import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { notifyDataChanged } from '../lib/events';
import { clampStartDay, monthStartFor, shiftMonth } from '../lib/period';
import { nextOccurrence, type Repeat } from '../lib/recurrence';
import { normalizeTag, parseTags, serializeTags } from '../lib/tags';
import { keywords, normalize } from '../lib/text';
import { categoryPalette } from '../theme';
import { DEFAULT_CATEGORIES, INVESTMENTS_GROUP_ID, PERSONAL_LIST_ID } from './seed';
import type {
  Account,
  AccountGroup,
  AccountType,
  AccountWithBalance,
  AiRule,
  Budget,
  Category,
  Frequency,
  Kind,
  List,
  Recurring,
  SettingRow,
  Tag,
  Transaction,
  TransactionAmount,
  TransactionInput,
  TransactionWithCategory,
} from './types';

const uuid = () => Crypto.randomUUID();

// ---------- Writes ----------
//
// Every write of the app goes through one queue, so two of them never overlap. expo-sqlite's
// withTransactionAsync is not exclusive: without the queue, a write started by another promise
// (recurring copies when the app comes back, a toggle, an import) would land inside someone
// else's BEGIN…COMMIT or fail with a nested BEGIN.
//
// Rule: code that runs inside a queued task only uses the private helpers below, never another
// exported write function (that would wait for the task it is running in).

let writeQueue: Promise<unknown> = Promise.resolve();

/** Runs `task` after every write queued before it has finished. */
export function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * A queued write made of several statements: all of them are saved, or none.
 * Exported only for maintenance code outside the repo (the development seed); screens use the
 * functions below.
 */
export function writeTx<T>(db: SQLiteDatabase, task: () => Promise<T>): Promise<T> {
  return enqueueWrite(async () => {
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await task();
    });
    return result;
  });
}

// ---------- Settings ----------

export const SETTING_SHOW_INCOME = 'show_income';
/** Day of the month where the home "month" starts (1–28). */
export const SETTING_PERIOD_START_DAY = 'period_start_day';
export const SETTING_CURRENT_LIST = 'current_list_id';
export const SETTING_ONBOARDING_DONE = 'onboarding_done';
/** "Acumulado": the balance adds up every month instead of only the current one. */
export const SETTING_ACCUMULATED = 'accumulated';
export const SETTING_BUDGET_ALERTS = 'budget_alerts';
/** Percentage (1–100) for the budget alert threshold. */
export const SETTING_BUDGET_THRESHOLD = 'budget_threshold';
export const DEFAULT_BUDGET_THRESHOLD = 85;
/** Accounts panel: 'general' (one column per account) or 'grouped' (one per group). */
export const SETTING_ACCOUNTS_VIEW = 'accounts_view';
/** The account used in the last expense or income, offered first the next time. */
export const SETTING_LAST_ACCOUNT = 'last_account_id';

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<SettingRow>('SELECT * FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

async function putSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    Date.now(),
  );
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await enqueueWrite(() => putSetting(db, key, value));
  notifyDataChanged();
}

// ---------- Lists ----------

export function listLists(db: SQLiteDatabase): Promise<List[]> {
  return db.getAllAsync<List>('SELECT * FROM lists WHERE deleted_at IS NULL ORDER BY sort_order, created_at');
}

/** The list the app is showing. Falls back to Personal if the saved one was deleted. */
export async function getCurrentListId(db: SQLiteDatabase): Promise<string> {
  const saved = await getSetting(db, SETTING_CURRENT_LIST);
  if (saved) {
    const exists = await db.getFirstAsync('SELECT 1 FROM lists WHERE id = ? AND deleted_at IS NULL', saved);
    if (exists) return saved;
  }
  return PERSONAL_LIST_ID;
}

export async function createList(db: SQLiteDatabase, name: string, emoji: string): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error('Ponle un nombre a la lista.');
  const id = uuid();
  const now = Date.now();
  await writeTx(db, async () => {
    const order = await db.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM lists');
    await db.runAsync(
      'INSERT INTO lists (id, name, emoji, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      id, clean, emoji.trim(), order?.n ?? 1, now, now,
    );
  });
  notifyDataChanged();
  return id;
}

export async function updateList(db: SQLiteDatabase, id: string, name: string, emoji: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Ponle un nombre a la lista.');
  await enqueueWrite(() =>
    db.runAsync('UPDATE lists SET name = ?, emoji = ?, updated_at = ? WHERE id = ?', clean, emoji.trim(), Date.now(), id),
  );
  notifyDataChanged();
}

/** Deletes a list and everything inside it (soft delete). Personal cannot be deleted. */
export async function deleteList(db: SQLiteDatabase, id: string): Promise<void> {
  if (id === PERSONAL_LIST_ID) throw new Error('La lista Personal no se puede eliminar.');
  const now = Date.now();
  await writeTx(db, async () => {
    for (const table of ['transactions', 'categories', 'tags', 'recurring', 'budgets', 'ai_rules']) {
      await db.runAsync(
        `UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE list_id = ? AND deleted_at IS NULL`,
        now, now, id,
      );
    }
    await db.runAsync('UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    if ((await getSetting(db, SETTING_CURRENT_LIST)) === id) {
      await putSetting(db, SETTING_CURRENT_LIST, PERSONAL_LIST_ID);
    }
  });
  notifyDataChanged();
}

// ---------- Categories ----------

export function listCategories(db: SQLiteDatabase, listId: string, kind?: Kind): Promise<Category[]> {
  if (kind) {
    return db.getAllAsync<Category>(
      'SELECT * FROM categories WHERE deleted_at IS NULL AND list_id = ? AND kind = ? ORDER BY sort_order, name',
      listId, kind,
    );
  }
  return db.getAllAsync<Category>(
    'SELECT * FROM categories WHERE deleted_at IS NULL AND list_id = ? ORDER BY sort_order, name',
    listId,
  );
}

export function getCategory(db: SQLiteDatabase, id: string): Promise<Category | null> {
  return db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ?', id);
}

export interface CategoryInput {
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
}

function assertValidCategory(input: CategoryInput): void {
  if (!input.name.trim()) throw new Error('Ponle un nombre a la categoría.');
  if (!input.emoji.trim()) throw new Error('Elige un emoji.');
}

export async function createCategory(db: SQLiteDatabase, listId: string, input: CategoryInput): Promise<string> {
  assertValidCategory(input);
  const id = uuid();
  const now = Date.now();
  await writeTx(db, async () => {
    const order = await db.getFirstAsync<{ n: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories WHERE list_id = ?',
      listId,
    );
    await db.runAsync(
      `INSERT INTO categories (id, list_id, name, emoji, color, kind, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, listId, input.name.trim(), input.emoji.trim(), input.color, input.kind, order?.n ?? 0, now, now,
    );
  });
  notifyDataChanged();
  return id;
}

export async function updateCategory(db: SQLiteDatabase, id: string, input: CategoryInput): Promise<void> {
  assertValidCategory(input);
  await enqueueWrite(() =>
    db.runAsync(
      'UPDATE categories SET name = ?, emoji = ?, color = ?, kind = ?, updated_at = ? WHERE id = ?',
      input.name.trim(), input.emoji.trim(), input.color, input.kind, Date.now(), id,
    ),
  );
  notifyDataChanged();
}

export async function categoryHasTransactions(db: SQLiteDatabase, id: string): Promise<boolean> {
  const row = await db.getFirstAsync('SELECT 1 FROM transactions WHERE category_id = ? AND deleted_at IS NULL LIMIT 1', id);
  return !!row;
}

export class CategoryInUseError extends Error {
  constructor() {
    super('La categoría ya está en tus transacciones');
  }
}

/** Like MonAi, a category with transactions cannot be deleted. Its budget and rules go with it. */
export async function deleteCategory(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await writeTx(db, async () => {
    // Checked inside the write, so a movement saved a moment ago is seen.
    if (await categoryHasTransactions(db, id)) throw new CategoryInUseError();
    await db.runAsync('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    await db.runAsync('UPDATE budgets SET deleted_at = ?, updated_at = ? WHERE category_id = ? AND deleted_at IS NULL', now, now, id);
    await db.runAsync('UPDATE ai_rules SET deleted_at = ?, updated_at = ? WHERE category_id = ? AND deleted_at IS NULL', now, now, id);
    await db.runAsync('UPDATE recurring SET category_id = NULL, updated_at = ? WHERE category_id = ?', now, id);
  });
  notifyDataChanged();
}

/** Ids of the categories used by at least one live transaction of the list. */
export async function usedCategoryIds(db: SQLiteDatabase, listId: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ category_id: string }>(
    `SELECT DISTINCT category_id FROM transactions
     WHERE list_id = ? AND deleted_at IS NULL AND category_id IS NOT NULL`,
    listId,
  );
  return new Set(rows.map((r) => r.category_id));
}

export interface PickedCategory {
  /** Existing category id, or a seed id (cat-*) for the Personal list. */
  id?: string;
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
}

/**
 * Saves the result of "Elige tus categorías": the picked categories stay (or are created) and
 * the others are hidden. Categories with transactions are always kept.
 */
export async function applyCategoryPick(db: SQLiteDatabase, listId: string, picked: PickedCategory[]): Promise<void> {
  const now = Date.now();
  const keep = new Set<string>();

  await writeTx(db, async () => {
    const used = await usedCategoryIds(db, listId);
    const existing = await db.getAllAsync<Category>('SELECT * FROM categories WHERE list_id = ?', listId);
    for (const [index, p] of picked.entries()) {
      const match = existing.find((c) => (p.id && c.id === p.id) || (!p.id && c.name === p.name && c.kind === p.kind));
      if (match) {
        keep.add(match.id);
        // Nothing to write when the category is already as picked: its updated_at keeps telling
        // whether the user ever touched it.
        if (match.deleted_at !== null || match.color !== p.color || match.sort_order !== index) {
          await db.runAsync(
            'UPDATE categories SET deleted_at = NULL, color = ?, sort_order = ?, updated_at = ? WHERE id = ?',
            p.color, index, now, match.id,
          );
        }
      } else {
        // Seed ids are only valid in Personal; other lists get fresh ids.
        const id = p.id && listId === PERSONAL_LIST_ID ? p.id : uuid();
        keep.add(id);
        await db.runAsync(
          `INSERT INTO categories (id, list_id, name, emoji, color, kind, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, listId, p.name, p.emoji, p.color, p.kind, index, now, now,
        );
      }
    }
    for (const c of existing) {
      if (c.deleted_at === null && !keep.has(c.id) && !used.has(c.id)) {
        await db.runAsync('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, c.id);
      }
    }
  });
  notifyDataChanged();
}

/** Distinct pastel per tile, so every category of a first run gets its own color (Video Yt/02). */
const DISTINCT_COLORS = [10, 1, 4, 3, 11, 5, 2, 6, 12, 13, 9, 7, 14, 15, 0, 8].map((i) => categoryPalette[i]);

export interface CategoryChoice extends PickedCategory {
  key: string;
  selected: boolean;
  /** Has transactions: it cannot be unselected. */
  locked: boolean;
}

/**
 * The tiles of "Elige tus categorías": the suggestions plus whatever the list already has.
 *
 * What the user already has is never recolored or hidden by default: every live category when
 * repeating the welcome (`replay`), and otherwise the ones with movements, edited by hand or
 * created by the user. Only the untouched seed categories of a real first run start unselected
 * and take a distinct color, like MonAi.
 */
export async function loadCategoryChoices(db: SQLiteDatabase, listId: string, replay: boolean): Promise<CategoryChoice[]> {
  const [existing, used] = await Promise.all([
    db.getAllAsync<Category>('SELECT * FROM categories WHERE list_id = ? AND deleted_at IS NULL ORDER BY sort_order, name', listId),
    usedCategoryIds(db, listId),
  ]);
  const result: CategoryChoice[] = suggestedCategories(listId).map((s, i) => {
    const match = existing.find((c) => c.id === s.id || (normalize(c.name) === normalize(s.name) && c.kind === s.kind));
    const locked = !!match && used.has(match.id);
    const keep = !!match && (replay || locked || match.updated_at !== match.created_at);
    return {
      ...s,
      id: match?.id ?? s.id,
      key: match?.id ?? s.id ?? `s${i}`,
      name: match?.name ?? s.name,
      emoji: match?.emoji ?? s.emoji,
      color: match && keep ? match.color : DISTINCT_COLORS[i % DISTINCT_COLORS.length],
      selected: keep,
      locked,
    };
  });
  // Categories the user created before (not in the suggestions) are shown too, selected.
  for (const c of existing) {
    if (result.some((r) => r.id === c.id)) continue;
    result.push({ id: c.id, key: c.id, name: c.name, emoji: c.emoji, color: c.color, kind: c.kind, selected: true, locked: used.has(c.id) });
  }
  return result;
}

/** Suggestions for "Elige tus categorías". Seed ids are only reused in Personal. */
export function suggestedCategories(listId: string): PickedCategory[] {
  return DEFAULT_CATEGORIES.map((c) => ({
    id: listId === PERSONAL_LIST_ID ? c.id : undefined,
    name: c.name,
    emoji: c.emoji,
    color: c.color,
    kind: c.kind,
  }));
}

// ---------- Transactions ----------

export const SELECT_WITH_CATEGORY = `
  SELECT t.*, c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color,
         a.name AS account_name, a.emoji AS account_emoji,
         ta.name AS to_account_name, ta.emoji AS to_account_emoji
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
`;

/** Transactions of a list in [start, end), newest first. */
export function listTransactionsInRange(
  db: SQLiteDatabase,
  listId: string,
  start: number,
  end: number,
): Promise<TransactionWithCategory[]> {
  return db.getAllAsync<TransactionWithCategory>(
    `${SELECT_WITH_CATEGORY}
     WHERE t.deleted_at IS NULL AND t.list_id = ? AND t.occurred_at >= ? AND t.occurred_at < ?
     ORDER BY t.occurred_at DESC`,
    listId,
    start,
    end,
  );
}

/** Most recent transactions of a list (for AI context and category history). */
export function listRecentTransactions(db: SQLiteDatabase, listId: string, limit: number): Promise<TransactionWithCategory[]> {
  return db.getAllAsync<TransactionWithCategory>(
    `${SELECT_WITH_CATEGORY}
     WHERE t.deleted_at IS NULL AND t.list_id = ?
     ORDER BY t.occurred_at DESC LIMIT ?`,
    listId,
    limit,
  );
}

/** Minimal rows for every live transaction of the list, used for strips, budgets and history. */
export function listTransactionAmounts(db: SQLiteDatabase, listId: string): Promise<TransactionAmount[]> {
  return db.getAllAsync<TransactionAmount>(
    `SELECT kind, amount, currency, occurred_at, category_id FROM transactions
     WHERE deleted_at IS NULL AND list_id = ? ORDER BY occurred_at`,
    listId,
  );
}

export function getTransaction(db: SQLiteDatabase, id: string): Promise<TransactionWithCategory | null> {
  return db.getFirstAsync<TransactionWithCategory>(`${SELECT_WITH_CATEGORY} WHERE t.id = ? AND t.deleted_at IS NULL`, id);
}

function assertValidInput(input: TransactionInput): void {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('El monto debe ser un entero mayor que cero.');
  }
  if (!Number.isFinite(input.occurred_at)) {
    throw new Error('Fecha inválida.');
  }
}

interface Money {
  account_id: string | null;
  to_account_id: string | null;
  to_amount: number | null;
  currency: string;
  category_id: string | null;
}

/**
 * Checks the accounts of a movement and fills in what follows from them: the currency is the one
 * of the account the money leaves (or enters), a transfer has no category, and a transfer between
 * currencies must say how much arrived.
 */
async function resolveMoney(
  db: SQLiteDatabase,
  input: TransactionInput,
  current?: Pick<Transaction, 'account_id' | 'to_account_id' | 'to_amount'>,
): Promise<Money> {
  const accountId = input.account_id === undefined ? current?.account_id ?? null : input.account_id;
  const live = (id: string) => db.getFirstAsync<Account>('SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL', id);

  if (input.kind !== 'transfer') {
    const account = accountId ? await live(accountId) : null;
    if (accountId && !account) throw new Error('Esa cuenta ya no existe.');
    return {
      account_id: accountId,
      to_account_id: null,
      to_amount: null,
      currency: account?.currency ?? input.currency,
      category_id: input.category_id,
    };
  }

  const toId = input.to_account_id === undefined ? current?.to_account_id ?? null : input.to_account_id;
  if (!accountId || !toId) throw new Error('Elige de qué cuenta sale y a cuál entra.');
  if (accountId === toId) throw new Error('La cuenta de origen y la de destino deben ser distintas.');
  const [from, to] = await Promise.all([live(accountId), live(toId)]);
  if (!from || !to) throw new Error('Una de las cuentas ya no existe.');

  let toAmount: number | null = null;
  if (from.currency !== to.currency) {
    const given = input.to_amount === undefined ? current?.to_amount ?? null : input.to_amount;
    if (given === null || !Number.isInteger(given) || given <= 0) {
      throw new Error(`Escribe cuánto llegó a ${to.name} en ${to.currency}.`);
    }
    toAmount = given;
  }
  return { account_id: accountId, to_account_id: toId, to_amount: toAmount, currency: from.currency, category_id: null };
}

async function insertTransaction(db: SQLiteDatabase, listId: string, input: TransactionInput): Promise<string> {
  assertValidInput(input);
  const money = await resolveMoney(db, input);
  const id = uuid();
  const now = Date.now();
  const tags = input.tags ?? [];
  await db.runAsync(
    `INSERT INTO transactions
       (id, list_id, kind, amount, currency, category_id, account_id, to_account_id, to_amount, title, note, tags,
        occurred_at, source, source_ref, recurring_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    listId,
    input.kind,
    input.amount,
    money.currency,
    money.category_id,
    money.account_id,
    money.to_account_id,
    money.to_amount,
    input.title.trim(),
    input.note ?? null,
    serializeTags(tags),
    input.occurred_at,
    input.source ?? 'manual',
    input.source_ref ?? null,
    input.recurring_id ?? null,
    now,
    now,
  );
  await addMissingTags(db, listId, tags);
  return id;
}

export async function createTransaction(db: SQLiteDatabase, listId: string, input: TransactionInput): Promise<string> {
  assertValidInput(input);
  const id = await writeTx(db, () => insertTransaction(db, listId, input));
  notifyDataChanged();
  return id;
}

async function changeTransaction(db: SQLiteDatabase, id: string, input: TransactionInput): Promise<void> {
  assertValidInput(input);
  const current = await db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ?', id);
  if (!current) throw new Error('El movimiento ya no existe.');
  const tags = input.tags ?? parseTags(current.tags);
  const money = await resolveMoney(db, input, current);
  await db.runAsync(
    `UPDATE transactions
     SET kind = ?, amount = ?, currency = ?, category_id = ?, account_id = ?, to_account_id = ?, to_amount = ?,
         title = ?, note = ?, tags = ?, occurred_at = ?, recurring_id = ?, updated_at = ?
     WHERE id = ?`,
    input.kind,
    input.amount,
    money.currency,
    money.category_id,
    money.account_id,
    money.to_account_id,
    money.to_amount,
    input.title.trim(),
    input.note ?? null,
    serializeTags(tags),
    input.occurred_at,
    input.recurring_id === undefined ? current.recurring_id : input.recurring_id,
    Date.now(),
    id,
  );
  await addMissingTags(db, current.list_id, tags);
}

export async function updateTransaction(db: SQLiteDatabase, id: string, input: TransactionInput): Promise<void> {
  assertValidInput(input);
  await writeTx(db, () => changeTransaction(db, id, input));
  notifyDataChanged();
}

export interface SaveTransactionOptions {
  /** The movement being edited. Leave it out to create a new one. */
  id?: string | null;
  input: TransactionInput;
  /** "Una vez" or how often it repeats from now on. */
  repeat: Repeat;
  /** The recurring template the edited movement already belongs to. */
  recurringId?: string | null;
}

/**
 * What the movement sheet saves: the movement, its recurring template (created, updated or
 * stopped) and its tags, in one transaction and with one refresh of the screens. If any step
 * fails nothing is saved, so there is never a recurring template without its movement.
 * Returns the id of the movement.
 */
export async function saveTransaction(db: SQLiteDatabase, listId: string, options: SaveTransactionOptions): Promise<string> {
  const { input } = options;
  // A transfer is a one-off: recurring templates only know expenses and incomes.
  const repeat: Repeat = input.kind === 'transfer' ? 'once' : options.repeat;
  const editingId = options.id ?? null;
  const recurringId = options.recurringId ?? null;
  assertValidInput(input);

  const id = await writeTx(db, async () => {
    if (!editingId) {
      const newRecurring = repeat !== 'once' ? await insertRecurring(db, listId, input, repeat) : null;
      return insertTransaction(db, listId, { ...input, recurring_id: newRecurring });
    }
    if (recurringId && repeat === 'once') {
      await stopRecurring(db, recurringId);
      await changeTransaction(db, editingId, { ...input, recurring_id: null });
    } else if (recurringId && repeat !== 'once') {
      await changeRecurring(db, recurringId, input, repeat);
      await changeTransaction(db, editingId, input);
    } else if (repeat !== 'once') {
      const newRecurring = await insertRecurring(db, listId, input, repeat);
      await changeTransaction(db, editingId, { ...input, recurring_id: newRecurring });
    } else {
      await changeTransaction(db, editingId, input);
    }
    return editingId;
  });
  if (input.kind !== 'transfer' && input.account_id) {
    await enqueueWrite(() => putSetting(db, SETTING_LAST_ACCOUNT, input.account_id as string));
  }
  notifyDataChanged();
  return id;
}

/** Soft delete, so a future sync can propagate the deletion. */
export async function deleteTransaction(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await enqueueWrite(() => db.runAsync('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id));
  notifyDataChanged();
}

// ---------- Tags ----------

export function listTags(db: SQLiteDatabase, listId: string): Promise<Tag[]> {
  return db.getAllAsync<Tag>('SELECT * FROM tags WHERE list_id = ? AND deleted_at IS NULL ORDER BY name', listId);
}

/** Adds missing tags to the catalog of the list. */
async function addMissingTags(db: SQLiteDatabase, listId: string, names: string[]): Promise<void> {
  const now = Date.now();
  for (const raw of names) {
    const name = normalizeTag(raw);
    if (!name) continue;
    const exists = await db.getFirstAsync(
      'SELECT 1 FROM tags WHERE list_id = ? AND name = ? AND deleted_at IS NULL',
      listId, name,
    );
    if (!exists) {
      await db.runAsync(
        'INSERT INTO tags (id, list_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        uuid(), listId, name, now, now,
      );
    }
  }
}

export async function createTag(db: SQLiteDatabase, listId: string, raw: string): Promise<void> {
  const name = normalizeTag(raw);
  if (!name) throw new Error('Escribe un nombre para la etiqueta.');
  await writeTx(db, () => addMissingTags(db, listId, [name]));
  notifyDataChanged();
}

/** Removes the tag from the catalog and from every transaction and recurring of the list. */
export async function deleteTag(db: SQLiteDatabase, listId: string, name: string): Promise<void> {
  const now = Date.now();
  await writeTx(db, async () => {
    await db.runAsync(
      'UPDATE tags SET deleted_at = ?, updated_at = ? WHERE list_id = ? AND name = ? AND deleted_at IS NULL',
      now, now, listId, name,
    );
    for (const table of ['transactions', 'recurring'] as const) {
      const rows = await db.getAllAsync<{ id: string; tags: string }>(
        `SELECT id, tags FROM ${table} WHERE list_id = ? AND deleted_at IS NULL AND tags LIKE ?`,
        listId, `%"${name}"%`,
      );
      for (const row of rows) {
        const next = parseTags(row.tags).filter((t) => t !== name);
        await db.runAsync(`UPDATE ${table} SET tags = ?, updated_at = ? WHERE id = ?`, serializeTags(next), now, row.id);
      }
    }
  });
  notifyDataChanged();
}

// ---------- Recurring ----------

export interface RecurringWithCategory extends Recurring {
  category_name: string | null;
  category_emoji: string | null;
  category_color: string | null;
}

export function listRecurring(db: SQLiteDatabase, listId: string): Promise<RecurringWithCategory[]> {
  return db.getAllAsync<RecurringWithCategory>(
    `SELECT r.*, c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color
     FROM recurring r LEFT JOIN categories c ON c.id = r.category_id
     WHERE r.list_id = ? AND r.deleted_at IS NULL ORDER BY r.next_at`,
    listId,
  );
}

export function getRecurring(db: SQLiteDatabase, id: string): Promise<Recurring | null> {
  return db.getFirstAsync<Recurring>('SELECT * FROM recurring WHERE id = ? AND deleted_at IS NULL', id);
}

async function insertRecurring(db: SQLiteDatabase, listId: string, input: TransactionInput, frequency: Frequency): Promise<string> {
  if (input.kind === 'transfer') throw new Error('Una transferencia no se puede repetir.');
  const id = uuid();
  const now = Date.now();
  const anchorDay = new Date(input.occurred_at).getDate();
  await db.runAsync(
    `INSERT INTO recurring
       (id, list_id, kind, amount, currency, category_id, account_id, title, tags, frequency, anchor_day, next_at,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, listId, input.kind, input.amount, input.currency, input.category_id, input.account_id ?? null, input.title.trim(),
    serializeTags(input.tags ?? []), frequency, anchorDay, nextOccurrence(input.occurred_at, frequency, anchorDay), now, now,
  );
  return id;
}

/** Creates the template from a transaction that just happened; the next copy comes one period later. */
export async function createRecurringFrom(
  db: SQLiteDatabase,
  listId: string,
  input: TransactionInput,
  frequency: Frequency,
): Promise<string> {
  const id = await writeTx(db, () => insertRecurring(db, listId, input, frequency));
  notifyDataChanged();
  return id;
}

async function changeRecurring(db: SQLiteDatabase, id: string, input: TransactionInput, frequency: Frequency): Promise<void> {
  const current = await getRecurring(db, id);
  if (!current) return;
  if (input.kind === 'transfer') throw new Error('Una transferencia no se puede repetir.');
  const frequencyChanged = current.frequency !== frequency;
  const anchorDay = frequencyChanged ? new Date(input.occurred_at).getDate() : current.anchor_day;
  const nextAt = frequencyChanged ? nextOccurrence(input.occurred_at, frequency, anchorDay) : current.next_at;
  await db.runAsync(
    `UPDATE recurring SET kind = ?, amount = ?, currency = ?, category_id = ?, account_id = ?, title = ?, tags = ?,
       frequency = ?, anchor_day = ?, next_at = ?, updated_at = ? WHERE id = ?`,
    input.kind, input.amount, input.currency, input.category_id,
    input.account_id === undefined ? current.account_id : input.account_id,
    input.title.trim(), serializeTags(input.tags ?? []), frequency, anchorDay, nextAt, Date.now(), id,
  );
}

/** Future copies follow the edited transaction. */
export async function updateRecurringFrom(
  db: SQLiteDatabase,
  id: string,
  input: TransactionInput,
  frequency: Frequency,
): Promise<void> {
  await writeTx(db, () => changeRecurring(db, id, input, frequency));
  notifyDataChanged();
}

async function stopRecurring(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await db.runAsync('UPDATE recurring SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

/** Stops future copies. Transactions already created stay. */
export async function deleteRecurring(db: SQLiteDatabase, id: string): Promise<void> {
  await enqueueWrite(() => stopRecurring(db, id));
  notifyDataChanged();
}

/** Safety cap so a daily template left alone for years cannot freeze the app. */
const MAX_COPIES_PER_RUN = 400;

// Opening the app and coming back from the background can both trigger a run; never two at once.
let materializing: Promise<number> | null = null;

/**
 * Creates every pending copy of every recurring template (all lists), with its real date.
 * `source_ref` = "<recurring id>:<date>" so a copy is never created twice.
 * Returns how many transactions were created.
 */
export function materializeRecurring(db: SQLiteDatabase, now = Date.now()): Promise<number> {
  materializing ??= runMaterialize(db, now).finally(() => {
    materializing = null;
  });
  return materializing;
}

async function runMaterialize(db: SQLiteDatabase, now: number): Promise<number> {
  const due = await db.getAllAsync<Recurring>(
    'SELECT * FROM recurring WHERE deleted_at IS NULL AND next_at <= ?',
    now,
  );
  let created = 0;
  for (const pending of due) {
    if (created >= MAX_COPIES_PER_RUN) break;
    created += await writeTx(db, async () => {
      // Read again inside the write: the template may have been edited or stopped while this waited its turn.
      const r = await getRecurring(db, pending.id);
      if (!r) return 0;
      // An account archived after the template was made: the copies go "sin cuenta".
      const account = r.account_id
        ? (await db.getFirstAsync<{ id: string }>('SELECT id FROM accounts WHERE id = ? AND deleted_at IS NULL', r.account_id))?.id ?? null
        : null;
      let copies = 0;
      let next = r.next_at;
      while (next <= now && created + copies < MAX_COPIES_PER_RUN) {
        const ref = `${r.id}:${next}`;
        const exists = await db.getFirstAsync('SELECT 1 FROM transactions WHERE source_ref = ?', ref);
        if (!exists) {
          const stamp = Date.now();
          await db.runAsync(
            `INSERT INTO transactions
               (id, list_id, kind, amount, currency, category_id, account_id, title, tags, occurred_at, source,
                source_ref, recurring_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recurring', ?, ?, ?, ?)`,
            uuid(), r.list_id, r.kind, r.amount, r.currency, r.category_id, account, r.title, r.tags, next, ref, r.id,
            stamp, stamp,
          );
          copies++;
        }
        next = nextOccurrence(next, r.frequency, r.anchor_day);
      }
      if (next !== r.next_at) {
        await db.runAsync('UPDATE recurring SET next_at = ?, updated_at = ? WHERE id = ?', next, Date.now(), r.id);
      }
      return copies;
    });
  }
  if (created > 0) notifyDataChanged();
  return created;
}

// ---------- Budgets ----------

export function listBudgets(db: SQLiteDatabase, listId: string): Promise<Budget[]> {
  return db.getAllAsync<Budget>('SELECT * FROM budgets WHERE list_id = ? AND deleted_at IS NULL', listId);
}

/** amount 0 removes the budget. */
export async function setBudget(db: SQLiteDatabase, listId: string, categoryId: string, amount: number): Promise<void> {
  if (!Number.isInteger(amount) || amount < 0) throw new Error('Monto inválido.');
  const now = Date.now();
  await writeTx(db, async () => {
    const current = await db.getFirstAsync<Budget>(
      'SELECT * FROM budgets WHERE category_id = ? AND deleted_at IS NULL',
      categoryId,
    );
    if (amount === 0) {
      if (current) await db.runAsync('UPDATE budgets SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, current.id);
    } else if (current) {
      await db.runAsync('UPDATE budgets SET amount = ?, updated_at = ? WHERE id = ?', amount, now, current.id);
    } else {
      await db.runAsync(
        'INSERT INTO budgets (id, list_id, category_id, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        uuid(), listId, categoryId, amount, now, now,
      );
    }
  });
  notifyDataChanged();
}

export interface BudgetAlert {
  categoryId: string;
  name: string;
  emoji: string;
  color: string;
  /** Spent this month over the budget, in percent (can go above 100). */
  percent: number;
  over: boolean;
}

/**
 * "Alertas de presupuesto": after saving an expense, tells whether that movement took its category
 * across the alert threshold, or across 100 %, of this month's budget.
 * `alreadyCounted` is how much of the movement was in that category before the save (when
 * editing), so changing only the title of an old movement does not alert again.
 * Null when alerts are off, there is no budget, the movement is outside the current month, or the
 * line had been crossed before.
 */
export async function budgetAlertFor(
  db: SQLiteDatabase,
  transactionId: string,
  alreadyCounted = 0,
  now = Date.now(),
): Promise<BudgetAlert | null> {
  if ((await getSetting(db, SETTING_BUDGET_ALERTS)) !== 'true') return null;
  const t = await db.getFirstAsync<Transaction>('SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL', transactionId);
  if (!t || t.kind !== 'expense' || !t.category_id) return null;
  const budget = await db.getFirstAsync<Budget>('SELECT * FROM budgets WHERE category_id = ? AND deleted_at IS NULL', t.category_id);
  if (!budget) return null;

  const startDay = clampStartDay(Number((await getSetting(db, SETTING_PERIOD_START_DAY)) ?? 1));
  const start = monthStartFor(new Date(now), startDay);
  const end = shiftMonth(start, 1).getTime();
  if (t.occurred_at < start.getTime() || t.occurred_at >= end) return null;

  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(amount) AS total FROM transactions
     WHERE deleted_at IS NULL AND kind = 'expense' AND category_id = ? AND currency = ? AND occurred_at >= ? AND occurred_at < ?`,
    t.category_id, t.currency, start.getTime(), end,
  );
  const spent = row?.total ?? 0;
  const before = spent - t.amount + Math.min(alreadyCounted, t.amount);
  const savedThreshold = Number(await getSetting(db, SETTING_BUDGET_THRESHOLD));
  const threshold = Number.isFinite(savedThreshold) && savedThreshold >= 1 ? Math.min(100, savedThreshold) : DEFAULT_BUDGET_THRESHOLD;

  // Compared as amounts (not rounded percentages) so 84,6 % does not count as 85 %.
  const crossed = (percent: number) => before * 100 < budget.amount * percent && spent * 100 >= budget.amount * percent;
  if (!crossed(threshold) && !crossed(100)) return null;

  const category = await getCategory(db, t.category_id);
  if (!category) return null;
  return {
    categoryId: category.id,
    name: category.name,
    emoji: category.emoji,
    color: category.color,
    percent: Math.floor((spent * 100) / budget.amount),
    over: spent >= budget.amount,
  };
}

// ---------- AI rules ("Mejoras de IA") ----------

export interface AiRuleWithCategory extends AiRule {
  category_name: string | null;
  category_emoji: string | null;
}

export function listAiRules(db: SQLiteDatabase, listId: string): Promise<AiRuleWithCategory[]> {
  return db.getAllAsync<AiRuleWithCategory>(
    `SELECT r.*, c.name AS category_name, c.emoji AS category_emoji
     FROM ai_rules r LEFT JOIN categories c ON c.id = r.category_id
     WHERE r.list_id = ? AND r.deleted_at IS NULL AND c.deleted_at IS NULL
     ORDER BY r.updated_at DESC`,
    listId,
  );
}

/**
 * Remembers "this phrase goes in this category". A newer rule for the same keywords replaces the
 * old one, so correcting twice keeps only the latest choice.
 */
export async function createAiRule(db: SQLiteDatabase, listId: string, phrase: string, categoryId: string): Promise<void> {
  const words = keywords(phrase);
  if (words.length === 0) return;
  const now = Date.now();
  const serialized = JSON.stringify(words);
  await writeTx(db, async () => {
    await db.runAsync(
      'UPDATE ai_rules SET deleted_at = ?, updated_at = ? WHERE list_id = ? AND keywords = ? AND deleted_at IS NULL',
      now, now, listId, serialized,
    );
    await db.runAsync(
      `INSERT INTO ai_rules (id, list_id, phrase, keywords, category_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      uuid(), listId, phrase.trim(), serialized, categoryId, now, now,
    );
  });
  notifyDataChanged();
}

export async function deleteAiRule(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await enqueueWrite(() => db.runAsync('UPDATE ai_rules SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id));
  notifyDataChanged();
}

// ---------- Accounts ----------
//
// Accounts and their groups are global: money is one, lists are only views of spending.
// Balances are never stored; they are worked out from the opening balance and the movements.

export function listAccountGroups(db: SQLiteDatabase): Promise<AccountGroup[]> {
  return db.getAllAsync<AccountGroup>('SELECT * FROM account_groups WHERE deleted_at IS NULL ORDER BY sort_order, created_at');
}

export async function createAccountGroup(db: SQLiteDatabase, name: string, emoji: string): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error('Ponle un nombre al grupo.');
  const id = uuid();
  const now = Date.now();
  await writeTx(db, async () => {
    // User groups go before the fixed "Inversiones" group (sort_order 1000).
    const order = await db.getFirstAsync<{ n: number }>(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM account_groups WHERE system_key IS NULL',
    );
    await db.runAsync(
      'INSERT INTO account_groups (id, name, emoji, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      id, clean, emoji.trim(), order?.n ?? 1, now, now,
    );
  });
  notifyDataChanged();
  return id;
}

export async function updateAccountGroup(db: SQLiteDatabase, id: string, name: string, emoji: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error('Ponle un nombre al grupo.');
  await enqueueWrite(() =>
    db.runAsync('UPDATE account_groups SET name = ?, emoji = ?, updated_at = ? WHERE id = ?', clean, emoji.trim(), Date.now(), id),
  );
  notifyDataChanged();
}

/** Deleting a group never deletes its accounts: they stay "sin grupo". The fixed group cannot be deleted. */
export async function deleteAccountGroup(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await writeTx(db, async () => {
    const group = await db.getFirstAsync<AccountGroup>('SELECT * FROM account_groups WHERE id = ?', id);
    if (!group) return;
    if (group.system_key) throw new Error('El grupo Inversiones no se puede eliminar.');
    await db.runAsync('UPDATE accounts SET group_id = NULL, updated_at = ? WHERE group_id = ?', now, id);
    await db.runAsync('UPDATE account_groups SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
  });
  notifyDataChanged();
}

/** Moves a user group one place up (-1) or down (1) among the user groups. */
export async function moveAccountGroup(db: SQLiteDatabase, id: string, direction: -1 | 1): Promise<void> {
  const now = Date.now();
  await writeTx(db, async () => {
    const groups = await db.getAllAsync<AccountGroup>(
      'SELECT * FROM account_groups WHERE deleted_at IS NULL AND system_key IS NULL ORDER BY sort_order, created_at',
    );
    const from = groups.findIndex((g) => g.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= groups.length) return;
    [groups[from], groups[to]] = [groups[to], groups[from]];
    for (const [index, g] of groups.entries()) {
      if (g.sort_order !== index + 1) {
        await db.runAsync('UPDATE account_groups SET sort_order = ?, updated_at = ? WHERE id = ?', index + 1, now, g.id);
      }
    }
  });
  notifyDataChanged();
}

export interface AccountInput {
  name: string;
  emoji: string;
  color: string;
  type: AccountType;
  group_id: string | null;
  subtitle?: string | null;
  currency?: string;
  /** For credit: the debt the card already has. */
  opening_balance?: number;
  credit_limit?: number | null;
}

/** Types that are investments: they always live in the fixed group, and only they do. */
export function isInvestmentType(type: AccountType): boolean {
  return type === 'broker' || type === 'asset';
}

function cleanAccount(input: AccountInput) {
  if (!input.name.trim()) throw new Error('Ponle un nombre a la cuenta.');
  const opening = input.opening_balance ?? 0;
  if (!Number.isInteger(opening)) throw new Error('El saldo debe ser un número entero.');
  const limit = input.type === 'credit' ? input.credit_limit ?? null : null;
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) throw new Error('El cupo debe ser mayor que cero.');
  // A liability never sits in a group of assets; investments always sit in "Inversiones".
  const groupId = input.type === 'credit'
    ? null
    : isInvestmentType(input.type)
      ? INVESTMENTS_GROUP_ID
      : input.group_id === INVESTMENTS_GROUP_ID
        ? null
        : input.group_id;
  return {
    name: input.name.trim(),
    emoji: input.emoji.trim(),
    color: input.color,
    type: input.type,
    group_id: groupId,
    subtitle: input.subtitle?.trim() || null,
    currency: input.currency ?? 'COP',
    opening_balance: opening,
    credit_limit: limit,
  };
}

export async function createAccount(db: SQLiteDatabase, input: AccountInput): Promise<string> {
  const a = cleanAccount(input);
  const id = uuid();
  const now = Date.now();
  await writeTx(db, async () => {
    const order = await db.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM accounts');
    await db.runAsync(
      `INSERT INTO accounts
         (id, name, emoji, color, group_id, subtitle, type, currency, opening_balance, credit_limit, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, a.name, a.emoji, a.color, a.group_id, a.subtitle, a.type, a.currency, a.opening_balance, a.credit_limit,
      order?.n ?? 1, now, now,
    );
  });
  notifyDataChanged();
  return id;
}

/** Edits everything but the opening balance and the currency (see setAccountBalance). */
export async function updateAccount(db: SQLiteDatabase, id: string, input: AccountInput): Promise<void> {
  const a = cleanAccount(input);
  await enqueueWrite(() =>
    db.runAsync(
      `UPDATE accounts SET name = ?, emoji = ?, color = ?, group_id = ?, subtitle = ?, type = ?, credit_limit = ?, updated_at = ?
       WHERE id = ?`,
      a.name, a.emoji, a.color, a.group_id, a.subtitle, a.type, a.credit_limit, Date.now(), id,
    ),
  );
  notifyDataChanged();
}

/**
 * Archives the account (soft delete). Its movements stay where they are, still showing its name;
 * it just leaves the panel, the totals and the pickers.
 */
export async function deleteAccount(db: SQLiteDatabase, id: string): Promise<void> {
  const now = Date.now();
  await writeTx(db, async () => {
    await db.runAsync('UPDATE accounts SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    await db.runAsync('UPDATE recurring SET account_id = NULL, updated_at = ? WHERE account_id = ?', now, id);
    await db.runAsync('DELETE FROM settings WHERE key = ? AND value = ?', SETTING_LAST_ACCOUNT, id);
  });
  notifyDataChanged();
}

const SELECT_ACCOUNTS_WITH_DELTA = `
  SELECT a.*,
    COALESCE((SELECT SUM(CASE t.kind WHEN 'income' THEN t.amount ELSE -t.amount END)
              FROM transactions t WHERE t.account_id = a.id AND t.deleted_at IS NULL), 0)
    + COALESCE((SELECT SUM(COALESCE(t.to_amount, t.amount))
                FROM transactions t WHERE t.to_account_id = a.id AND t.deleted_at IS NULL), 0) AS delta
  FROM accounts a
`;

/**
 * opening balance + incomes − expenses − transfers out + transfers in (what arrived, when the
 * currencies differ). A credit account is the mirror: its balance is debt, so expenses raise it
 * and payments lower it.
 */
function withBalance(row: Account & { delta: number }): AccountWithBalance {
  const { delta, ...account } = row;
  return { ...account, balance: account.type === 'credit' ? account.opening_balance - delta : account.opening_balance + delta };
}

export async function listAccounts(db: SQLiteDatabase): Promise<AccountWithBalance[]> {
  const rows = await db.getAllAsync<Account & { delta: number }>(
    `${SELECT_ACCOUNTS_WITH_DELTA} WHERE a.deleted_at IS NULL ORDER BY a.sort_order, a.created_at`,
  );
  return rows.map(withBalance);
}

export async function getAccount(db: SQLiteDatabase, id: string): Promise<AccountWithBalance | null> {
  const row = await db.getFirstAsync<Account & { delta: number }>(
    `${SELECT_ACCOUNTS_WITH_DELTA} WHERE a.id = ? AND a.deleted_at IS NULL`,
    id,
  );
  return row ? withBalance(row) : null;
}

/**
 * "Cuadrar saldo": the user types what the account really has and the opening balance absorbs the
 * difference. It is not written as an expense or an income, so it never shows up in the spending
 * of a list. Also how the value of a manual investment (CDT, property) is updated.
 */
export async function setAccountBalance(db: SQLiteDatabase, id: string, realBalance: number): Promise<void> {
  if (!Number.isInteger(realBalance)) throw new Error('El saldo debe ser un número entero.');
  await writeTx(db, async () => {
    const row = await db.getFirstAsync<Account & { delta: number }>(`${SELECT_ACCOUNTS_WITH_DELTA} WHERE a.id = ?`, id);
    if (!row) throw new Error('Esa cuenta ya no existe.');
    const current = withBalance(row);
    if (current.balance === realBalance) return;
    await db.runAsync(
      'UPDATE accounts SET opening_balance = ?, updated_at = ? WHERE id = ?',
      current.opening_balance + (realBalance - current.balance), Date.now(), id,
    );
  });
  notifyDataChanged();
}

/** Latest movements that touch the account (as origin or destination), any list. */
export function listAccountTransactions(db: SQLiteDatabase, accountId: string, limit: number): Promise<TransactionWithCategory[]> {
  return db.getAllAsync<TransactionWithCategory>(
    `${SELECT_WITH_CATEGORY}
     WHERE t.deleted_at IS NULL AND (t.account_id = ? OR t.to_account_id = ?)
     ORDER BY t.occurred_at DESC LIMIT ?`,
    accountId, accountId, limit,
  );
}
