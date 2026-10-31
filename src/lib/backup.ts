import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { SCHEMA_VERSION } from '../db/migrations';
import type { Category, SettingRow, Transaction } from '../db/types';
import { notifyDataChanged } from './events';

const FORMAT = 'my-financial-ai-backup';
const FORMAT_VERSION = 1;

interface BackupFile {
  format: typeof FORMAT;
  format_version: number;
  schema_version: number;
  exported_at: string;
  categories: Category[];
  transactions: Transaction[];
  settings: SettingRow[];
}

export interface ImportSummary {
  categories: number;
  transactions: number;
  skipped: number;
}

// ---------- Export ----------

/** Writes every row (including soft-deleted ones) to a JSON file and opens the share sheet. */
export async function exportBackup(db: SQLiteDatabase): Promise<void> {
  const backup: BackupFile = {
    format: FORMAT,
    format_version: FORMAT_VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    categories: await db.getAllAsync<Category>('SELECT * FROM categories'),
    transactions: await db.getAllAsync<Transaction>('SELECT * FROM transactions'),
    settings: await db.getAllAsync<SettingRow>('SELECT * FROM settings'),
  };

  const stamp = backup.exported_at.slice(0, 10);
  const file = new File(Paths.cache, `my-financial-ai-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(backup, null, 2));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Compartir archivos no está disponible en este dispositivo.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Guardar respaldo',
  });
}

// ---------- Import ----------

const isString = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNullableString = (v: unknown) => v === null || v === undefined || isString(v);
const isNullableInt = (v: unknown) => v === null || v === undefined || isInt(v);
const isKind = (v: unknown) => v === 'expense' || v === 'income';
const SOURCES = ['manual', 'voice', 'notification', 'sms', 'ocr', 'import'];

function isCategory(v: unknown): v is Category {
  const c = v as Record<string, unknown>;
  return (
    !!c && isString(c.id) && isString(c.name) && isString(c.emoji) && isString(c.color) &&
    isKind(c.kind) && isInt(c.sort_order) && isInt(c.created_at) && isInt(c.updated_at) &&
    isNullableInt(c.deleted_at)
  );
}

function isTransaction(v: unknown): v is Transaction {
  const t = v as Record<string, unknown>;
  return (
    !!t && isString(t.id) && isKind(t.kind) && isInt(t.amount) && (t.amount as number) > 0 &&
    isString(t.currency) && isNullableString(t.category_id) && isString(t.title) &&
    isNullableString(t.note) && isInt(t.occurred_at) && SOURCES.includes(t.source as string) &&
    isNullableString(t.source_ref) && isInt(t.created_at) && isInt(t.updated_at) &&
    isNullableInt(t.deleted_at)
  );
}

function isSetting(v: unknown): v is SettingRow {
  const s = v as Record<string, unknown>;
  return !!s && isString(s.key) && isString(s.value) && isInt(s.updated_at);
}

function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const b = data as Partial<BackupFile>;
  if (!b || b.format !== FORMAT) {
    throw new Error('Este archivo no es un respaldo de My Financial AI.');
  }
  if (!isInt(b.format_version) || b.format_version > FORMAT_VERSION) {
    throw new Error('El respaldo es de una versión más nueva de la app. Actualiza la app primero.');
  }
  if (!Array.isArray(b.categories) || !Array.isArray(b.transactions) || !Array.isArray(b.settings)) {
    throw new Error('El respaldo está incompleto.');
  }
  return b as BackupFile;
}

/**
 * Merges a backup into the local database. Rows are matched by id and the most recently
 * updated version wins, so importing the same file twice never duplicates data.
 */
export async function importBackupFromText(db: SQLiteDatabase, text: string): Promise<ImportSummary> {
  const backup = parseBackup(text);
  const summary: ImportSummary = { categories: 0, transactions: 0, skipped: 0 };

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const c of backup.categories) {
      if (!isCategory(c)) {
        summary.skipped++;
        continue;
      }
      const result = await txn.runAsync(
        `INSERT INTO categories (id, name, emoji, color, kind, sort_order, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, emoji = excluded.emoji, color = excluded.color, kind = excluded.kind,
           sort_order = excluded.sort_order, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
         WHERE excluded.updated_at > categories.updated_at`,
        c.id, c.name, c.emoji, c.color, c.kind, c.sort_order, c.created_at, c.updated_at, c.deleted_at ?? null,
      );
      summary.categories += result.changes;
    }

    for (const t of backup.transactions) {
      if (!isTransaction(t)) {
        summary.skipped++;
        continue;
      }
      // Drop links to categories that do not exist locally instead of failing the foreign key.
      let categoryId = t.category_id ?? null;
      if (categoryId) {
        const exists = await txn.getFirstAsync('SELECT 1 FROM categories WHERE id = ?', categoryId);
        if (!exists) categoryId = null;
      }
      const result = await txn.runAsync(
        `INSERT INTO transactions
           (id, kind, amount, currency, category_id, title, note, occurred_at, source, source_ref, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind, amount = excluded.amount, currency = excluded.currency,
           category_id = excluded.category_id, title = excluded.title, note = excluded.note,
           occurred_at = excluded.occurred_at, source = excluded.source, source_ref = excluded.source_ref,
           updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
         WHERE excluded.updated_at > transactions.updated_at`,
        t.id, t.kind, t.amount, t.currency, categoryId, t.title, t.note ?? null, t.occurred_at,
        t.source, t.source_ref ?? null, t.created_at, t.updated_at, t.deleted_at ?? null,
      );
      summary.transactions += result.changes;
    }

    for (const s of backup.settings) {
      if (!isSetting(s)) {
        summary.skipped++;
        continue;
      }
      await txn.runAsync(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
         WHERE excluded.updated_at > settings.updated_at`,
        s.key, s.value, s.updated_at,
      );
    }
  });

  notifyDataChanged();
  return summary;
}

/** Lets the user pick a backup file. Returns null if they cancel. */
export async function pickAndImportBackup(db: SQLiteDatabase): Promise<ImportSummary | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const file = new File(result.assets[0].uri);
  return importBackupFromText(db, await file.text());
}
