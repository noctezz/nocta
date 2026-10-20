// Nox, l'assistant de NOCTA : les appels à Claude (API Anthropic) se font ici, dans le
// processus principal, pour que la clé ne passe jamais par l'interface. La boucle d'outils
// (recherche, casting, vérification de la VF, lecture…) tourne dans l'interface, qui
// envoie l'historique complet à chaque tour.
const AnthropicSDK = require('@anthropic-ai/sdk');

const Anthropic = AnthropicSDK.default || AnthropicSDK;
const MODEL = 'claude-opus-5-5';

let client = null;
let clientKey = '';
function clientFor(apiKey) {
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120000 });
    clientKey = apiKey;
  }
  return client;
}

/** Message d'erreur clair, à partir des classes d'erreur du SDK */
function explain(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Clé API refusée : vérifie-la dans Paramètres → Avancé → Assistant Nox.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Cette clé API n\'a pas accès à ce modèle.';
  if (e instanceof Anthropic.RateLimitError) return 'Trop de questions d\'un coup : réessaie dans quelques secondes.';
  if (e instanceof Anthropic.BadRequestError) return `Requête refusée par l'API : ${e.message}`;
  if (e instanceof Anthropic.APIError && e.status >= 500) return 'Le service de Claude ne répond pas pour le moment, réessaie dans un instant.';
  if (e instanceof Anthropic.APIConnectionError) return 'Pas de connexion à Internet, ou le service est injoignable.';
  if (e instanceof Anthropic.APIError) return `Erreur de l'API (${e.status}) : ${e.message}`;
  return String((e && e.message) || e);
}

/**
 * Un tour de conversation : renvoie le contenu complet de la réponse (à remettre tel quel
 * dans l'historique, blocs de réflexion compris) et la raison d'arrêt.
 */
async function create({ apiKey, system, tools, messages }) {
  if (!apiKey) return { ok: false, error: 'Aucune clé API : ajoute-la dans Paramètres → Avancé → Assistant Nox.' };
  try {
    const res = await clientFor(apiKey).beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Discussion : un niveau d'effort bas suffit et répond plus vite
      output_config: { effort: 'low' },
      // Si le modèle décline une demande, un autre modèle prend le relais dans le même appel
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      system,
      tools,
      messages,
    });
    return { ok: true, content: res.content, stop_reason: res.stop_reason, stop_details: res.stop_details || null };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

/** Vérifie la clé sans rien facturer (lecture des infos du modèle) */
async function testKey(apiKey) {
  try {
    const m = await clientFor(apiKey).models.retrieve(MODEL);
    return { ok: true, model: m.display_name || MODEL };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

module.exports = { create, testKey };
