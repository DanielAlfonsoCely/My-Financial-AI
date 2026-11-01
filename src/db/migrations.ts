import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_CATEGORIES, PERSONAL_LIST_ID } from './seed';

// Each entry upgrades the schema by one version. Never edit a released migration;
// append a new one instead. The current version is tracked with PRAGMA user_version.
const MIGRATIONS: ((db: SQLiteDatabase) => Promise<void>)[] = [
  // v1: categories, transactions, settings
  async (db) => {
    await db.execAsync(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        color TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        currency TEXT NOT NULL,
        category_id TEXT REFERENCES categories(id),
        title TEXT NOT NULL DEFAULT '',
        note TEXT,
        occurred_at INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        source_ref TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE INDEX idx_transactions_occurred_at ON transactions (occurred_at);
      CREATE INDEX idx_transactions_source_ref ON transactions (source_ref);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const now = Date.now();
    for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
      await db.runAsync(
        `INSERT INTO categories (id, name, emoji, color, kind, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        category.id, category.name, category.emoji, category.color, category.kind, index, now, now,
      );
    }
  },

  // v2: lists, tags, recurring transactions, budgets and AI rules.
  // Existing categories and transactions move to the "Personal" list.
  async (db) => {
    const now = Date.now();
    await db.execAsync(`
      CREATE TABLE lists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      ALTER TABLE categories ADD COLUMN list_id TEXT NOT NULL DEFAULT '${PERSONAL_LIST_ID}';
      ALTER TABLE transactions ADD COLUMN list_id TEXT NOT NULL DEFAULT '${PERSONAL_LIST_ID}';
      ALTER TABLE transactions ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE transactions ADD COLUMN recurring_id TEXT;

      CREATE INDEX idx_categories_list ON categories (list_id);
      CREATE INDEX idx_transactions_list ON transactions (list_id, occurred_at);

      CREATE TABLE tags (
        id TEXT PRIMARY KEY NOT NULL,
        list_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE UNIQUE INDEX idx_tags_list_name ON tags (list_id, name) WHERE deleted_at IS NULL;

      CREATE TABLE recurring (
        id TEXT PRIMARY KEY NOT NULL,
        list_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        currency TEXT NOT NULL,
        category_id TEXT,
        title TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        frequency TEXT NOT NULL,
        anchor_day INTEGER NOT NULL,
        next_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE INDEX idx_recurring_list ON recurring (list_id);

      CREATE TABLE budgets (
        id TEXT PRIMARY KEY NOT NULL,
        list_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE UNIQUE INDEX idx_budgets_category ON budgets (category_id) WHERE deleted_at IS NULL;

      CREATE TABLE ai_rules (
        id TEXT PRIMARY KEY NOT NULL,
        list_id TEXT NOT NULL,
        phrase TEXT NOT NULL,
        keywords TEXT NOT NULL,
        category_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE INDEX idx_ai_rules_list ON ai_rules (list_id);
    `);
    await db.runAsync(
      'INSERT INTO lists (id, name, emoji, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
      PERSONAL_LIST_ID, 'Personal', '', now, now,
    );
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const migration = MIGRATIONS[version];
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await migration(db);
      // PRAGMA does not accept bound parameters; `next` is a trusted integer.
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
