// Backup price services, used when Yahoo fails. Both need a free key that the user pastes in
// Configuración → Precios (kept in SecureStore, like the Gemini key).
//
// NOTE: written from each service's public documentation and tested on answers shaped like the
// documented ones. They have not been run against the live services (no key at hand).

import { getJson, type HistoryRange, PriceError, type PriceProvider, type ProviderDay, type ProviderQuote, toE4 } from './types';

/** Finnhub: 60 calls a minute, US stocks only, quotes only. https://finnhub.io/docs/api/quote */
export function parseFinnhubQuote(body: unknown): ProviderQuote {
  const q = body as { c?: number; pc?: number; t?: number; error?: string };
  if (q?.error) throw new PriceError(`Finnhub: ${q.error}`, 'key');
  const price = toE4(q?.c);
  // Finnhub answers zeros for a symbol it does not know.
  if (price === null) throw new PriceError('Finnhub no conoce ese símbolo.', 'not-found');
  return { price_e4: price, prev_close_e4: toE4(q.pc), as_of: q.t ? q.t * 1000 : Date.now(), currency: null };
}

export function finnhub(apiKey: string): PriceProvider {
  return {
    name: 'finnhub',
    async quote(symbol) {
      return parseFinnhubQuote(await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`));
    },
  };
}

interface TwelveError {
  status?: string;
  code?: number;
  message?: string;
}

function twelveError(body: unknown): void {
  const e = body as TwelveError;
  if (e?.status !== 'error') return;
  const kind = e.code === 429 ? 'limit' : e.code === 401 || e.code === 403 ? 'key' : e.code === 404 || e.code === 400 ? 'not-found' : 'network';
  throw new PriceError(`Twelve Data: ${e.message ?? 'error'}`, kind);
}

/** Twelve Data: 800 calls a day, delayed prices. https://twelvedata.com/docs#quote */
export function parseTwelveQuote(body: unknown): ProviderQuote {
  twelveError(body);
  const q = body as { close?: string; previous_close?: string; timestamp?: number; currency?: string };
  const price = toE4(q?.close);
  if (price === null) throw new PriceError('Twelve Data no dio precio para ese símbolo.', 'not-found');
  return { price_e4: price, prev_close_e4: toE4(q.previous_close), as_of: q.timestamp ? q.timestamp * 1000 : Date.now(), currency: q.currency ?? null };
}

export function parseTwelveSeries(body: unknown): ProviderDay[] {
  twelveError(body);
  const values = (body as { values?: { datetime?: string; close?: string }[] })?.values;
  if (!Array.isArray(values)) throw new PriceError('Twelve Data respondió algo inesperado.', 'format');
  const days: ProviderDay[] = [];
  for (const v of values) {
    const close = toE4(v.close);
    if (close !== null && /^\d{4}-\d{2}-\d{2}/.test(v.datetime ?? '')) days.push({ day: String(v.datetime).slice(0, 10), close_e4: close });
  }
  // The service sends the newest first.
  return days.sort((a, b) => (a.day < b.day ? -1 : 1));
}

const TWELVE_SIZE: Record<HistoryRange, number> = { '1mo': 23, '6mo': 130, '1y': 260, '5y': 1300, max: 5000 };

export function twelveData(apiKey: string): PriceProvider {
  const base = 'https://api.twelvedata.com';
  const key = `apikey=${encodeURIComponent(apiKey)}`;
  return {
    name: 'twelvedata',
    async quote(symbol) {
      return parseTwelveQuote(await getJson(`${base}/quote?symbol=${encodeURIComponent(symbol)}&${key}`));
    },
    async history(symbol, range) {
      return parseTwelveSeries(await getJson(`${base}/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${TWELVE_SIZE[range]}&${key}`));
    },
  };
}
