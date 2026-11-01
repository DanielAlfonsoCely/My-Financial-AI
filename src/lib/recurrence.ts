import type { Frequency } from '../db/types';

export type Repeat = 'once' | Frequency;

/** Same options and order as MonAi's menu (Video Yt/15). */
export const REPEAT_OPTIONS: { value: Repeat; label: string; short: string }[] = [
  { value: 'once', label: 'Una vez', short: 'Una vez' },
  { value: 'daily', label: 'Diariamente', short: 'Diario' },
  { value: 'weekly', label: 'Semanalmente', short: 'Semanal' },
  { value: 'biweekly', label: 'Quincenalmente', short: 'Quincenal' },
  { value: 'monthly', label: 'Mensualmente', short: 'Mensual' },
  { value: 'bimonthly', label: 'Bimensualmente', short: 'Bimensual' },
  { value: 'quarterly', label: 'Trimestralmente', short: 'Trimestral' },
  { value: 'yearly', label: 'Anualmente', short: 'Anual' },
];

export function repeatLabel(value: Repeat): string {
  return REPEAT_OPTIONS.find((o) => o.value === value)?.label ?? 'Una vez';
}

const MONTHS_STEP: Partial<Record<Frequency, number>> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  yearly: 12,
};

const DAYS_STEP: Partial<Record<Frequency, number>> = {
  daily: 1,
  weekly: 7,
  // "Quincenal" in Colombia means every 15 days.
  biweekly: 15,
};

/**
 * Next occurrence after `from`. Month-based frequencies go back to `anchorDay` when the month
 * allows it, so a payment on the 31st becomes the 30th or 28th and then the 31st again.
 * The time of day is kept.
 */
export function nextOccurrence(from: number, frequency: Frequency, anchorDay: number): number {
  const d = new Date(from);
  const days = DAYS_STEP[frequency];
  if (days) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds()).getTime();
  }
  const months = MONTHS_STEP[frequency] ?? 1;
  const year = d.getFullYear();
  const month = d.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(anchorDay, lastDay), d.getHours(), d.getMinutes(), d.getSeconds()).getTime();
}
