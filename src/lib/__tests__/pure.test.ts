import { cell } from '../csv';
import { dayLabel } from '../dates';
import { notifyDataChanged, onDataChanged } from '../events';
import { formatCompact, formatMoney } from '../money';
import { currentMonthPeriod, monthPeriodLabel, monthStartFor, periodRange, rangeLabel, shiftMonth } from '../period';
import { nextOccurrence } from '../recurrence';
import { normalizeTag, parseTags, serializeTags } from '../tags';
import { keywords, matchesAllWords, normalize } from '../text';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const ymd = (ms: number) => {
  const d = new Date(ms);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
};

describe('csv cell', () => {
  test.each([
    ['=HYPERLINK("http://x","y")', `"'=HYPERLINK(""http://x"",""y"")"`],
    ['+57 300 1234567', "'+57 300 1234567"],
    ['-descuento', "'-descuento"],
    ['@usuario', "'@usuario"],
    ['\tcon tab', "'\tcon tab"],
  ])('neutraliza fórmulas: %s', (input, expected) => {
    expect(cell(input)).toBe(expected);
  });

  test('el texto normal y los números no cambian', () => {
    expect(cell('Almuerzo')).toBe('Almuerzo');
    expect(cell('Café - con leche')).toBe('Café - con leche');
    expect(cell(25000)).toBe('25000');
    expect(cell('a;b')).toBe('"a;b"');
    expect(cell('dijo "hola"')).toBe('"dijo ""hola"""');
  });
});

describe('recurrence', () => {
  test('mensual el 31 baja al último día y vuelve al 31', () => {
    const feb = nextOccurrence(at(2026, 1, 31, 9, 30), 'monthly', 31);
    expect(ymd(feb)).toEqual([2026, 2, 28]);
    const mar = nextOccurrence(feb, 'monthly', 31);
    expect(ymd(mar)).toEqual([2026, 3, 31]);
    expect(new Date(mar).getHours()).toBe(9);
  });

  test('año bisiesto', () => {
    expect(ymd(nextOccurrence(at(2028, 1, 30), 'monthly', 30))).toEqual([2028, 2, 29]);
  });

  test.each([
    ['daily', [2026, 11, 11]],
    ['weekly', [2026, 11, 17]],
    ['biweekly', [2026, 11, 25]],
    ['bimonthly', [2027, 1, 10]],
    ['quarterly', [2027, 2, 10]],
    ['yearly', [2027, 11, 10]],
  ] as const)('%s desde el 10 nov 2026', (frequency, expected) => {
    expect(ymd(nextOccurrence(at(2026, 11, 10), frequency, 10))).toEqual(expected);
  });

  test('diciembre pasa a enero del año siguiente', () => {
    expect(ymd(nextOccurrence(at(2026, 12, 15), 'monthly', 15))).toEqual([2027, 1, 15]);
  });
});

describe('period', () => {
  test('mes que empieza el día 1', () => {
    const period = currentMonthPeriod(1, new Date(2026, 10, 10));
    expect(periodRange(period)).toEqual([at(2026, 11, 1), at(2026, 12, 1)]);
  });

  test('mes que empieza el 15: el 10 nov cae en 15 oct – 14 nov', () => {
    const start = monthStartFor(new Date(2026, 10, 10), 15);
    expect(ymd(start.getTime())).toEqual([2026, 10, 15]);
    expect(ymd(shiftMonth(start, 1).getTime())).toEqual([2026, 11, 15]);
    expect(monthPeriodLabel(start, new Date(2026, 10, 10))).toBe('15 oct – 14 nov');
  });

  test('el día de inicio se limita a 1–28', () => {
    expect(monthStartFor(new Date(2026, 1, 20), 31).getDate()).toBe(28);
    expect(monthStartFor(new Date(2026, 1, 20), 0).getDate()).toBe(1);
  });

  test('año, todo y rango', () => {
    expect(periodRange({ mode: 'year', year: 2026 })).toEqual([at(2026, 1, 1), at(2027, 1, 1)]);
    expect(periodRange({ mode: 'all' })).toBeNull();
    expect(rangeLabel(at(2026, 7, 20), at(2026, 8, 1))).toBe('20 jul – 31 jul');
    expect(rangeLabel(at(2026, 7, 20), at(2026, 7, 21))).toBe('20 jul');
  });

  test('etiquetas de mes', () => {
    const now = new Date(2026, 10, 10);
    expect(monthPeriodLabel(new Date(2026, 6, 1), now)).toBe('julio');
    expect(monthPeriodLabel(new Date(2025, 6, 1), now)).toBe('julio 2025');
  });
});

describe('dates', () => {
  test('hoy y ayer dependen del "ahora" que se le pasa', () => {
    const day = new Date(2026, 10, 10, 23, 50);
    expect(dayLabel(day, new Date(2026, 10, 10, 23, 59))).toBe('Hoy');
    expect(dayLabel(day, new Date(2026, 10, 11, 0, 1))).toBe('Ayer');
    expect(dayLabel(day, new Date(2026, 10, 12, 0, 1))).toBe('mar 10 nov');
  });
});

describe('tags', () => {
  test('minúscula, sin espacios y sin #', () => {
    expect(normalizeTag('#Ropa de Verano')).toBe('ropadeverano');
    expect(normalizeTag('  Crédito ')).toBe('crédito');
  });

  test('parse tolera basura y quita repetidas', () => {
    expect(parseTags('["Nu","nu","#efectivo",5]')).toEqual(['nu', 'efectivo']);
    expect(parseTags('{no json')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags('"texto"')).toEqual([]);
  });

  test('serialize y parse son inversos', () => {
    expect(parseTags(serializeTags(['Ropa de verano', 'nu', 'NU']))).toEqual(['ropadeverano', 'nu']);
  });
});

describe('text', () => {
  test('normalize quita tildes y signos, y conserva la ñ', () => {
    expect(normalize("Café  McDonald's!")).toBe('cafe mcdonalds');
    expect(normalize('Año Nuevo')).toBe('año nuevo');
  });

  test('"mc donalds" y "mcdonalds" comparten palabra clave', () => {
    expect(keywords('mc donalds')).toContain('mcdonalds');
    expect(keywords('Combo McDonalds')).toContain('mcdonalds');
  });

  test('búsqueda: todas las palabras, sin tildes', () => {
    expect(matchesAllWords('Almuerzo Crepes & Waffles', 'crepes almuerzo')).toBe(true);
    expect(matchesAllWords('Café Juan Valdez', 'cafe valdes')).toBe(false);
  });
});

describe('money', () => {
  test('pesos sin decimales', () => {
    expect(formatMoney(25000)).toBe('$25.000');
    expect(formatMoney(2293479)).toBe('$2.293.479');
    expect(formatCompact(250000)).toBe('250K');
    expect(formatCompact(1500000)).toBe('1,5M');
  });
});

describe('events', () => {
  test('varios avisos en el mismo tick son un solo refresco', async () => {
    let calls = 0;
    const off = onDataChanged(() => calls++);
    notifyDataChanged();
    notifyDataChanged();
    notifyDataChanged();
    expect(calls).toBe(0);
    await Promise.resolve();
    expect(calls).toBe(1);
    notifyDataChanged();
    await Promise.resolve();
    expect(calls).toBe(2);
    off();
    notifyDataChanged();
    await Promise.resolve();
    expect(calls).toBe(2);
  });
});
