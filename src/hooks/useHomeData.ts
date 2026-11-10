import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';

import {
  DEFAULT_BUDGET_THRESHOLD,
  getSetting,
  listBudgets,
  listCategories,
  listTransactionAmounts,
  listTransactionsInRange,
  SETTING_ACCUMULATED,
  SETTING_BUDGET_ALERTS,
  SETTING_BUDGET_THRESHOLD,
  SETTING_PERIOD_START_DAY,
  SETTING_SHOW_INCOME,
} from '../db/repo';
import type { Budget, Category, Kind, TransactionAmount, TransactionWithCategory } from '../db/types';
import { DEFAULT_CURRENCY } from '../lib/money';
import { clampStartDay } from '../lib/period';
import { useQuery } from './useData';

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  emoji: string;
  color: string;
  kind: Kind;
  total: number;
  /** Monthly budget, only filled in month view. */
  budget: number | null;
}

export interface HomeSettings {
  showIncome: boolean;
  /** Day of the month where the home "month" starts. */
  startDay: number;
  accumulated: boolean;
  budgetAlerts: boolean;
  budgetThreshold: number;
  loaded: boolean;
}

export { DEFAULT_BUDGET_THRESHOLD };

/** Settings that change how the home screen is computed. Refreshes after any write. */
export function useHomeSettings(): HomeSettings {
  const db = useSQLiteContext();
  const { data, loaded } = useQuery(
    async () => {
      const [income, startDay, accumulated, alerts, threshold] = await Promise.all([
        getSetting(db, SETTING_SHOW_INCOME),
        getSetting(db, SETTING_PERIOD_START_DAY),
        getSetting(db, SETTING_ACCUMULATED),
        getSetting(db, SETTING_BUDGET_ALERTS),
        getSetting(db, SETTING_BUDGET_THRESHOLD),
      ]);
      const parsedThreshold = Number(threshold);
      return {
        showIncome: income === 'true',
        startDay: clampStartDay(Number(startDay ?? 1)),
        accumulated: accumulated === 'true',
        budgetAlerts: alerts === 'true',
        budgetThreshold:
          threshold && Number.isFinite(parsedThreshold) ? Math.min(100, Math.max(1, parsedThreshold)) : DEFAULT_BUDGET_THRESHOLD,
      };
    },
    { showIncome: false, startDay: 1, accumulated: false, budgetAlerts: false, budgetThreshold: DEFAULT_BUDGET_THRESHOLD },
    [db],
  );
  return { ...data, loaded };
}

export interface PeriodData {
  transactions: TransactionWithCategory[];
  categories: Category[];
  expenseTotal: number;
  incomeTotal: number;
  /** Every category of the kind, including those with 0, biggest first. */
  byCategory: Record<Kind, CategoryTotal[]>;
  loading: boolean;
  /** The last read failed. `transactions` keeps what was loaded before, if anything. */
  error: Error | null;
  reload: () => void;
}

const ALL_TIME: [number, number] = [0, Number.MAX_SAFE_INTEGER];

/**
 * Transactions and totals of a list for a range (`null` = all time).
 * Budgets are attached only when `withBudgets` is true (month view).
 */
export function usePeriodData(listId: string, range: [number, number] | null, withBudgets: boolean): PeriodData {
  const db = useSQLiteContext();
  const [start, end] = range ?? ALL_TIME;
  const { data, loaded, error, reload } = useQuery(
    async () => {
      const [rows, cats, budgets] = await Promise.all([
        listTransactionsInRange(db, listId, start, end),
        listCategories(db, listId),
        listBudgets(db, listId),
      ]);
      return { rows, cats, budgets };
    },
    { rows: [] as TransactionWithCategory[], cats: [] as Category[], budgets: [] as Budget[] },
    [db, listId, start, end],
  );

  return useMemo(() => {
    let expenseTotal = 0;
    let incomeTotal = 0;
    const budgetBy = new Map(data.budgets.map((b) => [b.category_id, b.amount]));
    const totals = new Map<string, CategoryTotal>();

    for (const c of data.cats) {
      totals.set(c.id, {
        categoryId: c.id,
        name: c.name,
        emoji: c.emoji,
        color: c.color,
        kind: c.kind,
        total: 0,
        budget: withBudgets ? budgetBy.get(c.id) ?? null : null,
      });
    }

    for (const t of data.rows) {
      // Totals are in one currency. A movement in another one stays in the list but is never
      // added to pesos (investments in USD will live in their own tables).
      if (t.currency !== DEFAULT_CURRENCY) continue;
      if (t.kind === 'income') incomeTotal += t.amount;
      else expenseTotal += t.amount;

      // Hidden categories still show their spending; uncategorized gets its own column per kind.
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
          budget: null,
        };
        totals.set(key, entry);
      }
      entry.total += t.amount;
    }

    // Biggest first. Zeros keep the category order (Map insertion order + stable sort).
    const all = [...totals.values()].sort((a, b) => b.total - a.total);
    const byCategory: Record<Kind, CategoryTotal[]> = {
      expense: all.filter((c) => c.kind === 'expense'),
      income: all.filter((c) => c.kind === 'income'),
    };
    return {
      transactions: data.rows,
      categories: data.cats,
      expenseTotal,
      incomeTotal,
      byCategory,
      loading: !loaded && !error,
      error,
      reload,
    };
  }, [data, loaded, error, reload, withBudgets]);
}

/** Amount and date of every transaction of the list, for the strips and "Acumulado". */
export function useAmountIndex(listId: string): TransactionAmount[] {
  const db = useSQLiteContext();
  return useQuery(() => listTransactionAmounts(db, listId), [] as TransactionAmount[], [db, listId]).data;
}

/** Sums rows in [start, end), only in the app's currency. Balance = income − expenses. */
export function sumRange(rows: TransactionAmount[], start: number, end: number) {
  let expense = 0;
  let income = 0;
  for (const r of rows) {
    if (r.occurred_at < start || r.occurred_at >= end) continue;
    if (r.currency !== DEFAULT_CURRENCY) continue;
    if (r.kind === 'income') income += r.amount;
    else expense += r.amount;
  }
  return { expense, income, balance: income - expense };
}
