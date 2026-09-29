#!/usr/bin/env node
/**
 * FoodGuard AI - model repair (v2)
 *
 * v1 made two mistakes this version fixes:
 *   - it ranked text-to-speech models (orpheus, allam) as vision candidates
 *   - it treated "Rate limit exceeded" as a permanent failure, so real vision
 *     models were discarded after one unlucky try
 *
 * What it does:
 *   1. lists every model your key can reach, and prints them
 *   2. filters out speech / embedding / code / moderation models
 *   3. sends a real 8x8 test image to each vision candidate
 *   4. sends a real text prompt to each chat candidate
 *   5. retries anything that fails on a rate limit, with backoff
 *   6. rewrites the model defaults in server.js to what actually answered
 *
 * Credentials are read from server.js. A backup is made before writing.
 *
 * Usage:  node fix-models.js
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const SERVER_FILE = path.join(__dirname, 'server.js');
const TEST_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGNocHDAihiGlgQAEj9AAQuDht8AAAAASUVORK5CYII=';

const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m' };
const ok = s => C.green + s + C.reset;
const bad = s => C.red + s + C.reset;
const warn = s => C.yellow + s + C.reset;
const dim = s => C.dim + s + C.reset;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Models that can never serve chat or vision for this app.
const EXCLUDE = /whisper|tts|speech|orpheus|allam|voxtral|embed|rerank|guard|moderation|audio|fim|ocr|codestral|mistral-code|devstral|\bcode\b/i;
// Strong hints that a model handles images.
const VISION_HINT = /vision|pixtral|scout|maverick|llava|omni|multimodal|gpt-4o|gemma-3|small-2|small-latest|medium-2|medium-latest|large-2|magistral/i;

function readKey(src, varName) {
  const re = new RegExp('const\\s+' + varName + "\\s*=\\s*(?:process\\.env\\.\\w+\\s*\\|\\|\\s*)?'([^']+)'");
  const m = src.match(re);
  return m ? m[1] : null;
}

function request(method, host, urlPath, headers, body) {
  return new Promise(resolve => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: host, port: 443, path: urlPath, method,
      headers: Object.assign({}, headers,
        payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, json, raw: data.slice(0, 300) });
      });
    });
    req.on('error', e => resolve({ status: 0, json: null, raw: 'network: ' + e.message }));
    req.setTimeout(45000, () => { req.destroy(); resolve({ status: 0, json: null, raw: 'timed out' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

function errText(r) {
  if (r.json && r.json.error) return r.json.error.message || JSON.stringify(r.json.error);
  if (r.json && r.json.message) return r.json.message;
  return r.raw || ('HTTP ' + r.status);
}

const isRateLimited = r => r.status === 429 || /rate.?limit|too many requests|capacity|try again/i.test(errText(r));

async function listModels(host, apiPath, key) {
  const r = await request('GET', host, apiPath, { Authorization: 'Bearer ' + key });
  if (r.status !== 200 || !r.json) return { error: errText(r), models: [] };
  const arr = r.json.data || r.json.models || [];
  return { error: null, models: [...new Set(arr.map(m => m.id || m.name).filter(Boolean))] };
}

/** Run one probe, retrying through rate limits (the v1 bug). */
async function probe(host, apiPath, key, model, vision, pace) {
  const body = vision
    ? { model, max_tokens: 20, messages: [{ role: 'user', content: [
        { type: 'text', text: 'What colour is this image? One word.' },
        { type: 'image_url', image_url: { url: TEST_IMAGE } }] }] }
    : { model, max_tokens: 10, messages: [{ role: 'user', content: 'Reply with exactly: OK' }] };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await request('POST', host, apiPath, { Authorization: 'Bearer ' + key }, body);
    if (r.status === 200 && r.json && r.json.choices && r.json.choices.length) return { ok: true };
    if (isRateLimited(r) && attempt < 3) {
      process.stdout.write(dim('rate-limited, waiting ' + (attempt * 3) + 's... '));
      await sleep(attempt * 3000);
      continue;
    }
    return { ok: false, why: errText(r), rate: isRateLimited(r) };
  }
  return { ok: false, why: 'rate limited after 3 attempts', rate: true };
}

async function findWorking(label, host, apiPath, key, candidates, vision, pace) {
  console.log('\n' + C.bold + label + C.reset + dim(' (' + candidates.length + ' candidates)'));
  if (!candidates.length) { console.log(dim('  none after filtering')); return null; }
  for (const m of candidates) {
    process.stdout.write('  ' + m.padEnd(42) + ' ');
    const r = await probe(host, apiPath, key, m, vision, pace);
    if (r.ok) { console.log(ok('WORKS')); return m; }
    console.log(bad('no') + dim('  ' + String(r.why).replace(/\s+/g, ' ').slice(0, 52)));
    await sleep(pace);
  }
  return null;
}

function patchDefault(src, varName, value) {
  const re = new RegExp("(const\\s+" + varName + "\\s*=\\s*process\\.env\\.\\w+\\s*\\|\\|\\s*')[^']*(')");
  if (!re.test(src)) { console.log(warn('  ! could not locate ' + varName)); return src; }
  return src.replace(re, '$1' + value + '$2');
}

(async () => {
  console.log(C.bold + '\nFoodGuard AI - model repair v2\n' + C.reset);

  if (!fs.existsSync(SERVER_FILE)) {
    console.error(bad('server.js not found. Run this from ~/Desktop/agnet'));
    process.exit(1);
  }
  let src = fs.readFileSync(SERVER_FILE, 'utf8');

  const providers = [
    { name: 'Groq', host: 'api.groq.com', list: '/openai/v1/models', chat: '/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY || readKey(src, 'GROQ_API_KEY'), pace: 600,
      visionVar: 'GROQ_MODEL_VISION', chatVar: 'GROQ_MODEL_CHAT' },
    { name: 'Mistral', host: 'api.mistral.ai', list: '/v1/models', chat: '/v1/chat/completions',
      key: process.env.MISTRAL_API_KEY || readKey(src, 'MISTRAL_API_KEY'), pace: 1500,
      visionVar: 'MISTRAL_MODEL_VISION', chatVar: 'MISTRAL_MODEL_CHAT' }
  ];

  const results = [];

  for (const p of providers) {
    console.log(C.cyan + '\n== ' + p.name + ' ==' + C.reset);
    if (!p.key) { console.log(bad('  no credential found in server.js')); continue; }

    const l = await listModels(p.host, p.list, p.key);
    if (l.error) { console.log(bad('  cannot list models: ') + l.error); continue; }

    console.log(dim('  all ' + l.models.length + ' models: ' + l.models.join(', ')));

    const usable = l.models.filter(m => !EXCLUDE.test(m));
    console.log(dim('  ' + usable.length + ' usable after removing speech/code/embedding models'));

    const visionCands = usable.filter(m => VISION_HINT.test(m)).slice(0, 8);
    const chatCands = usable.sort((a, b) =>
      (/instruct|chat|small|flash|llama|mistral|ministral|gpt-oss/i.test(b) ? 1 : 0) -
      (/instruct|chat|small|flash|llama|mistral|ministral|gpt-oss/i.test(a) ? 1 : 0)).slice(0, 8);

    const v = await findWorking(p.name + ' vision', p.host, p.chat, p.key, visionCands, true, p.pace);
    const c = await findWorking(p.name + ' chat', p.host, p.chat, p.key, chatCands, false, p.pace);
    results.push([p.visionVar, v], [p.chatVar, c]);
  }

  console.log('\n' + C.bold + '== Result ==' + C.reset);
  const applied = results.filter(([, v]) => v);

  if (!applied.length) {
    console.log(bad('\nNothing confirmed working. server.js left untouched.\n'));
    process.exit(2);
  }

  const backup = SERVER_FILE + '.backup-' + Date.now();
  fs.copyFileSync(SERVER_FILE, backup);
  for (const [name, value] of applied) {
    src = patchDefault(src, name, value);
    console.log('  ' + ok('set') + ' ' + name.padEnd(22) + ' -> ' + value);
  }
  for (const [name, value] of results.filter(([, v]) => !v)) {
    console.log('  ' + warn('---') + ' ' + name.padEnd(22) + ' -> ' + dim('none found, left as-is'));
  }
  fs.writeFileSync(SERVER_FILE, src);

  console.log('\n  backup: ' + dim(path.basename(backup)));
  console.log(ok('\n  Restart the server:') + '  Ctrl+C, then  node server.js\n');
})();
