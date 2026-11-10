import { creditUsage, formatShare, groupAccounts, summarizeAccounts } from '../../lib/accounts';
import { sumRange } from '../../hooks/useHomeData';
import { count, openTestDatabase, type TestDatabase } from '../../test/sqlite';
import { migrateDatabase } from '../migrations';
import {
  type AccountInput,
  budgetAlertFor,
  createAccount,
  createAccountGroup,
  createTransaction,
  deleteAccount,
  deleteAccountGroup,
  deleteTransaction,
  getAccount,
  getSetting,
  getTransaction,
  listAccountGroups,
  listAccounts,
  listAccountTransactions,
  listTransactionAmounts,
  materializeRecurring,
  moveAccountGroup,
  saveTransaction,
  setAccountBalance,
  setBudget,
  setSetting,
  SETTING_BUDGET_ALERTS,
  SETTING_LAST_ACCOUNT,
  updateAccount,
  updateTransaction,
} from '../repo';
import { INVESTMENTS_GROUP_ID, PERSONAL_LIST_ID } from '../seed';
import type { TransactionInput } from '../types';

const LIST = PERSONAL_LIST_ID;
const NOW = new Date(2026, 10, 10, 12).getTime();

async function freshDb(): Promise<TestDatabase> {
  const db = openTestDatabase();
  await migrateDatabase(db);
  return db;
}

const account = (name: string, extra: Partial<AccountInput> = {}): AccountInput => ({
  name, emoji: '🏦', color: '#FAD3D7', type: 'savings', group_id: null, ...extra,
});

function movement(kind: TransactionInput['kind'], amount: number, extra: Partial<TransactionInput> = {}): TransactionInput {
  return { kind, amount, currency: 'COP', category_id: null, title: 'x', occurred_at: NOW, ...extra };
}

const balance = async (db: TestDatabase, id: string) => (await getAccount(db, id))!.balance;

/** Davivienda 2.000.000, Efectivo 100.000, Tarjeta Nu con deuda 300.000 y cupo 3.000.000. */
async function setup() {
  const db = await freshDb();
  const bancos = await createAccountGroup(db, 'Bancos', '🏦');
  const efectivoGroup = await createAccountGroup(db, 'Efectivo', '💵');
  const davivienda = await createAccount(db, account('Davivienda', { group_id: bancos, opening_balance: 2_000_000 }));
  const efectivo = await createAccount(db, account('Billetera', { type: 'cash', group_id: efectivoGroup, opening_balance: 100_000 }));
  const tarjeta = await createAccount(db, account('Tarjeta Nu', { type: 'credit', group_id: bancos, opening_balance: 300_000, credit_limit: 3_000_000 }));
  return { db, bancos, efectivoGroup, davivienda, efectivo, tarjeta };
}

describe('saldos', () => {
  test('gasto baja, ingreso sube', async () => {
    const { db, davivienda } = await setup();
    await createTransaction(db, LIST, movement('expense', 50_000, { account_id: davivienda }));
    await createTransaction(db, LIST, movement('income', 3_000_000, { account_id: davivienda }));
    expect(await balance(db, davivienda)).toBe(2_000_000 - 50_000 + 3_000_000);
  });

  test('una transferencia es una sola fila: sale de una y entra a la otra', async () => {
    const { db, davivienda, efectivo } = await setup();
    const id = await createTransaction(db, LIST, movement('transfer', 80_000, { account_id: davivienda, to_account_id: efectivo, title: 'Retiro en cajero' }));
    expect(await count(db, 'transactions')).toBe(1);
    expect(await balance(db, davivienda)).toBe(1_920_000);
    expect(await balance(db, efectivo)).toBe(180_000);
    const saved = await getTransaction(db, id);
    expect(saved).toMatchObject({ kind: 'transfer', category_id: null, account_name: 'Davivienda', to_account_name: 'Billetera' });
  });

  test('editar y borrar una transferencia deja los saldos cuadrados', async () => {
    const { db, davivienda, efectivo } = await setup();
    const id = await createTransaction(db, LIST, movement('transfer', 80_000, { account_id: davivienda, to_account_id: efectivo }));
    await updateTransaction(db, id, movement('transfer', 200_000, { account_id: davivienda, to_account_id: efectivo }));
    expect([await balance(db, davivienda), await balance(db, efectivo)]).toEqual([1_800_000, 300_000]);
    // Reversing the direction.
    await updateTransaction(db, id, movement('transfer', 200_000, { account_id: efectivo, to_account_id: davivienda }));
    expect([await balance(db, davivienda), await balance(db, efectivo)]).toEqual([2_200_000, -100_000]);
    await deleteTransaction(db, id);
    expect([await balance(db, davivienda), await balance(db, efectivo)]).toEqual([2_000_000, 100_000]);
  });

  test('tarjeta de crédito: el saldo es deuda; comprar la sube y pagarla la baja', async () => {
    const { db, davivienda, tarjeta } = await setup();
    await createTransaction(db, LIST, movement('expense', 120_000, { account_id: tarjeta }));
    expect(await balance(db, tarjeta)).toBe(420_000);
    // Paying the card = transfer Davivienda → Tarjeta Nu.
    await createTransaction(db, LIST, movement('transfer', 400_000, { account_id: davivienda, to_account_id: tarjeta }));
    expect(await balance(db, tarjeta)).toBe(20_000);
    expect(await balance(db, davivienda)).toBe(1_600_000);
    expect(creditUsage((await getAccount(db, tarjeta))!)).toBe(1);
  });

  test('transferencia entre monedas: sale en pesos y entra lo que llegó en dólares', async () => {
    const { db, davivienda } = await setup();
    const xtb = await createAccount(db, account('XTB', { type: 'broker', currency: 'USD', group_id: null }));
    await expect(
      createTransaction(db, LIST, movement('transfer', 4_100_000, { account_id: davivienda, to_account_id: xtb })),
    ).rejects.toThrow('cuánto llegó');
    await createTransaction(db, LIST, movement('transfer', 4_100_000, { account_id: davivienda, to_account_id: xtb, to_amount: 100_000 }));
    expect(await balance(db, davivienda)).toBe(2_000_000 - 4_100_000);
    expect(await balance(db, xtb)).toBe(100_000); // US$1.000,00 in cents
  });

  test('entre cuentas de la misma moneda no se guarda to_amount', async () => {
    const { db, davivienda, efectivo } = await setup();
    const id = await createTransaction(db, LIST, movement('transfer', 10_000, { account_id: davivienda, to_account_id: efectivo, to_amount: 999 }));
    expect((await getTransaction(db, id))?.to_amount).toBeNull();
    expect(await balance(db, efectivo)).toBe(110_000);
  });

  test('los movimientos borrados y los "sin cuenta" no tocan ningún saldo', async () => {
    const { db, davivienda } = await setup();
    await createTransaction(db, LIST, movement('expense', 70_000));
    const gone = await createTransaction(db, LIST, movement('expense', 10_000, { account_id: davivienda }));
    await deleteTransaction(db, gone);
    expect(await balance(db, davivienda)).toBe(2_000_000);
  });

  test('editar un gasto sin decir la cuenta la conserva; pasarla a null la quita', async () => {
    const { db, davivienda } = await setup();
    const id = await createTransaction(db, LIST, movement('expense', 10_000, { account_id: davivienda }));
    await updateTransaction(db, id, movement('expense', 15_000));
    expect(await balance(db, davivienda)).toBe(1_985_000);
    await updateTransaction(db, id, movement('expense', 15_000, { account_id: null }));
    expect(await balance(db, davivienda)).toBe(2_000_000);
  });

  test('"Cuadrar saldo" deja el saldo que se escribe, sin crear movimientos', async () => {
    const { db, davivienda, tarjeta } = await setup();
    await createTransaction(db, LIST, movement('expense', 50_000, { account_id: davivienda }));
    await setAccountBalance(db, davivienda, 1_900_000);
    expect(await balance(db, davivienda)).toBe(1_900_000);
    await setAccountBalance(db, tarjeta, 250_000);
    expect(await balance(db, tarjeta)).toBe(250_000);
    expect(await count(db, 'transactions')).toBe(1);
    // Later movements keep adding on top of the corrected balance.
    await createTransaction(db, LIST, movement('expense', 100_000, { account_id: davivienda }));
    expect(await balance(db, davivienda)).toBe(1_800_000);
  });
});

describe('reglas de transferencias', () => {
  test('exige dos cuentas distintas que existan', async () => {
    const { db, davivienda, efectivo } = await setup();
    await expect(createTransaction(db, LIST, movement('transfer', 1000, { account_id: davivienda }))).rejects.toThrow('Elige');
    await expect(createTransaction(db, LIST, movement('transfer', 1000, { account_id: davivienda, to_account_id: davivienda }))).rejects.toThrow('distintas');
    await deleteAccount(db, efectivo);
    await expect(createTransaction(db, LIST, movement('transfer', 1000, { account_id: davivienda, to_account_id: efectivo }))).rejects.toThrow('ya no existe');
    expect(await count(db, 'transactions')).toBe(0);
  });

  test('nunca lleva categoría ni se repite', async () => {
    const { db, davivienda, efectivo } = await setup();
    const id = await saveTransaction(db, LIST, {
      input: movement('transfer', 80_000, { account_id: davivienda, to_account_id: efectivo, category_id: 'cat-mercado', tags: ['cajero'] }),
      repeat: 'monthly',
    });
    const saved = await getTransaction(db, id);
    expect(saved).toMatchObject({ category_id: null, recurring_id: null, tags: '["cajero"]' });
    expect(await count(db, 'recurring')).toBe(0);
  });

  test('no cuenta como gasto ni ingreso, ni dispara alertas de presupuesto', async () => {
    const { db, davivienda, efectivo } = await setup();
    await setSetting(db, SETTING_BUDGET_ALERTS, 'true');
    await setBudget(db, LIST, 'cat-mercado', 10_000);
    await createTransaction(db, LIST, movement('expense', 5_000, { account_id: davivienda, category_id: 'cat-mercado' }));
    const transfer = await createTransaction(db, LIST, movement('transfer', 900_000, { account_id: davivienda, to_account_id: efectivo }));

    const rows = await listTransactionAmounts(db, LIST);
    expect(sumRange(rows, 0, Number.MAX_SAFE_INTEGER)).toEqual({ expense: 5_000, income: 0, balance: -5_000 });
    expect(await budgetAlertFor(db, transfer, 0, NOW)).toBeNull();
  });
});

describe('cuentas y grupos', () => {
  test('recuerda la última cuenta usada en un gasto', async () => {
    const { db, davivienda, efectivo } = await setup();
    await saveTransaction(db, LIST, { input: movement('expense', 1000, { account_id: efectivo }), repeat: 'once' });
    expect(await getSetting(db, SETTING_LAST_ACCOUNT)).toBe(efectivo);
    await saveTransaction(db, LIST, { input: movement('transfer', 1000, { account_id: davivienda, to_account_id: efectivo }), repeat: 'once' });
    expect(await getSetting(db, SETTING_LAST_ACCOUNT)).toBe(efectivo);
  });

  test('una recurrente recuerda su cuenta y las copias bajan el saldo', async () => {
    const { db, davivienda } = await setup();
    await saveTransaction(db, LIST, {
      input: movement('expense', 50_000, { account_id: davivienda, occurred_at: NOW - 15 * 86_400_000 }),
      repeat: 'weekly',
    });
    expect(await materializeRecurring(db, NOW)).toBe(2);
    expect(await balance(db, davivienda)).toBe(2_000_000 - 150_000);
  });

  test('archivar una cuenta: sale del panel, sus movimientos siguen con su nombre y las recurrentes quedan sin cuenta', async () => {
    const { db, davivienda } = await setup();
    const id = await saveTransaction(db, LIST, { input: movement('expense', 50_000, { account_id: davivienda }), repeat: 'monthly' });
    await deleteAccount(db, davivienda);
    expect((await listAccounts(db)).map((a) => a.name)).toEqual(['Billetera', 'Tarjeta Nu']);
    expect((await getTransaction(db, id))?.account_name).toBe('Davivienda');
    expect(await count(db, 'recurring', 'account_id IS NULL')).toBe(1);
    expect(await getSetting(db, SETTING_LAST_ACCOUNT)).toBeNull();
    // A new copy of the recurring template is saved without account instead of failing.
    expect(await materializeRecurring(db, NOW + 40 * 86_400_000)).toBe(1);
  });

  test('borrar un grupo deja sus cuentas sin grupo; Inversiones no se puede borrar', async () => {
    const { db, bancos, davivienda } = await setup();
    await deleteAccountGroup(db, bancos);
    expect((await getAccount(db, davivienda))?.group_id).toBeNull();
    expect(await count(db, 'accounts', 'deleted_at IS NULL')).toBe(3);
    await expect(deleteAccountGroup(db, INVESTMENTS_GROUP_ID)).rejects.toThrow('Inversiones');
  });

  test('una tarjeta nunca queda en un grupo de activos, y las inversiones siempre en Inversiones', async () => {
    const { db, bancos, tarjeta, davivienda } = await setup();
    expect((await getAccount(db, tarjeta))?.group_id).toBeNull();
    const cdt = await createAccount(db, account('CDT', { type: 'asset', group_id: bancos, opening_balance: 2_000_000, subtitle: ' Vence 14 mar 2027 ' }));
    expect(await getAccount(db, cdt)).toMatchObject({ group_id: INVESTMENTS_GROUP_ID, subtitle: 'Vence 14 mar 2027' });
    await updateAccount(db, davivienda, account('Davivienda', { group_id: INVESTMENTS_GROUP_ID }));
    expect((await getAccount(db, davivienda))?.group_id).toBeNull();
  });

  test('los grupos del usuario se ordenan y van antes de Inversiones', async () => {
    const { db, efectivoGroup } = await setup();
    await moveAccountGroup(db, efectivoGroup, -1);
    expect((await listAccountGroups(db)).map((g) => g.name)).toEqual(['Efectivo', 'Bancos', 'Inversiones']);
    await moveAccountGroup(db, efectivoGroup, -1);
    expect((await listAccountGroups(db)).map((g) => g.name)).toEqual(['Efectivo', 'Bancos', 'Inversiones']);
  });

  test('movimientos de una cuenta: como origen o como destino', async () => {
    const { db, davivienda, efectivo } = await setup();
    await createTransaction(db, LIST, movement('expense', 1000, { account_id: efectivo }));
    await createTransaction(db, LIST, movement('transfer', 2000, { account_id: davivienda, to_account_id: efectivo }));
    await createTransaction(db, LIST, movement('expense', 3000, { account_id: davivienda }));
    expect((await listAccountTransactions(db, efectivo, 10)).map((t) => t.amount).sort()).toEqual([1000, 2000]);
  });
});

describe('resumen del panel', () => {
  test('disponible, invertido, deuda y "Tu dinero hoy"', async () => {
    const { db } = await setup();
    await createAccount(db, account('CDT', { type: 'asset', group_id: null, opening_balance: 2_000_000 }));
    await createAccount(db, account('XTB', { type: 'broker', currency: 'USD', group_id: null, opening_balance: 41_236 }));
    const accounts = await listAccounts(db);
    const summary = summarizeAccounts(accounts);
    expect(summary).toMatchObject({ available: 2_100_000, invested: 2_000_000, debt: 300_000, assets: 4_100_000, net: 3_800_000 });
    // Dollars are never added to pesos.
    expect(summary.foreign.map((a) => a.name)).toEqual(['XTB']);
  });

  test('vista agrupada: cada grupo con su total y su parte de los activos; los pasivos van aparte', async () => {
    const { db } = await setup();
    await createAccount(db, account('Suelta', { opening_balance: 400_000 }));
    const sections = groupAccounts(await listAccounts(db), await listAccountGroups(db));
    expect(sections.map((s) => [s.name, s.total, formatShare(s.share), s.accounts.length])).toEqual([
      ['Bancos', 2_000_000, '80%', 1],
      ['Efectivo', 100_000, '4%', 1],
      ['Inversiones', 0, '0%', 0],
      ['Sin grupo', 400_000, '16%', 1],
    ]);
    expect(sections.flatMap((s) => s.accounts).some((a) => a.type === 'credit')).toBe(false);
  });
});
