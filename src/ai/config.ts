// Gemini key and model. The key lives in SecureStore (Android Keystore): never in the code,
// the repo, SQLite or the JSON backup. SecureStore is excluded from Android Auto Backup.

import * as SecureStore from 'expo-secure-store';

const KEY_API = 'ai.geminiKey';
const KEY_MODEL = 'ai.model';

/** "-latest" aliases follow Google's newest release, so the app does not break when a model retires. */
export const AI_MODELS = [
  { id: 'gemini-flash-lite-latest', label: 'Flash-Lite', hint: 'Más cupo gratis por día (recomendado)' },
  { id: 'gemini-flash-latest', label: 'Flash', hint: 'Un poco más inteligente, menos cupo' },
] as const;

export const DEFAULT_MODEL = AI_MODELS[0].id;

export async function getApiKey(): Promise<string | null> {
  const key = await SecureStore.getItemAsync(KEY_API);
  return key && key.trim() ? key.trim() : null;
}

export async function setApiKey(key: string): Promise<void> {
  const clean = key.trim();
  if (!clean) {
    await SecureStore.deleteItemAsync(KEY_API);
    return;
  }
  await SecureStore.setItemAsync(KEY_API, clean);
}

export async function getModel(): Promise<string> {
  const saved = await SecureStore.getItemAsync(KEY_MODEL);
  return AI_MODELS.some((m) => m.id === saved) ? (saved as string) : DEFAULT_MODEL;
}

export async function setModel(model: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_MODEL, model);
}

/** "AIza…X9" so the screen can show which key is saved without revealing it. */
export function maskKey(key: string): string {
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}…${key.slice(-2)}`;
}
