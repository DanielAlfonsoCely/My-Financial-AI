/** What a category or a recurring template can be. */
export type Kind = 'expense' | 'income';

/**
 * What a movement can be. A transfer moves money between two of the user's accounts: it is one
 * row, and it is never an expense or an income.
 */
export type TransactionKind = Kind | 'transfer';

/**
 * credit = a liability (the balance is debt). broker = its value comes from the investments panel.
 * asset = an investment kept by hand (CDT, property).
 */
export type AccountType = 'cash' | 'savings' | 'wallet' | 'credit' | 'broker' | 'asset';

export const ACCOUNT_TYPES: AccountType[] = ['cash', 'savings', 'wallet', 'credit', 'broker', 'asset'];

/** Where a transaction came from. */
export type TransactionSource = 'manual' | 'voice' | 'notification' | 'sms' | 'ocr' | 'import' | 'recurring';

export const TRANSACTION_SOURCES: TransactionSource[] = [
  'manual', 'voice', 'notification', 'sms', 'ocr', 'import', 'recurring',
];

/** Common columns. Every table keeps them so a future sync can merge by id + updated_at. */
interface Row {
  id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** A list is an independent "world": its own categories, tags, budgets and AI rules. */
export interface List extends Row {
  name: string;
  emoji: string;
  sort_order: number;
}

export interface Category extends Row {
  list_id: string;
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
  sort_order: number;
}

/** Groups are made by the user ("Efectivo", "Bancos"); accounts and groups are global, not per list. */
export interface AccountGroup extends Row {
  name: string;
  emoji: string;
  /** 'investments' for the fixed group; null for the user's own. */
  system_key: string | null;
  sort_order: number;
}

export interface Account extends Row {
  name: string;
  emoji: string;
  color: string;
  /** null = without a group. */
  group_id: string | null;
  /** Free line under the name, e.g. "Vence 14 mar 2027 · 11% E.A.". */
  subtitle: string | null;
  type: AccountType;
  currency: string;
  /** Balance before the first movement. For credit: the debt it started with. */
  opening_balance: number;
  /** Only credit. */
  credit_limit: number | null;
  sort_order: number;
}

/** An account with its balance worked out from its movements. */
export interface AccountWithBalance extends Account {
  /** Money in the account, in its currency. For credit: what is owed (positive = debt). */
  balance: number;
}

export interface Transaction extends Row {
  list_id: string;
  kind: TransactionKind;
  /** Integer amount in the currency's minor unit (COP: pesos). Always positive. */
  amount: number;
  currency: string;
  category_id: string | null;
  /** Where the money left from (expense, transfer) or arrived (income). null = "sin cuenta". */
  account_id: string | null;
  /** Only transfers: where the money arrived. */
  to_account_id: string | null;
  /** Only transfers between currencies: what arrived, in the destination's currency. */
  to_amount: number | null;
  title: string;
  note: string | null;
  /** JSON array of tag names without '#', e.g. '["comida","credito"]'. */
  tags: string;
  occurred_at: number;
  source: TransactionSource;
  /** Identifier from the origin (notification key, recurring occurrence...). Used for de-duplication. */
  source_ref: string | null;
  /** Recurring template that created this transaction, if any. */
  recurring_id: string | null;
}

/** Transaction joined with the display fields of its category. */
export interface TransactionWithCategory extends Transaction {
  category_name: string | null;
  category_emoji: string | null;
  category_color: string | null;
  account_name: string | null;
  account_emoji: string | null;
  to_account_name: string | null;
  to_account_emoji: string | null;
}

/** Just enough to total periods without loading every column. */
export interface TransactionAmount {
  kind: TransactionKind;
  amount: number;
  currency: string;
  occurred_at: number;
  category_id: string | null;
}

export interface Tag extends Row {
  list_id: string;
  name: string;
}

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'yearly';

export interface Recurring extends Row {
  list_id: string;
  kind: Kind;
  amount: number;
  currency: string;
  category_id: string | null;
  title: string;
  tags: string;
  frequency: Frequency;
  /** Day of the month of the first occurrence, so monthly dates do not drift (31 → 28 → 28...). */
  anchor_day: number;
  /** Epoch ms of the next occurrence to create. */
  next_at: number;
  /** Account the copies are charged to, if any. */
  account_id: string | null;
}

export interface Budget extends Row {
  list_id: string;
  category_id: string;
  /** Monthly limit in minor units. */
  amount: number;
}

/** "Mejoras de IA": a category correction the user asked to remember. */
export interface AiRule extends Row {
  list_id: string;
  /** Text the user wrote, e.g. "Combo McDonalds". */
  phrase: string;
  /** JSON array of normalized keywords used for matching, e.g. '["combo","mcdonalds"]'. */
  keywords: string;
  category_id: string;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

export interface TransactionInput {
  kind: TransactionKind;
  amount: number;
  currency: string;
  category_id: string | null;
  /** undefined when editing = leave the account as it is. */
  account_id?: string | null;
  to_account_id?: string | null;
  to_amount?: number | null;
  title: string;
  note?: string | null;
  tags?: string[];
  occurred_at: number;
  source?: TransactionSource;
  source_ref?: string | null;
  recurring_id?: string | null;
}
