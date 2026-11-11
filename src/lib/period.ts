// Periods shown on the home screen: month (with an optional start day), year, all time or a
// custom range. Ranges are [start, end) in epoch ms, local time.

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Day 29–31 do not exist in every month, so the start day is capped at 28. */
export const MAX_START_DAY = 28;

export type Period =
  | { mode: 'month'; start: number }
  | { mode: 'year'; year: number }
  | { mode: 'all' }
  | { mode: 'range'; start: number; end: number };

export function clampStartDay(day: number): number {
  return Math.min(MAX_START_DAY, Math.max(1, Math.round(day) || 1));
}

/** Start of the "month" that contains `date`, when months start on `startDay`. */
export function monthStartFor(date: Date, startDay: number): Date {
  const day = clampStartDay(startDay);
  const sameMonth = new Date(date.getFullYear(), date.getMonth(), day);
  return date.getTime() >= sameMonth.getTime()
    ? sameMonth
    : new Date(date.getFullYear(), date.getMonth() - 1, day);
}

export function shiftMonth(start: Date, delta: number): Date {
  return new Date(start.getFullYear(), start.getMonth() + delta, start.getDate());
}

export function currentMonthPeriod(startDay: number, now = new Date()): Period {
  return { mode: 'month', start: monthStartFor(now, startDay).getTime() };
}

/** null means "no limit" (all time). */
export function periodRange(period: Period): [number, number] | null {
  switch (period.mode) {
    case 'month': {
      const start = new Date(period.start);
      return [period.start, shiftMonth(start, 1).getTime()];
    }
    case 'year':
      return [new Date(period.year, 0, 1).getTime(), new Date(period.year + 1, 0, 1).getTime()];
    case 'range':
      return [period.start, period.end];
    case 'all':
      return null;
  }
}

/** "6 jul" */
export function shortDate(date: Date): string {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** "julio", "julio 2025" or, with a custom start day, "6 jul – 5 ago". */
export function monthPeriodLabel(start: Date, now = new Date()): string {
  if (start.getDate() === 1) {
    const name = MONTHS[start.getMonth()];
    return start.getFullYear() === now.getFullYear() ? name : `${name} ${start.getFullYear()}`;
  }
  const lastDay = new Date(shiftMonth(start, 1).getTime() - 1);
  return `${shortDate(start)} – ${shortDate(lastDay)}`;
}

/** "20 jul – 31 jul" or "20 jul" for a single day. The end is exclusive. */
export function rangeLabel(start: number, end: number): string {
  const first = new Date(start);
  const last = new Date(end - 1);
  const sameDay =
    first.getFullYear() === last.getFullYear() &&
    first.getMonth() === last.getMonth() &&
    first.getDate() === last.getDate();
  return sameDay ? shortDate(first) : `${shortDate(first)} – ${shortDate(last)}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function monthTitle(year: number, month: number): string {
  return `${capitalize(MONTHS[month])} de ${year}`;
}
