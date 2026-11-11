// Pure math of the investments: lots, FIFO, value and gains. No database, no network.
// Quantities are ×1e6, prices ×1e4 and money is in minor units (cents), always integers.

import type { Trade } from '../db/types';
import { currencyDecimals } from './money';

export const QUANTITY_SCALE = 1_000_000;
export const PRICE_SCALE = 10_000;

/**
 * quantity × price in minor units, rounded half up. Done with BigInt because the product of the two
 * scaled integers does not fit in a JS number for big positions.
 */
export function valueMinor(quantityE6: number, priceE4: number, currency = 'USD'): number {
  const divisor = BigInt(10) ** BigInt(10 - currencyDecimals(currency));
  const product = BigInt(Math.round(quantityE6)) * BigInt(Math.round(priceE4));
  return Number((product + divisor / BigInt(2)) / divisor);
}

/** What a trade does to the free cash of the account: buying takes it out, selling brings it back. */
export function tradeCashEffect(trade: Pick<Trade, 'side' | 'gross_minor' | 'fee_minor'>): number {
  return trade.side === 'sell' ? trade.gross_minor - trade.fee_minor : -(trade.gross_minor + trade.fee_minor);
}

/** "0,3512" or "1.250,5" (Colombian style) or "0.3512" → scaled integer. null if it is not a number. */
export function parseScaled(text: string, scale: number): number | null {
  let clean = text.trim().replace(/\s/g, '');
  if (!clean) return null;
  if (clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(clean)) return null;
  const value = Math.round(Number(clean) * scale);
  return Number.isFinite(value) ? value : null;
}

function formatScaled(value: number, scale: number, minDecimals: number, maxDecimals: number): string {
  const fixed = (Math.abs(value) / scale).toFixed(maxDecimals);
  let [whole, fraction = ''] = fixed.split('.');
  while (fraction.length > minDecimals && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '−' : ''}${whole}${fraction ? `,${fraction}` : ''}`;
}

/** 351200 → "0,3512"; 2000000 → "2". */
export const formatQuantity = (quantityE6: number) => formatScaled(quantityE6, QUANTITY_SCALE, 0, 6);
/** 5982000 → "598,20". */
export const formatPrice = (priceE4: number) => formatScaled(priceE4, PRICE_SCALE, 2, 4);

/** "+2,37%" / "−2,59%". */
export function formatPercent(ratio: number): string {
  const value = Math.round(Math.abs(ratio) * 10000) / 100;
  return `${ratio < 0 ? '−' : '+'}${value.toFixed(2).replace('.', ',')}%`;
}

export interface Lot {
  tradeId: string;
  /** What is left of the buy. */
  quantity_e6: number;
  price_e4: number;
  executed_at: number;
}

export interface Position {
  instrumentId: string;
  quantity_e6: number;
  /** Open lots, oldest first. */
  lots: Lot[];
  /** What the open lots cost (without commissions), in minor units. */
  cost_minor: number;
  /** Average price of the open lots ×1e4. Only for display: the lots are what counts. */
  avg_price_e4: number;
  /** Gain already made by selling (sale − cost of the lots sold − commissions of those sells). */
  realized_minor: number;
  /** Commissions of the buys, in minor units. */
  buy_fees_minor: number;
}

export class OversellError extends Error {
  constructor(readonly instrumentId: string) {
    super('No puedes vender más de lo que tenías en ese momento.');
  }
}

type TradeForPosition = Pick<Trade, 'id' | 'instrument_id' | 'side' | 'quantity_e6' | 'price_e4' | 'fee_minor' | 'gross_minor' | 'executed_at' | 'currency'>;

const byTime = (a: { executed_at: number; id: string }, b: { executed_at: number; id: string }) =>
  a.executed_at - b.executed_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Walks the trades in order of time and returns what is held per instrument. Each buy is a lot;
 * a sell consumes the oldest lots first. Throws OversellError if a sell asks for more than was
 * held at that moment (with `strict: false` it sells what there is and goes on).
 */
export function buildPositions(trades: TradeForPosition[], options: { strict?: boolean } = {}): Map<string, Position> {
  const strict = options.strict ?? true;
  const positions = new Map<string, Position>();
  for (const trade of [...trades].sort(byTime)) {
    let position = positions.get(trade.instrument_id);
    if (!position) {
      position = { instrumentId: trade.instrument_id, quantity_e6: 0, lots: [], cost_minor: 0, avg_price_e4: 0, realized_minor: 0, buy_fees_minor: 0 };
      positions.set(trade.instrument_id, position);
    }
    if (trade.side === 'buy') {
      position.lots.push({ tradeId: trade.id, quantity_e6: trade.quantity_e6, price_e4: trade.price_e4, executed_at: trade.executed_at });
      position.quantity_e6 += trade.quantity_e6;
      position.buy_fees_minor += trade.fee_minor;
      continue;
    }
    let left = trade.quantity_e6;
    if (left > position.quantity_e6) {
      if (strict) throw new OversellError(trade.instrument_id);
      left = position.quantity_e6;
    }
    const sold = left;
    let costOfSold = 0;
    while (left > 0 && position.lots.length > 0) {
      const lot = position.lots[0];
      const take = Math.min(lot.quantity_e6, left);
      costOfSold += valueMinor(take, lot.price_e4, trade.currency);
      lot.quantity_e6 -= take;
      left -= take;
      if (lot.quantity_e6 === 0) position.lots.shift();
    }
    position.quantity_e6 -= sold;
    const proceeds = sold === trade.quantity_e6 ? trade.gross_minor : valueMinor(sold, trade.price_e4, trade.currency);
    position.realized_minor += proceeds - costOfSold - trade.fee_minor;
  }
  for (const position of positions.values()) {
    const currency = trades.find((t) => t.instrument_id === position.instrumentId)?.currency ?? 'USD';
    position.cost_minor = position.lots.reduce((sum, lot) => sum + valueMinor(lot.quantity_e6, lot.price_e4, currency), 0);
    const weighted = position.lots.reduce((sum, lot) => sum + (lot.quantity_e6 / QUANTITY_SCALE) * lot.price_e4, 0);
    position.avg_price_e4 = position.quantity_e6 > 0 ? Math.round(weighted / (position.quantity_e6 / QUANTITY_SCALE)) : 0;
  }
  return positions;
}

/** Units of each instrument held right after `at` (epoch ms). */
export function quantitiesAt(trades: Pick<Trade, 'instrument_id' | 'side' | 'quantity_e6' | 'executed_at'>[], at: number): Map<string, number> {
  const held = new Map<string, number>();
  for (const t of trades) {
    if (t.executed_at > at) continue;
    held.set(t.instrument_id, (held.get(t.instrument_id) ?? 0) + (t.side === 'buy' ? t.quantity_e6 : -t.quantity_e6));
  }
  return held;
}

export interface SeriesPoint {
  /** Epoch ms. */
  t: number;
  /** Value of what was held at that moment, in minor units. */
  value: number;
}

/**
 * value(t) = Σ units held at t × price at t, for each moment in `times`.
 * `priceAt(instrumentId, t)` gives the last known price at or before t (×1e4), or null if none yet:
 * an instrument without a price at that moment is valued at what it cost, so the line does not
 * drop to zero on days the service has no data for.
 */
export function portfolioSeries(
  trades: TradeForPosition[],
  times: number[],
  priceAt: (instrumentId: string, t: number) => number | null,
): SeriesPoint[] {
  const sorted = [...trades].sort(byTime);
  return times.map((t) => {
    const upTo = sorted.filter((trade) => trade.executed_at <= t);
    let value = 0;
    for (const position of buildPositions(upTo, { strict: false }).values()) {
      if (position.quantity_e6 <= 0) continue;
      const currency = upTo.find((trade) => trade.instrument_id === position.instrumentId)?.currency ?? 'USD';
      const price = priceAt(position.instrumentId, t);
      value += price === null ? position.cost_minor : valueMinor(position.quantity_e6, price, currency);
    }
    return { t, value };
  });
}

/**
 * Minor units of one currency into another with a rate ×1e4 (units of `to` per unit of `from`).
 * Meant for rates of 1 or more (dollars into pesos): a tiny rate like pesos into dollars does not
 * keep enough digits at ×1e4, so always store and use the pair in that direction.
 */
export function convertMinor(amountMinor: number, rateE4: number, from: string, to: string): number {
  const shift = currencyDecimals(to) - currencyDecimals(from) - 4;
  const product = BigInt(Math.round(amountMinor)) * BigInt(Math.round(rateE4));
  if (shift >= 0) return Number(product * BigInt(10) ** BigInt(shift));
  const divisor = BigInt(10) ** BigInt(-shift);
  const half = divisor / BigInt(2);
  return Number(product >= 0 ? (product + half) / divisor : -((-product + half) / divisor));
}

export interface PricePoint {
  t: number;
  price_e4: number;
}

/**
 * Turns the price points of each instrument (sorted by time) into "last known price at or before t".
 * `fallback` is asked when the first source has nothing that early (the day's chart starts at the
 * open; before that the previous daily close is the right price).
 */
export function priceLookup(
  series: Map<string, PricePoint[]>,
  fallback?: (instrumentId: string, t: number) => number | null,
): (instrumentId: string, t: number) => number | null {
  return (instrumentId, t) => {
    const points = series.get(instrumentId);
    if (points && points.length > 0 && points[0].t <= t) {
      let low = 0;
      let high = points.length - 1;
      while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (points[mid].t <= t) low = mid;
        else high = mid - 1;
      }
      return points[low].price_e4;
    }
    return fallback ? fallback(instrumentId, t) : null;
  };
}

/** A daily close counts from the end of its day (UTC), so a trade made that day is already in. */
export function dayToTime(day: string): number {
  return Date.parse(`${day}T23:59:59Z`);
}

/** Every distinct moment of the given series, in order, from `from` on. */
export function timeline(series: Iterable<PricePoint[]>, from = 0): number[] {
  const times = new Set<number>();
  for (const points of series) for (const p of points) if (p.t >= from) times.add(p.t);
  return [...times].sort((a, b) => a - b);
}
