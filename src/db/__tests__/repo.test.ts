import { budgetAlertToast } from '../../lib/budgetAlert';
import { onDataChanged } from '../../lib/events';
import { sumRange } from '../../hooks/useHomeData';
import { count, openTestDatabase, type TestDatabase } from '../../test/sqlite';
import { migrateDatabase } from '../migrations';
import {
  applyCategoryPick,
  budgetAlertFor,
  createCategory,
  createTransaction,
  deleteCategory,
  CategoryInUseError,
  getRecurring,
  getTransaction,
  listTransactionAmounts,
  loadCategoryChoices,
  materializeRecurring,
  saveTransaction,
  setBudget,
  setSetting,
  SETTING_BUDGET_ALERTS,
  SETTING_BUDGET_THRESHOLD,
  SETTING_PERIOD_START_DAY,
  updateCategory,
} from '../repo';
import { DEFAULT_CATEGORIES, PERSONAL_LIST_ID } from '../seed';
import type { Category, TransactionInput } from '../types';

const LIST = PERSONAL_LIST_ID;
const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime(); // 10 nov 2026

function expense(amount: number, extra: Partial<TransactionInput> = {}): TransactionInput {
  return { kind: 'expense', amount, currency: 'COP', category_id: 'cat-mercado', title: 'Mercado', occurred_at: NOW, ...extra };
}

async function freshDb(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await migrateDatabase(db);
  return db;
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('saveTransaction', () => {
  test('crea movimiento, recurrente y etiquetas en una sola transacción y con un solo aviso', async () => {
    const db = await freshDb();
    let notified = 0;
    const off = onDataChanged(() => notified++);
    const before = db.transactionCount;

    const id = await saveTransaction(db, LIST, { input: expense(1_200_000, { title: 'Arriendo', tags: ['hogar', 'fijo'] }), repeat: 'monthly' });
    await flush();
    off();

    expect(db.transactionCount - before).toBe(1);
    expect(notified).toBe(1);
    const saved = await getTransaction(db, id);
    expect(saved?.recurring_id).toBeTruthy();
    const recurring = await getRecurring(db, saved!.recurring_id!);
    expect(recurring).toMatchObject({ amount: 1_200_000, frequency: 'monthly', title: 'Arriendo' });
    expect(await count(db, 'tags', 'deleted_at IS NULL')).toBe(2);
  });

  test('si falla a mitad no queda una recurrente huérfana', async () => {
    const db = await freshDb();
    // The recurring template is written first; the movement then fails on its category (foreign key).
    await expect(
      saveTransaction(db, LIST, { input: expense(50_000, { category_id: 'cat-que-no-existe' }), repeat: 'weekly' }),
    ).rejects.toThrow();
    expect(await count(db, 'recurring')).toBe(0);
    expect(await count(db, 'transactions')).toBe(0);
  });

  test('editar: pasar a "una vez" detiene la recurrente y suelta el movimiento', async () => {
    const db = await freshDb();
    const id = await saveTransaction(db, LIST, { input: expense(30_000), repeat: 'weekly' });
    const recurringId = (await getTransaction(db, id))!.recurring_id!;

    await saveTransaction(db, LIST, { id, input: expense(32_000), repeat: 'once', recurringId });

    const saved = await getTransaction(db, id);
    expect(saved).toMatchObject({ amount: 32_000, recurring_id: null });
    expect(await getRecurring(db, recurringId)).toBeNull();
  });

  test('editar: cambiar el monto actualiza la recurrente sin crear otra', async () => {
    const db = await freshDb();
    const id = await saveTransaction(db, LIST, { input: expense(30_000), repeat: 'weekly' });
    const recurringId = (await getTransaction(db, id))!.recurring_id!;

    await saveTransaction(db, LIST, { id, input: expense(45_000), repeat: 'weekly', recurringId });

    expect(await count(db, 'recurring', 'deleted_at IS NULL')).toBe(1);
    expect((await getRecurring(db, recurringId))?.amount).toBe(45_000);
    expect((await getTransaction(db, id))?.recurring_id).toBe(recurringId);
  });

  test('rechaza montos que no son enteros positivos', async () => {
    const db = await freshDb();
    await expect(saveTransaction(db, LIST, { input: expense(10.5), repeat: 'once' })).rejects.toThrow('entero');
    await expect(saveTransaction(db, LIST, { input: expense(0), repeat: 'once' })).rejects.toThrow('entero');
  });
});

describe('cola de escrituras', () => {
  test('guardar, materializar recurrentes y otras escrituras a la vez no se cruzan', async () => {
    const db = await freshDb();
    // A weekly template due 3 times.
    await saveTransaction(db, LIST, { input: expense(20_000, { occurred_at: NOW - 21 * 86_400_000 }), repeat: 'weekly' });

    // On one connection a second BEGIN inside an open transaction throws, like on the phone.
    const results = await Promise.all([
      materializeRecurring(db, NOW),
      saveTransaction(db, LIST, { input: expense(10_000, { tags: ['a'] }), repeat: 'monthly' }),
      setSetting(db, 'show_income', 'true'),
      createCategory(db, LIST, { name: 'Gato', emoji: '🐱', color: '#111111', kind: 'expense' }),
      createTransaction(db, LIST, expense(5_000, { tags: ['b'] })),
      setBudget(db, LIST, 'cat-mercado', 500_000),
    ]);

    expect(results[0]).toBe(3);
    expect(await count(db, 'transactions')).toBe(1 + 3 + 2);
    expect(await count(db, 'recurring')).toBe(2);
    expect(await count(db, 'budgets')).toBe(1);
  });

  test('materializar dos veces no duplica copias', async () => {
    const db = await freshDb();
    await saveTransaction(db, LIST, { input: expense(20_000, { occurred_at: NOW - 15 * 86_400_000 }), repeat: 'weekly' });
    expect(await materializeRecurring(db, NOW)).toBe(2);
    expect(await materializeRecurring(db, NOW)).toBe(0);
    expect(await count(db, 'transactions')).toBe(3);
  });

  test('una escritura que falla no bloquea las siguientes', async () => {
    const db = await freshDb();
    await expect(createTransaction(db, LIST, expense(1_000, { category_id: 'nope' }))).rejects.toThrow();
    await createTransaction(db, LIST, expense(2_000));
    expect(await count(db, 'transactions')).toBe(1);
  });

  test('borrar una categoría con movimientos se rechaza dentro de la misma escritura', async () => {
    const db = await freshDb();
    await createTransaction(db, LIST, expense(2_000));
    await expect(deleteCategory(db, 'cat-mercado')).rejects.toBeInstanceOf(CategoryInUseError);
    expect(await count(db, 'categories', "id = 'cat-mercado' AND deleted_at IS NULL")).toBe(1);
  });
});

describe('onboarding sobre datos existentes', () => {
  const live = (db: TestDatabase) =>
    db.getAllAsync<Category>('SELECT * FROM categories WHERE list_id = ? AND deleted_at IS NULL ORDER BY id', LIST);

  test('primer arranque real: las semilla intactas salen sin marcar', async () => {
    const db = await freshDb();
    const choices = await loadCategoryChoices(db, LIST, false);
    expect(choices).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(choices.every((c) => !c.selected && !c.locked)).toBe(true);
  });

  test('con datos: guardar sin tocar nada no recolorea ni oculta lo que el usuario ya usa o editó', async () => {
    const db = await freshDb();
    await createTransaction(db, LIST, expense(25_000));
    await updateCategory(db, 'cat-transporte', { name: 'Transporte', emoji: '🚌', color: '#ABCDEF', kind: 'expense' });
    const own = await createCategory(db, LIST, { name: 'Gato', emoji: '🐱', color: '#123456', kind: 'expense' });

    const choices = await loadCategoryChoices(db, LIST, false);
    const byId = new Map(choices.map((c) => [c.id, c]));
    expect(byId.get('cat-mercado')).toMatchObject({ selected: true, locked: true, color: DEFAULT_CATEGORIES[0].color });
    expect(byId.get('cat-transporte')).toMatchObject({ selected: true, color: '#ABCDEF', emoji: '🚌' });
    expect(byId.get(own)).toMatchObject({ selected: true, color: '#123456' });

    await applyCategoryPick(db, LIST, choices.filter((c) => c.selected));

    const after = new Map((await live(db)).map((c) => [c.id, c]));
    expect(after.get('cat-mercado')?.color).toBe(DEFAULT_CATEGORIES[0].color);
    expect(after.get('cat-transporte')?.color).toBe('#ABCDEF');
    expect(after.get(own)?.color).toBe('#123456');
  });

  test('repetir la bienvenida: todo sale marcado con su color y guardar no cambia ninguna categoría', async () => {
    const db = await freshDb();
    await createTransaction(db, LIST, expense(25_000));
    await updateCategory(db, 'cat-ropa', { name: 'Ropa', emoji: '👕', color: '#00FF00', kind: 'expense' });
    const before = await live(db);

    const choices = await loadCategoryChoices(db, LIST, true);
    expect(choices.every((c) => c.selected)).toBe(true);
    await applyCategoryPick(db, LIST, choices.filter((c) => c.selected));

    const after = await live(db);
    expect(after.map((c) => [c.id, c.color, c.name, c.emoji])).toEqual(before.map((c) => [c.id, c.color, c.name, c.emoji]));
    expect(after).toHaveLength(before.length);
  });

  test('tras migrar desde v1 con datos, la bienvenida repetida deja todo igual', async () => {
    const db = openTestDatabase();
    await migrateDatabase(db, 1);
    await db.runAsync("UPDATE categories SET color = '#ABCDEF', updated_at = updated_at + 5 WHERE id = 'cat-hogar'");
    await db.runAsync(
      `INSERT INTO transactions (id, kind, amount, currency, category_id, title, occurred_at, source, created_at, updated_at)
       VALUES ('t1', 'expense', 9000, 'COP', 'cat-salud', 'Droguería', ?, 'manual', ?, ?)`,
      NOW, NOW, NOW,
    );
    await migrateDatabase(db);
    const before = await live(db);

    await applyCategoryPick(db, LIST, (await loadCategoryChoices(db, LIST, true)).filter((c) => c.selected));

    const after = await live(db);
    expect(after.map((c) => [c.id, c.color])).toEqual(before.map((c) => [c.id, c.color]));
  });

  test('una categoría con movimientos no se oculta aunque no se elija', async () => {
    const db = await freshDb();
    await createTransaction(db, LIST, expense(25_000));
    await applyCategoryPick(db, LIST, []);
    const after = await live(db);
    expect(after.map((c) => c.id)).toEqual(['cat-mercado']);
  });
});

describe('alerta de presupuesto', () => {
  async function withBudget(): Promise<TestDatabase> {
    const db = await freshDb();
    await setSetting(db, SETTING_BUDGET_ALERTS, 'true');
    await setSetting(db, SETTING_BUDGET_THRESHOLD, '85');
    await setBudget(db, LIST, 'cat-mercado', 100_000);
    return db;
  }

  test('avisa cuando el gasto cruza el umbral, y solo esa vez', async () => {
    const db = await withBudget();
    const first = await createTransaction(db, LIST, expense(80_000));
    expect(await budgetAlertFor(db, first, 0, NOW)).toBeNull();

    const second = await createTransaction(db, LIST, expense(7_000));
    const alert = await budgetAlertFor(db, second, 0, NOW);
    expect(alert).toMatchObject({ name: 'Mercado', emoji: '🥑', percent: 87, over: false });
    expect(budgetAlertToast(alert!).title).toBe('Mercado al 87 %');

    const third = await createTransaction(db, LIST, expense(3_000));
    expect(await budgetAlertFor(db, third, 0, NOW)).toBeNull();
  });

  test('avisa otra vez al pasar del 100 %', async () => {
    const db = await withBudget();
    await createTransaction(db, LIST, expense(95_000));
    const over = await createTransaction(db, LIST, expense(9_000));
    const alert = await budgetAlertFor(db, over, 0, NOW);
    expect(alert).toMatchObject({ percent: 104, over: true });
    expect(budgetAlertToast(alert!)).toMatchObject({ title: 'Mercado pasó el presupuesto', chip: '104 %' });
  });

  test('84,6 % no cuenta como 85 %', async () => {
    const db = await withBudget();
    const id = await createTransaction(db, LIST, expense(84_600));
    expect(await budgetAlertFor(db, id, 0, NOW)).toBeNull();
  });

  test('no avisa con alertas apagadas, sin presupuesto, en ingresos ni fuera del mes actual', async () => {
    const db = await withBudget();
    const lastMonth = await createTransaction(db, LIST, expense(99_000, { occurred_at: new Date(2026, 9, 15).getTime() }));
    expect(await budgetAlertFor(db, lastMonth, 0, NOW)).toBeNull();

    const other = await createTransaction(db, LIST, expense(99_000, { category_id: 'cat-ropa' }));
    expect(await budgetAlertFor(db, other, 0, NOW)).toBeNull();

    const income = await createTransaction(db, LIST, { ...expense(99_000), kind: 'income', category_id: 'cat-salario' });
    expect(await budgetAlertFor(db, income, 0, NOW)).toBeNull();

    await setSetting(db, SETTING_BUDGET_ALERTS, 'false');
    const off = await createTransaction(db, LIST, expense(99_000));
    expect(await budgetAlertFor(db, off, 0, NOW)).toBeNull();
  });

  test('editar un movimiento que ya contaba no vuelve a avisar', async () => {
    const db = await withBudget();
    const id = await createTransaction(db, LIST, expense(90_000));
    expect(await budgetAlertFor(db, id, 0, NOW)).not.toBeNull();
    // Same movement saved again with the same amount (only the title changed).
    expect(await budgetAlertFor(db, id, 90_000, NOW)).toBeNull();
  });

  test('respeta el día de inicio del mes', async () => {
    const db = await withBudget();
    await setSetting(db, SETTING_PERIOD_START_DAY, '15');
    // With months starting on the 15th, 10 nov belongs to the period 15 oct – 14 nov.
    await createTransaction(db, LIST, expense(80_000, { occurred_at: new Date(2026, 9, 20).getTime() }));
    const id = await createTransaction(db, LIST, expense(10_000));
    expect(await budgetAlertFor(db, id, 0, NOW)).toMatchObject({ percent: 90 });
  });
});

describe('totales por moneda', () => {
  test('los totales nunca suman una moneda distinta a pesos', async () => {
    const db = await freshDb();
    await createTransaction(db, LIST, expense(50_000));
    await createTransaction(db, LIST, expense(12_00, { currency: 'USD' }));
    await createTransaction(db, LIST, { ...expense(3_000_000), kind: 'income', category_id: 'cat-salario' });

    const rows = await listTransactionAmounts(db, LIST);
    expect(rows).toHaveLength(3);
    expect(sumRange(rows, 0, Number.MAX_SAFE_INTEGER)).toEqual({ expense: 50_000, income: 3_000_000, balance: 2_950_000 });
  });
});

describe('categorías ocultas que tienen movimientos', () => {
  const hide = (db: TestDatabase, id: string) => db.runAsync('UPDATE categories SET deleted_at = ? WHERE id = ?', NOW, id);

  test('una categoría oculta con movimientos se sigue listando (para editarla y ponerle presupuesto)', async () => {
    const db = await freshDb();
    await createTransaction(db, LIST, expense(40_000, { category_id: 'cat-hogar' }));
    // Hidden behind the back of the movement, as old data or an imported backup can leave it.
    await hide(db, 'cat-hogar');
    await hide(db, 'cat-lujo');

    const { listCategories } = jest.requireActual('../repo') as typeof import('../repo');
    const ids = (await listCategories(db, LIST)).map((c) => c.id);
    expect(ids).toContain('cat-hogar');
    expect(ids).not.toContain('cat-lujo');
    expect((await listCategories(db, LIST, 'expense')).map((c) => c.id)).toContain('cat-hogar');
    expect((await listCategories(db, LIST, 'income')).map((c) => c.id)).not.toContain('cat-hogar');
  });

  test('guardar un movimiento en una categoría oculta la vuelve a mostrar', async () => {
    const db = await freshDb();
    await hide(db, 'cat-servicios');
    await createTransaction(db, LIST, expense(90_000, { category_id: 'cat-servicios' }));
    expect(await count(db, 'categories', "id = 'cat-servicios' AND deleted_at IS NULL")).toBe(1);
  });

  test('el presupuesto de una categoría así funciona de punta a punta', async () => {
    const db = await freshDb();
    await createTransaction(db, LIST, expense(40_000, { category_id: 'cat-hogar' }));
    await hide(db, 'cat-hogar');
    await setSetting(db, SETTING_BUDGET_ALERTS, 'true');
    await setBudget(db, LIST, 'cat-hogar', 100_000);
    const id = await createTransaction(db, LIST, expense(50_000, { category_id: 'cat-hogar' }));
    expect(await budgetAlertFor(db, id, 0, NOW)).toMatchObject({ name: 'Hogar', percent: 90 });
  });
});
