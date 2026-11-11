import { containsAmount, parseFreeText } from '../localParser';

const NOW = new Date(2026, 10, 10, 15, 30, 0); // martes 10 nov 2026

const one = (text: string) => {
  const result = parseFreeText(text, NOW);
  expect(result.movements).toHaveLength(1);
  return { ...result.movements[0], confident: result.confident };
};

describe('parseFreeText: montos', () => {
  test.each([
    ['almuerzo 18 mil', 18_000],
    ['almuerzo 18mil', 18_000],
    ['café $4.500', 4_500],
    ['taxi 25.000', 25_000],
    ['mercado 80 lucas', 80_000],
    ['arriendo 1 millón 200 mil', 1_200_000],
    ['arriendo un millón doscientos mil', 1_200_000],
    ['moto un palo y medio', 1_500_000],
    ['celular 2 palos', 2_000_000],
    ['empanada dos mil quinientos', 2_500],
    ['bus veinticinco mil', 25_000],
    ['regalo treinta y cinco mil', 35_000],
  ])('%s → %i', (text, amount) => {
    expect(one(text).amount).toBe(amount);
  });

  test('siempre devuelve enteros positivos', () => {
    for (const text of ['almuerzo 18 mil', 'café 4,5 mil', 'moto un palo y medio', 'pan 3500']) {
      for (const m of parseFreeText(text, NOW).movements) {
        expect(Number.isInteger(m.amount)).toBe(true);
        expect(m.amount).toBeGreaterThan(0);
      }
    }
  });
});

describe('parseFreeText: título, tipo y fecha', () => {
  test('quita el relleno del título', () => {
    expect(one('me gasté 18 mil en almuerzo')).toMatchObject({ title: 'Almuerzo', amount: 18_000, kind: 'expense', confident: true });
  });

  test('sin fecha deja occurredAt en null', () => {
    expect(one('almuerzo 18 mil').occurredAt).toBeNull();
  });

  test('"ayer" pone el día anterior', () => {
    const m = one('almuerzo 18 mil ayer');
    const day = new Date(m.occurredAt!);
    expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([2026, 10, 9]);
    expect(m.title).toBe('Almuerzo');
  });

  test('un ingreso se reconoce', () => {
    expect(one('me pagaron el sueldo 3 millones')).toMatchObject({ kind: 'income', amount: 3_000_000 });
  });

  test('varios gastos salen como movimientos separados', () => {
    const result = parseFreeText('café 4 mil y mercado 80 mil', NOW);
    expect(result.confident).toBe(true);
    expect(result.movements.map((m) => [m.title, m.amount, m.kind])).toEqual([
      ['Café', 4_000, 'expense'],
      ['Mercado', 80_000, 'expense'],
    ]);
  });

  test('una fecha dicha una vez aplica a todos', () => {
    const result = parseFreeText('café 4 mil y mercado 80 mil ayer', NOW);
    const days = result.movements.map((m) => new Date(m.occurredAt!).getDate());
    expect(days).toEqual([9, 9]);
  });

  test('" y " dentro del nombre no parte el gasto', () => {
    const result = parseFreeText('hamburguesa y papas 40 mil', NOW);
    expect(result.movements).toHaveLength(1);
    expect(result.movements[0].amount).toBe(40_000);
  });
});

describe('parseFreeText: cuándo no confiar', () => {
  test('sin monto no hay movimientos y no es confiable', () => {
    const result = parseFreeText('fui a almorzar con mi mamá', NOW);
    expect(result.movements).toHaveLength(0);
    expect(result.confident).toBe(false);
  });

  test('dos montos en el mismo trozo se dejan a Gemini', () => {
    expect(parseFreeText('hamburguesa 20 mil papas 8 mil', NOW).confident).toBe(false);
  });

  test('gasto e ingreso mezclados empezando por gasto se dejan a Gemini', () => {
    expect(parseFreeText('almuerzo 20 mil y me pagaron 50 mil', NOW).confident).toBe(false);
  });
});

describe('containsAmount', () => {
  test.each([
    ['almuerzo 18 mil', true],
    ['veinte lucas', true],
    ['$25.000', true],
    ['almuerzo con Camila', false],
    ['', false],
  ])('%s → %s', (text, expected) => {
    expect(containsAmount(text)).toBe(expected);
  });
});
