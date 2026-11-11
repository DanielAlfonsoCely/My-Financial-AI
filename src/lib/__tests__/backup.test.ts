import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from '../../db/migrations';
import {
  createAccount,
  createAccountGroup,
  createAiRule,
  createCategory,
  createList,
  createTransaction,
  deleteTransaction,
  listAccounts,
  saveTransaction,
  setBudget,
  setSetting,
} from '../../db/repo';
import { PERSONAL_LIST_ID } from '../../db/seed';
import { count, openTestDatabase } from '../../test/sqlite';
import { exportBackup, importBackupFromText } from '../backup';

const written = (jest.requireMock('expo-file-system') as { __written: { name: string; content: string }[] }).__written;
const T = new Date(2026, 10, 10, 12).getTime();

async function freshDb(): Promise<SQLiteDatabase> {
  const db = openTestDatabase();
  await migrateDatabase(db);
  return db;
}

async function exported(db: SQLiteDatabase): Promise<string> {
  await exportBackup(db);
  return written[written.length - 1].content;
}

async function totals(db: SQLiteDatabase) {
  return db.getAllAsync(
    `SELECT list_id, kind, COUNT(*) AS n, SUM(amount) AS total FROM transactions
     WHERE deleted_at IS NULL GROUP BY list_id, kind ORDER BY list_id, kind`,
  );
}

async function populated(): Promise<SQLiteDatabase> {
  const db = await freshDb();
  const viaje = await createList(db, 'Viaje', '✈️');
  const hotel = await createCategory(db, viaje, { name: 'Hotel', emoji: '🏨', color: '#F0E0D0', kind: 'expense' });
  await createTransaction(db, viaje, { kind: 'expense', amount: 350_000, currency: 'COP', category_id: hotel, title: 'Hotel', occurred_at: T });
  await createTransaction(db, PERSONAL_LIST_ID, { kind: 'income', amount: 3_200_000, currency: 'COP', category_id: 'cat-salario', title: 'Nómina', occurred_at: T });
  await saveTransaction(db, PERSONAL_LIST_ID, {
    input: { kind: 'expense', amount: 1_200_000, currency: 'COP', category_id: 'cat-hogar', title: 'Arriendo', tags: ['fijo'], occurred_at: T },
    repeat: 'monthly',
  });
  const gone = await createTransaction(db, PERSONAL_LIST_ID, { kind: 'expense', amount: 9_000, currency: 'COP', category_id: null, title: 'Borrado', occurred_at: T });
  await deleteTransaction(db, gone);
  // Accounts, a group, a transfer and a card payment.
  const bancos = await createAccountGroup(db, 'Bancos', '🏦');
  const davivienda = await createAccount(db, { name: 'Davivienda', emoji: '🏦', color: '#FAD3D7', type: 'savings', group_id: bancos, opening_balance: 2_000_000 });
  const efectivo = await createAccount(db, { name: 'Billetera', emoji: '👛', color: '#D3EFE2', type: 'cash', group_id: null, opening_balance: 50_000 });
  const tarjeta = await createAccount(db, { name: 'Tarjeta Nu', emoji: '💳', color: '#CFE6F6', type: 'credit', group_id: null, opening_balance: 300_000, credit_limit: 3_000_000 });
  await createTransaction(db, PERSONAL_LIST_ID, { kind: 'transfer', amount: 80_000, currency: 'COP', category_id: null, account_id: davivienda, to_account_id: efectivo, title: 'Retiro', occurred_at: T });
  await createTransaction(db, PERSONAL_LIST_ID, { kind: 'transfer', amount: 100_000, currency: 'COP', category_id: null, account_id: davivienda, to_account_id: tarjeta, title: 'Pago tarjeta', occurred_at: T });
  await createTransaction(db, PERSONAL_LIST_ID, { kind: 'expense', amount: 20_000, currency: 'COP', category_id: 'cat-mercado', account_id: efectivo, title: 'Tienda', occurred_at: T });
  await setBudget(db, PERSONAL_LIST_ID, 'cat-mercado', 600_000);
  await createAiRule(db, PERSONAL_LIST_ID, 'Combo McDonalds', 'cat-comer-afuera');
  await setSetting(db, 'show_income', 'true');
  return db;
}

describe('respaldo JSON', () => {
  test('exportar e importar en una instalación limpia deja los mismos totales', async () => {
    const source = await populated();
    const text = await exported(source);
    const target = await freshDb();

    const summary = await importBackupFromText(target, text);

    expect(summary.skipped).toBe(0);
    expect(await totals(target)).toEqual(await totals(source));
    for (const table of ['lists', 'transactions', 'tags', 'recurring', 'budgets', 'ai_rules', 'accounts', 'account_groups']) {
      expect(await count(target, table)).toBe(await count(source, table));
    }
    // Same balances, account by account.
    const balances = async (db: SQLiteDatabase) => (await listAccounts(db)).map((a) => [a.name, a.balance, a.group_id]);
    expect(await balances(target)).toEqual(await balances(source));
    expect(await balances(target)).toEqual([
      ['Davivienda', 1_820_000, expect.any(String)],
      ['Billetera', 110_000, null],
      ['Tarjeta Nu', 200_000, null],
    ]);
    // The soft-deleted movement travels as deleted, so a future sync can propagate it.
    expect(await count(target, 'transactions', 'deleted_at IS NOT NULL')).toBe(1);
    const income = await target.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'show_income'");
    expect(income?.value).toBe('true');
  });

  test('importar dos veces no duplica nada', async () => {
    const text = await exported(await populated());
    const target = await freshDb();
    await importBackupFromText(target, text);
    const once = await totals(target);
    const again = await importBackupFromText(target, text);
    expect(await totals(target)).toEqual(once);
    expect(again.transactions).toBe(0);
  });

  test('gana la versión más reciente de cada fila', async () => {
    const source = await populated();
    const target = await freshDb();
    await importBackupFromText(target, await exported(source));
    // The same movement is edited later on the phone that receives the backup.
    await target.runAsync("UPDATE transactions SET amount = 111, updated_at = updated_at + 60000 WHERE title = 'Nómina'");

    await importBackupFromText(target, await exported(source));

    const row = await target.getFirstAsync<{ amount: number }>("SELECT amount FROM transactions WHERE title = 'Nómina'");
    expect(row?.amount).toBe(111);
  });

  test('un respaldo formato 1 (sin listas) entra en la lista Personal', async () => {
    const target = await freshDb();
    const v1 = {
      format: 'my-financial-ai-backup',
      format_version: 1,
      schema_version: 1,
      exported_at: '2026-10-01T00:00:00.000Z',
      categories: [
        { id: 'cat-own', name: 'Gato', emoji: '🐱', color: '#123456', kind: 'expense', sort_order: 20, created_at: 5, updated_at: 5, deleted_at: null },
      ],
      transactions: [
        { id: 't1', kind: 'expense', amount: 25000, currency: 'COP', category_id: 'cat-own', title: 'Croquetas', note: null, occurred_at: T, source: 'manual', source_ref: null, created_at: 5, updated_at: 5, deleted_at: null },
        { id: 't2', kind: 'expense', amount: 12.5, currency: 'COP', category_id: null, title: 'Monto inválido', note: null, occurred_at: T, source: 'manual', source_ref: null, created_at: 5, updated_at: 5, deleted_at: null },
      ],
      settings: [{ key: 'show_income', value: 'true', updated_at: 5 }],
    };

    const summary = await importBackupFromText(target, JSON.stringify(v1));

    expect(summary).toMatchObject({ transactions: 1, skipped: 1 });
    const row = await target.getFirstAsync<{ list_id: string; tags: string; category_id: string }>("SELECT list_id, tags, category_id FROM transactions WHERE id = 't1'");
    expect(row).toEqual({ list_id: PERSONAL_LIST_ID, tags: '[]', category_id: 'cat-own' });
  });

  test('rechaza archivos que no son un respaldo o son de una versión más nueva', async () => {
    const target = await freshDb();
    await expect(importBackupFromText(target, 'hola')).rejects.toThrow('JSON');
    await expect(importBackupFromText(target, '{"format":"otro"}')).rejects.toThrow('respaldo');
    await expect(
      importBackupFromText(target, JSON.stringify({ format: 'my-financial-ai-backup', format_version: 99, categories: [], transactions: [], settings: [] })),
    ).rejects.toThrow('más nueva');
    expect(await count(target, 'transactions')).toBe(0);
  });
  test('un respaldo formato 2 (sin cuentas) sigue importando', async () => {
    const target = await freshDb();
    const v2 = {
      format: 'my-financial-ai-backup',
      format_version: 2,
      schema_version: 3,
      exported_at: '2026-11-01T00:00:00.000Z',
      lists: [{ id: 'list-viaje', name: 'Viaje', emoji: '✈️', sort_order: 1, created_at: 5, updated_at: 5, deleted_at: null }],
      categories: [],
      transactions: [
        { id: 't1', list_id: 'list-viaje', kind: 'expense', amount: 350000, currency: 'COP', category_id: null, title: 'Hotel', note: null, tags: '["viaje"]', occurred_at: T, source: 'manual', source_ref: null, recurring_id: null, created_at: 5, updated_at: 5, deleted_at: null },
      ],
      recurring: [
        { id: 'r1', list_id: 'list-personal', kind: 'expense', amount: 30000, currency: 'COP', category_id: 'cat-suscripciones', title: 'Spotify', tags: '[]', frequency: 'monthly', anchor_day: 5, next_at: T, created_at: 5, updated_at: 5, deleted_at: null },
      ],
      settings: [],
    };

    const summary = await importBackupFromText(target, JSON.stringify(v2));

    expect(summary).toMatchObject({ transactions: 1, skipped: 0 });
    const row = await target.getFirstAsync("SELECT list_id, account_id, to_account_id FROM transactions WHERE id = 't1'");
    expect(row).toEqual({ list_id: 'list-viaje', account_id: null, to_account_id: null });
    expect(await count(target, 'recurring', 'account_id IS NULL')).toBe(1);
  });

  test('una transferencia cuyas cuentas no vienen en el archivo se omite; un gasto queda sin cuenta', async () => {
    const target = await freshDb();
    const base = { list_id: 'list-personal', amount: 1000, currency: 'COP', category_id: null, title: 'x', note: null, tags: '[]', occurred_at: T, source: 'manual', source_ref: null, recurring_id: null, created_at: 5, updated_at: 5, deleted_at: null };
    const file = {
      format: 'my-financial-ai-backup', format_version: 3, schema_version: 4, exported_at: '2026-11-10T00:00:00.000Z',
      categories: [],
      transactions: [
        { ...base, id: 'tr', kind: 'transfer', account_id: 'no-existe', to_account_id: 'tampoco', to_amount: null },
        { ...base, id: 'ga', kind: 'expense', account_id: 'no-existe', to_account_id: null, to_amount: null },
      ],
      settings: [],
    };
    const summary = await importBackupFromText(target, JSON.stringify(file));
    expect(summary).toMatchObject({ transactions: 1, skipped: 1 });
    expect(await target.getFirstAsync("SELECT account_id FROM transactions WHERE id = 'ga'")).toEqual({ account_id: null });
  });
});
