import { ensureInstrument, getPortfolio, listHistory, latestFxRates, saveTrade } from '../../db/investments';
import { migrateDatabase } from '../../db/migrations';
import { createAccount } from '../../db/repo';
import { openTestDatabase } from '../../test/sqlite';
import { parseFinnhubQuote, parseTwelveQuote, parseTwelveSeries } from '../fallbacks';
import { firstAnswer, rangeSince, refreshPrices } from '../service';
import { PriceError, type PriceProvider } from '../types';
import { daysFromChart, parseChart, parseSearch, quoteFromChart, yahooFxSymbol } from '../yahoo';

// Real answers of the service, saved on 10 nov 2026.
import copChart from '../__fixtures__/yahoo-cop-5d.json';
import errorChart from '../__fixtures__/yahoo-error.json';
import koChart from '../__fixtures__/yahoo-ko-1mo.json';
import vooChart from '../__fixtures__/yahoo-voo-1d.json';

const DAY = 86_400_000;

describe('Yahoo (respuestas reales guardadas)', () => {
  test('cotización: precio, cierre anterior, hora y moneda', () => {
    expect(quoteFromChart(parseChart(vooChart))).toEqual({
      price_e4: 6_895_000,
      prev_close_e4: 6_918_700,
      as_of: 1794344400 * 1000,
      currency: 'USD',
    });
  });

  test('TRM: dólar en pesos', () => {
    const quote = quoteFromChart(parseChart(copChart));
    expect(quote.currency).toBe('COP');
    expect(quote.price_e4).toBe(32_968_400);
    expect(yahooFxSymbol('USD', 'COP')).toBe('COP=X');
    expect(yahooFxSymbol('EUR', 'COP')).toBe('EURCOP=X');
  });

  test('histórico: un cierre por día de mercado, en orden, con el día de la bolsa', () => {
    const days = daysFromChart(parseChart(koChart));
    expect(days.length).toBeGreaterThan(15);
    expect(days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day) && Number.isInteger(d.close_e4) && d.close_e4 > 0)).toBe(true);
    expect([...days].sort((a, b) => (a.day < b.day ? -1 : 1))).toEqual(days);
    expect(new Set(days.map((d) => d.day)).size).toBe(days.length);
    // No weekends: the exchange's calendar, not UTC's.
    expect(days.some((d) => [0, 6].includes(new Date(`${d.day}T12:00:00Z`).getUTCDay()))).toBe(false);
  });

  test('símbolo que no existe', () => {
    expect(() => parseChart(errorChart)).toThrow(PriceError);
    try {
      parseChart(errorChart);
    } catch (e) {
      expect((e as PriceError).kind).toBe('not-found');
    }
    expect(() => parseChart({ nada: true })).toThrow('inesperado');
  });

  test('los huecos del intradía (null) se saltan', () => {
    const result = parseChart({ chart: { result: [{ meta: { currency: 'USD' }, timestamp: [10, 20, 30], indicators: { quote: [{ close: [1.5, null, 2] }] } }], error: null } });
    expect(quoteFromChart(result)).toMatchObject({ price_e4: 20_000, prev_close_e4: null, as_of: 30_000 });
  });

  test('búsqueda: solo acciones, ETF y fondos', () => {
    const matches = parseSearch({
      quotes: [
        { symbol: 'NVDA', quoteType: 'EQUITY', longname: 'NVIDIA Corporation', exchDisp: 'NASDAQ' },
        { symbol: 'SNVDA=F', quoteType: 'FUTURE', shortname: 'futuro' },
        { symbol: 'SAN.MC', quoteType: 'EQUITY', shortname: 'BANCO SANTANDER', exchDisp: 'MCE' },
      ],
    });
    expect(matches).toEqual([
      { provider_symbol: 'NVDA', symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: null, kind: 'Acción' },
      { provider_symbol: 'SAN.MC', symbol: 'SAN', name: 'BANCO SANTANDER', exchange: 'MCE', currency: null, kind: 'Acción' },
    ]);
    expect(parseSearch({})).toEqual([]);
  });
});

describe('servicios de respaldo (forma documentada, sin probar en vivo)', () => {
  test('Finnhub', () => {
    expect(parseFinnhubQuote({ c: 689.5, pc: 691.87, t: 1794344400 })).toEqual({ price_e4: 6_895_000, prev_close_e4: 6_918_700, as_of: 1794344400000, currency: null });
    expect(() => parseFinnhubQuote({ c: 0, pc: 0, t: 0 })).toThrow('no conoce');
    expect(() => parseFinnhubQuote({ error: 'Invalid API key' })).toThrow('Invalid API key');
  });

  test('Twelve Data', () => {
    expect(parseTwelveQuote({ symbol: 'VOO', close: '689.50', previous_close: '691.87', timestamp: 1794344400, currency: 'USD' })).toMatchObject({ price_e4: 6_895_000, prev_close_e4: 6_918_700, currency: 'USD' });
    expect(parseTwelveSeries({ values: [{ datetime: '2026-11-09', close: '689.5' }, { datetime: '2026-11-06', close: '691.87' }] })).toEqual([
      { day: '2026-11-06', close_e4: 6_918_700 },
      { day: '2026-11-09', close_e4: 6_895_000 },
    ]);
    try {
      parseTwelveQuote({ status: 'error', code: 429, message: 'You have run out of API credits' });
      throw new Error('debió fallar');
    } catch (e) {
      expect((e as PriceError).kind).toBe('limit');
    }
  });
});

describe('respaldo entre servicios', () => {
  const failing: PriceProvider = { name: 'a', quote: async () => { throw new PriceError('caído', 'network'); } };
  const working: PriceProvider = { name: 'b', quote: async () => ({ price_e4: 100, prev_close_e4: null, as_of: 1, currency: 'USD' }) };

  test('si el primero falla responde el siguiente', async () => {
    expect(await firstAnswer([failing, working], (p) => p.quote('X'))).toMatchObject({ provider: 'b', value: { price_e4: 100 } });
  });

  test('si todos fallan sale el primer error, y se saltan los que no saben hacer eso', async () => {
    await expect(firstAnswer([failing, failing], (p) => p.quote('X'))).rejects.toThrow('caído');
    await expect(firstAnswer([working], (p) => (p.history ? p.history('X', '1mo') : null))).rejects.toBeInstanceOf(PriceError);
  });

  test('el histórico pedido alcanza hasta la primera compra', () => {
    const now = Date.UTC(2026, 10, 10);
    expect(rangeSince(now - 10 * DAY, now)).toBe('1mo');
    expect(rangeSince(now - 100 * DAY, now)).toBe('6mo');
    expect(rangeSince(now - 300 * DAY, now)).toBe('1y');
    expect(rangeSince(now - 900 * DAY, now)).toBe('5y');
    expect(rangeSince(now - 3000 * DAY, now)).toBe('max');
  });
});

describe('refreshPrices', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  async function setup() {
    const db = openTestDatabase();
    await migrateDatabase(db);
    const xtb = await createAccount(db, { name: 'XTB', emoji: '📈', color: '#fff', type: 'broker', currency: 'USD', group_id: null, opening_balance: 100_000 });
    const voo = await ensureInstrument(db, { symbol: 'VOO', name: 'VOO', exchange: '', currency: 'USD', provider_symbol: 'VOO' });
    await saveTrade(db, { account_id: xtb, instrument_id: voo, side: 'buy', quantity_e6: 1_000_000, price_e4: 6_000_000, executed_at: Date.now() - 5 * DAY });
    return { db, xtb, voo };
  }

  const respond = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  test('guarda cotización, histórico y TRM; solo manda el símbolo', async () => {
    const { db, xtb, voo } = await setup();
    const urls: string[] = [];
    global.fetch = jest.fn(async (input: unknown) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('COP%3DX')) return respond(copChart);
      if (url.includes('interval=1d')) return respond(koChart);
      return respond(vooChart);
    }) as unknown as typeof fetch;

    const result = await refreshPrices(db, { force: true });

    expect(result).toEqual({ ran: true, updated: 1, failed: [], error: null });
    const portfolio = (await getPortfolio(db, xtb))!;
    expect(portfolio.holdings[0]).toMatchObject({ price_e4: 6_895_000, value_minor: 68_950, gain_minor: 8_950 });
    expect((await listHistory(db, voo)).length).toBeGreaterThan(15);
    expect((await latestFxRates(db)).get('USDCOP')?.rate_e4).toBe(32_968_400);
    // Privacy: the requests carry the ticker and nothing else.
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/(VOO|COP%3DX)\?range=\w+&interval=\w+$/);
    }

    // Right after, without force, it does not ask again.
    expect((await refreshPrices(db)).ran).toBe(false);
  });

  test('sin conexión no rompe nada: queda el último precio conocido y dice por qué', async () => {
    const { db, xtb } = await setup();
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    const result = await refreshPrices(db, { force: true });

    expect(result).toMatchObject({ ran: true, updated: 0, failed: ['VOO'] });
    expect(result.error).toContain('Sin conexión');
    expect((await getPortfolio(db, xtb))?.holdings[0].quote).toBeNull();
  });

  test('sin posiciones no llama a nadie', async () => {
    const db = openTestDatabase();
    await migrateDatabase(db);
    global.fetch = jest.fn() as unknown as typeof fetch;
    expect((await refreshPrices(db, { force: true })).ran).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
