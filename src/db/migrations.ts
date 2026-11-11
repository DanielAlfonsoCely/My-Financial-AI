import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_CATEGORIES, INVESTMENTS_GROUP_ID, PERSONAL_LIST_ID } from './seed';

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

  // v3: v2 never marked the onboarding as done, so whoever updated with data was treated as a new
  // install. Anyone who already has transactions has seen the app: skip the welcome. This also
  // repairs a 'false' left behind by "Ver la bienvenida otra vez" when it was closed halfway.
  async (db) => {
    await db.runAsync(
      `INSERT INTO settings (key, value, updated_at)
       SELECT 'onboarding_done', 'true', ? WHERE EXISTS (SELECT 1 FROM transactions)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
       WHERE settings.value <> 'true'`,
      Date.now(),
    );
  },

  // v4: accounts, account groups and transfers.
  // `transactions` is rebuilt because SQLite cannot change a CHECK: kind now accepts 'transfer'
  // and the row can say which account the money left and which one it entered.
  // Existing movements keep everything and stay "sin cuenta" (account_id NULL).
  async (db) => {
    const now = Date.now();
    await db.execAsync(`
      CREATE TABLE account_groups (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL DEFAULT '',
        system_key TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE TABLE accounts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL,
        group_id TEXT REFERENCES account_groups(id),
        subtitle TEXT,
        type TEXT NOT NULL CHECK (type IN ('cash', 'savings', 'wallet', 'credit', 'broker', 'asset')),
        currency TEXT NOT NULL DEFAULT 'COP',
        opening_balance INTEGER NOT NULL DEFAULT 0,
        credit_limit INTEGER CHECK (credit_limit IS NULL OR credit_limit > 0),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE INDEX idx_accounts_group ON accounts (group_id);

      CREATE TABLE transactions_v4 (
        id TEXT PRIMARY KEY NOT NULL,
        list_id TEXT NOT NULL DEFAULT '${PERSONAL_LIST_ID}',
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
        amount INTEGER NOT NULL CHECK (amount > 0),
        currency TEXT NOT NULL,
        category_id TEXT REFERENCES categories(id),
        account_id TEXT REFERENCES accounts(id),
        to_account_id TEXT REFERENCES accounts(id),
        to_amount INTEGER CHECK (to_amount IS NULL OR to_amount > 0),
        title TEXT NOT NULL DEFAULT '',
        note TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        occurred_at INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        source_ref TEXT,
        recurring_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        CHECK ((kind = 'transfer') = (to_account_id IS NOT NULL)),
        CHECK (kind <> 'transfer' OR account_id IS NOT NULL),
        CHECK (to_account_id IS NULL OR to_account_id <> account_id),
        CHECK (kind <> 'transfer' OR category_id IS NULL),
        CHECK (kind = 'transfer' OR to_amount IS NULL)
      );

      -- A category link that points nowhere (possible only in old imports) becomes "sin categoría"
      -- instead of stopping the upgrade.
      INSERT INTO transactions_v4
        (id, list_id, kind, amount, currency, category_id, title, note, tags, occurred_at, source, source_ref,
         recurring_id, created_at, updated_at, deleted_at)
      SELECT id, list_id, kind, amount, currency,
             CASE WHEN category_id IN (SELECT id FROM categories) THEN category_id END,
             title, note, tags, occurred_at, source, source_ref, recurring_id, created_at, updated_at, deleted_at
      FROM transactions;

      DROP TABLE transactions;
      ALTER TABLE transactions_v4 RENAME TO transactions;

      CREATE INDEX idx_transactions_occurred_at ON transactions (occurred_at);
      CREATE INDEX idx_transactions_source_ref ON transactions (source_ref);
      CREATE INDEX idx_transactions_list ON transactions (list_id, occurred_at);
      CREATE INDEX idx_transactions_account ON transactions (account_id);
      CREATE INDEX idx_transactions_to_account ON transactions (to_account_id);

      ALTER TABLE recurring ADD COLUMN account_id TEXT;

      -- Rows created by the "datos de prueba" button (development only), so they can be removed
      -- without touching real data.
      CREATE TABLE dev_seed (
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        PRIMARY KEY (table_name, row_id)
      );
    `);
    // The fixed group: whatever the investments panel holds shows up here. It cannot be deleted.
    await db.runAsync(
      `INSERT INTO account_groups (id, name, emoji, system_key, sort_order, created_at, updated_at)
       VALUES (?, 'Inversiones', '📈', 'investments', 1000, ?, ?)`,
      INVESTMENTS_GROUP_ID, now, now,
    );
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Brings the database up to `target` (the latest version by default). Tests pass an older target
 * to build a database like the one an earlier release left on the phone.
 */
export async function migrateDatabase(db: SQLiteDatabase, target = MIGRATIONS.length): Promise<void> {
  const last = Math.min(target, MIGRATIONS.length);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < last) {
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
