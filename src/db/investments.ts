// Investments: instruments, trades and the cache of prices and exchange rates.
// What is held is never stored: it is worked out from the trades (see lib/portfolio.ts).

import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { notifyDataChanged } from '../lib/events';
import { DEFAULT_CURRENCY } from '../lib/money';
import { buildPositions, convertMinor, OversellError, type Position, valueMinor } from '../lib/portfolio';
import { listAccounts, writeTx } from './repo';
import type { Account, AccountWithBalance, Instrument, Quote, Trade, TradeSide } from './types';

const uuid = () => Crypto.randomUUID();

// ---------- Instruments ----------

export interface InstrumentInput {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  /** How the price services know it (for Yahoo: "VOO", "SAN.MC"). */
  provider_symbol: string;
}

export function listInstruments(db: SQLiteDatabase): Promise<Instrument[]> {
  return db.getAllAsync<Instrument>('SELECT * FROM instruments WHERE deleted_at IS NULL ORDER BY symbol');
}

export function getInstrument(db: SQLiteDatabase, id: string): Promise<Instrument | null> {
  return db.getFirstAsync<Instrument>('SELECT * FROM instruments WHERE id = ?', id);
}

async function findOrInsertInstrument(db: SQLiteDatabase, input: InstrumentInput): Promise<string> {
  const providerSymbol = input.provider_symbol.trim().toUpperCase();
  if (!providerSymbol) throw new Error('Falta el símbolo.');
  const existing = await db.getFirstAsync<Instrument>(
    'SELECT * FROM instruments WHERE provider_symbol = ? AND deleted_at IS NULL',
    providerSymbol,
  );
  if (existing) return existing.id;
  const id = uuid();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO instruments (id, symbol, name, exchange, currency, provider_symbol, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.symbol.trim().toUpperCase() || providerSymbol, input.name.trim(), input.exchange.trim(),
    input.currency.trim().toUpperCase(), providerSymbol, now, now,
  );
  return id;
}

/** The instrument with that symbol, created if it is the first time it is seen. */
export async function ensureInstrument(db: SQLiteDatabase, input: InstrumentInput): Promise<string> {
  const id = await writeTx(db, () => findOrInsertInstrument(db, input));
  notifyDataChanged();
  return id;
}

// ---------- Trades ----------

export interface TradeInput {
  account_id: string;
  instrument_id: string;
  side: TradeSide;
  quantity_e6: number;
  price_e4: number;
  fee_minor?: number;
  executed_at: number;
  note?: string | null;
  source?: string;
  source_ref?: string | null;
}

export interface TradeWithInstrument extends Trade {
  symbol: string;
  instrument_name: string;
}

export function listTrades(db: SQLiteDatabase, accountId: string): Promise<TradeWithInstrument[]> {
  return db.getAllAsync<TradeWithInstrument>(
    `SELECT tr.*, i.symbol AS symbol, i.name AS instrument_name
     FROM trades tr JOIN instruments i ON i.id = tr.instrument_id
     WHERE tr.account_id = ? AND tr.deleted_at IS NULL ORDER BY tr.executed_at DESC, tr.id`,
    accountId,
  );
}

export function getTrade(db: SQLiteDatabase, id: string): Promise<Trade | null> {
  return db.getFirstAsync<Trade>('SELECT * FROM trades WHERE id = ? AND deleted_at IS NULL', id);
}

const isPositiveInt = (n: number) => Number.isInteger(n) && n > 0;

/** Throws if, with the trades as they are now in the database, some sell has nothing to sell. */
async function assertNoOversell(db: SQLiteDatabase, accountId: string): Promise<void> {
  const trades = await db.getAllAsync<Trade>('SELECT * FROM trades WHERE account_id = ? AND deleted_at IS NULL', accountId);
  buildPositions(trades);
}

async function writeTrade(db: SQLiteDatabase, id: string | null, input: TradeInput): Promise<string> {
  if (!isPositiveInt(input.quantity_e6)) throw new Error('Escribe la cantidad.');
  if (!isPositiveInt(input.price_e4)) throw new Error('Escribe el precio por unidad.');
  const fee = input.fee_minor ?? 0;
  if (!Number.isInteger(fee) || fee < 0) throw new Error('La comisión no puede ser negativa.');
  if (!Number.isFinite(input.executed_at)) throw new Error('Fecha inválida.');
  if (input.executed_at > Date.now() + 60_000) throw new Error('La orden no puede ser en el futuro.');

  const account = await db.getFirstAsync<Account>('SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL', input.account_id);
  if (!account) throw new Error('Esa cuenta ya no existe.');
  if (account.type !== 'broker') throw new Error('Las operaciones van en una cuenta de bróker.');
  const instrument = await db.getFirstAsync<Instrument>('SELECT * FROM instruments WHERE id = ? AND deleted_at IS NULL', input.instrument_id);
  if (!instrument) throw new Error('Ese instrumento ya no existe.');
  // The trade moves the free cash of the account, so both must be in the same currency.
  if (instrument.currency !== account.currency) {
    throw new Error(`${instrument.symbol} cotiza en ${instrument.currency} y la cuenta ${account.name} está en ${account.currency}. Por ahora deben coincidir.`);
  }

  const gross = valueMinor(input.quantity_e6, input.price_e4, instrument.currency);
  const now = Date.now();
  const tradeId = id ?? uuid();
  if (id) {
    const result = await db.runAsync(
      `UPDATE trades SET account_id = ?, instrument_id = ?, side = ?, quantity_e6 = ?, price_e4 = ?, fee_minor = ?, gross_minor = ?,
         currency = ?, executed_at = ?, note = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      input.account_id, input.instrument_id, input.side, input.quantity_e6, input.price_e4, fee, gross, instrument.currency,
      input.executed_at, input.note?.trim() || null, now, id,
    );
    if (result.changes === 0) throw new Error('La operación ya no existe.');
  } else {
    await db.runAsync(
      `INSERT INTO trades
         (id, account_id, instrument_id, side, quantity_e6, price_e4, fee_minor, gross_minor, currency, executed_at, source,
          source_ref, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tradeId, input.account_id, input.instrument_id, input.side, input.quantity_e6, input.price_e4, fee, gross,
      instrument.currency, input.executed_at, input.source ?? 'manual', input.source_ref ?? null, input.note?.trim() || null, now, now,
    );
  }
  // Checked after writing and inside the transaction: if it does not hold, everything rolls back.
  await assertNoOversell(db, input.account_id);
  return tradeId;
}

/** Creates a trade, or edits it when `id` is given. A sell can never exceed what was held at its moment. */
export async function saveTrade(db: SQLiteDatabase, input: TradeInput, id: string | null = null): Promise<string> {
  const tradeId = await writeTx(db, () => writeTrade(db, id, input));
  notifyDataChanged();
  return tradeId;
}

/** Deleting a buy that a later sell depends on is refused, for the same reason. */
export async function deleteTrade(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await writeTx(db, async () => {
    const trade = await getTrade(db, id);
    if (!trade) return;
    await db.runAsync('UPDATE trades SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    try {
      await assertNoOversell(db, trade.account_id);
    } catch (error) {
      if (error instanceof OversellError) throw new Error('No se puede borrar esta compra: hay una venta posterior que depende de ella.');
      throw error;
    }
  });
  notifyDataChanged();
}

export interface ImportedTrade extends Omit<TradeInput, 'instrument_id' | 'source' | 'source_ref'> {
  instrument: InstrumentInput;
  /** Id of the operation in the broker's report. */
  source_ref: string;
}

/**
 * Saves the trades of a broker report, all or none. A trade whose `source_ref` is already in the
 * database is skipped, so importing the same report again adds nothing.
 */
export async function importTrades(db: SQLiteDatabase, trades: ImportedTrade[]): Promise<{ added: number; skipped: number }> {
  const result = await writeTx(db, async () => {
    let added = 0;
    let skipped = 0;
    for (const t of [...trades].sort((a, b) => a.executed_at - b.executed_at)) {
      const seen = await db.getFirstAsync('SELECT 1 FROM trades WHERE source_ref = ? AND deleted_at IS NULL', t.source_ref);
      if (seen) {
        skipped++;
        continue;
      }
      const instrumentId = await findOrInsertInstrument(db, t.instrument);
      await writeTrade(db, null, { ...t, instrument_id: instrumentId, source: 'import', source_ref: t.source_ref });
      added++;
    }
    return { added, skipped };
  });
  notifyDataChanged();
  return result;
}

// ---------- Prices and exchange rates (cache) ----------

export interface QuoteInput {
  instrument_id: string;
  price_e4: number;
  prev_close_e4: number | null;
  as_of: number;
  provider: string;
}

/** Keeps the newest quote of each instrument; an older answer never replaces a newer one. */
export async function saveQuotes(db: SQLiteDatabase, quotes: QuoteInput[]): Promise<void> {
  if (quotes.length === 0) return;
  await writeTx(db, async () => {
    for (const q of quotes) {
      if (!isPositiveInt(q.price_e4)) continue;
      await db.runAsync(
        `INSERT INTO quotes (instrument_id, price_e4, prev_close_e4, as_of, provider) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(instrument_id) DO UPDATE SET price_e4 = excluded.price_e4, prev_close_e4 = excluded.prev_close_e4,
           as_of = excluded.as_of, provider = excluded.provider
         WHERE excluded.as_of >= quotes.as_of`,
        q.instrument_id, q.price_e4, q.prev_close_e4, q.as_of, q.provider,
      );
    }
  });
  notifyDataChanged();
}

export interface DailyClose {
  /** 'YYYY-MM-DD' */
  day: string;
  close_e4: number;
}

export async function saveHistory(db: SQLiteDatabase, instrumentId: string, closes: DailyClose[]): Promise<void> {
  if (closes.length === 0) return;
  await writeTx(db, async () => {
    for (const c of closes) {
      if (!isPositiveInt(c.close_e4)) continue;
      await db.runAsync(
        `INSERT INTO price_history (instrument_id, day, close_e4) VALUES (?, ?, ?)
         ON CONFLICT(instrument_id, day) DO UPDATE SET close_e4 = excluded.close_e4`,
        instrumentId, c.day, c.close_e4,
      );
    }
  });
  notifyDataChanged();
}

export function listHistory(db: SQLiteDatabase, instrumentId: string, fromDay = '0000-00-00'): Promise<DailyClose[]> {
  return db.getAllAsync<DailyClose>(
    'SELECT day, close_e4 FROM price_history WHERE instrument_id = ? AND day >= ? ORDER BY day',
    instrumentId, fromDay,
  );
}

/** `pair` like 'USDCOP': how many COP one USD is worth. */
export async function saveFxRates(db: SQLiteDatabase, pair: string, rates: { day: string; rate_e4: number }[]): Promise<void> {
  if (rates.length === 0) return;
  await writeTx(db, async () => {
    for (const r of rates) {
      if (!isPositiveInt(r.rate_e4)) continue;
      await db.runAsync(
        `INSERT INTO fx_rates (pair, day, rate_e4) VALUES (?, ?, ?)
         ON CONFLICT(pair, day) DO UPDATE SET rate_e4 = excluded.rate_e4`,
        pair, r.day, r.rate_e4,
      );
    }
  });
  notifyDataChanged();
}

export interface FxRate {
  pair: string;
  day: string;
  rate_e4: number;
}

/** The most recent rate known for each pair. */
export async function latestFxRates(db: SQLiteDatabase): Promise<Map<string, FxRate>> {
  const rows = await db.getAllAsync<FxRate>(
    `SELECT f.pair, f.day, f.rate_e4 FROM fx_rates f
     WHERE f.day = (SELECT MAX(day) FROM fx_rates WHERE pair = f.pair)`,
  );
  return new Map(rows.map((r) => [r.pair, r]));
}

// ---------- The portfolio of an account ----------

export interface Holding extends Position {
  instrument: Instrument;
  quote: Quote | null;
  /** Price used to value it: the last quote, or what it cost when there is none yet. */
  price_e4: number;
  /** quantity × price, in minor units of the instrument's currency. */
  value_minor: number;
  /** value − cost of the open lots. */
  gain_minor: number;
  /** Change since the previous close, or null without a quote. */
  day_change_minor: number | null;
}

export interface Portfolio {
  holdings: Holding[];
  /** Free cash of the account. */
  cash_minor: number;
  holdings_value_minor: number;
  /** cash + holdings. */
  total_minor: number;
  cost_minor: number;
  gain_minor: number;
  realized_minor: number;
  /** Sum of today's change of the holdings that have a quote; null if none has. */
  day_change_minor: number | null;
  /** Value of the holdings at the previous close, to turn the change into a percentage. */
  prev_value_minor: number;
  /** The oldest quote among the holdings: "actualizado hace…". null if some holding has no quote. */
  as_of: number | null;
  currency: string;
}

function holdingsOf(trades: Trade[], instruments: Map<string, Instrument>, quotes: Map<string, Quote>): Holding[] {
  const holdings: Holding[] = [];
  // Not strict: a screen must never fail to open because of old inconsistent data.
  for (const position of buildPositions(trades, { strict: false }).values()) {
    const instrument = instruments.get(position.instrumentId);
    if (!instrument || (position.quantity_e6 <= 0 && position.realized_minor === 0)) continue;
    const quote = quotes.get(position.instrumentId) ?? null;
    const price = quote?.price_e4 ?? position.avg_price_e4;
    const value = valueMinor(position.quantity_e6, price, instrument.currency);
    const prev = quote?.prev_close_e4 ? valueMinor(position.quantity_e6, quote.prev_close_e4, instrument.currency) : null;
    holdings.push({
      ...position,
      instrument,
      quote,
      price_e4: price,
      value_minor: value,
      gain_minor: value - position.cost_minor,
      day_change_minor: prev === null ? null : value - prev,
    });
  }
  return holdings.sort((a, b) => b.value_minor - a.value_minor);
}

async function loadMarket(db: SQLiteDatabase) {
  const [instruments, quotes] = await Promise.all([
    db.getAllAsync<Instrument>('SELECT * FROM instruments'),
    db.getAllAsync<Quote>('SELECT * FROM quotes'),
  ]);
  return { instruments: new Map(instruments.map((i) => [i.id, i])), quotes: new Map(quotes.map((q) => [q.instrument_id, q])) };
}

function summarize(holdings: Holding[], cash: number, currency: string): Portfolio {
  const open = holdings.filter((h) => h.quantity_e6 > 0);
  const value = open.reduce((s, h) => s + h.value_minor, 0);
  const cost = open.reduce((s, h) => s + h.cost_minor, 0);
  const withQuote = open.filter((h) => h.day_change_minor !== null);
  const dayChange = withQuote.length > 0 ? withQuote.reduce((s, h) => s + (h.day_change_minor ?? 0), 0) : null;
  return {
    holdings,
    cash_minor: cash,
    holdings_value_minor: value,
    total_minor: cash + value,
    cost_minor: cost,
    gain_minor: value - cost,
    realized_minor: holdings.reduce((s, h) => s + h.realized_minor, 0),
    day_change_minor: dayChange,
    prev_value_minor: withQuote.reduce((s, h) => s + h.value_minor - (h.day_change_minor ?? 0), 0),
    as_of: open.length > 0 && open.every((h) => h.quote) ? Math.min(...open.map((h) => h.quote?.as_of ?? 0)) : null,
    currency,
  };
}

export async function getPortfolio(db: SQLiteDatabase, accountId: string): Promise<Portfolio | null> {
  const account = (await listAccounts(db)).find((a) => a.id === accountId);
  if (!account) return null;
  const [trades, market] = await Promise.all([
    db.getAllAsync<Trade>('SELECT * FROM trades WHERE account_id = ? AND deleted_at IS NULL', accountId),
    loadMarket(db),
  ]);
  return summarize(holdingsOf(trades, market.instruments, market.quotes), account.balance, account.currency);
}

/** An account as the panel shows it: what it is worth, and that worth in pesos when the rate is known. */
export interface ValuedAccount extends AccountWithBalance {
  /** Free cash (for everything but a broker, the whole balance). */
  cash_balance: number;
  /** Market value of what a broker account holds; 0 for the rest. */
  holdings_value: number;
  /** `balance` in pesos. null when the account is in another currency and no rate has been fetched yet. */
  base_balance: number | null;
  /** Rate used for `base_balance` (×1e4) and its day, when it was needed. */
  fx: FxRate | null;
  /** Today's change of a broker account, in its currency; null if unknown. */
  day_change: number | null;
}

/**
 * Every account with its value. A broker account is worth its free cash plus its positions at the
 * last known prices. Accounts in another currency also get their value in pesos, with the most
 * recent rate that was fetched (never a made-up one).
 */
export async function listValuedAccounts(db: SQLiteDatabase): Promise<ValuedAccount[]> {
  const [accounts, trades, market, rates] = await Promise.all([
    listAccounts(db),
    db.getAllAsync<Trade>('SELECT * FROM trades WHERE deleted_at IS NULL'),
    loadMarket(db),
    latestFxRates(db),
  ]);
  return accounts.map((account) => {
    const own = account.type === 'broker' ? trades.filter((t) => t.account_id === account.id) : [];
    const portfolio = own.length > 0 ? summarize(holdingsOf(own, market.instruments, market.quotes), account.balance, account.currency) : null;
    const balance = account.balance + (portfolio?.holdings_value_minor ?? 0);
    const fx = account.currency === DEFAULT_CURRENCY ? null : rates.get(`${account.currency}${DEFAULT_CURRENCY}`) ?? null;
    return {
      ...account,
      balance,
      cash_balance: account.balance,
      holdings_value: portfolio?.holdings_value_minor ?? 0,
      base_balance: account.currency === DEFAULT_CURRENCY ? balance : fx ? convertMinor(balance, fx.rate_e4, account.currency, DEFAULT_CURRENCY) : null,
      fx,
      day_change: portfolio?.day_change_minor ?? null,
    };
  });
}

/** Instruments that are held somewhere (or were, so their history still draws): the ones worth pricing. */
export function listTradedInstruments(db: SQLiteDatabase): Promise<Instrument[]> {
  return db.getAllAsync<Instrument>(
    `SELECT i.* FROM instruments i
     WHERE i.deleted_at IS NULL AND EXISTS (SELECT 1 FROM trades tr WHERE tr.instrument_id = i.id AND tr.deleted_at IS NULL)
     ORDER BY i.symbol`,
  );
}

