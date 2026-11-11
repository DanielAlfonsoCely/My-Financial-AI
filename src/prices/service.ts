// Keeps the price cache fresh. The screens read prices from SQLite (so they work offline with the
// last known value); this module is the only place that talks to the price services.

import type { SQLiteDatabase } from 'expo-sqlite';

import { listTradedInstruments, saveFxRates, saveHistory, saveQuotes } from '../db/investments';
import { getSetting, setSetting } from '../db/repo';
import type { Instrument } from '../db/types';
import { DEFAULT_CURRENCY } from '../lib/money';
import { getPriceKey } from './config';
import { finnhub, twelveData } from './fallbacks';
import {
  type HistoryRange,
  type IntradayRange,
  PriceError,
  type PriceProvider,
  type ProviderPoint,
  type ProviderQuote,
  type SymbolMatch,
} from './types';
import { yahoo, yahooFxSymbol } from './yahoo';

export const SETTING_PRICES_REFRESHED_AT = 'prices_refreshed_at';
/** While the app is open, prices are asked for again after this long. */
export const REFRESH_EVERY_MS = 15 * 60_000;
const DAY_MS = 86_400_000;

/** Yahoo first; the others only if the user gave their key. */
export async function activeProviders(): Promise<PriceProvider[]> {
  const [finnhubKey, twelveKey] = await Promise.all([getPriceKey('finnhub'), getPriceKey('twelvedata')]);
  return [yahoo, ...(finnhubKey ? [finnhub(finnhubKey)] : []), ...(twelveKey ? [twelveData(twelveKey)] : [])];
}

/** Asks each provider in turn until one answers. Throws the first error if none does. */
export async function firstAnswer<T>(
  providers: PriceProvider[],
  ask: (provider: PriceProvider) => Promise<T> | null,
): Promise<{ value: T; provider: string }> {
  let firstError: unknown = null;
  for (const provider of providers) {
    const attempt = ask(provider);
    if (!attempt) continue;
    try {
      return { value: await attempt, provider: provider.name };
    } catch (error) {
      firstError ??= error;
    }
  }
  throw firstError ?? new PriceError('Ningún servicio de precios puede responder eso.', 'network');
}

const isoDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The shortest history that still reaches back to the first trade. */
export function rangeSince(firstTradeAt: number, now = Date.now()): HistoryRange {
  const days = (now - firstTradeAt) / DAY_MS;
  if (days <= 25) return '1mo';
  if (days <= 170) return '6mo';
  if (days <= 350) return '1y';
  if (days <= 1800) return '5y';
  return 'max';
}

export interface RefreshResult {
  /** False when it was skipped because the last refresh is recent enough. */
  ran: boolean;
  updated: number;
  /** Symbols no service could price this time. Their last known price stays. */
  failed: string[];
  /** The first problem found, to tell the user why (no connection, limit…). */
  error: string | null;
}

let running: Promise<RefreshResult> | null = null;

/**
 * Fetches the price of every instrument that has trades, their daily history when it is missing or
 * a day old, and the exchange rate to pesos. Never throws: a failure leaves the cache as it was.
 * Without `force` it does nothing if the last refresh was less than 15 minutes ago.
 */
export function refreshPrices(db: SQLiteDatabase, options: { force?: boolean } = {}): Promise<RefreshResult> {
  running ??= run(db, options.force ?? false).finally(() => {
    running = null;
  });
  return running;
}

async function run(db: SQLiteDatabase, force: boolean): Promise<RefreshResult> {
  const now = Date.now();
  const last = Number((await getSetting(db, SETTING_PRICES_REFRESHED_AT)) ?? 0);
  const instruments = await listTradedInstruments(db);
  if (instruments.length === 0 || (!force && now - last < REFRESH_EVERY_MS)) {
    return { ran: false, updated: 0, failed: [], error: null };
  }

  const providers = await activeProviders();
  const failed: string[] = [];
  let error: string | null = null;
  let updated = 0;
  const note = (e: unknown) => {
    error ??= e instanceof Error ? e.message : 'No se pudieron actualizar los precios.';
  };

  for (const instrument of instruments) {
    try {
      const { value, provider } = await firstAnswer(providers, (p) => p.quote(instrument.provider_symbol));
      await saveQuotes(db, [{ instrument_id: instrument.id, price_e4: value.price_e4, prev_close_e4: value.prev_close_e4, as_of: value.as_of, provider }]);
      updated++;
    } catch (e) {
      failed.push(instrument.symbol);
      note(e);
    }
    try {
      await refreshHistory(db, providers, instrument, now);
    } catch (e) {
      note(e);
    }
  }

  // Exchange rate of every foreign currency in use, to show the portfolio in pesos.
  for (const currency of new Set(instruments.map((i) => i.currency))) {
    if (currency === DEFAULT_CURRENCY) continue;
    try {
      const { value } = await firstAnswer(providers, (p) =>
        p.name === 'yahoo' ? p.quote(yahooFxSymbol(currency, DEFAULT_CURRENCY)) : p.name === 'twelvedata' ? p.quote(`${currency}/${DEFAULT_CURRENCY}`) : null,
      );
      await saveFxRates(db, `${currency}${DEFAULT_CURRENCY}`, [{ day: isoDay(now), rate_e4: value.price_e4 }]);
    } catch (e) {
      note(e);
    }
  }

  if (updated > 0) await setSetting(db, SETTING_PRICES_REFRESHED_AT, String(now));
  return { ran: true, updated, failed, error };
}

/** Daily closes since the first trade. Asked for at most once a day per instrument. */
async function refreshHistory(db: SQLiteDatabase, providers: PriceProvider[], instrument: Instrument, now: number): Promise<void> {
  const [newest, first] = await Promise.all([
    db.getFirstAsync<{ day: string | null }>('SELECT MAX(day) AS day FROM price_history WHERE instrument_id = ?', instrument.id),
    db.getFirstAsync<{ at: number | null }>('SELECT MIN(executed_at) AS at FROM trades WHERE instrument_id = ? AND deleted_at IS NULL', instrument.id),
  ]);
  const oldest = await db.getFirstAsync<{ day: string | null }>('SELECT MIN(day) AS day FROM price_history WHERE instrument_id = ?', instrument.id);
  const firstTradeAt = first?.at ?? now;
  // Fresh enough: it has yesterday's close and reaches back to the first trade (a week of slack for holidays).
  const coversStart = !!oldest?.day && oldest.day <= isoDay(firstTradeAt + 7 * DAY_MS);
  if (newest?.day && newest.day >= isoDay(now - DAY_MS) && coversStart) return;
  const range = rangeSince(firstTradeAt - 7 * DAY_MS, now);
  const { value } = await firstAnswer(providers, (p) => (p.history ? p.history(instrument.provider_symbol, range) : null));
  await saveHistory(db, instrument.id, value);
}

/** Prices within the day or the week for the chart. Not stored: they are only worth something now. */
export async function fetchIntraday(instruments: Instrument[], range: IntradayRange): Promise<Map<string, ProviderPoint[]>> {
  const providers = await activeProviders();
  const result = new Map<string, ProviderPoint[]>();
  await Promise.all(
    instruments.map(async (instrument) => {
      const { value } = await firstAnswer(providers, (p) => (p.intraday ? p.intraday(instrument.provider_symbol, range) : null));
      result.set(instrument.id, value);
    }),
  );
  return result;
}

export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  const clean = query.trim();
  if (clean.length < 1) return [];
  const { value } = await firstAnswer(await activeProviders(), (p) => (p.search ? p.search(clean) : null));
  return value;
}

/** Price and currency of a symbol right now: confirms it exists and fills the trade form. */
export async function lookupQuote(providerSymbol: string): Promise<ProviderQuote> {
  const { value } = await firstAnswer(await activeProviders(), (p) => p.quote(providerSymbol));
  return value;
}
