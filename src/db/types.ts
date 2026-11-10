export type Kind = 'expense' | 'income';

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

export interface Transaction extends Row {
  list_id: string;
  kind: Kind;
  /** Integer amount in the currency's minor unit (COP: pesos). Always positive. */
  amount: number;
  currency: string;
  category_id: string | null;
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
}

/** Just enough to total periods without loading every column. */
export interface TransactionAmount {
  kind: Kind;
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
  kind: Kind;
  amount: number;
  currency: string;
  category_id: string | null;
  title: string;
  note?: string | null;
  tags?: string[];
  occurred_at: number;
  source?: TransactionSource;
  source_ref?: string | null;
  recurring_id?: string | null;
}
