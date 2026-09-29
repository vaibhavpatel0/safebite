#!/usr/bin/env node
/**
 * SafeByte - vision diagnosis
 *
 * All three vision providers failed with truncated messages. This prints the
 * FULL error from each, asks Gemini and OpenRouter which models actually
 * exist, tries the plausible vision models with a real image, and patches the
 * server with whatever answers.
 *
 * Usage:  node check-vision.js [server-new.js]
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const TARGET = path.join(__dirname, process.argv[2] || 'server-new.js');

// 8x8 PNG - a real image, small enough to be free to test with.
const IMG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGNocHDAihiGlgQAEj9AAQuDht8AAAAASUVORK5CYII=';
const IMG_URL = 'data:image/png;base64,' + IMG_B64;

const C = { r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m', g: '\x1b[32m', red: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m' };
const ok = s => C.g + s + C.r, bad = s => C.red + s + C.r, dim = s => C.d + s + C.r;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function readKey(src, name) {
  const re = new RegExp('const\\s+' + name + "\\s*=\\s*(?:process\\.env\\.\\w+\\s*\\|\\|\\s*)?'([^']+)'");
  const m = src.match(re);
  return m ? m[1] : null;
}

function req(method, host, p, headers, body) {
  return new Promise(res => {
    const payload = body ? JSON.stringify(body) : null;
    const o = { hostname: host, port: 443, path: p, method,
      headers: Object.assign({}, headers, payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) };
    const q = https.request(o, r => {
      let d = '';
      r.on('data', c => { d += c; });
      r.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} res({ status: r.statusCode, json: j, raw: d }); });
    });
    q.on('error', e => res({ status: 0, json: null, raw: 'network: ' + e.message }));
    q.setTimeout(45000, () => { q.destroy(); res({ status: 0, json: null, raw: 'timed out' }); });
    if (payload) q.write(payload);
    q.end();
  });
}

function fullErr(r) {
  if (r.json && r.json.error) {
    const e = r.json.error;
    return (e.message || JSON.stringify(e)) + (e.code ? ` [code ${e.code}]` : '');
  }
  return (r.raw || '').replace(/\s+/g, ' ').slice(0, 400) || ('HTTP ' + r.status);
}

(async () => {
  console.log(C.b + '\nSafeByte - vision diagnosis\n' + C.r);
  if (!fs.existsSync(TARGET)) { console.error(bad('not found: ' + TARGET)); process.exit(1); }
  let src = fs.readFileSync(TARGET, 'utf8');
  console.log(dim('reading credentials from ' + path.basename(TARGET)));

  const gemKey = process.env.GEMINI_API_KEY || readKey(src, 'GEMINI_API_KEY_SERVER');
  const misKey = process.env.MISTRAL_API_KEY || readKey(src, 'MISTRAL_API_KEY');
  const orKey = process.env.OPENROUTER_API_KEY || readKey(src, 'OPENROUTER_API_KEY_GLOBAL');

  const found = {};

  // ---------------------------------------------------------------- GEMINI
  console.log(C.c + '\n== Gemini ==' + C.r);
  if (!gemKey) { console.log(bad('  no credential')); }
  else {
    const list = await req('GET', 'generativelanguage.googleapis.com', '/v1beta/models?key=' + gemKey + '&pageSize=100');
    if (list.status !== 200) {
      console.log(bad('  cannot list models: ') + fullErr(list));
    } else {
      const models = (list.json.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .filter(n => !/embed|aqa|imagen|veo|tts|native-audio|live/i.test(n));
      console.log(dim('  ' + models.length + ' usable: ' + models.slice(0, 18).join(', ')));

      const pref = models.filter(m => /flash|pro/.test(m) && !/thinking|exp-|preview-0/.test(m)).slice(0, 5);
      for (const m of (pref.length ? pref : models.slice(0, 5))) {
        process.stdout.write('  ' + m.padEnd(34) + ' ');
        const r = await req('POST', 'generativelanguage.googleapis.com',
          `/v1beta/models/${m}:generateContent?key=${gemKey}`, {},
          { contents: [{ role: 'user', parts: [
              { text: 'What colour is this? One word.' },
              { inlineData: { mimeType: 'image/png', data: IMG_B64 } }] }] });
        if (r.status === 200 && r.json && r.json.candidates) { console.log(ok('VISION OK')); found.gemini = m; break; }
        console.log(bad('no') + dim('  ' + fullErr(r).slice(0, 90)));
        await sleep(700);
      }
    }
  }

  // --------------------------------------------------------------- MISTRAL
  console.log(C.c + '\n== Mistral ==' + C.r);
  if (!misKey) { console.log(bad('  no credential')); }
  else {
    for (const m of ['mistral-small-latest', 'mistral-medium-latest', 'magistral-small-latest', 'ministral-14b-latest']) {
      process.stdout.write('  ' + m.padEnd(34) + ' ');
      const r = await req('POST', 'api.mistral.ai', '/v1/chat/completions',
        { Authorization: 'Bearer ' + misKey },
        { model: m, max_tokens: 20, messages: [{ role: 'user', content: [
            { type: 'text', text: 'What colour is this? One word.' },
            { type: 'image_url', image_url: { url: IMG_URL } }] }] });
      if (r.status === 200 && r.json && r.json.choices) { console.log(ok('VISION OK')); found.mistral = m; break; }
      console.log(bad('no') + dim('  ' + fullErr(r).slice(0, 90)));
      await sleep(2500);   // free tier is ~1 req/sec; be generous
    }
  }

  // ------------------------------------------------------------ OPENROUTER
  console.log(C.c + '\n== OpenRouter (free vision models) ==' + C.r);
  if (!orKey) { console.log(bad('  no credential')); }
  else {
    const list = await req('GET', 'openrouter.ai', '/api/v1/models', { Authorization: 'Bearer ' + orKey });
    if (list.status !== 200) {
      console.log(bad('  cannot list models: ') + fullErr(list));
    } else {
      const free = (list.json.data || []).filter(m => {
        const p = m.pricing || {};
        const isFree = String(m.id).endsWith(':free') ||
          (parseFloat(p.prompt || '1') === 0 && parseFloat(p.completion || '1') === 0);
        const inputs = (m.architecture && m.architecture.input_modalities) || [];
        const seesImages = inputs.includes('image') || /vision|vl|llava|gemma-3|qwen2.5-vl|maverick|scout/i.test(m.id);
        return isFree && seesImages;
      }).map(m => m.id);

      console.log(dim('  ' + free.length + ' free image-capable models offered'));
      if (!free.length) console.log(C.y + '  none - your key needs credits for any vision model' + C.r);

      for (const m of free.slice(0, 6)) {
        process.stdout.write('  ' + m.slice(0, 40).padEnd(42) + ' ');
        const r = await req('POST', 'openrouter.ai', '/api/v1/chat/completions',
          { Authorization: 'Bearer ' + orKey, 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'SafeByte' },
          { model: m, max_tokens: 20, messages: [{ role: 'user', content: [
              { type: 'text', text: 'What colour is this? One word.' },
              { type: 'image_url', image_url: { url: IMG_URL } }] }] });
        if (r.status === 200 && r.json && r.json.choices) { console.log(ok('VISION OK')); found.openrouter = m; break; }
        console.log(bad('no') + dim('  ' + fullErr(r).slice(0, 80)));
        await sleep(1200);
      }
    }
  }

  // ------------------------------------------------------------------ APPLY
  console.log('\n' + C.b + '== Result ==' + C.r);
  const patches = [
    ['GEMINI_MODEL', found.gemini],
    ['MISTRAL_MODEL_VISION', found.mistral],
    ['OPENROUTER_MODEL', found.openrouter]
  ].filter(([, v]) => v);

  if (!patches.length) {
    console.log(bad('\n  No provider could process an image.'));
    console.log('  Scanning cannot work until one can. Simplest fix: a new free');
    console.log('  Gemini key from https://aistudio.google.com/apikey then:');
    console.log(dim('    GEMINI_API_KEY=your_new_key node ' + path.basename(TARGET)) + '\n');
    process.exit(2);
  }

  fs.copyFileSync(TARGET, TARGET + '.bak-' + Date.now());
  for (const [name, value] of patches) {
    const re = new RegExp("(const\\s+" + name + "\\s*=\\s*process\\.env\\.\\w+\\s*\\|\\|\\s*')[^']*(')");
    if (re.test(src)) { src = src.replace(re, '$1' + value + '$2'); console.log('  ' + ok('set') + ' ' + name.padEnd(22) + ' -> ' + value); }
    else console.log('  ' + C.y + '!' + C.r + ' could not locate ' + name);
  }
  fs.writeFileSync(TARGET, src);
  console.log(ok('\n  Restart:') + '  node ' + path.basename(TARGET) + '\n');
})();
