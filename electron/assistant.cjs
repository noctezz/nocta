// Nox, l'assistant de NOCTA, réfléchit avec Gemini (Google AI Studio, gratuit dans la limite
// des quotas). Les appels se font ici, dans le processus principal, pour que la clé ne passe
// jamais par l'interface. La boucle d'outils (recherche, casting, VF, lecture…) tourne dans
// l'interface, qui envoie l'historique complet à chaque tour.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const API = 'https://generativelanguage.googleapis.com/v1beta';
const ATTEMPT_MS = 40000; // au-delà, on essaie le modèle suivant
const TOTAL_MS = 80000;

/** Petit journal (userData/nox-log.txt) pour comprendre un souci de connexion */
function log(line) {
  try {
    const file = path.join(app.getPath('userData'), 'nox-log.txt');
    try { if (fs.statSync(file).size > 200000) fs.rmSync(file); } catch {}
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {}
}

let models = null; // modèles utilisables avec la clé, du meilleur au moins bon
let modelsKey = '';

/** Version d'un nom de modèle (gemini-2.5-flash → 2.5) pour trier du plus récent au plus ancien */
const versionOf = (name) => parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(name) || [])[1] || '0');

/**
 * Choisit automatiquement les modèles « Flash » accessibles avec la clé (rapides et gratuits) :
 * les versions stables d'abord, les plus récentes en premier ; « Lite » en dernier recours.
 */
async function modelsFor(apiKey) {
  if (models && modelsKey === apiKey) return models;
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(res.status, data);
  const all = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-\d/.test(n) && /flash/.test(n) && !/image|tts|audio|live|embedding|vision|learnlm|computer|robot|thinking|research/.test(n));
  // Modèles « purs » d'abord (gemini-X-flash, -lite, -preview…), pas les variantes spécialisées
  const clean = all.filter((n) => /^gemini-\d+(\.\d+)?-flash(-lite)?(-\d{3})?(-preview)?(-\d{2}-\d{2,4})?(-latest)?$/.test(n));
  const usable = clean.length ? clean : all;
  const rank = (n) => (/lite/.test(n) ? 2 : 0) + (/preview|exp/.test(n) ? 1 : 0);
  usable.sort((a, b) => rank(a) - rank(b) || versionOf(b) - versionOf(a) || a.length - b.length);
  if (!usable.length) throw new Error('Aucun modèle Gemini disponible avec cette clé.');
  models = usable;
  modelsKey = apiKey;
  return models;
}

function apiError(status, data) {
  const msg = (data && data.error && data.error.message) || '';
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) return Object.assign(new Error('Clé API refusée : vérifie-la dans Paramètres → Avancé → Assistant Nox.'), { status });
  if (status === 403) return Object.assign(new Error('Cette clé n\'a pas accès à l\'API Gemini (active « Generative Language API » sur ton compte Google).'), { status });
  if (status === 429) return Object.assign(new Error('Quota gratuit atteint pour le moment : réessaie dans une minute.'), { status, quota: true });
  if (status >= 500) return Object.assign(new Error('Le service de Google ne répond pas pour le moment, réessaie dans un instant.'), { status });
  return Object.assign(new Error(msg || `Erreur de l'API Gemini (${status})`), { status });
}

/**
 * Réglages adaptés à chaque génération de modèle. Gemini 3 doit garder sa température par
 * défaut (plus basse, il peut tourner en boucle) et réfléchir peu pour répondre vite ;
 * Gemini 2.5 reçoit un petit budget de réflexion.
 */
function configFor(model, base) {
  const v = versionOf(model);
  const cfg = { ...base };
  if (v >= 3) { delete cfg.temperature; cfg.thinkingConfig = { thinkingLevel: 'low' }; }
  else if (v >= 2.5) cfg.thinkingConfig = { thinkingBudget: /lite/.test(model) ? 0 : 1024 };
  return cfg;
}

/** Modèles qui ont posé problème récemment (quota, lenteur) : essayés en dernier */
const benched = new Map();

/** Appel à generateContent, en passant au modèle suivant en cas de quota, d'absence ou de lenteur */
async function generate(apiKey, body, config, kind) {
  const list = await modelsFor(apiKey);
  const now = Date.now();
  const order = [...list].sort((a, b) => ((benched.get(a) || 0) > now) - ((benched.get(b) || 0) > now));
  const t0 = Date.now();
  let lastErr;
  for (const model of order.slice(0, 3)) {
    const left = TOTAL_MS - (Date.now() - t0);
    if (left < 5000) break;
    const t = Date.now();
    try {
      const res = await fetch(`${API}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ ...body, generationConfig: configFor(model, config) }),
        signal: AbortSignal.timeout(Math.min(ATTEMPT_MS, left)),
      });
      const data = await res.json().catch(() => ({}));
      const cand = (data.candidates || [])[0] || {};
      log(`${kind} ${model} ${res.status} ${Date.now() - t}ms ${cand.finishReason || ''} ${res.ok ? '' : JSON.stringify(data.error || {}).slice(0, 300)}`);
      if (res.ok) return { data, model };
      lastErr = apiError(res.status, data);
      if (lastErr.quota) benched.set(model, Date.now() + 60000);
      // Paramètre refusé par ce modèle : on essaie le suivant plutôt que d'abandonner
      if (!lastErr.quota && res.status !== 404 && res.status !== 400 && res.status < 500) break;
    } catch (e) {
      log(`${kind} ${model} ${e && e.name} ${Date.now() - t}ms`);
      lastErr = e && e.name === 'TimeoutError' ? new Error('Gemini met trop de temps à répondre, réessaie.') : new Error('Impossible de joindre Google : vérifie ta connexion.');
      benched.set(model, Date.now() + 120000);
    }
  }
  throw lastErr || new Error('Gemini met trop de temps à répondre, réessaie.');
}

const fail = (e) => ({ ok: false, error: e && e.name === 'TimeoutError' ? 'Gemini met trop de temps à répondre, réessaie.' : String((e && e.message) || e) });

/**
 * Un tour de conversation : renvoie le contenu du modèle (à remettre tel quel dans l'historique,
 * signatures de réflexion comprises) et la raison d'arrêt.
 */
async function create({ apiKey, system, tools, contents }) {
  if (!apiKey) return { ok: false, error: 'Aucune clé API : ajoute ta clé Google dans Paramètres → Avancé → Assistant Nox.' };
  try {
    const { data, model } = await generate(apiKey, {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: tools }],
    }, { temperature: 0.7, maxOutputTokens: 8192 }, 'chat');
    const cand = (data.candidates || [])[0];
    if (!cand || !cand.content) {
      const blocked = data.promptFeedback && data.promptFeedback.blockReason;
      return { ok: false, error: blocked ? 'Gemini a refusé de répondre à cette question.' : 'Pas de réponse de Gemini.' };
    }
    return { ok: true, content: { role: 'model', parts: cand.content.parts || [] }, finishReason: cand.finishReason, model };
  } catch (e) {
    return fail(e);
  }
}

/** Transcription d'un message vocal (WAV en base64) */
async function transcribe({ apiKey, audio, mime }) {
  try {
    const { data } = await generate(apiKey, {
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mime || 'audio/wav', data: audio } },
          { text: 'Transcris exactement ce message vocal (en français, avec la ponctuation). Réponds uniquement par le texte transcrit, sans guillemets. S\'il n\'y a pas de parole, réponds par une chaîne vide.' },
        ],
      }],
    }, { temperature: 0 }, 'voice');
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    return { ok: true, text: parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim() };
  } catch (e) {
    return fail(e);
  }
}

/** Vérifie la clé par une vraie petite question, et indique le modèle et le temps de réponse */
async function testKey(apiKey) {
  try {
    models = null;
    benched.clear();
    const t = Date.now();
    const { model } = await generate(apiKey, { contents: [{ role: 'user', parts: [{ text: 'Réponds juste : ok' }] }] }, { maxOutputTokens: 2048 }, 'test');
    return { ok: true, model, ms: Date.now() - t };
  } catch (e) {
    return fail(e);
  }
}

module.exports = { create, transcribe, testKey };
