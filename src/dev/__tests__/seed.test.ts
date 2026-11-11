import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from '../../db/migrations';
import {
  createAccount,
  createCategory,
  createTransaction,
  getTransaction,
  listAccountGroups,
  listAccounts,
  listBudgets,
  listLists,
  listRecurring,
  setBudget,
} from '../../db/repo';
import { ensureInstrument, getPortfolio, saveQuotes, saveTrade } from '../../db/investments';
import { PERSONAL_LIST_ID } from '../../db/seed';
import { groupAccounts, summarizeAccounts } from '../../lib/accounts';
import { count, openTestDatabase } from '../../test/sqlite';
import { clearDevData, getDevSeedStatus, seedDevData } from '../seed';

const NOW = new Date(2026, 10, 10, 15, 0).getTime();
const TABLES = ['transactions', 'trades', 'instruments', 'quotes', 'price_history', 'recurring', 'budgets', 'ai_rules', 'tags', 'categories', 'accounts', 'account_groups', 'lists', 'settings'];

async function dump(db: SQLiteDatabase) {
  const result: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const order = table === 'settings' ? 'key' : table === 'quotes' || table === 'price_history' ? 'instrument_id' : 'id';
    result[table] = await db.getAllAsync(`SELECT * FROM ${table} ORDER BY ${order}`);
  }
  return result;
}

async function freshDb() {
  const db = openTestDatabase();
  await migrateDatabase(db);
  return db;
}

jest.setTimeout(60_000);

describe('datos de prueba', () => {
  test('pobla la app con cuentas, movimientos, transferencias, presupuestos y listas', async () => {
    const db = await freshDb();
    expect(await seedDevData(db, NOW)).toBe(true);

    const status = await getDevSeedStatus(db);
    expect(status).toMatchObject({ seeded: true, seededAt: NOW });
    expect(status.movements).toBeGreaterThan(200);
    expect(await count(db, 'transactions')).toBe(status.movements);
    expect(await count(db, 'transactions', 'occurred_at > ' + NOW)).toBe(0);
    expect(await count(db, 'transactions', "kind = 'transfer'")).toBeGreaterThan(10);
    expect(await count(db, 'transactions', "source = 'voice'")).toBeGreaterThan(0);
    expect(await count(db, 'transactions', "kind = 'expense' AND category_id IS NULL")).toBeGreaterThan(0);
    expect((await listLists(db)).map((l) => l.name)).toEqual(['Personal', 'Trabajo', 'Viaje']);
    expect(await listRecurring(db, PERSONAL_LIST_ID)).toHaveLength(4);
    expect(await count(db, 'ai_rules')).toBe(5);

    const accounts = await listAccounts(db);
    expect(accounts.map((a) => a.name)).toEqual(['Billetera', 'Bajo el colchón', 'Davivienda', 'Cuenta Nu', 'Nequi', 'CDT Davivienda', 'XTB', 'Tarjeta Nu']);
    // A believable picture: nobody is overdrawn, the card owes something within its limit.
    for (const a of accounts.filter((x) => x.type !== 'credit')) expect(a.balance).toBeGreaterThanOrEqual(0);
    const card = accounts.find((a) => a.type === 'credit')!;
    expect(card.balance).toBeGreaterThan(0);
    expect(card.balance).toBeLessThan(card.credit_limit!);
    // Free cash of the broker: US$500 deposited − buys + the partial sale.
    expect(accounts.find((a) => a.name === 'XTB')).toMatchObject({ currency: 'USD', balance: 50_000 - 43_048 + 3_000 });
    const xtb = accounts.find((a) => a.name === 'XTB')!.id;
    const portfolio = (await getPortfolio(db, xtb))!;
    expect(portfolio.holdings.map((h) => h.instrument.symbol).sort()).toEqual(['KO', 'MSFT', 'NVDA', 'VOO']);
    expect(portfolio.holdings.find((h) => h.instrument.symbol === 'NVDA')).toMatchObject({ quantity_e6: 600_000, realized_minor: 3_000 - 2_770 });
    expect(portfolio.total_minor).toBe(portfolio.cash_minor + portfolio.cost_minor);
    const summary = summarizeAccounts(accounts);
    expect(summary.invested).toBe(2_000_000);
    expect(summary.net).toBe(summary.available + summary.invested - summary.debt);
    expect(groupAccounts(accounts, await listAccountGroups(db)).map((s) => s.name)).toEqual(['Efectivo', 'Bancos', 'Inversiones']);
  });

  test('los presupuestos del mes quedan uno pasado, uno cerca del umbral y uno holgado', async () => {
    const db = await freshDb();
    await seedDevData(db, NOW);
    const monthStart = new Date(2026, 10, 1).getTime();
    const ratio = async (categoryId: string) => {
      const budget = (await listBudgets(db, PERSONAL_LIST_ID)).find((b) => b.category_id === categoryId)!;
      const spent = await db.getFirstAsync<{ total: number }>(
        "SELECT SUM(amount) AS total FROM transactions WHERE kind = 'expense' AND category_id = ? AND occurred_at >= ?",
        categoryId, monthStart,
      );
      return (spent?.total ?? 0) / budget.amount;
    };
    expect(await ratio('cat-mercado')).toBeGreaterThan(1);
    const near = await ratio('cat-comer-afuera');
    expect(near).toBeGreaterThan(0.8);
    expect(near).toBeLessThan(0.95);
    expect(await ratio('cat-transporte')).toBeLessThan(0.6);
  });

  test('siempre sale lo mismo y no se repite si ya hay datos de prueba', async () => {
    const a = await freshDb();
    const b = await freshDb();
    await seedDevData(a, NOW);
    await seedDevData(b, NOW);
    const shape = (db: SQLiteDatabase) =>
      db.getAllAsync('SELECT kind, amount, title, occurred_at / 60000 AS minute FROM transactions ORDER BY occurred_at, title, amount');
    expect(await shape(a)).toEqual(await shape(b));

    const before = await count(a, 'transactions');
    expect(await seedDevData(a, NOW)).toBe(false);
    expect(await count(a, 'transactions')).toBe(before);
  });

  test('borrar deja la base exactamente como estaba', async () => {
    const db = await freshDb();
    // Real data from before the seed.
    const mine = await createAccount(db, { name: 'Mi cuenta', emoji: '🏦', color: '#fff', type: 'savings', group_id: null, opening_balance: 500_000 });
    await createTransaction(db, PERSONAL_LIST_ID, { kind: 'expense', amount: 12_000, currency: 'COP', category_id: 'cat-mercado', account_id: mine, title: 'Pan', tags: ['mio'], occurred_at: NOW });
    await setBudget(db, PERSONAL_LIST_ID, 'cat-mercado', 777_000);
    const before = await dump(db);

    await seedDevData(db, NOW);
    // The user's own budget was not overwritten by the seed.
    expect((await listBudgets(db, PERSONAL_LIST_ID)).find((b) => b.category_id === 'cat-mercado')?.amount).toBe(777_000);

    const removed = await clearDevData(db);
    expect(removed).toBeGreaterThan(250);
    expect(await dump(db)).toEqual(before);
    expect(await getDevSeedStatus(db)).toMatchObject({ seeded: false, rows: 0 });
    // And it can be seeded again.
    expect(await seedDevData(db, NOW)).toBe(true);
  });

  test('lo que el usuario creó encima de los datos de prueba se conserva, suelto', async () => {
    const db = await freshDb();
    await seedDevData(db, NOW);
    const accounts = await listAccounts(db);
    const davivienda = accounts.find((a) => a.name === 'Davivienda')!.id;
    const billetera = accounts.find((a) => a.name === 'Billetera')!.id;
    const trabajo = (await listLists(db)).find((l) => l.name === 'Trabajo')!.id;
    const ownCategory = await createCategory(db, trabajo, { name: 'Mía', emoji: '⭐', color: '#fff', kind: 'expense' });
    const expense = await createTransaction(db, trabajo, { kind: 'expense', amount: 9_000, currency: 'COP', category_id: ownCategory, account_id: davivienda, title: 'Real', occurred_at: NOW });
    // Prices fetched for the test positions, and a real trade made on top of them.
    const xtb = accounts.find((a) => a.name === 'XTB')!.id;
    const voo = await ensureInstrument(db, { symbol: 'VOO', name: '', exchange: '', currency: 'USD', provider_symbol: 'VOO' });
    await saveQuotes(db, [{ instrument_id: voo, price_e4: 6_895_000, prev_close_e4: null, as_of: NOW, provider: 'yahoo' }]);
    await saveTrade(db, { account_id: xtb, instrument_id: voo, side: 'buy', quantity_e6: 1000, price_e4: 6_895_000, executed_at: NOW });
    const transfer = await createTransaction(db, PERSONAL_LIST_ID, { kind: 'transfer', amount: 5_000, currency: 'COP', category_id: null, account_id: davivienda, to_account_id: billetera, title: 'Real', occurred_at: NOW });

    await clearDevData(db);

    expect(await getTransaction(db, expense)).toMatchObject({ list_id: PERSONAL_LIST_ID, account_id: null, category_id: ownCategory, amount: 9_000 });
    expect(await count(db, 'categories', `id = '${ownCategory}' AND list_id = '${PERSONAL_LIST_ID}'`)).toBe(1);
    // A transfer cannot outlive its accounts.
    expect(await getTransaction(db, transfer)).toBeNull();
    expect(await count(db, 'transactions')).toBe(1);
    expect(await count(db, 'accounts')).toBe(0);
    for (const table of ['trades', 'instruments', 'quotes']) expect(await count(db, table)).toBe(0);
  });
});
