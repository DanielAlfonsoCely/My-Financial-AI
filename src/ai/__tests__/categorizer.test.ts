import type { AiRule, Category } from '../../db/types';
import { keywords } from '../../lib/text';
import { type HistoryItem, matchDictionary, matchHistory, matchRule, suggestLocally } from '../categorizer';

const category = (id: string, name: string, kind: Category['kind'] = 'expense'): Category => ({
  id, name, kind, list_id: 'list-personal', emoji: '🙂', color: '#FFFFFF', sort_order: 0, created_at: 1, updated_at: 1, deleted_at: null,
});

const CATEGORIES = [
  category('cat-mercado', 'Mercado'),
  category('cat-comer', 'Comer afuera'),
  category('cat-transporte', 'Transporte'),
  category('cat-suscripciones', 'Suscripciones'),
  category('cat-salario', 'Salario', 'income'),
];
const EXPENSES = new Set(CATEGORIES.filter((c) => c.kind === 'expense').map((c) => c.id));

const rule = (phrase: string, categoryId: string, updatedAt = 1): AiRule => ({
  id: `rule-${phrase}`, list_id: 'list-personal', phrase, keywords: JSON.stringify(keywords(phrase)), category_id: categoryId,
  created_at: updatedAt, updated_at: updatedAt, deleted_at: null,
});

describe('matchRule (Mejoras de IA)', () => {
  test('una corrección recordada gana, sin importar tildes, mayúsculas ni espacios', () => {
    const rules = [rule('Combo McDonalds', 'cat-mercado')];
    expect(matchRule('combo mc donalds', rules, EXPENSES)).toBe('cat-mercado');
    expect(matchRule('COMBO MCDONALD\'S', rules, EXPENSES)).toBe('cat-mercado');
  });

  test('una palabra genérica sola no alcanza', () => {
    expect(matchRule('combo de pollo', [rule('Combo McDonalds', 'cat-mercado')], EXPENSES)).toBeNull();
  });

  test('ignora reglas de categorías que no aplican (otro tipo u ocultas)', () => {
    expect(matchRule('combo mcdonalds', [rule('Combo McDonalds', 'cat-salario')], EXPENSES)).toBeNull();
  });

  test('una regla con datos dañados no rompe nada', () => {
    const broken = { ...rule('x', 'cat-mercado'), keywords: '{no es json' };
    expect(matchRule('mercado', [broken], EXPENSES)).toBeNull();
  });
});

describe('matchHistory', () => {
  const history: HistoryItem[] = [
    { title: 'Tienda de la esquina', categoryId: 'cat-mercado', kind: 'expense' },
    { title: 'Peluquería', categoryId: null, kind: 'expense' },
  ];

  test('un título idéntico ya usado decide la categoría', () => {
    expect(matchHistory('tienda de la esquina', 'expense', history, EXPENSES)).toBe('cat-mercado');
  });

  test('no mezcla gastos con ingresos ni usa movimientos sin categoría', () => {
    expect(matchHistory('tienda de la esquina', 'income', history, new Set(['cat-salario']))).toBeNull();
    expect(matchHistory('peluquería', 'expense', history, EXPENSES)).toBeNull();
  });
});

describe('matchDictionary', () => {
  test.each([
    ['Uber al aeropuerto', 'cat-transporte'],
    ['almuerzo', 'cat-comer'],
    ['Netflix', 'cat-suscripciones'],
    ['compras en el D1', 'cat-mercado'],
  ])('%s → %s', (title, expected) => {
    expect(matchDictionary(title, 'expense', CATEGORIES)).toBe(expected);
  });

  test('si la lista no tiene esa categoría, no inventa', () => {
    expect(matchDictionary('Netflix', 'expense', [category('cat-mercado', 'Mercado')])).toBeNull();
  });

  test('"quincena" es ingreso', () => {
    expect(matchDictionary('quincena', 'income', CATEGORIES)).toBe('cat-salario');
  });
});

describe('suggestLocally', () => {
  test('el orden es regla → historial → diccionario', () => {
    const history: HistoryItem[] = [{ title: 'Uber', categoryId: 'cat-comer', kind: 'expense' }];
    expect(suggestLocally('Uber', 'expense', CATEGORIES, [rule('Uber', 'cat-mercado')], history)).toEqual({ categoryId: 'cat-mercado', source: 'rule' });
    expect(suggestLocally('Uber', 'expense', CATEGORIES, [], history)).toEqual({ categoryId: 'cat-comer', source: 'history' });
    expect(suggestLocally('Uber', 'expense', CATEGORIES, [], [])).toEqual({ categoryId: 'cat-transporte', source: 'dictionary' });
  });

  test('sin título o sin pistas devuelve null', () => {
    expect(suggestLocally('   ', 'expense', CATEGORIES, [], [])).toBeNull();
    expect(suggestLocally('xyzzy', 'expense', CATEGORIES, [], [])).toBeNull();
  });
});
