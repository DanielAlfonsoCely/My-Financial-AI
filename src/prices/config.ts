// Keys of the backup price services. Like the Gemini key, they live in SecureStore: never in the
// code, the repo, SQLite or the JSON backup. Both are optional: Yahoo needs none.

import * as SecureStore from 'expo-secure-store';

export type PriceKeyName = 'finnhub' | 'twelvedata';

const STORE_KEY: Record<PriceKeyName, string> = { finnhub: 'prices.finnhubKey', twelvedata: 'prices.twelveDataKey' };

export async function getPriceKey(name: PriceKeyName): Promise<string | null> {
  const key = await SecureStore.getItemAsync(STORE_KEY[name]);
  return key && key.trim() ? key.trim() : null;
}

export async function setPriceKey(name: PriceKeyName, key: string): Promise<void> {
  const clean = key.trim();
  if (!clean) await SecureStore.deleteItemAsync(STORE_KEY[name]);
  else await SecureStore.setItemAsync(STORE_KEY[name], clean);
}
