import type { SQLiteDatabase } from 'expo-sqlite';

import { type BudgetAlert, budgetAlertFor } from '../db/repo';
import { showToast, type ToastMessage } from './toast';

/** "🥑 Mercado al 87 %", or "🥑 Mercado pasó el presupuesto" with the percentage on the chip. */
export function budgetAlertToast(alert: BudgetAlert): ToastMessage {
  return {
    kind: 'success',
    emoji: alert.emoji,
    color: alert.color,
    title: alert.over ? `${alert.name} pasó el presupuesto` : `${alert.name} al ${alert.percent} %`,
    chip: alert.over ? `${alert.percent} %` : 'Presupuesto',
  };
}

/** The "saved" toast is on screen for about this long; the alert comes right after it. */
const AFTER_SAVED_TOAST_MS = 2900;

export interface SavedMovement {
  id: string;
  /** When editing: the amount the movement already had in the same category. */
  alreadyCounted?: number;
}

/**
 * Call after saving movements. If one of them took a category over the alert threshold (or over
 * its budget), shows one toast: the most serious one. Never throws: the movement is already saved.
 */
export async function checkBudgetAlerts(db: SQLiteDatabase, saved: SavedMovement[], delayMs = AFTER_SAVED_TOAST_MS): Promise<void> {
  try {
    const found = new Map<string, BudgetAlert>();
    for (const m of saved) {
      const alert = await budgetAlertFor(db, m.id, m.alreadyCounted ?? 0);
      if (alert) found.set(alert.categoryId, alert);
    }
    const worst = [...found.values()].sort((a, b) => b.percent - a.percent)[0];
    if (worst) setTimeout(() => showToast(budgetAlertToast(worst)), delayMs);
  } catch (error) {
    console.warn('Budget alert failed', error);
  }
}
