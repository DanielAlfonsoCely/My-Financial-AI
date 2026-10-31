import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getSetting, listTransactionsInRange, SETTING_SHOW_INCOME } from '../db/repo';
import type { TransactionWithCategory } from '../db/types';
import { monthRange } from '../lib/dates';
import { onDataChanged } from '../lib/events';

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  emoji: string;
  color: string;
  total: number;
}

export interface MonthData {
  transactions: TransactionWithCategory[];
  expenseTotal: number;
  incomeTotal: number;
  expenseByCategory: CategoryTotal[];
  showIncome: boolean;
  loading: boolean;
}

export function useMonthData(monthStart: Date): MonthData {
  const db = useSQLiteContext();
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  const [showIncome, setShowIncome] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [start, end] = monthRange(monthStart);
    const [rows, income] = await Promise.all([
      listTransactionsInRange(db, start, end),
      getSetting(db, SETTING_SHOW_INCOME),
    ]);
    setTransactions(rows);
    setShowIncome(income === 'true');
    setLoading(false);
  }, [db, monthStart]);

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, [load]);

  return useMemo(() => {
    let expenseTotal = 0;
    let incomeTotal = 0;
    const byCategory = new Map<string, CategoryTotal>();

    for (const t of transactions) {
      if (t.kind === 'income') {
        incomeTotal += t.amount;
        continue;
      }
      expenseTotal += t.amount;
      const key = t.category_id ?? 'none';
      const entry = byCategory.get(key) ?? {
        categoryId: t.category_id,
        name: t.category_name ?? 'Sin categoría',
        emoji: t.category_emoji ?? '❔',
        color: t.category_color ?? '#EDEDEF',
        total: 0,
      };
      entry.total += t.amount;
      byCategory.set(key, entry);
    }

    const expenseByCategory = [...byCategory.values()].sort((a, b) => b.total - a.total);
    return { transactions, expenseTotal, incomeTotal, expenseByCategory, showIncome, loading };
  }, [transactions, showIncome, loading]);
}
