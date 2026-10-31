export type Kind = 'expense' | 'income';

/** Where a transaction came from. Later phases add 'voice', 'notification', 'sms', 'ocr'. */
export type TransactionSource = 'manual' | 'voice' | 'notification' | 'sms' | 'ocr' | 'import';

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface Transaction {
  id: string;
  kind: Kind;
  /** Integer amount in the currency's minor unit (COP: pesos). Always positive. */
  amount: number;
  currency: string;
  category_id: string | null;
  title: string;
  note: string | null;
  occurred_at: number;
  source: TransactionSource;
  /** Identifier from the origin (notification key, SMS id...). Used for de-duplication later. */
  source_ref: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** Transaction joined with the display fields of its category. */
export interface TransactionWithCategory extends Transaction {
  category_name: string | null;
  category_emoji: string | null;
  category_color: string | null;
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
  occurred_at: number;
  source?: TransactionSource;
  source_ref?: string | null;
}
