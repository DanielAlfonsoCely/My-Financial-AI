import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { notifyDataChanged } from '../lib/events';
import type {
  Category,
  Kind,
  SettingRow,
  Transaction,
  TransactionAmount,
  TransactionInput,
  TransactionWithCategory,
} from './types';

// ---------- Categories ----------

export function listCategories(db: SQLiteDatabase, kind?: Kind): Promise<Category[]> {
  if (kind) {
    return db.getAllAsync<Category>(
      'SELECT * FROM categories WHERE deleted_at IS NULL AND kind = ? ORDER BY sort_order',
      kind,
    );
  }
  return db.getAllAsync<Category>(
    'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order',
  );
}

// ---------- Transactions ----------

const SELECT_WITH_CATEGORY = `
  SELECT t.*, c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
`;

/** Transactions in [start, end), newest first. */
export function listTransactionsInRange(
  db: SQLiteDatabase,
  start: number,
  end: number,
): Promise<TransactionWithCategory[]> {
  return db.getAllAsync<TransactionWithCategory>(
    `${SELECT_WITH_CATEGORY}
     WHERE t.deleted_at IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?
     ORDER BY t.occurred_at DESC`,
    start,
    end,
  );
}

/** Minimal rows for every live transaction, used to total the month and year strips. */
export function listTransactionAmounts(db: SQLiteDatabase): Promise<TransactionAmount[]> {
  return db.getAllAsync<TransactionAmount>(
    'SELECT kind, amount, occurred_at FROM transactions WHERE deleted_at IS NULL ORDER BY occurred_at',
  );
}

export function getTransaction(db: SQLiteDatabase, id: string): Promise<Transaction | null> {
  return db.getFirstAsync<Transaction>(
    'SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL',
    id,
  );
}

function assertValidInput(input: TransactionInput): void {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('El monto debe ser un entero mayor que cero.');
  }
  if (!Number.isFinite(input.occurred_at)) {
    throw new Error('Fecha inválida.');
  }
}

export async function createTransaction(db: SQLiteDatabase, input: TransactionInput): Promise<string> {
  assertValidInput(input);
  const id = Crypto.randomUUID();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO transactions
       (id, kind, amount, currency, category_id, title, note, occurred_at, source, source_ref, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.kind,
    input.amount,
    input.currency,
    input.category_id,
    input.title.trim(),
    input.note ?? null,
    input.occurred_at,
    input.source ?? 'manual',
    input.source_ref ?? null,
    now,
    now,
  );
  notifyDataChanged();
  return id;
}

export async function updateTransaction(
  db: SQLiteDatabase,
  id: string,
  input: TransactionInput,
): Promise<void> {
  assertValidInput(input);
  await db.runAsync(
    `UPDATE transactions
     SET kind = ?, amount = ?, currency = ?, category_id = ?, title = ?, note = ?, occurred_at = ?, updated_at = ?
     WHERE id = ?`,
    input.kind,
    input.amount,
    input.currency,
    input.category_id,
    input.title.trim(),
    input.note ?? null,
    input.occurred_at,
    Date.now(),
    id,
  );
  notifyDataChanged();
}

/** Soft delete, so a future sync can propagate the deletion. */
export async function deleteTransaction(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    'UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?',
    now,
    now,
    id,
  );
  notifyDataChanged();
}

// ---------- Settings ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<SettingRow>('SELECT * FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    Date.now(),
  );
  notifyDataChanged();
}

export const SETTING_SHOW_INCOME = 'show_income';
/** Day of the month where the home "month" starts (1–28). */
export const SETTING_PERIOD_START_DAY = 'period_start_day';
