// Date helpers. Timestamps are stored as epoch milliseconds and shown in local time.

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** [start, end) of the month in epoch ms. */
export function monthRange(monthStart: Date): [number, number] {
  return [startOfMonth(monthStart).getTime(), addMonths(monthStart, 1).getTime()];
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function monthLabel(monthStart: Date, now = new Date()): string {
  const current = startOfMonth(now);
  if (monthStart.getTime() === current.getTime()) return 'Este mes';
  if (monthStart.getTime() === addMonths(current, -1).getTime()) return 'Mes pasado';
  const name = capitalize(MONTHS[monthStart.getMonth()]);
  return monthStart.getFullYear() === now.getFullYear() ? name : `${name} ${monthStart.getFullYear()}`;
}

/** "Hoy", "Ayer" or "lun 27 oct". */
export function dayLabel(date: Date, now = new Date()): string {
  if (isSameDay(date, now)) return 'Hoy';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Ayer';
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** Keeps the chosen calendar day but uses the current time of day, so entries sort naturally. */
export function withCurrentTime(day: Date, now = new Date()): Date {
  return new Date(
    day.getFullYear(), day.getMonth(), day.getDate(),
    now.getHours(), now.getMinutes(), now.getSeconds(),
  );
}
