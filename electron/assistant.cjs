// Nox, l'assistant de NOCTA, réfléchit avec des IA gratuites : Gemini (Google), Groq, OpenRouter,
// Mistral, Cerebras. On peut enregistrer plusieurs clés : si l'une est saturée ou à court de
// quota, Nox passe tout seul à la suivante. Les appels se font ici, dans le processus principal,
// pour que les clés ne passent jamais par l'interface. La boucle d'outils (recherche, casting,
// VF, lecture…) tourne dans l'interface, qui envoie l'historique complet (au format Gemini).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const ATTEMPT_MS = 25000; // au-delà, on essaie le modèle ou la clé suivante
const TOTAL_MS = 110000;

/** Services compatibles OpenAI : adresse et modèles préférés (les meilleurs pour les outils d'abord) */
const OPENAI_LIKE = {
  groq: {
    name: 'Groq',
    base: 'https://api.groq.com/openai/v1',
    // Chaque modèle a son propre quota gratuit (par minute et par jour) : on passe de l'un à l'autre
    prefer: ['openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct-0905', 'moonshotai/kimi-k2-instruct', 'llama-3.3-70b-versatile', 'meta-llama/llama-4-maverick', 'meta-llama/llama-4-scout', 'qwen/qwen3-32b', 'openai/gpt-oss-20b'],
    skip: /whisper|guard|tts|playai|orpheus|compound|prompt/,
  },
  openrouter: {
    name: 'OpenRouter',
    base: 'https://openrouter.ai/api/v1',
    prefer: ['deepseek/deepseek-chat-v3', 'qwen/qwen3-235b', 'meta-llama/llama-3.3-70b', 'openai/gpt-oss-120b', 'mistralai/mistral-small', 'google/gemini'],
    free: true,
  },
  mistral: {
    name: 'Mistral',
    base: 'https://api.mistral.ai/v1',
    prefer: ['mistral-medium-latest', 'mistral-small-latest', 'mistral-large-latest'],
    skip: /embed|moderation|ocr|codestral|voxtral|pixtral|devstral|magistral/,
  },
  cerebras: {
    name: 'Cerebras',
    base: 'https://api.cerebras.ai/v1',
    prefer: ['gpt-oss-120b', 'qwen-3-235b-a22b-instruct-2507', 'llama-3.3-70b', 'qwen-3-32b'],
  },
};
const NAMES = { gemini: 'Gemini', ...Object.fromEntries(Object.entries(OPENAI_LIKE).map(([k, v]) => [k, v.name])) };

/** Petit journal (userData/nox-log.txt) pour comprendre un souci de connexion */
function log(line) {
  try {
    const file = path.join(app.getPath('userData'), 'nox-log.txt');
    try { if (fs.statSync(file).size > 200000) fs.rmSync(file); } catch {}
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

const tail = (k) => `…${String(k).slice(-4)}`;

// ---------- Erreurs ----------
/** retry : la clé suivante a des chances de marcher (quota, saturation, lenteur) ; auth : clé refusée */
function apiError(status, data) {
  const msg = (data && data.error && (data.error.message || data.error)) || (data && data.message) || '';
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
  if (status === 401 || (status === 400 && /API key not valid|API_KEY_INVALID|invalid api key/i.test(text))) return Object.assign(new Error('Clé API refusée : vérifie-la dans Paramètres → Avancé → Assistant Nox.'), { status, auth: true });
  if (status === 403) return Object.assign(new Error('Cette clé n\'a pas accès à ce service (droits ou région).'), { status, auth: true });
  if (status === 429 || status === 402) return Object.assign(new Error('Quota gratuit atteint pour le moment : réessaie dans une minute.'), { status, retry: true, quota: true });
  if (status >= 500) return Object.assign(new Error('Le service est saturé pour le moment, réessaie dans un instant.'), { status, retry: true });
  return Object.assign(new Error(text || `Erreur du service (${status})`), { status, retry: status === 404 || status === 400 || status === 413 });
}
const netError = (e) => Object.assign(
  new Error(e && e.name === 'TimeoutError' ? 'Le service met trop de temps à répondre, réessaie.' : 'Impossible de joindre le service : vérifie ta connexion.'),
  { retry: true, slow: true },
);

async function request(url, opts, ms) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// Clés et modèles en difficulté récemment : essayés en dernier
const benched = new Map();
const bench = (id, ms) => benched.set(id, Date.now() + ms);
const isBenched = (id) => (benched.get(id) || 0) > Date.now();
const lastGood = new Map(); // dernière réussite par clé : réessayée en premier

// ---------- Gemini ----------
const versionOf = (name) => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(name) || [])[1] || '0');
const geminiModels = new Map();

/**
 * Modèles « Flash » accessibles avec la clé (rapides et gratuits) : versions stables d'abord,
 * les plus récentes en premier ; « Lite » en dernier recours.
 */
async function geminiList(key) {
  if (geminiModels.has(key)) return geminiModels.get(key);
  const { res, data } = await request(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }, 15000);
  if (!res.ok) throw apiError(res.status, data);
  const all = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-\d/.test(n) && /flash/.test(n) && !/image|tts|audio|live|embedding|vision|learnlm|computer|robot|thinking|research/.test(n));
  // Modèles « purs » (gemini-X-flash, -lite, -preview…), pas les variantes spécialisées
  const clean = all.filter((n) => /^gemini-\d+(\.\d+)?-flash(-lite)?(-\d{3})?(-preview)?(-\d{2}-\d{2,4})?(-latest)?$/.test(n));
  const usable = clean.length ? clean : all;
  const rank = (n) => (/lite/.test(n) ? 2 : 0) + (/preview|exp/.test(n) ? 1 : 0);
  usable.sort((a, b) => rank(a) - rank(b) || versionOf(b) - versionOf(a) || a.length - b.length);
  if (!usable.length) throw Object.assign(new Error('Aucun modèle Gemini disponible avec cette clé.'), { retry: true });
  geminiModels.set(key, usable);
  return usable;
}

/**
 * Ordre d'essai : le dernier modèle qui a marché, puis on varie les générations (quand Google
 * sature, c'est souvent toute une génération à la fois : 3.x, puis 2.5…).
 */
function geminiOrder(key, list) {
  const good = lastGood.get(key);
  const fresh = list.filter((m) => !isBenched(`gemini:${m}`));
  const pool = fresh.length ? fresh : list;
  const out = [];
  if (good && pool.includes(good)) out.push(good);
  const gen = (m) => Math.floor(versionOf(m));
  const seen = new Set(out.map(gen));
  for (const m of pool) if (!out.includes(m) && !seen.has(gen(m))) { out.push(m); seen.add(gen(m)); }
  for (const m of pool) if (!out.includes(m)) out.push(m);
  return out;
}

/**
 * Réglages adaptés à chaque génération. Gemini 3 garde sa température d'origine (plus basse,
 * il peut tourner en boucle) et réfléchit peu ; Gemini 2.5 reçoit un petit budget de réflexion.
 */
function geminiConfig(model, base) {
  const v = versionOf(model);
  const cfg = { ...base };
  if (v >= 3) { delete cfg.temperature; cfg.thinkingConfig = { thinkingLevel: 'low' }; }
  else if (v >= 2.5) cfg.thinkingConfig = { thinkingBudget: /lite/.test(model) ? 0 : 1024 };
  return cfg;
}

/** Un appel generateContent sur une clé Gemini, en essayant jusqu'à 3 modèles */
async function geminiCall(key, body, config, kind, deadline) {
  const list = await geminiList(key);
  let lastErr;
  for (const model of geminiOrder(key, list).slice(0, 3)) {
    const left = deadline - Date.now();
    if (left < 4000) break;
    const t = Date.now();
    let res, data;
    try {
      ({ res, data } = await request(`${GEMINI}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ ...body, generationConfig: geminiConfig(model, config) }),
      }, Math.min(ATTEMPT_MS, left)));
    } catch (e) {
      log(`${kind} gemini ${tail(key)} ${model} ${e && e.name} ${Date.now() - t}ms`);
      lastErr = netError(e);
      bench(`gemini:${model}`, 120000);
      continue;
    }
    const cand = (data.candidates || [])[0] || {};
    log(`${kind} gemini ${tail(key)} ${model} ${res.status} ${Date.now() - t}ms ${cand.finishReason || ''} ${res.ok ? '' : JSON.stringify(data.error || {}).slice(0, 200)}`);
    if (res.ok) { lastGood.set(key, model); return { data, model }; }
    lastErr = apiError(res.status, data);
    if (lastErr.auth) throw lastErr;
    bench(`gemini:${model}`, lastErr.quota ? 60000 : 90000);
  }
  throw lastErr || netError({ name: 'TimeoutError' });
}

/** Gemini 3 exige une signature de réflexion sur ses appels d'outils : ceux venus d'un autre service n'en ont pas */
const forGemini = (contents) => contents.map((c) => (c.role !== 'model' ? c : {
  ...c,
  parts: c.parts.map((p) => (p.functionCall && !p.thoughtSignature ? { ...p, thoughtSignature: 'skip_thought_signature_validator' } : p)),
}));

// ---------- Services compatibles OpenAI (Groq, OpenRouter, Mistral, Cerebras) ----------
const oaModels = new Map();

/** Modèles utilisables avec la clé, les meilleurs pour les outils d'abord */
async function oaModelList(provider, key) {
  const id = `${provider}:${key}`;
  if (oaModels.has(id)) return oaModels.get(id);
  const p = OPENAI_LIKE[provider];
  const { res, data } = await request(`${p.base}/models`, { headers: { Authorization: `Bearer ${key}` } }, 15000);
  if (!res.ok) throw apiError(res.status, data);
  const ids = (data.data || []).filter((m) => {
    if (p.skip && p.skip.test(m.id)) return false;
    if (p.free && !/:free$/.test(m.id)) return false;
    if (p.free && Array.isArray(m.supported_parameters) && !m.supported_parameters.includes('tools')) return false;
    return true;
  }).map((m) => m.id);
  if (!ids.length) throw Object.assign(new Error(`Aucun modèle gratuit compatible sur ${p.name} pour le moment.`), { retry: true });
  const score = (m) => { const i = p.prefer.findIndex((x) => m.startsWith(x)); return i < 0 ? 99 : i; };
  // Les modèles connus d'abord ; les inconnus seulement s'il n'y a rien d'autre
  const known = ids.filter((m) => score(m) < 99).sort((a, b) => score(a) - score(b));
  const list = known.length ? known : ids;
  oaModels.set(id, list);
  return list;
}

/** Attente demandée par le service après un quota (en ms), si elle est indiquée */
function retryAfter(res, data) {
  const h = Number(res.headers.get('retry-after'));
  if (Number.isFinite(h) && h > 0) return h * 1000;
  const m = /try again in (?:(\d+)m)?([\d.]+)s/i.exec(JSON.stringify(data || ''));
  return m ? ((+m[1] || 0) * 60 + parseFloat(m[2])) * 1000 : 0;
}

/** Identifiant d'appel d'outil accepté partout (Mistral exige 9 caractères alphanumériques) */
const callId = (s) => crypto.createHash('sha1').update(String(s)).digest('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 9).padEnd(9, '0');

/** Historique au format Gemini → messages au format OpenAI */
function toOpenAI(system, contents) {
  const msgs = [{ role: 'system', content: system }];
  const pending = []; // appels sans identifiant, associés aux réponses dans l'ordre
  contents.forEach((c, i) => {
    if (c.role === 'model') {
      const text = c.parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
      const calls = c.parts.filter((p) => p.functionCall).map((p, j) => {
        const raw = p.functionCall.id || `c${i}_${j}`;
        pending.push({ name: p.functionCall.name, raw });
        return { id: callId(raw), type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } };
      });
      msgs.push({ role: 'assistant', content: text || (calls.length ? null : '…'), ...(calls.length ? { tool_calls: calls } : {}) });
      return;
    }
    const texts = [];
    for (const p of c.parts) {
      if (p.functionResponse) {
        const r = p.functionResponse;
        const k = pending.findIndex((x) => (r.id ? x.raw === r.id : x.name === r.name));
        const raw = k >= 0 ? pending.splice(k, 1)[0].raw : r.id || r.name;
        msgs.push({ role: 'tool', tool_call_id: callId(raw), name: r.name, content: JSON.stringify((r.response && r.response.result) ?? r.response ?? null) });
      } else if (typeof p.text === 'string') texts.push(p.text);
    }
    if (texts.length) msgs.push({ role: 'user', content: texts.join('\n\n') });
  });
  return msgs;
}

const oaTools = (tools) => tools.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } },
}));

/** Un appel sur un service compatible OpenAI, en essayant jusqu'à 4 de ses modèles */
async function openaiCall(provider, key, { system, tools, contents }, kind, deadline) {
  const p = OPENAI_LIKE[provider];
  const list = await oaModelList(provider, key);
  const benchId = (m) => `${provider}:${key}:${m}`;
  const order = [...list.filter((m) => !isBenched(benchId(m))), ...list.filter((m) => isBenched(benchId(m)))];
  const body = {
    messages: toOpenAI(system, contents),
    ...(tools && tools.length ? { tools: oaTools(tools), tool_choice: 'auto' } : {}),
    temperature: 0.6,
    max_tokens: 2048,
  };
  let lastErr;
  let shortest = Infinity; // plus courte attente annoncée par un quota
  const attempt = async (model) => {
    const left = deadline - Date.now();
    if (left < 4000) throw netError({ name: 'TimeoutError' });
    const t = Date.now();
    let res, data;
    try {
      ({ res, data } = await request(`${p.base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/noctezz/nocta', 'X-Title': 'NOCTA' } : {}),
        },
        body: JSON.stringify({ model, ...body }),
      }, Math.min(ATTEMPT_MS, left)));
    } catch (e) {
      log(`${kind} ${provider} ${tail(key)} ${model} ${e && e.name} ${Date.now() - t}ms`);
      bench(benchId(model), 60000);
      throw netError(e);
    }
    const choice = (data.choices || [])[0];
    log(`${kind} ${provider} ${tail(key)} ${model} ${res.status} ${Date.now() - t}ms ${(choice && choice.finish_reason) || ''} ${res.ok ? '' : JSON.stringify(data.error || data).slice(0, 200)}`);
    if (!res.ok) {
      const err = apiError(res.status, data);
      if (err.quota) {
        const wait = retryAfter(res, data);
        shortest = Math.min(shortest, wait || 60000);
        bench(benchId(model), Math.max(wait, 5000) || 60000);
      } else bench(benchId(model), 120000);
      throw err;
    }
    if (!choice || !choice.message) throw Object.assign(new Error('Réponse vide.'), { retry: true });
    const m = choice.message;
    const parts = [];
    if (m.content) parts.push({ text: m.content });
    for (const tc of m.tool_calls || []) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}') || {}; } catch {}
      parts.push({ functionCall: { name: tc.function.name, args, id: tc.id } });
    }
    return { parts, finishReason: choice.finish_reason, model };
  };
  for (const model of order.slice(0, 4)) {
    try {
      return await attempt(model);
    } catch (e) {
      lastErr = e;
      if (e.auth) throw e;
    }
  }
  // Tous saturés, mais le quota se libère dans quelques secondes : on patiente un peu
  if (lastErr && lastErr.quota && shortest <= 12000 && deadline - Date.now() > shortest + 8000) {
    await new Promise((r) => setTimeout(r, shortest + 300));
    return attempt(order[0]);
  }
  throw lastErr || netError({ name: 'TimeoutError' });
}

// ---------- Choix de la clé ----------
/** Clés valides, celles en difficulté récemment à la fin (l'ordre choisi par l'utilisateur sinon) */
function orderKeys(keys) {
  const list = (keys || []).filter((k) => k && k.key && (k.provider === 'gemini' || OPENAI_LIKE[k.provider]));
  return [...list.filter((k) => !isBenched(`key:${k.key}`)), ...list.filter((k) => isBenched(`key:${k.key}`))];
}

/** Message final quand aucune clé n'a pu répondre */
function finalError(errors) {
  if (!errors.length) return new Error('Aucune clé API : ajoute une clé dans Paramètres → Avancé → Assistant Nox.');
  if (errors.every((e) => e.auth)) return errors[0];
  if (errors.some((e) => e.quota) && errors.every((e) => e.quota || e.auth)) return new Error('Quota gratuit atteint sur toutes tes clés : réessaie dans une minute, ou ajoute une autre clé (Groq, OpenRouter…) dans les paramètres.');
  return new Error(errors.length > 1 ? 'Tous les services sont saturés pour le moment : réessaie dans un instant.' : errors[errors.length - 1].message);
}

async function eachKey(keys, kind, fn) {
  const deadline = Date.now() + TOTAL_MS;
  const errors = [];
  for (const k of orderKeys(keys)) {
    if (deadline - Date.now() < 4000) break;
    try {
      return await fn(k, deadline);
    } catch (e) {
      errors.push(e);
      if (!e.auth) bench(`key:${k.key}`, e.quota ? 60000 : 45000);
      log(`${kind} ${k.provider} ${tail(k.key)} échec : ${e.message}`);
    }
  }
  throw finalError(errors);
}

const fail = (e) => ({ ok: false, error: String((e && e.message) || e) });

/** Compatibilité : ancienne clé unique (Gemini) */
const keysOf = (req) => (req.keys && req.keys.length ? req.keys : req.apiKey ? [{ provider: 'gemini', key: req.apiKey }] : []);

/**
 * Un tour de conversation : renvoie le contenu du modèle (à remettre tel quel dans l'historique,
 * signatures de réflexion comprises), la raison d'arrêt et le service utilisé.
 */
async function create(req) {
  const { system, tools, contents } = req;
  try {
    return await eachKey(keysOf(req), 'chat', async (k, deadline) => {
      if (k.provider === 'gemini') {
        const { data, model } = await geminiCall(k.key, {
          systemInstruction: { parts: [{ text: system }] },
          contents: forGemini(contents),
          ...(tools && tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
        }, { temperature: 0.7, maxOutputTokens: 8192 }, 'chat', deadline);
        const cand = (data.candidates || [])[0];
        if (!cand || !cand.content) {
          if (data.promptFeedback && data.promptFeedback.blockReason) return { ok: false, error: 'Gemini a refusé de répondre à cette question.' };
          throw Object.assign(new Error('Pas de réponse de Gemini.'), { retry: true });
        }
        return { ok: true, content: { role: 'model', parts: cand.content.parts || [] }, finishReason: cand.finishReason, model, via: 'Gemini' };
      }
      const out = await openaiCall(k.provider, k.key, { system, tools, contents }, 'chat', deadline);
      return { ok: true, content: { role: 'model', parts: out.parts }, finishReason: out.finishReason, model: out.model, via: NAMES[k.provider] };
    });
  } catch (e) {
    return fail(e);
  }
}

// ---------- Voix ----------
const PROMPT = 'Transcris exactement ce message vocal (en français, avec la ponctuation). L\'assistant s\'appelle « Nox ». Réponds uniquement par le texte transcrit, sans guillemets. S\'il n\'y a pas de parole, réponds par une chaîne vide.';

const WHISPER = ['whisper-large-v3-turbo', 'whisper-large-v3'];
let whisperTurn = 0;

/** Phrases inventées par Whisper sur du silence ou du bruit (génériques de sous-titres…) */
const HALLU = /sous-titr|amara\.org|merci d'avoir regard|abonnez-vous|n'oubliez pas de vous abonner|merci de votre attention|♪|^\W*$/i;
function cleanHeard(t) {
  const s = t.replace(/\s+/g, ' ').trim();
  return HALLU.test(s) && s.length < 90 ? '' : s;
}

/** Transcription d'un message vocal (WAV en base64) : Whisper chez Groq (rapide), sinon Gemini */
async function transcribe(req) {
  const { audio, mime } = req;
  const keys = keysOf(req).filter((k) => k.provider === 'groq' || k.provider === 'gemini')
    .sort((a, b) => (a.provider === 'groq' ? 0 : 1) - (b.provider === 'groq' ? 0 : 1));
  if (!keys.length) return { ok: false, error: 'Pour parler à Nox, il faut une clé Gemini ou Groq.' };
  try {
    return await eachKey(keys, 'voice', async (k, deadline) => {
      if (k.provider === 'groq') {
        // Deux modèles Whisper, chacun avec son quota gratuit : on alterne (le double d'écoute par jour)
        const order = WHISPER.map((_, i) => WHISPER[(whisperTurn + i) % WHISPER.length]).filter((m) => !isBenched(`whisper:${k.key}:${m}`));
        whisperTurn++;
        let lastErr;
        for (const model of order.length ? order : WHISPER) {
          const form = new FormData();
          form.append('file', new Blob([Buffer.from(audio, 'base64')], { type: mime || 'audio/wav' }), 'voix.wav');
          form.append('model', model);
          form.append('language', 'fr');
          form.append('response_format', 'json');
          // Aide Whisper à reconnaître le nom de l'assistant et les titres de l'utilisateur
          form.append('prompt', (req.prompt || 'Nox, lance-moi Spider-Man. Nox, mets pause.').slice(0, 600));
          const t = Date.now();
          let res, data;
          try {
            ({ res, data } = await request(`${OPENAI_LIKE.groq.base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${k.key}` }, body: form }, Math.min(15000, deadline - Date.now())));
          } catch (e) { lastErr = netError(e); continue; }
          log(`voice groq ${tail(k.key)} ${model} ${res.status} ${Date.now() - t}ms`);
          if (res.ok) return { ok: true, text: cleanHeard(String(data.text || '')) };
          lastErr = apiError(res.status, data);
          if (lastErr.auth) throw lastErr;
          bench(`whisper:${k.key}:${model}`, lastErr.quota ? Math.max(retryAfter(res, data), 20000) : 60000);
        }
        throw lastErr || netError({ name: 'TimeoutError' });
      }
      const { data } = await geminiCall(k.key, {
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime || 'audio/wav', data: audio } }, { text: PROMPT }] }],
      }, { temperature: 0 }, 'voice', deadline);
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      return { ok: true, text: cleanHeard(parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('')) };
    });
  } catch (e) {
    return fail(e);
  }
}

/** Vérifie une clé par une vraie petite question : service, modèle et temps de réponse */
async function testKey(arg) {
  const k = typeof arg === 'string' ? { provider: 'gemini', key: arg } : arg;
  benched.delete(`key:${k.key}`);
  geminiModels.delete(k.key);
  oaModels.delete(`${k.provider}:${k.key}`);
  for (const id of [...benched.keys()]) if (id.includes(k.key)) benched.delete(id);
  const t = Date.now();
  try {
    const deadline = Date.now() + 60000;
    let model;
    if (k.provider === 'gemini') {
      // Plusieurs modèles essayés : une génération saturée ne rend pas la clé mauvaise
      ({ model } = await geminiCall(k.key, { contents: [{ role: 'user', parts: [{ text: 'Réponds juste : ok' }] }] }, { maxOutputTokens: 2048 }, 'test', deadline));
    } else if (OPENAI_LIKE[k.provider]) {
      ({ model } = await openaiCall(k.provider, k.key, { system: 'Réponds en un mot.', tools: [], contents: [{ role: 'user', parts: [{ text: 'Réponds juste : ok' }] }] }, 'test', deadline));
    } else return { ok: false, error: 'Service inconnu' };
    return { ok: true, model, via: NAMES[k.provider], ms: Date.now() - t };
  } catch (e) {
    // Clé bonne mais service saturé : on peut la garder quand même
    return { ok: false, error: e.message, keyOk: !e.auth && !!e.retry };
  }
}

// ---------- Voix de Nox (Gemini, voix naturelles) ----------
const ttsModels = new Map();

/** Modèles « TTS » de Gemini accessibles avec la clé (Flash d'abord, plus rapides et gratuits) */
async function ttsList(key) {
  if (ttsModels.has(key)) return ttsModels.get(key);
  const { res, data } = await request(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }, 15000);
  if (!res.ok) throw apiError(res.status, data);
  const list = (data.models || []).map((m) => m.name.replace(/^models\//, '')).filter((n) => /^gemini-.*tts/.test(n))
    .sort((a, b) => (/flash/.test(b) ? 1 : 0) - (/flash/.test(a) ? 1 : 0) || versionOf(b) - versionOf(a));
  if (!list.length) throw Object.assign(new Error('Pas de voix Gemini disponible avec cette clé.'), { retry: true });
  ttsModels.set(key, list);
  return list;
}

/**
 * Nox lit sa réponse avec une voix naturelle Gemini. Renvoie du PCM 16 bits (base64) et sa
 * fréquence ; en cas d'échec (quota…), l'interface prend la voix de Windows.
 */
async function tts(req) {
  const keys = keysOf(req).filter((k) => k.provider === 'gemini');
  if (!keys.length) return { ok: false, error: 'Il faut une clé Gemini pour la voix naturelle.' };
  try {
    return await eachKey(keys, 'tts', async (k, deadline) => {
      let lastErr;
      for (const model of (await ttsList(k.key)).slice(0, 2)) {
        if (isBenched(`tts:${model}`)) continue;
        const t = Date.now();
        let res, data;
        try {
          ({ res, data } = await request(`${GEMINI}/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k.key },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `Lis ce texte en français, d'un ton chaleureux, enjoué et naturel, comme un ami cinéphile : ${req.text}` }] }],
              generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice || 'Puck' } } } },
            }),
          }, Math.min(30000, deadline - Date.now())));
        } catch (e) { lastErr = netError(e); continue; }
        log(`tts gemini ${tail(k.key)} ${model} ${res.status} ${Date.now() - t}ms`);
        if (!res.ok) {
          lastErr = apiError(res.status, data);
          if (lastErr.auth) throw lastErr;
          bench(`tts:${model}`, lastErr.quota ? 10 * 60000 : 60000);
          continue;
        }
        const part = ((((data.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData);
        if (!part) { lastErr = Object.assign(new Error('Pas d\'audio reçu.'), { retry: true }); continue; }
        const rate = Number((/rate=(\d+)/.exec(part.inlineData.mimeType || '') || [])[1]) || 24000;
        return { ok: true, audio: part.inlineData.data, rate };
      }
      throw lastErr || Object.assign(new Error('Voix indisponible pour le moment.'), { retry: true });
    });
  } catch (e) {
    return fail(e);
  }
}

module.exports = { create, transcribe, testKey, tts };
