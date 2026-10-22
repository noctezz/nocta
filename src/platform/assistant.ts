// IA de l'X-Ray sur la TV : même fonctionnement que sur PC (electron/assistant.cjs) — Gemini, Groq,
// OpenRouter, Mistral, Cerebras, plusieurs clés avec repli automatique — mais les appels passent par
// le réseau natif de la box (window.nocta.http), sans blocage des pages web.

type Part = { text?: string; thought?: boolean; functionCall?: { name: string; args?: unknown; id?: string }; functionResponse?: { name: string; id?: string; response?: any } };
type Content = { role: string; parts: Part[] };
type Key = { provider: string; key: string };
type Tool = { name: string; description?: string; parameters?: unknown };
type ApiErr = Error & { status?: number; auth?: boolean; retry?: boolean; quota?: boolean };

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const ATTEMPT_MS = 25000;
const TOTAL_MS = 110000;

const OPENAI_LIKE: Record<string, { name: string; base: string; prefer: string[]; skip?: RegExp; free?: boolean }> = {
  groq: {
    name: 'Groq',
    base: 'https://api.groq.com/openai/v1',
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
const NAMES: Record<string, string> = { gemini: 'Gemini', ...Object.fromEntries(Object.entries(OPENAI_LIKE).map(([k, v]) => [k, v.name])) };

// ---------- Erreurs ----------
const err = (message: string, extra: Partial<ApiErr>): ApiErr => Object.assign(new Error(message), extra);

function apiError(status: number, data: any): ApiErr {
  const msg = data?.error?.message || data?.error || data?.message || '';
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
  if (status === 401 || (status === 400 && /API key not valid|API_KEY_INVALID|invalid api key/i.test(text))) return err('Clé API refusée : vérifie-la dans Paramètres → Avancé → X-Ray.', { status, auth: true });
  if (status === 403) return err('Cette clé n\'a pas accès à ce service (droits ou région).', { status, auth: true });
  if (status === 429 || status === 402) return err('Quota gratuit atteint pour le moment : réessaie dans une minute.', { status, retry: true, quota: true });
  if (status >= 500) return err('Le service est saturé pour le moment, réessaie dans un instant.', { status, retry: true });
  return err(text || `Erreur du service (${status})`, { status, retry: status === 404 || status === 400 || status === 413 });
}
const netError = (timeout: boolean) => err(timeout ? 'Le service met trop de temps à répondre, réessaie.' : 'Impossible de joindre le service : vérifie ta connexion.', { retry: true });

async function request(url: string, opts: { method?: string; headers?: Record<string, string>; body?: unknown }, ms: number) {
  const r = await window.nocta!.http(url, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    timeout: ms,
  });
  if (!r.status) throw netError(/timeout/i.test(r.error || ''));
  return { ok: r.ok, status: r.status, data: (r.data && typeof r.data === 'object' ? r.data : {}) as any };
}

// Clés et modèles en difficulté récemment : essayés en dernier
const benched = new Map<string, number>();
const bench = (id: string, ms: number) => benched.set(id, Date.now() + ms);
const isBenched = (id: string) => (benched.get(id) || 0) > Date.now();
const lastGood = new Map<string, string>();

// ---------- Gemini ----------
const versionOf = (name: string) => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(name) || [])[1] || '0');
const geminiModels = new Map<string, string[]>();

async function geminiList(key: string) {
  if (geminiModels.has(key)) return geminiModels.get(key)!;
  const { ok, status, data } = await request(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }, 15000);
  if (!ok) throw apiError(status, data);
  const all: string[] = (data.models || [])
    .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m: any) => m.name.replace(/^models\//, ''))
    .filter((n: string) => /^gemini-\d/.test(n) && /flash/.test(n) && !/image|tts|audio|live|embedding|vision|learnlm|computer|robot|thinking|research/.test(n));
  const clean = all.filter((n) => /^gemini-\d+(\.\d+)?-flash(-lite)?(-\d{3})?(-preview)?(-\d{2}-\d{2,4})?(-latest)?$/.test(n));
  const usable = clean.length ? clean : all;
  const rank = (n: string) => (/lite/.test(n) ? 2 : 0) + (/preview|exp/.test(n) ? 1 : 0);
  usable.sort((a, b) => rank(a) - rank(b) || versionOf(b) - versionOf(a) || a.length - b.length);
  if (!usable.length) throw err('Aucun modèle Gemini disponible avec cette clé.', { retry: true });
  geminiModels.set(key, usable);
  return usable;
}

function geminiOrder(key: string, list: string[]) {
  const good = lastGood.get(key);
  const fresh = list.filter((m) => !isBenched(`gemini:${m}`));
  const pool = fresh.length ? fresh : list;
  const out: string[] = [];
  if (good && pool.includes(good)) out.push(good);
  const gen = (m: string) => Math.floor(versionOf(m));
  const seen = new Set(out.map(gen));
  for (const m of pool) if (!out.includes(m) && !seen.has(gen(m))) { out.push(m); seen.add(gen(m)); }
  for (const m of pool) if (!out.includes(m)) out.push(m);
  return out;
}

function geminiConfig(model: string, base: Record<string, unknown>) {
  const v = versionOf(model);
  const cfg: Record<string, unknown> = { ...base };
  if (v >= 3) { delete cfg.temperature; cfg.thinkingConfig = { thinkingLevel: 'low' }; }
  else if (v >= 2.5) cfg.thinkingConfig = { thinkingBudget: /lite/.test(model) ? 0 : 1024 };
  return cfg;
}

async function geminiCall(key: string, body: Record<string, unknown>, config: Record<string, unknown>, deadline: number) {
  const list = await geminiList(key);
  let lastErr: ApiErr | undefined;
  for (const model of geminiOrder(key, list).slice(0, 3)) {
    const left = deadline - Date.now();
    if (left < 4000) break;
    let res;
    try {
      res = await request(`${GEMINI}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: { ...body, generationConfig: geminiConfig(model, config) },
      }, Math.min(ATTEMPT_MS, left));
    } catch (e) {
      lastErr = e as ApiErr;
      bench(`gemini:${model}`, 120000);
      continue;
    }
    if (res.ok) { lastGood.set(key, model); return { data: res.data, model }; }
    lastErr = apiError(res.status, res.data);
    if (lastErr.auth) throw lastErr;
    bench(`gemini:${model}`, lastErr.quota ? 60000 : 90000);
  }
  throw lastErr || netError(true);
}

const forGemini = (contents: Content[]) => contents.map((c) => (c.role !== 'model' ? c : {
  ...c,
  parts: c.parts.map((p) => (p.functionCall && !(p as any).thoughtSignature ? { ...p, thoughtSignature: 'skip_thought_signature_validator' } : p)),
}));

// ---------- Services compatibles OpenAI ----------
const oaModels = new Map<string, string[]>();

async function oaModelList(provider: string, key: string) {
  const id = `${provider}:${key}`;
  if (oaModels.has(id)) return oaModels.get(id)!;
  const p = OPENAI_LIKE[provider];
  const { ok, status, data } = await request(`${p.base}/models`, { headers: { Authorization: `Bearer ${key}` } }, 15000);
  if (!ok) throw apiError(status, data);
  const ids: string[] = (data.data || []).filter((m: any) => {
    if (p.skip && p.skip.test(m.id)) return false;
    if (p.free && !/:free$/.test(m.id)) return false;
    if (p.free && Array.isArray(m.supported_parameters) && !m.supported_parameters.includes('tools')) return false;
    return true;
  }).map((m: any) => m.id);
  if (!ids.length) throw err(`Aucun modèle gratuit compatible sur ${p.name} pour le moment.`, { retry: true });
  const score = (m: string) => { const i = p.prefer.findIndex((x) => m.startsWith(x)); return i < 0 ? 99 : i; };
  const known = ids.filter((m) => score(m) < 99).sort((a, b) => score(a) - score(b));
  const list = known.length ? known : ids;
  oaModels.set(id, list);
  return list;
}

/** Identifiant d'appel d'outil accepté partout (Mistral exige 9 caractères alphanumériques) */
function callId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h.toString(36) + 'x0000000').slice(0, 9);
}

function toOpenAI(system: string, contents: Content[]) {
  const msgs: any[] = [{ role: 'system', content: system }];
  const pending: { name: string; raw: string }[] = [];
  contents.forEach((c, i) => {
    if (c.role === 'model') {
      const text = c.parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
      const calls = c.parts.filter((p) => p.functionCall).map((p, j) => {
        const raw = p.functionCall!.id || `c${i}_${j}`;
        pending.push({ name: p.functionCall!.name, raw });
        return { id: callId(raw), type: 'function', function: { name: p.functionCall!.name, arguments: JSON.stringify(p.functionCall!.args || {}) } };
      });
      msgs.push({ role: 'assistant', content: text || (calls.length ? null : '…'), ...(calls.length ? { tool_calls: calls } : {}) });
      return;
    }
    const texts: string[] = [];
    for (const p of c.parts) {
      if (p.functionResponse) {
        const r = p.functionResponse;
        const k = pending.findIndex((x) => (r.id ? x.raw === r.id : x.name === r.name));
        const raw = k >= 0 ? pending.splice(k, 1)[0].raw : r.id || r.name;
        msgs.push({ role: 'tool', tool_call_id: callId(raw), name: r.name, content: JSON.stringify(r.response?.result ?? r.response ?? null) });
      } else if (typeof p.text === 'string') texts.push(p.text);
    }
    if (texts.length) msgs.push({ role: 'user', content: texts.join('\n\n') });
  });
  return msgs;
}

const oaTools = (tools: Tool[]) => tools.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } },
}));

async function openaiCall(provider: string, key: string, { system, tools, contents }: { system: string; tools: Tool[]; contents: Content[] }, deadline: number) {
  const p = OPENAI_LIKE[provider];
  const list = await oaModelList(provider, key);
  const benchId = (m: string) => `${provider}:${key}:${m}`;
  const order = [...list.filter((m) => !isBenched(benchId(m))), ...list.filter((m) => isBenched(benchId(m)))];
  const body = {
    messages: toOpenAI(system, contents),
    ...(tools.length ? { tools: oaTools(tools), tool_choice: 'auto' } : {}),
    temperature: 0.6,
    max_tokens: 2048,
  };
  let lastErr: ApiErr | undefined;
  for (const model of order.slice(0, 4)) {
    const left = deadline - Date.now();
    if (left < 4000) break;
    try {
      const res = await request(`${p.base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/noctezz/nocta', 'X-Title': 'NOCTA' } : {}),
        },
        body: { model, ...body },
      }, Math.min(ATTEMPT_MS, left));
      if (!res.ok) {
        const e = apiError(res.status, res.data);
        bench(benchId(model), e.quota ? 60000 : 120000);
        throw e;
      }
      const choice = (res.data.choices || [])[0];
      if (!choice?.message) throw err('Réponse vide.', { retry: true });
      const m = choice.message;
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls || []) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}') || {}; } catch { /* arguments illisibles */ }
        parts.push({ functionCall: { name: tc.function.name, args, id: tc.id } });
      }
      return { parts, finishReason: choice.finish_reason, model };
    } catch (e) {
      lastErr = e as ApiErr;
      if (lastErr.auth) throw lastErr;
    }
  }
  throw lastErr || netError(true);
}

// ---------- Choix de la clé ----------
function orderKeys(keys: Key[]) {
  const list = (keys || []).filter((k) => k?.key && (k.provider === 'gemini' || OPENAI_LIKE[k.provider]));
  return [...list.filter((k) => !isBenched(`key:${k.key}`)), ...list.filter((k) => isBenched(`key:${k.key}`))];
}

function finalError(errors: ApiErr[]) {
  if (!errors.length) return new Error('Aucune clé API : ajoute une clé dans Paramètres → Avancé → X-Ray.');
  if (errors.every((e) => e.auth)) return errors[0];
  if (errors.some((e) => e.quota) && errors.every((e) => e.quota || e.auth)) return new Error('Quota gratuit atteint sur toutes tes clés : réessaie dans une minute, ou ajoute une autre clé (Groq, OpenRouter…) dans les paramètres.');
  return new Error(errors.length > 1 ? 'Tous les services sont saturés pour le moment : réessaie dans un instant.' : errors[errors.length - 1].message);
}

/** Un tour de conversation (mêmes entrées et sorties que sur PC) */
export async function create(req: { keys: Key[]; system: string; tools: unknown; contents: unknown }) {
  const tools = (Array.isArray(req.tools) ? req.tools : []) as Tool[];
  const contents = req.contents as Content[];
  const deadline = Date.now() + TOTAL_MS;
  const errors: ApiErr[] = [];
  for (const k of orderKeys(req.keys)) {
    if (deadline - Date.now() < 4000) break;
    try {
      if (k.provider === 'gemini') {
        const { data, model } = await geminiCall(k.key, {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: forGemini(contents),
          ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
        }, { temperature: 0.7, maxOutputTokens: 8192 }, deadline);
        const cand = (data.candidates || [])[0];
        if (!cand?.content) {
          if (data.promptFeedback?.blockReason) return { ok: false, error: 'Gemini a refusé de répondre à cette question.' };
          throw err('Pas de réponse de Gemini.', { retry: true });
        }
        return { ok: true, content: { role: 'model', parts: cand.content.parts || [] }, finishReason: cand.finishReason, model, via: 'Gemini' };
      }
      const out = await openaiCall(k.provider, k.key, { system: req.system, tools, contents }, deadline);
      return { ok: true, content: { role: 'model', parts: out.parts }, finishReason: out.finishReason, model: out.model, via: NAMES[k.provider] };
    } catch (e) {
      const x = e as ApiErr;
      errors.push(x);
      if (!x.auth) bench(`key:${k.key}`, x.quota ? 60000 : 45000);
    }
  }
  return { ok: false, error: finalError(errors).message };
}

/** Vérifie une clé par une vraie petite question */
export async function testKey(k: Key) {
  benched.delete(`key:${k.key}`);
  geminiModels.delete(k.key);
  oaModels.delete(`${k.provider}:${k.key}`);
  for (const id of [...benched.keys()]) if (id.includes(k.key)) benched.delete(id);
  const t = Date.now();
  try {
    const deadline = Date.now() + 60000;
    let model;
    if (k.provider === 'gemini') {
      ({ model } = await geminiCall(k.key, { contents: [{ role: 'user', parts: [{ text: 'Réponds juste : ok' }] }] }, { maxOutputTokens: 2048 }, deadline));
    } else if (OPENAI_LIKE[k.provider]) {
      ({ model } = await openaiCall(k.provider, k.key, { system: 'Réponds en un mot.', tools: [], contents: [{ role: 'user', parts: [{ text: 'Réponds juste : ok' }] }] }, deadline));
    } else return { ok: false, error: 'Service inconnu' };
    return { ok: true, model, via: NAMES[k.provider], ms: Date.now() - t };
  } catch (e) {
    const x = e as ApiErr;
    return { ok: false, error: x.message, keyOk: !x.auth && !!x.retry };
  }
}
