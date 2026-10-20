// Les services d'IA gratuits que Nox sait utiliser, et les clés enregistrées (dans l'ordre d'essai)
import type { Settings } from './types';

export type NoxProvider = 'gemini' | 'groq' | 'openrouter' | 'mistral' | 'cerebras';
export interface NoxKey { provider: NoxProvider; key: string }

export const PROVIDERS: Record<NoxProvider, { name: string; url: string; hint: string; placeholder: string; voice?: boolean }> = {
  gemini: { name: 'Gemini (Google)', url: 'https://aistudio.google.com/apikey', hint: 'Gratuit, le plus complet. Connecte-toi avec ton compte Google, puis « Create API key ».', placeholder: 'AIza…', voice: true },
  groq: { name: 'Groq', url: 'https://console.groq.com/keys', hint: 'Gratuit, ultra rapide, et la meilleure transcription de la voix. Crée un compte, puis « Create API Key ».', placeholder: 'gsk_…', voice: true },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/settings/keys', hint: 'Modèles gratuits (environ 50 questions par jour). Crée un compte, puis « Create API Key ».', placeholder: 'sk-or-…' },
  mistral: { name: 'Mistral', url: 'https://console.mistral.ai/api-keys', hint: 'IA française. Choisis l\'offre gratuite « Experiment », puis crée une clé.', placeholder: 'Clé Mistral' },
  cerebras: { name: 'Cerebras', url: 'https://cloud.cerebras.ai/', hint: 'Très rapide. Crée un compte, puis « API Keys ».', placeholder: 'csk-…' },
};

/** Devine le service d'après le début de la clé */
export function detectProvider(key: string): NoxProvider | null {
  const k = key.trim();
  if (/^AIza/.test(k)) return 'gemini';
  if (/^gsk_/.test(k)) return 'groq';
  if (/^sk-or-/.test(k)) return 'openrouter';
  if (/^csk-/.test(k)) return 'cerebras';
  if (/^[A-Za-z0-9]{32}$/.test(k)) return 'mistral';
  return null;
}

/** Clés enregistrées (l'ancienne clé Gemini unique est reprise automatiquement) */
export function noxKeys(settings: Settings): NoxKey[] {
  if (settings.noxKeys) return settings.noxKeys.filter((k) => k.key.trim());
  return settings.noxKey?.trim() ? [{ provider: 'gemini', key: settings.noxKey.trim() }] : [];
}
