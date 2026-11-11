import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { SCHEMA_VERSION } from '../db/migrations';
import { PERSONAL_LIST_ID } from '../db/seed';
import {
  type Account,
  type AccountGroup,
  ACCOUNT_TYPES,
  type AiRule,
  type Budget,
  type Category,
  type List,
  type Recurring,
  type SettingRow,
  type Tag,
  type Transaction,
  TRANSACTION_SOURCES,
} from '../db/types';
import { enqueueWrite } from '../db/repo';
import { notifyDataChanged } from './events';
import { parseTags, serializeTags } from './tags';

const FORMAT = 'my-financial-ai-backup';
/**
 * v1: categories, transactions, settings. v2 adds lists, tags, recurring, budgets and AI rules.
 * v3 adds account groups, accounts and transfers. Older files still import.
 */
const FORMAT_VERSION = 3;

interface BackupFile {
  format: typeof FORMAT;
  format_version: number;
  schema_version: number;
  exported_at: string;
  lists?: List[];
  account_groups?: AccountGroup[];
  accounts?: Account[];
  categories: Category[];
  transactions: Transaction[];
  tags?: Tag[];
  recurring?: Recurring[];
  budgets?: Budget[];
  ai_rules?: AiRule[];
  settings: SettingRow[];
}

export interface ImportSummary {
  categories: number;
  transactions: number;
  other: number;
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
    lists: await db.getAllAsync<List>('SELECT * FROM lists'),
    account_groups: await db.getAllAsync<AccountGroup>('SELECT * FROM account_groups'),
    accounts: await db.getAllAsync<Account>('SELECT * FROM accounts'),
    categories: await db.getAllAsync<Category>('SELECT * FROM categories'),
    transactions: await db.getAllAsync<Transaction>('SELECT * FROM transactions'),
    tags: await db.getAllAsync<Tag>('SELECT * FROM tags'),
    recurring: await db.getAllAsync<Recurring>('SELECT * FROM recurring'),
    budgets: await db.getAllAsync<Budget>('SELECT * FROM budgets'),
    ai_rules: await db.getAllAsync<AiRule>('SELECT * FROM ai_rules'),
    settings: await db.getAllAsync<SettingRow>('SELECT * FROM settings'),
  };

  const stamp = backup.exported_at.slice(0, 10);
  await shareFile(`my-financial-ai-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json', 'Guardar respaldo');
}

/** Writes a text file to the cache and opens the Android share sheet. */
export async function shareFile(name: string, content: string, mimeType: string, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Compartir archivos no está disponible en este dispositivo.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

// ---------- Validation ----------

type Rec = Record<string, unknown>;
const isString = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNullableString = (v: unknown) => v === null || v === undefined || isString(v);
const isNullableInt = (v: unknown) => v === null || v === undefined || isInt(v);
const isKind = (v: unknown) => v === 'expense' || v === 'income';
const isTransactionKind = (v: unknown) => isKind(v) || v === 'transfer';
const hasRow = (r: Rec) => isString(r.id) && isInt(r.created_at) && isInt(r.updated_at) && isNullableInt(r.deleted_at);
const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'yearly'];

const validators = {
  list: (r: Rec) => hasRow(r) && isString(r.name) && isNullableString(r.emoji) && isNullableInt(r.sort_order),
  category: (r: Rec) =>
    hasRow(r) && isString(r.name) && isString(r.emoji) && isString(r.color) && isKind(r.kind) &&
    isInt(r.sort_order) && isNullableString(r.list_id),
  accountGroup: (r: Rec) => hasRow(r) && isString(r.name) && isNullableString(r.emoji) && isNullableString(r.system_key) && isNullableInt(r.sort_order),
  account: (r: Rec) =>
    hasRow(r) && isString(r.name) && isNullableString(r.emoji) && isString(r.color) && ACCOUNT_TYPES.includes(r.type as never) &&
    isNullableString(r.group_id) && isNullableString(r.subtitle) && isNullableString(r.currency) &&
    isNullableInt(r.opening_balance) && isNullableInt(r.credit_limit) && isNullableInt(r.sort_order),
  transaction: (r: Rec) =>
    isNullableString(r.account_id) && isNullableString(r.to_account_id) && isNullableInt(r.to_amount) &&
    hasRow(r) && isTransactionKind(r.kind) && isInt(r.amount) && (r.amount as number) > 0 && isString(r.currency) &&
    isNullableString(r.category_id) && isString(r.title) && isNullableString(r.note) && isInt(r.occurred_at) &&
    TRANSACTION_SOURCES.includes(r.source as never) && isNullableString(r.source_ref) &&
    isNullableString(r.list_id) && isNullableString(r.tags) && isNullableString(r.recurring_id),
  tag: (r: Rec) => hasRow(r) && isString(r.list_id) && isString(r.name),
  recurring: (r: Rec) =>
    hasRow(r) && isString(r.list_id) && isKind(r.kind) && isInt(r.amount) && (r.amount as number) > 0 &&
    isString(r.currency) && isNullableString(r.category_id) && isString(r.title) && isNullableString(r.tags) &&
    isNullableString(r.account_id) && FREQUENCIES.includes(r.frequency as string) && isInt(r.anchor_day) && isInt(r.next_at),
  budget: (r: Rec) => hasRow(r) && isString(r.list_id) && isString(r.category_id) && isInt(r.amount) && (r.amount as number) > 0,
  aiRule: (r: Rec) => hasRow(r) && isString(r.list_id) && isString(r.phrase) && isString(r.keywords) && isString(r.category_id),
  setting: (r: Rec) => isString(r.key) && isString(r.value) && isInt(r.updated_at),
};

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

// ---------- Import ----------

/** Upsert where the newest updated_at wins. */
function upsertSql(table: string, columns: string[]): string {
  const updates = columns.filter((c) => c !== 'id' && c !== 'created_at').map((c) => `${c} = excluded.${c}`);
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
          ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}
          WHERE excluded.updated_at > ${table}.updated_at`;
}

const COLUMNS = {
  lists: ['id', 'name', 'emoji', 'sort_order', 'created_at', 'updated_at', 'deleted_at'],
  account_groups: ['id', 'name', 'emoji', 'system_key', 'sort_order', 'created_at', 'updated_at', 'deleted_at'],
  accounts: [
    'id', 'name', 'emoji', 'color', 'group_id', 'subtitle', 'type', 'currency', 'opening_balance', 'credit_limit',
    'sort_order', 'created_at', 'updated_at', 'deleted_at',
  ],
  categories: ['id', 'list_id', 'name', 'emoji', 'color', 'kind', 'sort_order', 'created_at', 'updated_at', 'deleted_at'],
  transactions: [
    'id', 'list_id', 'kind', 'amount', 'currency', 'category_id', 'account_id', 'to_account_id', 'to_amount', 'title',
    'note', 'tags', 'occurred_at', 'source', 'source_ref', 'recurring_id', 'created_at', 'updated_at', 'deleted_at',
  ],
  tags: ['id', 'list_id', 'name', 'created_at', 'updated_at', 'deleted_at'],
  recurring: [
    'id', 'list_id', 'kind', 'amount', 'currency', 'category_id', 'account_id', 'title', 'tags', 'frequency',
    'anchor_day', 'next_at', 'created_at', 'updated_at', 'deleted_at',
  ],
  budgets: ['id', 'list_id', 'category_id', 'amount', 'created_at', 'updated_at', 'deleted_at'],
  ai_rules: ['id', 'list_id', 'phrase', 'keywords', 'category_id', 'created_at', 'updated_at', 'deleted_at'],
} as const;

/**
 * Merges a backup into the local database. Rows are matched by id and the most recently
 * updated version wins, so importing the same file twice never duplicates data.
 * v1 backups (no lists) go into the Personal list.
 */
export async function importBackupFromText(db: SQLiteDatabase, text: string): Promise<ImportSummary> {
  const backup = parseBackup(text);
  const summary: ImportSummary = { categories: 0, transactions: 0, other: 0, skipped: 0 };

  // Queued with the rest of the writes: nothing else writes while the import holds its transaction.
  await enqueueWrite(() => db.withExclusiveTransactionAsync(async (txn) => {
    const listIds = new Set((await txn.getAllAsync<{ id: string }>('SELECT id FROM lists')).map((r) => r.id));

    const upsert = async (
      table: keyof typeof COLUMNS,
      rows: unknown[] | undefined,
      valid: (r: Rec) => boolean,
      prepare: (r: Rec) => Rec | null | Promise<Rec | null>,
      count: (n: number) => void,
    ) => {
      if (!rows) return;
      const sql = upsertSql(table, [...COLUMNS[table]]);
      for (const raw of rows) {
        const r = raw as Rec;
        if (!r || !valid(r)) {
          summary.skipped++;
          continue;
        }
        const row = await prepare(r);
        if (!row) continue;
        const result = await txn.runAsync(sql, ...COLUMNS[table].map((c) => (row[c] ?? null) as string | number | null));
        count(result.changes);
      }
    };

    const listOf = (r: Rec) => (isString(r.list_id) ? r.list_id : PERSONAL_LIST_ID);

    await upsert('lists', backup.lists, validators.list, (r) => {
      listIds.add(r.id as string);
      return { ...r, emoji: r.emoji ?? '', sort_order: r.sort_order ?? 0 };
    }, (n) => {
      summary.other += n;
    });
    const knownList = (id: string) => (listIds.has(id) ? id : PERSONAL_LIST_ID);

    await upsert('categories', backup.categories, validators.category, (r) => ({ ...r, list_id: knownList(listOf(r)) }), (n) => {
      summary.categories += n;
    });

    const other = (n: number) => {
      summary.other += n;
    };
    // Accounts are global. The fixed "Inversiones" group has the same id on every phone, so it merges.
    await upsert('account_groups', backup.account_groups, validators.accountGroup,
      (r) => ({ ...r, emoji: r.emoji ?? '', sort_order: r.sort_order ?? 0 }), other);
    const groupIds = new Set((await txn.getAllAsync<{ id: string }>('SELECT id FROM account_groups')).map((r) => r.id));
    await upsert('accounts', backup.accounts, validators.account,
      (r) => ({
        ...r,
        emoji: r.emoji ?? '',
        group_id: isString(r.group_id) && groupIds.has(r.group_id) ? r.group_id : null,
        currency: r.currency ?? 'COP',
        opening_balance: r.opening_balance ?? 0,
        sort_order: r.sort_order ?? 0,
      }), other);
    const accountIds = new Set((await txn.getAllAsync<{ id: string }>('SELECT id FROM accounts')).map((r) => r.id));
    const knownAccount = (id: unknown) => (isString(id) && accountIds.has(id) ? id : null);

    const categoryIds = new Set((await txn.getAllAsync<{ id: string }>('SELECT id FROM categories')).map((r) => r.id));
    // Drop links to categories that do not exist locally instead of keeping a broken reference.
    const knownCategory = (id: unknown) => (isString(id) && categoryIds.has(id) ? id : null);

    await upsert(
      'transactions',
      backup.transactions,
      validators.transaction,
      (r) => {
        const transfer = r.kind === 'transfer';
        const accountId = knownAccount(r.account_id);
        const toId = transfer ? knownAccount(r.to_account_id) : null;
        // A transfer needs both of its accounts; without them it would mean nothing.
        if (transfer && (!accountId || !toId || accountId === toId)) {
          summary.skipped++;
          return null;
        }
        return {
          ...r,
          list_id: knownList(listOf(r)),
          category_id: transfer ? null : knownCategory(r.category_id),
          account_id: accountId,
          to_account_id: toId,
          to_amount: transfer ? r.to_amount ?? null : null,
          tags: serializeTags(parseTags(r.tags as string | undefined)),
          note: r.note ?? null,
          source_ref: r.source_ref ?? null,
          recurring_id: r.recurring_id ?? null,
        };
      },
      (n) => {
        summary.transactions += n;
      },
    );

    // Tags and budgets have "one live row per name/category" indexes. If this phone already has
    // its own live row with another id, keep the local one instead of breaking the import.
    const conflicts = async (sql: string, ...params: (string | number)[]) => !!(await txn.getFirstAsync(sql, ...params));
    await upsert(
      'tags',
      backup.tags,
      validators.tag,
      async (r) => {
        const listForTag = knownList(r.list_id as string);
        const row: Rec = { ...r, list_id: listForTag };
        if (row.deleted_at == null &&
          (await conflicts(
            'SELECT 1 FROM tags WHERE list_id = ? AND name = ? AND deleted_at IS NULL AND id <> ?',
            listForTag, r.name as string, r.id as string,
          ))) {
          return null;
        }
        return row;
      },
      other,
    );
    await upsert(
      'recurring',
      backup.recurring,
      validators.recurring,
      (r) => ({
        ...r,
        list_id: knownList(r.list_id as string),
        category_id: knownCategory(r.category_id),
        account_id: knownAccount(r.account_id),
        tags: serializeTags(parseTags(r.tags as string | undefined)),
      }),
      other,
    );
    await upsert(
      'budgets',
      backup.budgets,
      validators.budget,
      async (r) => {
        if (!knownCategory(r.category_id)) return null;
        if (r.deleted_at == null &&
          (await conflicts(
            'SELECT 1 FROM budgets WHERE category_id = ? AND deleted_at IS NULL AND id <> ?',
            r.category_id as string, r.id as string,
          ))) {
          return null;
        }
        return { ...r, list_id: knownList(r.list_id as string) };
      },
      other,
    );
    await upsert(
      'ai_rules',
      backup.ai_rules,
      validators.aiRule,
      (r) => (knownCategory(r.category_id) ? { ...r, list_id: knownList(r.list_id as string) } : null),
      other,
    );

    for (const s of backup.settings) {
      if (!validators.setting(s as unknown as Rec)) {
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
  }));

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
