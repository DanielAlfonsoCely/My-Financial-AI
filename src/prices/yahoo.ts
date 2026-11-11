// Yahoo Finance, through its public chart endpoint. No key, covers the US and Europe, gives the
// price, the history and the exchange rates. It is not an official API and can change without
// notice, which is why there are other providers behind it (see service.ts).

import {
  getJson,
  type HistoryRange,
  type IntradayRange,
  PriceError,
  type PriceProvider,
  type ProviderDay,
  type ProviderPoint,
  type ProviderQuote,
  type SymbolMatch,
  toE4,
} from './types';

const BASE = 'https://query1.finance.yahoo.com';
// Without a browser-like agent the endpoint answers 429 to everyone.
const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

interface ChartResult {
  meta: {
    currency?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    gmtoffset?: number;
  };
  timestamp?: number[];
  indicators?: { quote?: { close?: (number | null)[] }[] };
}

/** Reads a chart answer. Exported for tests (they run on real answers saved as fixtures). */
export function parseChart(body: unknown): ChartResult {
  const chart = (body as { chart?: { result?: ChartResult[] | null; error?: { code?: string; description?: string } | null } })?.chart;
  if (!chart) throw new PriceError('Yahoo respondió algo inesperado.', 'format');
  if (chart.error || !chart.result?.[0]) {
    throw new PriceError(chart.error?.description ?? 'Yahoo no conoce ese símbolo.', 'not-found');
  }
  return chart.result[0];
}

function points(result: ChartResult): ProviderPoint[] {
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const out: ProviderPoint[] = [];
  (result.timestamp ?? []).forEach((seconds, i) => {
    const price = toE4(closes[i]);
    // Yahoo leaves nulls where there was no trade in that interval.
    if (price !== null) out.push({ t: seconds * 1000, price_e4: price });
  });
  return out;
}

export function quoteFromChart(result: ChartResult): ProviderQuote {
  const series = points(result);
  const price = toE4(result.meta.regularMarketPrice) ?? series[series.length - 1]?.price_e4 ?? null;
  if (price === null) throw new PriceError('Yahoo no dio precio para ese símbolo.', 'not-found');
  return {
    price_e4: price,
    prev_close_e4: toE4(result.meta.previousClose) ?? toE4(result.meta.chartPreviousClose),
    as_of: result.meta.regularMarketTime ? result.meta.regularMarketTime * 1000 : series[series.length - 1]?.t ?? Date.now(),
    currency: result.meta.currency ?? null,
  };
}

/** One close per market day. The day is the exchange's own calendar day, not the phone's. */
export function daysFromChart(result: ChartResult): ProviderDay[] {
  const offsetMs = (result.meta.gmtoffset ?? 0) * 1000;
  const byDay = new Map<string, number>();
  for (const p of points(result)) byDay.set(new Date(p.t + offsetMs).toISOString().slice(0, 10), p.price_e4);
  return [...byDay.entries()].map(([day, close_e4]) => ({ day, close_e4 }));
}

const KIND_LABEL: Record<string, string> = { EQUITY: 'Acción', ETF: 'ETF', MUTUALFUND: 'Fondo', INDEX: 'Índice', CRYPTOCURRENCY: 'Cripto', CURRENCY: 'Moneda' };

export function parseSearch(body: unknown): SymbolMatch[] {
  const quotes = (body as { quotes?: Record<string, unknown>[] })?.quotes;
  if (!Array.isArray(quotes)) return [];
  return quotes
    .filter((q) => typeof q.symbol === 'string' && ['EQUITY', 'ETF', 'MUTUALFUND'].includes(String(q.quoteType)))
    .map((q) => ({
      provider_symbol: String(q.symbol),
      symbol: String(q.symbol).split('.')[0],
      name: String(q.longname ?? q.shortname ?? q.symbol),
      exchange: String(q.exchDisp ?? q.exchange ?? ''),
      currency: null,
      kind: KIND_LABEL[String(q.quoteType)] ?? '',
    }));
}

const chartUrl = (symbol: string, range: string, interval: string) =>
  `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;

export const yahoo: PriceProvider = {
  name: 'yahoo',
  async quote(symbol) {
    return quoteFromChart(parseChart(await getJson(chartUrl(symbol, '1d', '5m'), HEADERS)));
  },
  async history(symbol, range: HistoryRange) {
    return daysFromChart(parseChart(await getJson(chartUrl(symbol, range, '1d'), HEADERS)));
  },
  async intraday(symbol, range: IntradayRange) {
    return points(parseChart(await getJson(chartUrl(symbol, range, range === '1d' ? '5m' : '30m'), HEADERS)));
  },
  async search(query) {
    const url = `${BASE}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
    return parseSearch(await getJson(url, HEADERS));
  },
};

/** How Yahoo names an exchange rate: USD→COP is "COP=X", EUR→COP is "EURCOP=X". */
export function yahooFxSymbol(from: string, to: string): string {
  return from === 'USD' ? `${to}=X` : `${from}${to}=X`;
}
