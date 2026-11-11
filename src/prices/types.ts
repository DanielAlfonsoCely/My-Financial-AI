// The price services sit behind this interface (like the AI behind pipeline.ts), so one can be
// swapped or fail without the screens knowing. They only ever receive ticker symbols: nothing
// about the user, their accounts or how much they hold.

export interface ProviderQuote {
  /** Last price ×1e4, in `currency`. */
  price_e4: number;
  /** Close of the previous session ×1e4, when the service gives it. */
  prev_close_e4: number | null;
  /** Epoch ms of the price. */
  as_of: number;
  currency: string | null;
}

export interface ProviderPoint {
  /** Epoch ms. */
  t: number;
  price_e4: number;
}

export interface ProviderDay {
  /** Market day, 'YYYY-MM-DD'. */
  day: string;
  close_e4: number;
}

export interface SymbolMatch {
  /** Symbol as the service knows it ("VOO", "SAN.MC"). */
  provider_symbol: string;
  symbol: string;
  name: string;
  exchange: string;
  /** Not every search says it; the quote does. */
  currency: string | null;
  /** "ETF", "Acción"… for the list. */
  kind: string;
}

export type HistoryRange = '1mo' | '6mo' | '1y' | '5y' | 'max';
export type IntradayRange = '1d' | '5d';

export class PriceError extends Error {
  constructor(
    message: string,
    /** 'network' and 'limit' are worth trying on another service; 'not-found' is about the symbol. */
    readonly kind: 'network' | 'limit' | 'not-found' | 'key' | 'format',
  ) {
    super(message);
  }
}

export interface PriceProvider {
  readonly name: string;
  quote(symbol: string): Promise<ProviderQuote>;
  /** Daily closes, oldest first. */
  history?(symbol: string, range: HistoryRange): Promise<ProviderDay[]>;
  /** Prices within the day (1d) or the week (5d), oldest first. */
  intraday?(symbol: string, range: IntradayRange): Promise<ProviderPoint[]>;
  search?(query: string): Promise<SymbolMatch[]>;
}

export const toE4 = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n * 10_000) : null;
};

const TIMEOUT_MS = 12_000;

/** GET that turns every way of failing into a PriceError. */
export async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: controller.signal });
  } catch {
    throw new PriceError('Sin conexión con el servicio de precios.', 'network');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 429) throw new PriceError('El servicio de precios pidió esperar un momento.', 'limit');
  if (response.status === 401 || response.status === 403) throw new PriceError('El servicio de precios rechazó la clave.', 'key');
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PriceError('El servicio de precios respondió algo que no se pudo leer.', response.ok ? 'format' : 'network');
  }
  if (response.status === 404) return body;
  if (!response.ok) throw new PriceError(`El servicio de precios respondió ${response.status}.`, 'network');
  return body;
}
