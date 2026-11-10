import type { SQLiteDatabase } from 'expo-sqlite';

import { count, openTestDatabase, userVersion } from '../../test/sqlite';
import { migrateDatabase, SCHEMA_VERSION } from '../migrations';
import { DEFAULT_CATEGORIES, PERSONAL_LIST_ID } from '../seed';

const T0 = 1_750_000_000_000;

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

const V2_TABLES = ['lists', 'categories', 'transactions', 'tags', 'recurring', 'budgets', 'ai_rules'];

describe('migraciones', () => {
  test('la versión actual es la 3', () => {
    expect(SCHEMA_VERSION).toBe(3);
  });

  test('instalación limpia: llega a v3, con categorías y lista Personal, y sigue viendo la bienvenida', async () => {
    const db = openTestDatabase();
    await migrateDatabase(db);
    expect(await userVersion(db)).toBe(3);
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

    expect(await userVersion(db)).toBe(3);
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
    expect(await userVersion(db)).toBe(3);
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

      expect(await userVersion(db)).toBe(3);
      expect(await onboardingDone(db)).toBe('true');
      expect(await snapshot(db, V2_TABLES)).toEqual(before);
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
    const before = await snapshot(db, [...V2_TABLES, 'settings']);
    await migrateDatabase(db);
    expect(await userVersion(db)).toBe(3);
    expect(await snapshot(db, [...V2_TABLES, 'settings'])).toEqual(before);
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
});
