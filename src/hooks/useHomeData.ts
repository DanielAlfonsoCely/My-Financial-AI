import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getSetting,
  listCategories,
  listTransactionAmounts,
  listTransactionsInRange,
  SETTING_PERIOD_START_DAY,
  SETTING_SHOW_INCOME,
} from '../db/repo';
import type { Category, Kind, TransactionAmount, TransactionWithCategory } from '../db/types';
import { onDataChanged } from '../lib/events';
import { clampStartDay } from '../lib/period';

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
  total: number;
}

export interface HomeSettings {
  showIncome: boolean;
  /** Day of the month where the home "month" starts. */
  startDay: number;
  loaded: boolean;
}

/** Settings that change how the home screen is computed. Refreshes after any write. */
export function useHomeSettings(): HomeSettings {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<HomeSettings>({ showIncome: false, startDay: 1, loaded: false });

  const load = useCallback(async () => {
    const [income, startDay] = await Promise.all([
      getSetting(db, SETTING_SHOW_INCOME),
      getSetting(db, SETTING_PERIOD_START_DAY),
    ]);
    setSettings({ showIncome: income === 'true', startDay: clampStartDay(Number(startDay ?? 1)), loaded: true });
  }, [db]);

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, [load]);

  return settings;
}

export interface PeriodData {
  transactions: TransactionWithCategory[];
  expenseTotal: number;
  incomeTotal: number;
  /** Every category of the kind, including those with 0, biggest first. */
  byCategory: Record<Kind, CategoryTotal[]>;
  loading: boolean;
}

const ALL_TIME: [number, number] = [0, Number.MAX_SAFE_INTEGER];

/** Transactions and totals for a range. `null` means all time. */
export function usePeriodData(range: [number, number] | null): PeriodData {
  const db = useSQLiteContext();
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [start, end] = range ?? ALL_TIME;

  const load = useCallback(async () => {
    const [rows, cats] = await Promise.all([listTransactionsInRange(db, start, end), listCategories(db)]);
    setTransactions(rows);
    setCategories(cats);
    setLoading(false);
  }, [db, start, end]);

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, [load]);

  return useMemo(() => {
    let expenseTotal = 0;
    let incomeTotal = 0;
    const totals = new Map<string, CategoryTotal>();

    for (const c of categories) {
      totals.set(c.id, { categoryId: c.id, name: c.name, emoji: c.emoji, color: c.color, kind: c.kind, total: 0 });
    }

    for (const t of transactions) {
      if (t.kind === 'income') incomeTotal += t.amount;
      else expenseTotal += t.amount;

      // Deleted categories still show their spending; uncategorized gets its own column per kind.
      const key = t.category_id ?? `none-${t.kind}`;
      let entry = totals.get(key);
      if (!entry) {
        entry = {
          categoryId: t.category_id,
          name: t.category_name ?? 'Sin categoría',
          emoji: t.category_emoji ?? '❔',
          color: t.category_color ?? '#EDEDEF',
          kind: t.kind,
          total: 0,
        };
        totals.set(key, entry);
      }
      entry.total += t.amount;
    }

    // Map keeps insertion order (category sort_order), so the sort is stable for zeros.
    const all = [...totals.values()].sort((a, b) => b.total - a.total);
    const byCategory: Record<Kind, CategoryTotal[]> = {
      expense: all.filter((c) => c.kind === 'expense'),
      income: all.filter((c) => c.kind === 'income'),
    };
    return { transactions, expenseTotal, incomeTotal, byCategory, loading };
  }, [transactions, categories, loading]);
}

/** Amount and date of every transaction, for the month and year strips. */
export function useAmountIndex(): TransactionAmount[] {
  const db = useSQLiteContext();
  const [rows, setRows] = useState<TransactionAmount[]>([]);

  const load = useCallback(async () => {
    setRows(await listTransactionAmounts(db));
  }, [db]);

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, [load]);

  return rows;
}

/** Sums rows in [start, end). Balance = income − expenses. */
export function sumRange(rows: TransactionAmount[], start: number, end: number) {
  let expense = 0;
  let income = 0;
  for (const r of rows) {
    if (r.occurred_at < start || r.occurred_at >= end) continue;
    if (r.kind === 'income') income += r.amount;
    else expense += r.amount;
  }
  return { expense, income, balance: income - expense };
}
