import type { SQLiteDatabase } from 'expo-sqlite';

import { count, openTestDatabase, userVersion } from '../../test/sqlite';
import { migrateDatabase, SCHEMA_VERSION } from '../migrations';
import { DEFAULT_CATEGORIES, PERSONAL_LIST_ID } from '../seed';

const T0 = 1_750_000_000_000;
const LATEST = 4;

async function onboardingDone(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'onboarding_done'");
  return row?.value ?? null;
}

/** Data like the one the v0.1.0 APK (schema v1) leaves on the phone. */
async function fillV1(db: SQLiteDatabase): Promise<void> {
  // A category created by the user and a seed one the user recolored.
  await db.runAsync(
    `INSERT INTO categories (id, name, emoji, color, kind, sort_order, created_at, updated_at)
     VALUES ('cat-own', 'Gato', '🐱', '#123456', 'expense', 20, ?, ?)`,
    T0, T0,
  );
  const tx = `INSERT INTO transactions (id, kind, amount, currency, category_id, title, occurred_at, source, created_at, updated_at, deleted_at)
              VALUES (?, ?, ?, 'COP', ?, ?, ?, 'manual', ?, ?, ?)`;
  await db.runAsync(tx, 't1', 'expense', 25000, 'cat-mercado', 'Mercado D1', T0, T0, T0, null);
  await db.runAsync(tx, 't2', 'expense', 12500, 'cat-own', 'Croquetas', T0 + 1000, T0, T0, null);
  await db.runAsync(tx, 't3', 'income', 3_200_000, 'cat-salario', 'Nómina', T0 + 2000, T0, T0, null);
  await db.runAsync(tx, 't4', 'expense', 9000, null, 'Borrado', T0 + 3000, T0, T0 + 5000, T0 + 5000);
  await db.runAsync("UPDATE categories SET color = '#ABCDEF', updated_at = ? WHERE id = 'cat-transporte'", T0 + 10);
  await db.runAsync("INSERT INTO settings (key, value, updated_at) VALUES ('show_income', 'true', ?)", T0);
}

async function fillV2(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    "INSERT INTO lists (id, name, emoji, sort_order, created_at, updated_at) VALUES ('list-viaje', 'Viaje', '✈️', 1, ?, ?)",
    T0, T0,
  );
  await db.runAsync(
    `INSERT INTO categories (id, list_id, name, emoji, color, kind, sort_order, created_at, updated_at)
     VALUES ('cat-hotel', 'list-viaje', 'Hotel', '🏨', '#F0E0D0', 'expense', 0, ?, ?)`,
    T0, T0,
  );
  const tx = `INSERT INTO transactions (id, list_id, kind, amount, currency, category_id, title, tags, occurred_at, source, source_ref, recurring_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'COP', ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await db.runAsync(tx, 'a1', PERSONAL_LIST_ID, 'expense', 48000, 'cat-comer-afuera', 'Almuerzo', '["trabajo"]', T0, 'voice', null, null, T0, T0);
  await db.runAsync(tx, 'a2', 'list-viaje', 'expense', 350000, 'cat-hotel', 'Hotel Cartagena', '[]', T0 + 1, 'manual', null, null, T0, T0);
  await db.runAsync(tx, 'a3', PERSONAL_LIST_ID, 'expense', 1_200_000, 'cat-hogar', 'Arriendo', '[]', T0 + 2, 'recurring', 'r1:1', 'r1', T0, T0);
  await db.runAsync("INSERT INTO tags (id, list_id, name, created_at, updated_at) VALUES ('tag1', ?, 'trabajo', ?, ?)", PERSONAL_LIST_ID, T0, T0);
  await db.runAsync(
    `INSERT INTO recurring (id, list_id, kind, amount, currency, category_id, title, frequency, anchor_day, next_at, created_at, updated_at)
     VALUES ('r1', ?, 'expense', 1200000, 'COP', 'cat-hogar', 'Arriendo', 'monthly', 5, ?, ?, ?)`,
    PERSONAL_LIST_ID, T0 + 86_400_000, T0, T0,
  );
  await db.runAsync(
    "INSERT INTO budgets (id, list_id, category_id, amount, created_at, updated_at) VALUES ('b1', ?, 'cat-mercado', 600000, ?, ?)",
    PERSONAL_LIST_ID, T0, T0,
  );
  await db.runAsync(
    `INSERT INTO ai_rules (id, list_id, phrase, keywords, category_id, created_at, updated_at)
     VALUES ('rule1', ?, 'Combo McDonalds', '["combo","mcdonalds"]', 'cat-comer-afuera', ?, ?)`,
    PERSONAL_LIST_ID, T0, T0,
  );
}

/** Every row of every user table, to prove a migration left the data alone. */
async function snapshot(db: SQLiteDatabase, tables: string[]): Promise<Record<string, unknown[]>> {
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    result[table] = await db.getAllAsync(`SELECT * FROM ${table} ORDER BY ${table === 'settings' ? 'key' : 'id'}`);
  }
  return result;
}

/** `after` cut down to the columns `before` had: a later migration may add columns, never change the old ones. */
function sameColumns(after: Record<string, unknown[]>, before: Record<string, unknown[]>): Record<string, unknown[]> {
  const result: Record<string, unknown[]> = {};
  for (const table of Object.keys(before)) {
    result[table] = after[table].map((row, i) => {
      const keys = Object.keys((before[table][i] ?? row) as object);
      return Object.fromEntries(keys.map((k) => [k, (row as Record<string, unknown>)[k]]));
    });
  }
  return result;
}

const V2_TABLES = ['lists', 'categories', 'transactions', 'tags', 'recurring', 'budgets', 'ai_rules'];

describe('migraciones', () => {
  test('la versión actual es la 4', () => {
    expect(SCHEMA_VERSION).toBe(LATEST);
  });

  test('instalación limpia: llega a la última versión, con categorías y lista Personal, y sigue viendo la bienvenida', async () => {
    const db = openTestDatabase();
    await migrateDatabase(db);
    expect(await userVersion(db)).toBe(LATEST);
    expect(await count(db, 'categories')).toBe(DEFAULT_CATEGORIES.length);
    expect(await count(db, 'lists')).toBe(1);
    expect(await onboardingDone(db)).toBeNull();
  });

  test('desde v1 con datos: nada se pierde y no vuelve a la bienvenida', async () => {
    const db = openTestDatabase();
    await migrateDatabase(db, 1);
    expect(await userVersion(db)).toBe(1);
    await fillV1(db);
    const before = await db.getAllAsync<{ id: string; kind: string; amount: number; category_id: string | null; title: string; occurred_at: number; deleted_at: number | null }>(
      'SELECT id, kind, amount, category_id, title, occurred_at, deleted_at FROM transactions ORDER BY id',
    );
    const categoriesBefore = await db.getAllAsync('SELECT id, name, emoji, color, kind, sort_order, deleted_at FROM categories ORDER BY id');

    await migrateDatabase(db);

    expect(await userVersion(db)).toBe(LATEST);
    expect(await onboardingDone(db)).toBe('true');
    expect(
      await db.getAllAsync('SELECT id, kind, amount, category_id, title, occurred_at, deleted_at FROM transactions ORDER BY id'),
    ).toEqual(before);
    expect(await db.getAllAsync('SELECT id, name, emoji, color, kind, sort_order, deleted_at FROM categories ORDER BY id')).toEqual(
      categoriesBefore,
    );
    // Everything moved to the Personal list, with empty tags.
    expect(await count(db, 'transactions', `list_id = '${PERSONAL_LIST_ID}' AND tags = '[]'`)).toBe(4);
    expect(await count(db, 'categories', `list_id = '${PERSONAL_LIST_ID}'`)).toBe(DEFAULT_CATEGORIES.length + 1);
    const colors = await db.getAllAsync<{ id: string; color: string }>("SELECT id, color FROM categories WHERE id IN ('cat-own', 'cat-transporte') ORDER BY id");
    expect(colors).toEqual([{ id: 'cat-own', color: '#123456' }, { id: 'cat-transporte', color: '#ABCDEF' }]);
    const income = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'show_income'");
    expect(income?.value).toBe('true');
    const sum = await db.getFirstAsync<{ total: number }>("SELECT SUM(amount) AS total FROM transactions WHERE deleted_at IS NULL AND kind = 'expense'");
    expect(sum?.total).toBe(37500);
  });

  test('desde v1 sin movimientos: sigue siendo instalación nueva', async () => {
    const db = openTestDatabase();
    await migrateDatabase(db, 1);
    await migrateDatabase(db);
    expect(await userVersion(db)).toBe(LATEST);
    expect(await onboardingDone(db)).toBeNull();
  });

  describe('desde v2 con datos', () => {
    const cases: [string, string | null][] = [
      ['sin onboarding_done', null],
      ["con onboarding_done = 'false' (bienvenida repetida a medias)", 'false'],
      ["con onboarding_done = 'true'", 'true'],
    ];
    test.each(cases)('%s', async (_name, initial) => {
      const db = openTestDatabase();
      await migrateDatabase(db, 2);
      expect(await userVersion(db)).toBe(2);
      await fillV2(db);
      if (initial !== null) {
        await db.runAsync("INSERT INTO settings (key, value, updated_at) VALUES ('onboarding_done', ?, ?)", initial, T0);
      }
      await db.runAsync("INSERT INTO settings (key, value, updated_at) VALUES ('budget_threshold', '80', ?)", T0);
      const before = await snapshot(db, V2_TABLES);

      await migrateDatabase(db);

      expect(await userVersion(db)).toBe(LATEST);
      expect(await onboardingDone(db)).toBe('true');
      expect(sameColumns(await snapshot(db, V2_TABLES), before)).toEqual(before);
      const threshold = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'budget_threshold'");
      expect(threshold?.value).toBe('80');
      if (initial === 'true') {
        // Already done: the row is not rewritten.
        const row = await db.getFirstAsync<{ updated_at: number }>("SELECT updated_at FROM settings WHERE key = 'onboarding_done'");
        expect(row?.updated_at).toBe(T0);
      }
    });

    test('solo con movimientos borrados: también cuenta como usuario existente', async () => {
      const db = openTestDatabase();
      await migrateDatabase(db, 2);
      await fillV2(db);
      await db.runAsync('UPDATE transactions SET deleted_at = ?', T0 + 9);
      await migrateDatabase(db);
      expect(await onboardingDone(db)).toBe('true');
    });

    test('sin movimientos: no se marca', async () => {
      const db = openTestDatabase();
      await migrateDatabase(db, 2);
      await migrateDatabase(db);
      expect(await onboardingDone(db)).toBeNull();
    });
  });

  test('correr la migración dos veces no cambia nada', async () => {
    const db = openTestDatabase();
    await migrateDatabase(db, 2);
    await fillV2(db);
    await migrateDatabase(db);
    const before = await snapshot(db, [...V2_TABLES, 'settings', 'accounts', 'account_groups']);
    await migrateDatabase(db);
    expect(await userVersion(db)).toBe(LATEST);
    expect(await snapshot(db, [...V2_TABLES, 'settings', 'accounts', 'account_groups'])).toEqual(before);
  });

  test('si una migración falla, la versión y los datos quedan como estaban', async () => {
    const db = openTestDatabase();
    await migrateDatabase(db, 1);
    await fillV1(db);
    // Makes v2 fail halfway: it creates this table itself.
    await db.execAsync('CREATE TABLE tags (id TEXT)');
    await expect(migrateDatabase(db)).rejects.toThrow();
    expect(await userVersion(db)).toBe(1);
    expect(await count(db, 'transactions')).toBe(4);
    const lists = await db.getFirstAsync("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lists'");
    expect(lists).toBeNull();
  });
  describe('v4: cuentas y transferencias', () => {
    test('desde v3 con datos: los movimientos quedan iguales y "sin cuenta"', async () => {
      const db = openTestDatabase();
      await migrateDatabase(db, 2);
      await fillV2(db);
      await migrateDatabase(db, 3);
      expect(await userVersion(db)).toBe(3);
      const before = await snapshot(db, [...V2_TABLES, 'settings']);

      await migrateDatabase(db);

      expect(await userVersion(db)).toBe(4);
      expect(sameColumns(await snapshot(db, [...V2_TABLES, 'settings']), before)).toEqual(before);
      expect(await count(db, 'transactions', 'account_id IS NULL AND to_account_id IS NULL AND to_amount IS NULL')).toBe(3);
      expect(await count(db, 'recurring', 'account_id IS NULL')).toBe(1);
      expect(await count(db, 'accounts')).toBe(0);
    });

    test('desde v1 con datos: llega a v4 sin perder nada', async () => {
      const db = openTestDatabase();
      await migrateDatabase(db, 1);
      await fillV1(db);
      await migrateDatabase(db);
      expect(await count(db, 'transactions')).toBe(4);
      expect(await count(db, 'transactions', 'deleted_at IS NOT NULL')).toBe(1);
      const sum = await db.getFirstAsync<{ total: number }>('SELECT SUM(amount) AS total FROM transactions');
      expect(sum?.total).toBe(25000 + 12500 + 3_200_000 + 9000);
    });

    test('crea el grupo fijo Inversiones y los índices de movimientos', async () => {
      const db = openTestDatabase();
      await migrateDatabase(db);
      const group = await db.getFirstAsync<{ id: string; system_key: string }>('SELECT id, system_key FROM account_groups');
      expect(group).toEqual({ id: 'group-investments', system_key: 'investments' });
      const indexes = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transactions' AND name LIKE 'idx_%' ORDER BY name",
      );
      expect(indexes.map((i) => i.name)).toEqual([
        'idx_transactions_account',
        'idx_transactions_list',
        'idx_transactions_occurred_at',
        'idx_transactions_source_ref',
        'idx_transactions_to_account',
      ]);
      expect(await db.getFirstAsync("SELECT 1 FROM sqlite_master WHERE name = 'transactions_v4'")).toBeNull();
    });

    test('una categoría que ya no existe no detiene la actualización: el movimiento queda sin categoría', async () => {
      const db = openTestDatabase();
      await migrateDatabase(db, 3);
      await db.execAsync('PRAGMA foreign_keys = OFF');
      await db.runAsync(
        `INSERT INTO transactions (id, list_id, kind, amount, currency, category_id, title, occurred_at, created_at, updated_at)
         VALUES ('huerfano', ?, 'expense', 5000, 'COP', 'cat-fantasma', 'Algo', ?, ?, ?)`,
        PERSONAL_LIST_ID, T0, T0, T0,
      );
      await db.execAsync('PRAGMA foreign_keys = ON');

      await migrateDatabase(db);

      const row = await db.getFirstAsync<{ amount: number; category_id: string | null }>("SELECT amount, category_id FROM transactions WHERE id = 'huerfano'");
      expect(row).toEqual({ amount: 5000, category_id: null });
    });

    test('las reglas de una transferencia las hace cumplir la base', async () => {
      const db = openTestDatabase();
      await migrateDatabase(db);
      for (const id of ['a1', 'a2']) {
        await db.runAsync("INSERT INTO accounts (id, name, color, type, created_at, updated_at) VALUES (?, ?, '#fff', 'savings', ?, ?)", id, id, T0, T0);
      }
      const insert = (id: string, kind: string, account: string | null, to: string | null, category: string | null = null) =>
        db.runAsync(
          `INSERT INTO transactions (id, kind, amount, currency, category_id, account_id, to_account_id, occurred_at, created_at, updated_at)
           VALUES (?, ?, 1000, 'COP', ?, ?, ?, ?, ?, ?)`,
          id, kind, category, account, to, T0, T0, T0,
        );

      await insert('ok', 'transfer', 'a1', 'a2');
      await insert('gasto', 'expense', 'a1', null, 'cat-mercado');
      await expect(insert('sin-destino', 'transfer', 'a1', null)).rejects.toThrow();
      await expect(insert('sin-origen', 'transfer', null, 'a2')).rejects.toThrow();
      await expect(insert('misma', 'transfer', 'a1', 'a1')).rejects.toThrow();
      await expect(insert('gasto-con-destino', 'expense', 'a1', 'a2')).rejects.toThrow();
      await expect(insert('con-categoria', 'transfer', 'a1', 'a2', 'cat-mercado')).rejects.toThrow();
      await expect(insert('cuenta-fantasma', 'expense', 'no-existe', null)).rejects.toThrow();
      expect(await count(db, 'transactions')).toBe(2);
    });
  });
});
