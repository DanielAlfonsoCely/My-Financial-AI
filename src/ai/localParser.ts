// Offline parser for phrases like "almuerzo 18 mil ayer" or "café 4 mil y mercado 80 lucas".
// It does not need the Gemini key. When the phrase is too messy it says so (`confident: false`)
// and the caller can ask Gemini instead.

import type { Kind } from '../db/types';
import { startOfDay, withCurrentTime } from '../lib/dates';
import { capitalizeFirst, normalize } from '../lib/text';

export interface ParsedMovement {
  title: string;
  amount: number;
  kind: Kind;
  /** Epoch ms, or null when the phrase did not mention a date. */
  occurredAt: number | null;
}

export interface ParseResult {
  movements: ParsedMovement[];
  /** False when something looked like a movement but could not be read reliably. */
  confident: boolean;
}

// ---------- Numbers written with words ----------

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
  noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};

/** Multipliers, including Colombian slang: "lucas" = thousands, "palos" = millions. */
const MULTIPLIERS: Record<string, number> = {
  mil: 1_000, k: 1_000, luca: 1_000, lucas: 1_000, lukas: 1_000,
  millon: 1_000_000, millones: 1_000_000, palo: 1_000_000, palos: 1_000_000, m: 1_000_000, mm: 1_000_000,
};

interface Token {
  /** As written (keeps accents and case) — used for titles. */
  raw: string;
  /** Normalized key for lookups: lowercase, no accents. */
  key: string;
  /** Numeric value when the token is written with digits. */
  value?: number;
}

/** "25.000" -> 25000, "1,5" -> 1.5, "1.500.000" -> 1500000, "12,500" -> 12500 */
function parseDigits(raw: string): number | null {
  const s = raw.replace(/^\$/, '');
  if (!/^\d/.test(s)) return null;
  // Groups of three after a separator are thousands ("25.000", "12,500", "1.500.000").
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  // A single separator with 1-2 decimals is a decimal ("1,5 millones", "2.5k").
  if (/^\d+[.,]\d{1,2}$/.test(s)) return Number(s.replace(',', '.'));
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

/** "treinta y cinco" -> "treinta cinco" and "palo y medio" -> "palo ymedio": that "y" is part of the number. */
function joinTensAndUnits(text: string): string {
  return text
    .replace(
      /\b(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/gi,
      '$1 $2',
    )
    .replace(/\b(mil|millones|millón|millon|palos?|lucas?)\s+y\s+medio\b/gi, '$1 ymedio');
}

function tokenize(text: string): Token[] {
  // Split "25mil" / "18k" / "2palos" into number + multiplier.
  const prepared = joinTensAndUnits(text).replace(/(\d)(k|mil|mm|m|lucas?|palos?|millon(?:es)?|millón)\b/gi, '$1 $2');
  return prepared
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ$]+/, '').replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]+$/, ''))
    .filter(Boolean)
    .map((raw) => {
      const key = normalize(raw).replace(/\s+/g, '');
      const value = parseDigits(raw);
      return value === null ? { raw, key } : { raw, key, value };
    });
}

interface Span {
  start: number;
  end: number; // exclusive
}

interface AmountMatch extends Span {
  value: number;
}

/** Reads one amount starting at token `i` ("25 mil", "veinte mil", "1,5 millones", "medio palo", "$18.000"). */
function readAmount(tokens: Token[], i: number): AmountMatch | null {
  const first = tokens[i];
  if (!first) return null;
  let j = i;
  let total = 0;
  let current = 0;
  let any = false;

  if (first.value !== undefined) {
    current = first.value;
    any = true;
    j++;
  } else if (first.key === 'medio' || first.key === 'media') {
    const mult = MULTIPLIERS[tokens[i + 1]?.key ?? ''];
    return mult ? { start: i, end: i + 2, value: mult / 2 } : null;
  } else if (UNITS[first.key] === undefined && first.key !== 'mil') {
    return null;
  }

  let lastMultiplier = 0;
  while (j < tokens.length) {
    const t = tokens[j];
    if (t.value !== undefined) {
      // "1 millón 200 mil": digits right after millions continue the same amount.
      if (lastMultiplier >= 1_000_000 && t.value < 1_000 && MULTIPLIERS[tokens[j + 1]?.key ?? ''] === 1_000) {
        current = t.value;
        j++;
        continue;
      }
      break; // a second number starts another amount
    }
    if (t.key === 'ymedio' && lastMultiplier) {
      total += lastMultiplier / 2;
      j++;
      continue;
    }
    const unit = UNITS[t.key];
    if (unit !== undefined) {
      // "un" / "una" alone are articles ("una hamburguesa"), not numbers.
      if ((t.key === 'un' || t.key === 'una') && MULTIPLIERS[tokens[j + 1]?.key ?? ''] === undefined) break;
      current += unit;
      any = true;
      j++;
      continue;
    }
    const mult = MULTIPLIERS[t.key];
    if (mult !== undefined) {
      if (mult === 1_000) total += (any ? current : 1) * 1_000;
      else total = (total + (any ? current : 1)) * mult;
      current = 0;
      any = true;
      lastMultiplier = mult;
      j++;
      continue; // "1 millón 200 mil": keep reading
    }
    break;
  }

  const value = Math.round(total + current);
  if (!any || value <= 0) return null;
  // A lonely small word number ("dos", "cinco") is usually a quantity ("dos empanadas"), not money.
  if (first.value === undefined && j - i === 1 && MULTIPLIERS[first.key] === undefined) return null;
  // Same for small digits without "mil": no price in pesos is below 100 ("2 empanadas").
  if (first.value !== undefined && j - i === 1 && first.value < 100) return null;
  return { start: i, end: j, value };
}

// ---------- Dates ----------

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

interface DateMatch extends Span {
  day: Date;
}

function readDate(tokens: Token[], i: number, now: Date): DateMatch | null {
  const t = tokens[i]?.key;
  const today = startOfDay(now);
  const daysAgo = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  if (t === 'hoy') return { start: i, end: i + 1, day: today };
  if (t === 'ayer') return { start: i, end: i + 1, day: daysAgo(1) };
  if (t === 'antier' || t === 'anteayer') return { start: i, end: i + 1, day: daysAgo(2) };
  if (t === 'antes' && tokens[i + 1]?.key === 'de' && tokens[i + 2]?.key === 'ayer') {
    return { start: i, end: i + 3, day: daysAgo(2) };
  }
  if (t === 'hace') {
    const next = tokens[i + 1];
    const n = next?.value ?? UNITS[next?.key ?? ''];
    const unit = tokens[i + 2]?.key ?? '';
    if (n && /^dias?$/.test(unit)) return { start: i, end: i + 3, day: daysAgo(n) };
    if (n && /^semanas?$/.test(unit)) return { start: i, end: i + 3, day: daysAgo(n * 7) };
  }
  // "el lunes" -> the most recent past Monday (if today is Monday, a week ago).
  const weekday = WEEKDAYS.indexOf(t ?? '');
  if (weekday >= 0) {
    const diff = (today.getDay() - weekday + 7) % 7 || 7;
    const start = tokens[i - 1]?.key === 'el' ? i - 1 : i;
    return { start, end: i + 1, day: daysAgo(diff) };
  }
  // "el 15 de octubre" / "15 de octubre"
  const dayNumber = tokens[i]?.value;
  if (dayNumber !== undefined && Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 31 && tokens[i + 1]?.key === 'de') {
    const month = MONTHS.indexOf(tokens[i + 2]?.key ?? '');
    if (month >= 0) {
      let candidate = new Date(today.getFullYear(), month, dayNumber);
      if (candidate.getTime() > today.getTime()) candidate = new Date(today.getFullYear() - 1, month, dayNumber);
      const start = tokens[i - 1]?.key === 'el' ? i - 1 : i;
      return { start, end: i + 3, day: candidate };
    }
  }
  return null;
}

// ---------- Kind and title ----------

/** Phrases that mean money came in. Matched on whole words of the normalized segment. */
const INCOME_HINTS = [
  'me pagaron', 'me pago', 'recibi', 'me llego', 'me consignaron', 'me transfirieron', 'me depositaron',
  'ingreso', 'salario', 'sueldo', 'nomina', 'mi quincena', 'me cayo la quincena', 'la prima', 'mi prima',
  'gane', 'vendi', 'me devolvieron', 'reembolso',
];

function isIncome(segment: string): boolean {
  const text = ` ${normalize(segment)} `;
  return INCOME_HINTS.some((hint) => text.includes(` ${hint} `));
}

/** Fillers removed at the start and end of a title ("me gasté ... en ..."). */
const EDGE_FILLER = new Set([
  'me', 'nos', 'gaste', 'gastamos', 'gastaron', 'pague', 'pagamos', 'compre', 'compramos', 'costo', 'costaron', 'valio',
  'fue', 'fueron', 'por', 'en', 'de', 'un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'mi', 'mis', 'pesos', 'peso',
  'cop', 'que', 'y', 'tambien', 'ademas', 'creo', 'se', 'al', 'del', 'con', 'como', 'para', 'pagaron', 'pago', 'recibi',
  'llego', 'consignaron', 'transfirieron', 'depositaron', 'gane', 'vendi', 'devolvieron', 'total', 'son', 'era',
  'acaban', 'acaba', 'acabo', 'acabe', 'acabamos', 'pagar', 'gastar', 'comprar', 'hice', 'hicimos',
]);
/** Verbs removed anywhere in the title. */
const INNER_FILLER = new Set(['gaste', 'pague', 'compre', 'costo', 'costaron', 'pesos', 'peso', 'cop']);

function cleanTitle(words: Token[]): string {
  const kept = words.filter((w) => !INNER_FILLER.has(w.key));
  while (kept.length && EDGE_FILLER.has(kept[0].key)) kept.shift();
  while (kept.length && EDGE_FILLER.has(kept[kept.length - 1].key)) kept.pop();
  return capitalizeFirst(kept.map((w) => w.raw.replace(/^\$/, '')).join(' '));
}

// ---------- Main ----------

const SEPARATOR = /,\s+|;\s*|\s+y\s+|\s+(?:además|ademas|también|tambien|luego|después|despues)\s+/i;

function hasAmount(text: string): boolean {
  const tokens = tokenize(text);
  return tokens.some((_, i) => readAmount(tokens, i) !== null);
}

/** Splits into one piece per purchase, gluing pieces without an amount to their neighbor. */
function splitSegments(text: string): string[] {
  const parts = joinTensAndUnits(text).split(SEPARATOR).filter((p) => p.trim());
  const segments: string[] = [];
  let pending = '';
  for (const part of parts) {
    if (hasAmount(part)) {
      segments.push(pending ? `${pending} y ${part}` : part);
      pending = '';
    } else if (segments.length > 0 && !pending) {
      // Trailing words like "ayer" or "con tarjeta" go with the previous purchase.
      segments[segments.length - 1] += ` ${part}`;
    } else {
      // Leading words ("hamburguesa y papas 40 mil") go with the next purchase.
      pending = pending ? `${pending} y ${part}` : part;
    }
  }
  if (pending) segments.push(pending);
  return segments;
}

export function parseFreeText(text: string, now = new Date()): ParseResult {
  // "Me pagaron el sueldo por 3 millones y 500 mil en comisiones": an income said once covers the
  // pieces that do not say otherwise. Mixed phrases are left to Gemini (confident = false).
  const segments = splitSegments(text);
  const incomeBySegment = segments.map(isIncome);
  const anyIncome = incomeBySegment.some(Boolean);
  const allIncome = incomeBySegment.every(Boolean);
  const movements: ParsedMovement[] = [];
  const dates: (Date | null)[] = [];
  let confident = true;
  if (anyIncome && !allIncome && incomeBySegment[0] === false) confident = false;

  for (const [index, segment] of segments.entries()) {
    const income = anyIncome && (incomeBySegment[index] || incomeBySegment[0]);
    const tokens = tokenize(segment);
    let amount: AmountMatch | null = null;
    let date: DateMatch | null = null;
    const used = new Set<number>();

    for (let i = 0; i < tokens.length; i++) {
      const d: DateMatch | null = date ? null : readDate(tokens, i, now);
      if (d) {
        date = d;
        for (let k = d.start; k < d.end; k++) used.add(k);
        i = d.end - 1;
        continue;
      }
      const a = readAmount(tokens, i);
      if (a) {
        // Two amounts in one piece ("hamburguesa 20 mil papas 8 mil"): let Gemini handle it.
        if (amount) confident = false;
        else amount = a;
        for (let k = a.start; k < a.end; k++) used.add(k);
        i = a.end - 1;
      }
    }

    if (!amount) {
      confident = false;
      continue;
    }
    const title = cleanTitle(tokens.filter((_, i) => !used.has(i)));
    if (!title) confident = false;
    dates.push(date?.day ?? null);
    movements.push({
      title: title || (income ? 'Ingreso' : 'Gasto'),
      amount: amount.value,
      kind: income ? 'income' : 'expense',
      occurredAt: null,
    });
  }

  // "café 4 mil y mercado 80 mil ayer": a date said once applies to every movement.
  const shared = dates.find((d) => d !== null) ?? null;
  movements.forEach((m, i) => {
    const day = dates[i] ?? shared;
    m.occurredAt = day ? withCurrentTime(day, now).getTime() : null;
  });

  if (movements.length === 0 || movements.length > 4) confident = false;
  return { movements, confident };
}

/** True if the text contains something that reads as money ("18 mil", "$25.000", "veinte lucas"). */
export function containsAmount(text: string): boolean {
  return hasAmount(text);
}
