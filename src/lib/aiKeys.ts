// Les services d'IA gratuits utilisés par X-Ray, et les clés enregistrées (dans l'ordre d'essai)
import type { Settings } from './types';

export type AiProvider = 'gemini' | 'groq' | 'openrouter' | 'mistral' | 'cerebras';
export interface AiKey { provider: AiProvider; key: string }

export const PROVIDERS: Record<AiProvider, { name: string; url: string; hint: string; placeholder: string }> = {
  gemini: { name: 'Gemini (Google)', url: 'https://aistudio.google.com/apikey', hint: 'Gratuit, le plus complet. Connecte-toi avec ton compte Google, puis « Create API key ».', placeholder: 'AIza…' },
  groq: { name: 'Groq', url: 'https://console.groq.com/keys', hint: 'Gratuit et ultra rapide. Crée un compte, puis « Create API Key ».', placeholder: 'gsk_…' },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/settings/keys', hint: 'Modèles gratuits (environ 50 questions par jour). Crée un compte, puis « Create API Key ».', placeholder: 'sk-or-…' },
  mistral: { name: 'Mistral', url: 'https://console.mistral.ai/api-keys', hint: 'IA française. Choisis l\'offre gratuite « Experiment », puis crée une clé.', placeholder: 'Clé Mistral' },
  cerebras: { name: 'Cerebras', url: 'https://cloud.cerebras.ai/', hint: 'Très rapide. Crée un compte, puis « API Keys ».', placeholder: 'csk-…' },
};

/** Devine le service d'après le début de la clé */
export function detectProvider(key: string): AiProvider | null {
  const k = key.trim();
  if (/^AIza/.test(k)) return 'gemini';
  if (/^gsk_/.test(k)) return 'groq';
  if (/^sk-or-/.test(k)) return 'openrouter';
  if (/^csk-/.test(k)) return 'cerebras';
  if (/^[A-Za-z0-9]{32}$/.test(k)) return 'mistral';
  return null;
}

/** Clés enregistrées (l'ancienne clé Gemini unique est reprise automatiquement) */
export function aiKeys(settings: Settings): AiKey[] {
  if (settings.noxKeys) return settings.noxKeys.filter((k) => k.key.trim());
  return settings.noxKey?.trim() ? [{ provider: 'gemini', key: settings.noxKey.trim() }] : [];
}
