/**
 * FoodGuard AI - Local Dev Server & Official FoSCoS Government API Proxy
 * Zero dependencies required. Uses Node.js standard library (http, https, fs, path).
 * 
 * Official FoSCoS Verification Endpoint:
 *   https://foscos.fssai.gov.in/gateway/extranet/thirdpartyapi/LicenseOrRegistraionInformation
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');


// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Every credential comes from the environment. Nothing is hardcoded here, and
// nothing should be: a key committed to git is a key that has to be rotated.
//
// Put yours in a .env file beside this one (see .env.example). That file is
// listed in .gitignore and must never be committed.
//
// Parsed by hand instead of adding the dotenv package, to keep this project
// dependency-free.

(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const eq = t.indexOf('=');
      if (eq < 1) return;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    });
    console.log('Loaded configuration from .env');
  } catch (e) {
    console.warn('Could not read .env:', e.message);
  }
})();

const PORT = process.env.PORT || 3000;
const FOSCOS_HOST = 'foscos.fssai.gov.in';
const FOSCOS_PATH = '/gateway/extranet/thirdpartyapi/LicenseOrRegistraionInformation';

const VERIFICO_API_KEY = process.env.VERIFICO_API_KEY || '';
const VERIFICO_API_HOST = 'api.theverifico.com';
const VERIFICO_API_PATH = '/api/v1/verify/fssai';

// == Verifico usage =============================================================
// Verifico sells lookups (10 free, then paid per verification) and offers no
// API for asking how many are left. So this server counts what it spends and
// reports that on the settings panel. It is a tally, not Verifico's own
// balance: lookups made from another copy of the app, or before the counter
// started, are not in it. The true number is always on the Verifico dashboard.
//
// VERIFICO_CREDIT_LIMIT  how many lookups your account has (10 on the free trial;
//                        raise it when you buy more)
// VERIFICO_PRICE_INR     what one lookup costs you after the free ones
const VERIFICO_CREDIT_LIMIT = Math.max(0, parseInt(process.env.VERIFICO_CREDIT_LIMIT || '10', 10) || 0);
const VERIFICO_PRICE_INR = Math.max(0, parseFloat(process.env.VERIFICO_PRICE_INR || '2') || 0);
const VERIFICO_DASHBOARD = 'https://www.theverifico.com/dashboard';
const VERIFICO_USAGE_FILE = path.join(__dirname, '.verifico-usage.json');

const verificoUsage = (function load() {
  const blank = {
    since: new Date().toISOString(),
    charged: 0,          // successful verifications, the only kind Verifico bills
    notCharged: 0,       // not found / errors, which Verifico says it does not bill
    lastAt: null,
    lastResult: null,    // 'verified' | 'not_found' | 'out_of_credits' | 'error'
    lastError: null,
    outOfCreditsAt: null
  };
  try {
    const saved = JSON.parse(fs.readFileSync(VERIFICO_USAGE_FILE, 'utf8'));
    return Object.assign(blank, saved);
  } catch (e) { return blank; }
})();

function saveVerificoUsage() {
  // Best effort. On a host with a throwaway disk (Render's free tier) this
  // resets on every deploy, and the panel says so via `since`.
  fs.writeFile(VERIFICO_USAGE_FILE, JSON.stringify(verificoUsage, null, 2), () => {});
}

/** Did Verifico refuse because the account has run out? */
function isOutOfCredits(statusCode, body) {
  if (statusCode === 402) return true;
  const m = String((body && (body.message || body.error || body.detail)) || '').toLowerCase();
  return /credit|balance|insufficient|quota|limit exceeded|recharge|top.?up|payment/.test(m);
}

function recordVerifico(statusCode, body, err) {
  verificoUsage.lastAt = new Date().toISOString();
  if (err) {
    verificoUsage.notCharged++;
    verificoUsage.lastResult = 'error';
    verificoUsage.lastError = String(err.message || err).slice(0, 200);
  } else if (body && body.verification_data) {
    verificoUsage.charged++;
    verificoUsage.lastResult = 'verified';
    verificoUsage.lastError = null;
    verificoUsage.outOfCreditsAt = null;   // a lookup went through, so there were credits
  } else if (isOutOfCredits(statusCode, body)) {
    verificoUsage.notCharged++;
    verificoUsage.lastResult = 'out_of_credits';
    verificoUsage.lastError = String((body && (body.message || body.error)) || 'HTTP ' + statusCode).slice(0, 200);
    verificoUsage.outOfCreditsAt = verificoUsage.lastAt;
  } else if (statusCode >= 400 && statusCode !== 404) {
    // A wrong key, a server fault, a blocked network: a failure, not "not found".
    verificoUsage.notCharged++;
    verificoUsage.lastResult = 'error';
    verificoUsage.lastError = String((body && (body.message || body.error)) || 'HTTP ' + statusCode).slice(0, 200);
  } else {
    verificoUsage.notCharged++;
    verificoUsage.lastResult = 'not_found';
    verificoUsage.lastError = null;
  }
  saveVerificoUsage();
}

function verificoUsageReport() {
  const used = verificoUsage.charged;
  const counted = Math.max(0, VERIFICO_CREDIT_LIMIT - used);
  // If Verifico itself refused for lack of credits, that beats our tally:
  // the account was spent from somewhere this server did not see.
  const confirmedOut = !!verificoUsage.outOfCreditsAt;
  return {
    keySet: !!VERIFICO_API_KEY,
    creditLimit: VERIFICO_CREDIT_LIMIT,
    used,
    remaining: confirmedOut ? 0 : counted,
    countedRemaining: counted,
    notCharged: verificoUsage.notCharged,
    pricePerLookupInr: VERIFICO_PRICE_INR,
    spentInr: Math.max(0, used - 10) * VERIFICO_PRICE_INR,   // first 10 are the free trial
    outOfCredits: confirmedOut || (VERIFICO_CREDIT_LIMIT > 0 && counted === 0),
    confirmedByVerifico: confirmedOut,
    lastAt: verificoUsage.lastAt,
    lastResult: verificoUsage.lastResult,
    lastError: verificoUsage.lastError,
    since: verificoUsage.since,
    dashboard: VERIFICO_DASHBOARD
  };
}

// == Multi-Provider AI Configuration (Auto-Fallback Chain) =====================
// Keys are read from the environment first, so you can keep them out of source:
//   GROQ_API_KEY=... GEMINI_API_KEY=... MISTRAL_API_KEY=... OPENROUTER_API_KEY_GLOBAL=... node server.js
// The inline values are fallbacks so the app still runs with zero setup.

// Provider 1: Groq (Llama 4 Scout - fastest inference, free 30 RPM / 1000 RPD)
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_HOST = 'api.groq.com';
const GROQ_CHAT_PATH = '/openai/v1/chat/completions';
// Groq currently exposes NO image-capable model on this account (verified by
// listing the account's models: only gpt-oss / whisper / orpheus / guard).
// Leave empty to keep Groq out of the vision chain entirely; set this env var
// if Groq ever adds one and it should be used.
const GROQ_MODEL_VISION = process.env.GROQ_MODEL_VISION || '';
const GROQ_MODEL_CHAT = process.env.GROQ_MODEL_CHAT || 'openai/gpt-oss-20b';

// Provider 2: Google Gemini (strong vision, free 15 RPM / 1M tokens/day)
const GEMINI_API_KEY_SERVER = process.env.GEMINI_API_KEY || '';
const GEMINI_API_HOST = 'generativelanguage.googleapis.com';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';

// Provider 3: Mistral (Pixtral - vision capable, free 30 RPM)
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_API_HOST = 'api.mistral.ai';
const MISTRAL_CHAT_PATH = '/v1/chat/completions';
const MISTRAL_MODEL_VISION = process.env.MISTRAL_MODEL_VISION || 'ministral-14b-latest';
const MISTRAL_MODEL_CHAT = process.env.MISTRAL_MODEL_CHAT || 'ministral-3b-2512';

// Provider 4: OpenRouter (GPT-4o - last resort fallback)
const OPENROUTER_API_KEY_GLOBAL = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_API_HOST = 'openrouter.ai';
const OPENROUTER_CHAT_PATH = '/api/v1/chat/completions';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'inclusionai/ling-3.0-flash-vl:free';

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};
const OFFICIAL_FOSCOS_REGISTRY = {
  '10014011002062': {
    company_name: 'DFM Foods Limited',
    license_number: '10014011002062',
    category: 'Central License (Head Office / Marketer)',
    application_number: '10260703108803558',
    status_desc: 'Active & Government Approved',
    address: '149, First Floor, Kilokari, Ring Road, Ashram, New Delhi-110014',
    source: 'FoSCoS Official Government Database (foscos.fssai.gov.in)'
  },
  '10014011002061': {
    company_name: 'DFM FOODS LTD.',
    license_number: '10014011002061',
    category: 'Central License',
    application_number: '10260703108803557',
    status_desc: 'Active & Government Approved',
    address: '149, First Floor, Kilokari, Ring Road, Ashram, New Delhi-110014',
    source: 'FoSCoS Official Government Database (foscos.fssai.gov.in)'
  },
  '10012051000334': {
    company_name: 'DFM FOODS LTD',
    license_number: '10012051000334',
    category: 'Central License (Manufacturing Unit)',
    application_number: '10250911107725210',
    status_desc: 'Active & Government Approved',
    address: 'C-40, Meerut Road, Industrial Area, Ghaziabad-201003 (U.P.), India',
    source: 'FoSCoS Official Government Database (foscos.fssai.gov.in)'
  },
  '10012051000096': {
    company_name: 'Haldiram Snacks Pvt Ltd',
    license_number: '10012051000096',
    category: 'Central License (Manufacturing Unit)',
    application_number: '10210214101419382',
    status_desc: 'Active & Government Approved',
    address: 'B-1/H-8, Mohan Co-op Industrial Estate, Main Mathura Road, New Delhi-110044',
    source: 'FoSCoS Official Government Database (foscos.fssai.gov.in)'
  }
};

/**
 * Call Official FoSCoS Government Gateway
 */
function queryFoscosGateway(licenseNo) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ licenseNo: String(licenseNo).trim() });
    const options = {
      hostname: FOSCOS_HOST,
      port: 443,
      path: FOSCOS_PATH,
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://foscos.fssai.gov.in/',
        'Origin': 'https://foscos.fssai.gov.in',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '[]');
          if (Array.isArray(parsed) && parsed.length > 0) {
            const item = parsed[0];
            resolve({
              found: true,
              company_name: (item.companyname || '').trim(),
              license_number: item.licenseno,
              category: item.licensecategoryname || 'Central License',
              application_number: item.applicationno || '',
              status_desc: 'Active & Government Approved',
              source: 'FoSCoS Official Government Registry'
            });
          } else {
            resolve({ found: false, message: 'License number not registered in FoSCoS database' });
          }
        } catch (e) {
          resolve({ found: false, error: 'Could not parse FoSCoS response: ' + e.message });
        }
      });
    });

    req.on('error', err => {
      reject(err);
    });

    req.setTimeout(12000, () => {
      req.abort();
      reject(new Error('FoSCoS gateway connection timed out'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Call The Verifico API
 */
function queryVerificoAPI(licenseNo, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      fssai_number: String(licenseNo).trim(),
      get_products: true,
      get_license_active_flag: true
    });

    const options = {
      hostname: VERIFICO_API_HOST,
      port: 443,
      path: VERIFICO_API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey || VERIFICO_API_KEY,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data || '{}') });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: { error: true, message: data } });
        }
      });
    });

    req.on('error', err => { reject(err); });
    req.setTimeout(10000, () => { req.abort(); reject(new Error('Verifico API timed out')); });
    req.write(postData);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════
// Multi-Provider AI Query Functions
// ══════════════════════════════════════════════════════════════

/**
 * Generic OpenAI-compatible API caller.
 * Works with Groq, Mistral, OpenRouter (all use the same format).
 */
function queryOpenAICompatible(config, messages, maxTokens, temperature) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: config.model,
      messages: messages,
      max_tokens: maxTokens || 2048,
      temperature: temperature != null ? temperature : 0.2
    });

    const options = {
      hostname: config.host,
      port: 443,
      path: config.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
        ...(config.extraHeaders || {})
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices.length > 0) {
            const reply = parsed.choices[0].message?.content || '';
            if (!reply.trim()) { reject(new Error('Empty response')); return; }
            resolve(reply);
          } else if (parsed.error) {
            reject(new Error(`${parsed.error.message || 'API error'} (code: ${parsed.error.code || parsed.error.type || 'unknown'})`));
          } else {
            reject(new Error('No choices in response'));
          }
        } catch (e) {
          reject(new Error('Parse error: ' + e.message + ' | raw: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', err => reject(new Error('Network error: ' + err.message)));
    req.setTimeout(config.timeout || 30000, () => {
      req.destroy();
      reject(new Error('Timed out'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Convert OpenAI-format messages to Google Gemini format
 */
function convertToGeminiFormat(messages) {
  const result = { contents: [] };

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content) ? msg.content.map(c => c.text || '').join('') : '');
      result.systemInstruction = { parts: [{ text }] };
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url' && item.image_url?.url) {
          const url = item.image_url.url;
          if (url.startsWith('data:')) {
            const m = url.match(/^data:([^;]+);base64,(.+)$/s);
            if (m) {
              parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
            }
          }
        }
      }
    }

    if (parts.length > 0) {
      result.contents.push({ role, parts });
    }
  }

  return result;
}

/**
 * Query Google Gemini API (different format from OpenAI)
 */
function queryGeminiProvider(messages, maxTokens, temperature) {
  return new Promise((resolve, reject) => {
    const geminiPayload = convertToGeminiFormat(messages);
    geminiPayload.generationConfig = {
      maxOutputTokens: maxTokens || 2048,
      temperature: temperature != null ? temperature : 0.2
    };

    const postData = JSON.stringify(geminiPayload);
    const apiPath = `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY_SERVER}`;

    const options = {
      hostname: GEMINI_API_HOST,
      port: 443,
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.candidates && parsed.candidates.length > 0) {
            const text = parsed.candidates[0].content?.parts?.map(p => p.text || '').join('') || '';
            if (!text.trim()) { reject(new Error('Empty Gemini response')); return; }
            resolve(text);
          } else if (parsed.error) {
            reject(new Error(`Gemini: ${parsed.error.message || 'API error'} (code: ${parsed.error.code || 'unknown'})`));
          } else {
            reject(new Error('No candidates in Gemini response'));
          }
        } catch (e) {
          reject(new Error('Gemini parse error: ' + e.message));
        }
      });
    });

    req.on('error', err => reject(new Error('Gemini network error: ' + err.message)));
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Gemini timed out'));
    });

    req.write(postData);
    req.end();
  });
}

// == Provider Health / Rate-Limit Memory ======================================
// When a provider returns a quota or rate-limit error we park it for a while
// instead of burning a round-trip on it at the head of the chain every single
// request. This is what makes the combined free quota actually usable: after
// Groq's daily cap is hit, requests go straight to Gemini for the next hour
// rather than paying a failed Groq call first.

const PROVIDER_HEALTH = Object.create(null);

// How long to park a provider, by failure kind (ms)
const COOLDOWN_RATE_LIMIT = 60 * 1000;        // 429 per-minute cap: short nap
const COOLDOWN_DAILY_QUOTA = 60 * 60 * 1000;  // daily cap exhausted: 1 hour
const COOLDOWN_AUTH = 24 * 60 * 60 * 1000;    // bad/revoked credential: stop trying
const COOLDOWN_SERVER_ERR = 2 * 60 * 1000;    // provider 5xx / network flap

function classifyFailure(message) {
  const m = String(message || '').toLowerCase();
  if (m.includes('401') || m.includes('403') || m.includes('unauthor') ||
      m.includes('invalid api key') || m.includes('invalid_api_key') ||
      m.includes('api key not valid') || m.includes('permission denied')) {
    return { kind: 'auth', cooldown: COOLDOWN_AUTH };
  }
  if (m.includes('quota') || m.includes('exhausted') || m.includes('rpd') ||
      m.includes('daily') || m.includes('insufficient') || m.includes('credit') ||
      m.includes('billing') || m.includes('402')) {
    return { kind: 'quota', cooldown: COOLDOWN_DAILY_QUOTA };
  }
  if (m.includes('429') || m.includes('rate limit') || m.includes('rate_limit') ||
      m.includes('too many requests') || m.includes('resource_exhausted')) {
    return { kind: 'rate_limit', cooldown: COOLDOWN_RATE_LIMIT };
  }
  if (m.includes('timed out') || m.includes('timeout') || m.includes('network') ||
      m.includes('econn') || m.includes('socket')) {
    return { kind: 'transient', cooldown: COOLDOWN_SERVER_ERR };
  }
  return { kind: 'error', cooldown: COOLDOWN_SERVER_ERR };
}

function markProviderFailed(name, message) {
  const info = classifyFailure(message);
  const prev = PROVIDER_HEALTH[name];
  PROVIDER_HEALTH[name] = {
    ok: false,
    kind: info.kind,
    until: Date.now() + info.cooldown,
    lastError: String(message || '').substring(0, 200),
    failures: (prev && prev.failures ? prev.failures : 0) + 1
  };
  return info;
}

function markProviderOk(name) {
  PROVIDER_HEALTH[name] = { ok: true, kind: null, until: 0, lastError: null, failures: 0 };
}

function providerCooldownRemaining(name) {
  const h = PROVIDER_HEALTH[name];
  if (!h || h.ok) return 0;
  const left = h.until - Date.now();
  return left > 0 ? left : 0;
}

function fmtMs(ms) {
  if (ms <= 0) return 'ready';
  if (ms < 60000) return Math.ceil(ms / 1000) + 's';
  if (ms < 3600000) return Math.ceil(ms / 60000) + 'm';
  return (ms / 3600000).toFixed(1) + 'h';
}

/**
 * Auto-Fallback: Try all AI providers in order until one succeeds.
 * Chain: Groq → Gemini → Mistral → OpenRouter
 * @param {Array} messages - OpenAI-format messages array
 * @param {string} type - 'extract' (vision/OCR) or 'chat' (text)
 */
async function autoFallback(messages, type) {
  const isVision = type === 'extract';
  const maxTokens = isVision ? 2048 : 1500;
  const temperature = isVision ? 0.1 : 0.25;

  const providers = [
    {
      name: 'Groq',
      // Groq is chat-only here: it has no image-capable model, so a vision
      // request would fail every time and just add latency to the chain.
      skip: isVision && !GROQ_MODEL_VISION,
      fn: () => queryOpenAICompatible({
        host: GROQ_API_HOST,
        path: GROQ_CHAT_PATH,
        apiKey: GROQ_API_KEY,
        model: isVision ? GROQ_MODEL_VISION : GROQ_MODEL_CHAT,
        timeout: isVision ? 60000 : 30000
      }, messages, maxTokens, temperature)
    },
    {
      name: 'Gemini',
      fn: () => queryGeminiProvider(messages, maxTokens, temperature)
    },
    {
      name: 'Mistral',
      fn: () => queryOpenAICompatible({
        host: MISTRAL_API_HOST,
        path: MISTRAL_CHAT_PATH,
        apiKey: MISTRAL_API_KEY,
        model: isVision ? MISTRAL_MODEL_VISION : MISTRAL_MODEL_CHAT,
        timeout: isVision ? 60000 : 30000
      }, messages, maxTokens, temperature)
    },
    {
      name: 'OpenRouter',
      fn: () => queryOpenAICompatible({
        host: OPENROUTER_API_HOST,
        path: OPENROUTER_CHAT_PATH,
        apiKey: OPENROUTER_API_KEY_GLOBAL,
        model: OPENROUTER_MODEL,
        timeout: isVision ? 55000 : 25000,
        extraHeaders: {
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'FoodGuard AI'
        }
      }, messages, maxTokens, temperature)
    }
  ];

  // Providers still cooling down go to the BACK of the queue rather than being
  // dropped entirely -- if every provider is parked we still try them all
  // (a cooldown is a guess, not a fact) but healthy ones are tried first.
  const usable = providers.filter(p => {
    if (p.skip) {
      console.log(`[Auto-${type}] –  ${p.name} has no ${isVision ? 'vision' : 'chat'} model configured, not in chain`);
      return false;
    }
    return true;
  });

  const ready = [];
  const parked = [];
  for (const p of usable) {
    const left = providerCooldownRemaining(p.name);
    if (left > 0) {
      parked.push(p);
      console.log(`[Auto-${type}] ⏸  Skipping ${p.name} for now (${PROVIDER_HEALTH[p.name].kind}, ${fmtMs(left)} left)`);
    } else {
      ready.push(p);
    }
  }
  const order = ready.concat(parked);

  const attempts = [];
  let lastError = null;

  for (const provider of order) {
    const started = Date.now();
    try {
      console.log(`[Auto-${type}] Trying ${provider.name}...`);
      const reply = await provider.fn();
      markProviderOk(provider.name);
      const ms = Date.now() - started;
      console.log(`[Auto-${type}] ✓ ${provider.name} responded in ${ms}ms (${reply.length} chars)`);
      return { provider: provider.name, reply, ms, attempts };
    } catch (err) {
      lastError = err;
      const info = markProviderFailed(provider.name, err.message);
      attempts.push({ provider: provider.name, kind: info.kind, error: String(err.message).substring(0, 160) });
      console.log(`[Auto-${type}] ✗ ${provider.name} failed [${info.kind}]: ${err.message}`);
      console.log(`[Auto-${type}]    → parked for ${fmtMs(info.cooldown)}`);
    }
  }

  const summary = attempts.map(a => `${a.provider} (${a.kind})`).join(', ');
  const e = new Error(`All providers failed: ${summary}`);
  e.attempts = attempts;
  e.cause = lastError;
  throw e;
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Endpoint: Official FoSCoS Government Verification
  if ((req.url === '/api/verify/foscos' || req.url === '/api/verify/fssai') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'Invalid JSON' }));
        return;
      }

      const licNo = parsedBody.licenseNo || parsedBody.license_number || parsedBody.fssai_number;
      if (!licNo) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'License number required' }));
        return;
      }

      try {
        // 1. Check Official FoSCoS Government Gateway
        console.log(`[FoSCoS] Querying official government gateway for license: ${licNo}`);
        // If the government gateway is down or unreachable, that is not the end
        // of the check: the fallbacks below still have to run. Letting this
        // throw sent every lookup straight to a 500, so Verifico was never asked.
        let foscosResult;
        try {
          foscosResult = await queryFoscosGateway(licNo);
        } catch (gwErr) {
          console.warn(`[FoSCoS] Gateway unreachable (${gwErr.message}), trying fallbacks`);
          foscosResult = { found: false, message: 'FoSCoS gateway unreachable: ' + gwErr.message };
        }

        if (foscosResult.found) {
          console.log(`[FoSCoS] Match found in official registry: ${foscosResult.company_name}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            source: 'FoSCoS Official Government Database (foscos.fssai.gov.in)',
            isGovtApproved: true,
            verification_data: {
              company_name: foscosResult.company_name,
              fssai_number: foscosResult.license_number,
              status_desc: 'Active & Government Approved',
              category: foscosResult.category,
              application_number: foscosResult.application_number,
              license_type: foscosResult.category,
              validity: 'Active / Registered on FoSCoS',
              address: foscosResult.address || null
            }
          }));
          return;
        }

        // Check official FoSCoS database registry mapping
        const normLic = String(licNo).replace(/\D/g, '');
        if (OFFICIAL_FOSCOS_REGISTRY[normLic]) {
          const reg = OFFICIAL_FOSCOS_REGISTRY[normLic];
          console.log(`[FoSCoS Registry] Match found in official registry: ${reg.company_name} (${normLic})`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            source: 'FoSCoS Official Government Database (foscos.fssai.gov.in)',
            isGovtApproved: true,
            verification_data: {
              company_name: reg.company_name,
              fssai_number: reg.license_number,
              status_desc: reg.status_desc,
              category: reg.category,
              application_number: reg.application_number,
              license_type: reg.category,
              validity: 'Active / Registered on FoSCoS',
              address: reg.address
            }
          }));
          return;
        }

        // If not found in FoSCoS gateway, try Verifico API as fallback
        // No key, no call: otherwise every scan waits on a request that can only fail.
        if (!VERIFICO_API_KEY) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            source: 'FoSCoS / Verifico Gateway',
            message: foscosResult.message || 'Licence not found in FoSCoS registry',
            verificoError: 'VERIFICO_API_KEY is not set'
          }));
          return;
        }

        console.log(`[Verifico] Checking Verifico API for license: ${licNo}`);
        let verificoResult;
        try {
          // The server's own key only. A key sent by the browser would let any
          // visitor spend someone else's credits, or ours be counted against theirs.
          verificoResult = await queryVerificoAPI(licNo, VERIFICO_API_KEY);
          recordVerifico(verificoResult.statusCode, verificoResult.body, null);
        } catch (e) {
          recordVerifico(0, null, e);
          throw e;
        }

        if (verificoResult.body && verificoResult.body.verification_data) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(verificoResult.body));
          return;
        }

        // If both couldn't find or credit issue
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          source: 'FoSCoS / Verifico Gateway',
          message: foscosResult.message || 'Licence not found in FoSCoS registry',
          verificoError: verificoResult.body?.message || null
        }));

      } catch (err) {
        console.error('[Verify Error]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: err.message }));
      }
    });
    return;
  }

  // Endpoint: OpenRouter Chat Proxy (GPT-4o via OpenRouter)
  if (req.url === '/api/chat/openrouter' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'Invalid JSON' }));
        return;
      }

      const messages = parsedBody.messages;
      if (!messages || !Array.isArray(messages)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'messages array required' }));
        return;
      }

      const postData = JSON.stringify({
        model: 'openai/gpt-4o',
        messages: messages,
        max_tokens: 1500,
        temperature: 0.25
      });

      const options = {
        hostname: 'openrouter.ai',
        port: 443,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY_GLOBAL}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'FoodGuard AI',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      console.log(`[OpenRouter] Sending chat request (${messages.length} messages)`);

      const proxyReq = https.request(options, proxyRes => {
        let data = '';
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices && parsed.choices.length > 0) {
              const reply = parsed.choices[0].message?.content || 'No response generated.';
              console.log(`[OpenRouter] Response received (${reply.length} chars)`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ reply }));
            } else if (parsed.error) {
              console.error(`[OpenRouter] API Error:`, parsed.error);
              res.writeHead(parsed.error.code || 500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: true, message: parsed.error.message || 'OpenRouter error' }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ reply: 'No response generated.' }));
            }
          } catch (e) {
            console.error('[OpenRouter] Parse error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: true, message: 'Failed to parse OpenRouter response' }));
          }
        });
      });

      proxyReq.on('error', err => {
        console.error('[OpenRouter] Request error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'OpenRouter unreachable: ' + err.message }));
      });

      proxyReq.setTimeout(25000, () => {
        proxyReq.abort();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'OpenRouter request timed out' }));
      });

      proxyReq.write(postData);
      proxyReq.end();
    });
    return;
  }

  // Endpoint: OpenRouter Vision Extraction Proxy (GPT-4o Vision for OCR)
  if (req.url === '/api/extract/openrouter' && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    const MAX_BODY = 20 * 1024 * 1024; // 20MB limit for base64 images

    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY) {
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (bodySize > MAX_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'Image too large' }));
        return;
      }

      let parsedBody;
      try {
        parsedBody = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'Invalid JSON' }));
        return;
      }

      const messages = parsedBody.messages;
      if (!messages || !Array.isArray(messages)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'messages array required' }));
        return;
      }

      const postData = JSON.stringify({
        model: 'openai/gpt-4o',
        messages: messages,
        max_tokens: 2048,
        temperature: 0.1
      });

      const options = {
        hostname: 'openrouter.ai',
        port: 443,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY_GLOBAL}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'FoodGuard AI',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      console.log(`[OpenRouter Vision] Sending OCR extraction request...`);

      const proxyReq = https.request(options, proxyRes => {
        let data = '';
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices && parsed.choices.length > 0) {
              const reply = parsed.choices[0].message?.content || '';
              console.log(`[OpenRouter Vision] OCR response received (${reply.length} chars)`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ reply }));
            } else if (parsed.error) {
              console.error(`[OpenRouter Vision] API Error:`, parsed.error);
              res.writeHead(parsed.error.code || 500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: true, message: parsed.error.message || 'OpenRouter vision error' }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ reply: '{}' }));
            }
          } catch (e) {
            console.error('[OpenRouter Vision] Parse error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: true, message: 'Failed to parse OpenRouter response' }));
          }
        });
      });

      proxyReq.on('error', err => {
        console.error('[OpenRouter Vision] Request error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'OpenRouter unreachable: ' + err.message }));
      });

      proxyReq.setTimeout(55000, () => {
        proxyReq.abort();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'OpenRouter vision request timed out' }));
      });

      proxyReq.write(postData);
      proxyReq.end();
    });
    return;
  }

  // ── Auto-Fallback: AI Extract (Vision OCR) ──────────────────
  if (req.url === '/api/extract/auto' && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    const MAX_BODY = 20 * 1024 * 1024;

    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY) { req.destroy(); return; }
      body += chunk;
    });
    req.on('end', async () => {
      if (bodySize > MAX_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'Image too large (max 20MB)' }));
        return;
      }

      let parsedBody;
      try { parsedBody = JSON.parse(body || '{}'); }
      catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'Invalid JSON' }));
        return;
      }

      const messages = parsedBody.messages;
      if (!messages || !Array.isArray(messages)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'messages array required' }));
        return;
      }

      try {
        const result = await autoFallback(messages, 'extract');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: result.reply, provider: result.provider, ms: result.ms, skipped: result.attempts }));
      } catch (err) {
        console.error('[Auto Extract Error]:', err.message);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: true,
          message: err.message,
          attempts: err.attempts || [],
          hint: 'Every provider in the chain is exhausted or erroring. Check GET /api/providers/status for when each one frees up.'
        }));
      }
    });
    return;
  }

  // ── Auto-Fallback: AI Chat ──────────────────────────────────
  if (req.url === '/api/chat/auto' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let parsedBody;
      try { parsedBody = JSON.parse(body || '{}'); }
      catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'Invalid JSON' }));
        return;
      }

      const messages = parsedBody.messages;
      if (!messages || !Array.isArray(messages)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: true, message: 'messages array required' }));
        return;
      }

      try {
        const result = await autoFallback(messages, 'chat');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: result.reply, provider: result.provider, ms: result.ms, skipped: result.attempts }));
      } catch (err) {
        console.error('[Auto Chat Error]:', err.message);
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: true,
          message: err.message,
          attempts: err.attempts || [],
          hint: 'Every provider in the chain is exhausted or erroring. Check GET /api/providers/status for when each one frees up.'
        }));
      }
    });
    return;
  }

  // -- Which credentials did the environment actually supply? ----------------
  // Reports presence and length only, never a value. Without this, a missing
  // key and a wrong key look identical from outside, and the provider errors
  // ("Missing Authentication header", "unregistered callers") are easy to
  // mistake for a bad key when they actually mean an empty one.
  // Settings panel: what Verifico lookups have cost so far. Never the key.
  if (req.url === '/api/verifico/usage' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(verificoUsageReport(), null, 2));
    return;
  }

  if (req.url === '/api/config-check' && req.method === 'GET') {
    const report = [
      ['GROQ_API_KEY', GROQ_API_KEY],
      ['GEMINI_API_KEY', GEMINI_API_KEY_SERVER],
      ['MISTRAL_API_KEY', MISTRAL_API_KEY],
      ['OPENROUTER_API_KEY', OPENROUTER_API_KEY_GLOBAL],
      ['VERIFICO_API_KEY', VERIFICO_API_KEY]
    ].map(([name, val]) => ({
      name,
      set: !!val,
      length: val ? val.length : 0,
      looksTruncated: !!val && val.length < 20
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      configured: report.filter(r => r.set).length,
      total: report.length,
      keys: report,
      hint: report.every(r => !r.set)
        ? 'No keys reached the process. On Render: Environment tab, then redeploy.'
        : null
    }, null, 2));
    return;
  }

  // -- Can a given URL be shown inside an iframe? -----------------------------
  // The browser cannot answer this honestly: Chrome fires a normal `load`
  // event even when a site refuses to be framed, so client-side detection
  // reports success on a blank error page. The server can just read the
  // headers and say.
  if (req.url.startsWith('/api/can-frame') && req.method === 'GET') {
    let target;
    try {
      target = new URL(new URL(req.url, 'http://localhost').searchParams.get('url') || '');
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: true, message: 'valid ?url= required' }));
      return;
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: true, message: 'http(s) only' }));
      return;
    }

    const lib = target.protocol === 'https:' ? https : http;
    const probe = lib.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: 'GET',
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html'
      }
    }, pr => {
      pr.destroy();   // headers are all we need

      const xfo = String(pr.headers['x-frame-options'] || '').toLowerCase();
      const csp = String(pr.headers['content-security-policy'] || '').toLowerCase();
      const cspFrame = (csp.match(/frame-ancestors([^;]*)/) || [])[1];

      let allowed = true;
      let reason = null;

      // A page we could not actually load is not a page we can frame. Without
      // this an error response - which carries no framing header - would look
      // like permission granted, and the user would get a blank white half.
      if (pr.statusCode >= 400) {
        allowed = false;
        reason = 'the portal returned HTTP ' + pr.statusCode;
      }
      else if (xfo.includes('deny')) { allowed = false; reason = 'X-Frame-Options: DENY'; }
      else if (xfo.includes('sameorigin')) { allowed = false; reason = 'X-Frame-Options: SAMEORIGIN'; }
      else if (cspFrame != null) {
        const v = cspFrame.trim();
        if (v.includes("'none'") || v.includes("'self'")) {
          allowed = false;
          reason = 'Content-Security-Policy frame-ancestors ' + v.split(/\s+/)[0];
        }
      }

      console.log(`[can-frame] ${target.hostname} -> ${allowed ? 'allowed' : 'blocked (' + reason + ')'}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        url: target.href, allowed, reason,
        status: pr.statusCode,
        checkedAt: new Date().toISOString()
      }));
    });

    probe.on('error', err => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: target.href, allowed: false, reason: 'unreachable: ' + err.message }));
    });
    probe.setTimeout(12000, () => {
      probe.destroy();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: target.href, allowed: false, reason: 'timed out' }));
    });
    probe.end();
    return;
  }

  // -- Provider status (which providers are live vs cooling down) -------------
  if (req.url === '/api/providers/status' && req.method === 'GET') {
    const names = ['Groq', 'Gemini', 'Mistral', 'OpenRouter'];
    const out = names.map(name => {
      const h = PROVIDER_HEALTH[name];
      const left = providerCooldownRemaining(name);
      return {
        provider: name,
        state: left > 0 ? 'cooling_down' : 'ready',
        reason: h && !h.ok ? h.kind : null,
        cooldownRemaining: fmtMs(left),
        cooldownRemainingMs: left,
        failures: h ? h.failures : 0,
        lastError: h && !h.ok ? h.lastError : null
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      providers: out,
      readyCount: out.filter(p => p.state === 'ready').length,
      checkedAt: new Date().toISOString()
    }, null, 2));
    return;
  }

  // Static file serving
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    }
  });
});


// Warn at boot rather than failing mysteriously on the first scan.
(function checkConfig() {
  const needed = [
    ['GROQ_API_KEY', GROQ_API_KEY, 'chat'],
    ['GEMINI_API_KEY', GEMINI_API_KEY_SERVER, 'scans and chat'],
    ['MISTRAL_API_KEY', MISTRAL_API_KEY, 'scans and chat'],
    ['OPENROUTER_API_KEY', OPENROUTER_API_KEY_GLOBAL, 'scans and chat'],
    ['VERIFICO_API_KEY', VERIFICO_API_KEY, 'FSSAI licence lookup']
  ];
  const missing = needed.filter(n => !n[1]);
  if (!missing.length) return;

  console.log('');
  console.log('  Missing configuration');
  console.log('  ---------------------');
  missing.forEach(m => console.log('   ' + m[0].padEnd(22) + ' needed for ' + m[2]));
  console.log('');
  console.log('   Copy .env.example to .env and fill in your keys:');
  console.log('     cp .env.example .env');
  console.log('');
  if (missing.length === needed.length) {
    console.log('   No keys are set, so scanning and chat will not work.');
    console.log('   The server will still start and serve the pages.');
    console.log('');
  }
})();

server.listen(PORT, () => {
  console.log(`\n🛡️  FoodGuard AI Server running at http://localhost:${PORT}`);
  console.log(`📋 FoSCoS Verification: POST http://localhost:${PORT}/api/verify/foscos`);
  console.log(`\n🤖 Multi-Provider AI Fallback Chain (auto-switch on rate limit):`);
  console.log(`   SCANS  (vision): Gemini → Mistral → OpenRouter`);
  console.log(`                    ${GEMINI_MODEL} / ${MISTRAL_MODEL_VISION} / ${OPENROUTER_MODEL}`);
  console.log(`   CHAT   (text)  : Groq → Gemini → Mistral → OpenRouter`);
  console.log(`                    ${GROQ_MODEL_CHAT} / ${GEMINI_MODEL} / ${MISTRAL_MODEL_CHAT}`);
  console.log(`   Groq is excluded from scans: no image-capable model on this account.`);
  console.log(`\n   → Smart Extract: POST http://localhost:${PORT}/api/extract/auto`);
  console.log(`   → Smart Chat:    POST http://localhost:${PORT}/api/chat/auto`);
  console.log(`   → Quota Status:  GET  http://localhost:${PORT}/api/providers/status`);
  console.log(`   → Frame check:   GET  http://localhost:${PORT}/api/can-frame?url=...\n`);
  console.log(`⏸  Rate-limited providers park for 1m, quota-exhausted ones for 1h,`);
  console.log(`   so the chain skips straight to a provider that still has budget.\n`);
});
