import {
  buildPositions,
  convertMinor,
  formatPercent,
  formatPrice,
  formatQuantity,
  OversellError,
  parseScaled,
  portfolioSeries,
  PRICE_SCALE,
  QUANTITY_SCALE,
  quantitiesAt,
  tradeCashEffect,
  valueMinor,
} from '../../lib/portfolio';
import { summarizeAccounts } from '../../lib/accounts';
import { count, openTestDatabase, type TestDatabase } from '../../test/sqlite';
import {
  deleteTrade,
  ensureInstrument,
  getPortfolio,
  importTrades,
  listTradedInstruments,
  listTrades,
  listValuedAccounts,
  saveFxRates,
  saveHistory,
  saveQuotes,
  saveTrade,
  listHistory,
  type TradeInput,
} from '../investments';
import { migrateDatabase } from '../migrations';
import { createAccount, createTransaction, deleteAccount, getAccount } from '../repo';
import { PERSONAL_LIST_ID } from '../seed';
import type { Trade } from '../types';

const q = (units: number) => Math.round(units * QUANTITY_SCALE);
const p = (price: number) => Math.round(price * PRICE_SCALE);
const DAY = 86_400_000;
const T = new Date(2026, 9, 1, 10, 30).getTime();

describe('matemática del portafolio', () => {
  test('cantidad × precio en centavos, redondeado una sola vez', () => {
    expect(valueMinor(q(0.3512), p(598.2))).toBe(21009); // US$210,09
    expect(valueMinor(q(0.15), p(440))).toBe(6600);
    expect(valueMinor(q(1), p(0.0049))).toBe(0);
    expect(valueMinor(q(1), p(0.005))).toBe(1);
    // Big position: the scaled product does not fit in a JS number.
    expect(valueMinor(q(250_000), p(1234.5678))).toBe(30_864_195_000);
    // Pesos have no cents.
    expect(valueMinor(q(10), p(4250.5), 'COP')).toBe(42505);
  });

  test('leer y escribir cantidades y precios', () => {
    expect(parseScaled('0,3512', QUANTITY_SCALE)).toBe(351200);
    expect(parseScaled('0.3512', QUANTITY_SCALE)).toBe(351200);
    expect(parseScaled('1.250,5', PRICE_SCALE)).toBe(12_505_000);
    expect(parseScaled('598,20', PRICE_SCALE)).toBe(5_982_000);
    expect(parseScaled('', PRICE_SCALE)).toBeNull();
    expect(parseScaled('abc', PRICE_SCALE)).toBeNull();
    expect(parseScaled('-5', PRICE_SCALE)).toBeNull();
    expect(formatQuantity(351200)).toBe('0,3512');
    expect(formatQuantity(q(2))).toBe('2');
    expect(formatPrice(p(598.2))).toBe('598,20');
    expect(formatPrice(p(1234.5))).toBe('1.234,50');
    expect(formatPercent(0.0237)).toBe('+2,37%');
    expect(formatPercent(-0.0259)).toBe('−2,59%');
  });

  const trade = (id: string, side: Trade['side'], units: number, price: number, at: number, fee = 0, instrument = 'voo') => ({
    id, instrument_id: instrument, side, quantity_e6: q(units), price_e4: p(price), fee_minor: fee,
    gross_minor: valueMinor(q(units), p(price)), executed_at: at, currency: 'USD',
  });

  test('cada compra es un lote y las ventas gastan primero el más viejo (FIFO)', () => {
    const positions = buildPositions([
      trade('b1', 'buy', 2, 100, T),
      trade('b2', 'buy', 3, 120, T + DAY),
      trade('s1', 'sell', 2.5, 150, T + 2 * DAY, 100),
    ]);
    const voo = positions.get('voo')!;
    expect(voo.quantity_e6).toBe(q(2.5));
    expect(voo.lots).toEqual([{ tradeId: 'b2', quantity_e6: q(2.5), price_e4: p(120), executed_at: T + DAY }]);
    expect(voo.cost_minor).toBe(30_000);
    expect(voo.avg_price_e4).toBe(p(120));
    // Sold 2 @100 + 0,5 @120 = 260 of cost, for 375, minus 1 of commission.
    expect(voo.realized_minor).toBe(37_500 - 26_000 - 100);
  });

  test('el orden en que llegan las operaciones no importa, solo su fecha', () => {
    const a = buildPositions([trade('s', 'sell', 1, 150, T + DAY), trade('b', 'buy', 2, 100, T)]);
    expect(a.get('voo')?.quantity_e6).toBe(q(1));
  });

  test('vender más de lo que había en ese momento es un error', () => {
    expect(() => buildPositions([trade('b', 'buy', 1, 100, T + DAY), trade('s', 'sell', 1, 150, T)])).toThrow(OversellError);
    expect(() => buildPositions([trade('b', 'buy', 1, 100, T), trade('s', 'sell', 1.000001, 150, T + 1)])).toThrow(OversellError);
    // The lenient mode (for showing old data) sells what there is.
    expect(buildPositions([trade('b', 'buy', 1, 100, T), trade('s', 'sell', 2, 150, T + 1)], { strict: false }).get('voo')?.quantity_e6).toBe(0);
  });

  test('efecto en el saldo libre: comprar lo baja con la comisión, vender lo sube sin ella', () => {
    expect(tradeCashEffect({ side: 'buy', gross_minor: 21009, fee_minor: 50 })).toBe(-21059);
    expect(tradeCashEffect({ side: 'sell', gross_minor: 21009, fee_minor: 50 })).toBe(20959);
  });

  test('serie del gráfico: unidades que había × precio de ese momento', () => {
    const trades = [trade('b1', 'buy', 2, 100, T), trade('k', 'buy', 10, 60, T + DAY, 0, 'ko'), trade('s1', 'sell', 1, 130, T + 2 * DAY)];
    expect([...quantitiesAt(trades, T + DAY)]).toEqual([['voo', q(2)], ['ko', q(10)]]);
    const prices: Record<string, number> = { voo: 110, ko: 61 };
    const series = portfolioSeries(trades, [T - DAY, T, T + DAY, T + 3 * DAY], (id, t) => (id === 'ko' && t < T + 2 * DAY ? null : p(prices[id])));
    expect(series.map((s) => s.value)).toEqual([
      0,
      22_000,
      // KO has no price yet: it counts at what it cost, so the line does not fall to zero.
      22_000 + 60_000,
      11_000 + 61_000,
    ]);
  });

  test('pasar dólares a pesos con la tasa ×1e4', () => {
    expect(convertMinor(41_236, p(4100), 'USD', 'COP')).toBe(1_690_676); // US$412,36 × 4.100
    expect(convertMinor(-100, p(4100.5), 'USD', 'COP')).toBe(-4101);
    // Same number of decimals on both sides.
    expect(convertMinor(10_000, p(0.92), 'USD', 'EUR')).toBe(9_200);
  });
});

async function setup() {
  const db: TestDatabase = openTestDatabase();
  await migrateDatabase(db);
  const davivienda = await createAccount(db, { name: 'Davivienda', emoji: '🏦', color: '#fff', type: 'savings', group_id: null, opening_balance: 5_000_000 });
  const xtb = await createAccount(db, { name: 'XTB', emoji: '📈', color: '#fff', type: 'broker', currency: 'USD', group_id: null });
  // Deposit: 4.100.000 pesos leave, US$1.000,00 arrive.
  await createTransaction(db, PERSONAL_LIST_ID, { kind: 'transfer', amount: 4_100_000, currency: 'COP', category_id: null, account_id: davivienda, to_account_id: xtb, to_amount: 100_000, title: 'Depósito', occurred_at: T - DAY });
  const voo = await ensureInstrument(db, { symbol: 'voo', name: 'Vanguard S&P 500 ETF', exchange: 'NYSEArca', currency: 'USD', provider_symbol: 'VOO' });
  const ko = await ensureInstrument(db, { symbol: 'KO', name: 'Coca-Cola', exchange: 'NYSE', currency: 'USD', provider_symbol: 'KO' });
  const buy = (instrument: string, units: number, price: number, at: number, extra: Partial<TradeInput> = {}): TradeInput => ({
    account_id: xtb, instrument_id: instrument, side: 'buy', quantity_e6: q(units), price_e4: p(price), executed_at: at, ...extra,
  });
  return { db, davivienda, xtb, voo, ko, buy };
}

describe('operaciones', () => {
  test('un instrumento se crea una vez por símbolo', async () => {
    const { db, voo } = await setup();
    expect(await ensureInstrument(db, { symbol: 'VOO', name: 'otro nombre', exchange: '', currency: 'USD', provider_symbol: ' voo ' })).toBe(voo);
    expect(await count(db, 'instruments')).toBe(2);
  });

  test('comprar baja el saldo libre y sube las posiciones: la cuenta vale lo mismo', async () => {
    const { db, xtb, voo, buy } = await setup();
    await saveTrade(db, buy(voo, 0.3512, 598.2, T));
    expect((await getAccount(db, xtb))?.balance).toBe(100_000 - 21_009);
    const portfolio = (await getPortfolio(db, xtb))!;
    // Without a quote yet, a position is worth what it cost.
    expect(portfolio).toMatchObject({ cash_minor: 78_991, holdings_value_minor: 21_009, total_minor: 100_000, gain_minor: 0, day_change_minor: null, as_of: null });
  });

  test('con cotización: valor, ganancia del día y total', async () => {
    const { db, xtb, voo, ko, buy } = await setup();
    await saveTrade(db, buy(voo, 0.3512, 598.2, T, { fee_minor: 50 }));
    await saveTrade(db, buy(ko, 0.68, 64.1, T));
    await saveQuotes(db, [
      { instrument_id: voo, price_e4: p(612.38), prev_close_e4: p(607.7), as_of: T + DAY, provider: 'yahoo' },
      { instrument_id: ko, price_e4: p(66.59), prev_close_e4: p(66.9), as_of: T + DAY + 1000, provider: 'yahoo' },
    ]);
    const portfolio = (await getPortfolio(db, xtb))!;
    const [first, second] = portfolio.holdings;
    expect(first).toMatchObject({ value_minor: 21_507, gain_minor: 21_507 - 21_009, day_change_minor: 21_507 - 21_342 });
    expect(first.instrument.symbol).toBe('VOO');
    expect(second).toMatchObject({ value_minor: 4_528, gain_minor: 4_528 - 4_359 });
    expect(portfolio.holdings_value_minor).toBe(26_035);
    expect(portfolio.cash_minor).toBe(100_000 - 21_009 - 50 - 4_359);
    expect(portfolio.day_change_minor).toBe(21_507 - 21_342 + (4_528 - 4_549));
    expect(portfolio.as_of).toBe(T + DAY);
  });

  test('una cotización más vieja no pisa una más nueva', async () => {
    const { db, xtb, voo, buy } = await setup();
    await saveTrade(db, buy(voo, 1, 600, T));
    await saveQuotes(db, [{ instrument_id: voo, price_e4: p(620), prev_close_e4: null, as_of: T + 2 * DAY, provider: 'yahoo' }]);
    await saveQuotes(db, [{ instrument_id: voo, price_e4: p(500), prev_close_e4: null, as_of: T + DAY, provider: 'finnhub' }]);
    expect((await getPortfolio(db, xtb))?.holdings[0].price_e4).toBe(p(620));
  });

  test('vender: FIFO, ganancia realizada y el efectivo vuelve', async () => {
    const { db, xtb, voo, buy } = await setup();
    await saveTrade(db, buy(voo, 1, 100, T));
    await saveTrade(db, buy(voo, 1, 120, T + DAY));
    await saveTrade(db, { ...buy(voo, 1.5, 150, T + 2 * DAY), side: 'sell', fee_minor: 100 });
    const portfolio = (await getPortfolio(db, xtb))!;
    expect(portfolio.holdings[0]).toMatchObject({ quantity_e6: q(0.5), cost_minor: 6_000, realized_minor: 22_500 - 16_000 - 100 });
    expect(portfolio.cash_minor).toBe(100_000 - 10_000 - 12_000 + 22_500 - 100);
  });

  test('no deja vender lo que no hay, ni borrar o editar una compra de la que depende una venta', async () => {
    const { db, xtb, voo, buy } = await setup();
    const first = await saveTrade(db, buy(voo, 1, 100, T));
    await expect(saveTrade(db, { ...buy(voo, 2, 150, T + DAY), side: 'sell' })).rejects.toThrow('vender más');
    await saveTrade(db, { ...buy(voo, 1, 150, T + DAY), side: 'sell' });
    await expect(deleteTrade(db, first)).rejects.toThrow('venta posterior');
    await expect(saveTrade(db, buy(voo, 0.5, 100, T), first)).rejects.toThrow('vender más');
    // Nothing was half-saved.
    const trades = await listTrades(db, xtb);
    expect(trades.map((t) => [t.side, t.quantity_e6, t.symbol])).toEqual([['sell', q(1), 'VOO'], ['buy', q(1), 'VOO']]);
  });

  test('reglas: cuenta de bróker, misma moneda, cantidades y fecha válidas', async () => {
    const { db, davivienda, xtb, voo, buy } = await setup();
    await expect(saveTrade(db, { ...buy(voo, 1, 100, T), account_id: davivienda })).rejects.toThrow('bróker');
    const eur = await ensureInstrument(db, { symbol: 'SAN', name: 'Santander', exchange: 'MCE', currency: 'EUR', provider_symbol: 'SAN.MC' });
    await expect(saveTrade(db, buy(eur, 1, 4, T))).rejects.toThrow('deben coincidir');
    await expect(saveTrade(db, { ...buy(voo, 1, 100, T), quantity_e6: 0 })).rejects.toThrow('cantidad');
    await expect(saveTrade(db, { ...buy(voo, 1, 100, T), price_e4: 1.5 })).rejects.toThrow('precio');
    await expect(saveTrade(db, buy(voo, 1, 100, Date.now() + DAY))).rejects.toThrow('futuro');
    expect(await count(db, 'trades')).toBe(0);
    expect((await getAccount(db, xtb))?.balance).toBe(100_000);
  });

  test('editar y borrar una operación deja el saldo libre cuadrado', async () => {
    const { db, xtb, voo, buy } = await setup();
    const id = await saveTrade(db, buy(voo, 1, 100, T));
    await saveTrade(db, buy(voo, 2, 110, T, { fee_minor: 25 }), id);
    expect((await getAccount(db, xtb))?.balance).toBe(100_000 - 22_000 - 25);
    await deleteTrade(db, id);
    expect((await getAccount(db, xtb))?.balance).toBe(100_000);
    expect(await listTradedInstruments(db)).toEqual([]);
  });

  test('una cuenta con operaciones no se puede archivar', async () => {
    const { db, xtb, voo, buy } = await setup();
    await saveTrade(db, buy(voo, 1, 100, T));
    await expect(deleteAccount(db, xtb)).rejects.toThrow('operaciones');
  });

  test('importar un reporte: todo o nada, y la segunda vez no agrega nada', async () => {
    const { db, xtb } = await setup();
    const nvda = { symbol: 'NVDA', name: 'Nvidia', exchange: 'NASDAQ', currency: 'USD', provider_symbol: 'NVDA' };
    const report = [
      { account_id: xtb, instrument: nvda, side: 'sell' as const, quantity_e6: q(0.2), price_e4: p(150), executed_at: T + DAY, source_ref: 'xtb-2' },
      { account_id: xtb, instrument: nvda, side: 'buy' as const, quantity_e6: q(0.6), price_e4: p(138.5), executed_at: T, source_ref: 'xtb-1' },
    ];
    expect(await importTrades(db, report)).toEqual({ added: 2, skipped: 0 });
    expect(await importTrades(db, report)).toEqual({ added: 0, skipped: 2 });
    expect(await count(db, 'trades', "source = 'import'")).toBe(2);
    expect((await getPortfolio(db, xtb))?.holdings[0].quantity_e6).toBe(q(0.4));

    const broken = [...report.map((r) => ({ ...r, source_ref: `${r.source_ref}-b` })), { ...report[0], quantity_e6: q(50), source_ref: 'xtb-3' }];
    await expect(importTrades(db, broken)).rejects.toThrow();
    expect(await count(db, 'trades')).toBe(2);
  });
});

describe('cuentas valoradas y tasa de cambio', () => {
  test('el bróker vale efectivo más posiciones, y entra a "Tu dinero hoy" cuando hay tasa', async () => {
    const { db, xtb, voo, buy } = await setup();
    await saveTrade(db, buy(voo, 0.5, 600, T));
    await saveQuotes(db, [{ instrument_id: voo, price_e4: p(660), prev_close_e4: p(650), as_of: T + DAY, provider: 'yahoo' }]);

    let accounts = await listValuedAccounts(db);
    let broker = accounts.find((a) => a.id === xtb)!;
    expect(broker).toMatchObject({ cash_balance: 70_000, holdings_value: 33_000, balance: 103_000, base_balance: null, fx: null, day_change: 500 });
    // Without a rate the dollars are shown but not added to the pesos.
    expect(summarizeAccounts(accounts)).toMatchObject({ available: 900_000, invested: 0, net: 900_000 });
    expect(summarizeAccounts(accounts).foreign.map((a) => a.name)).toEqual(['XTB']);

    await saveFxRates(db, 'USDCOP', [{ day: '2026-11-06', rate_e4: p(4000) }, { day: '2026-11-09', rate_e4: p(4100) }]);
    accounts = await listValuedAccounts(db);
    broker = accounts.find((a) => a.id === xtb)!;
    expect(broker.base_balance).toBe(4_223_000);
    expect(broker.fx).toMatchObject({ day: '2026-11-09', rate_e4: p(4100) });
    expect(summarizeAccounts(accounts)).toMatchObject({ available: 900_000, invested: 4_223_000, net: 5_123_000, foreign: [] });
  });

  test('el histórico de cierres se guarda por día y se puede reescribir', async () => {
    const { db, voo } = await setup();
    await saveHistory(db, voo, [{ day: '2026-11-05', close_e4: p(675.99) }, { day: '2026-11-06', close_e4: p(691.87) }]);
    await saveHistory(db, voo, [{ day: '2026-11-06', close_e4: p(692) }, { day: '2026-11-09', close_e4: p(689.5) }]);
    expect(await listHistory(db, voo, '2026-11-06')).toEqual([{ day: '2026-11-06', close_e4: p(692) }, { day: '2026-11-09', close_e4: p(689.5) }]);
  });
});
