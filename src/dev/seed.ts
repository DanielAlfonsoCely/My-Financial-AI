// Development only: fills the app with invented data that is really saved in SQLite, so every
// screen can be tried without typing six months of movements by hand.
//
// It goes through the same functions the screens use (repo.ts), so seeding also exercises the data
// layer. Every row it creates is written down in the `dev_seed` table; "Borrar datos de prueba"
// removes exactly those rows and nothing the user created.

import type { SQLiteDatabase } from 'expo-sqlite';

import {
  createAccount,
  createAccountGroup,
  createAiRule,
  createCategory,
  createList,
  createRecurringFrom,
  createTransaction,
  getSetting,
  listBudgets,
  setBudget,
  SETTING_CURRENT_LIST,
  writeTx,
} from '../db/repo';
import { PERSONAL_LIST_ID } from '../db/seed';
import type { Frequency, TransactionInput, TransactionSource } from '../db/types';
import { notifyDataChanged, withNotificationsPaused } from '../lib/events';
import { keywords } from '../lib/text';
import { categoryPalette } from '../theme';

/** Tables the seed writes to, in the order they must be emptied (children before parents). */
const TABLES = ['transactions', 'recurring', 'budgets', 'ai_rules', 'tags', 'categories', 'accounts', 'account_groups', 'lists'] as const;
const SETTING_SEEDED_AT = 'dev_seed_at';
const DAY = 86_400_000;
const MONTHS_BACK = 6;

/** Small deterministic generator: the same seed always gives the same data, so bugs can be repeated. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DevSeedStatus {
  seeded: boolean;
  /** Epoch ms of the last seed, or null. */
  seededAt: number | null;
  movements: number;
  rows: number;
}

export async function getDevSeedStatus(db: SQLiteDatabase): Promise<DevSeedStatus> {
  const [rows, movements, at] = await Promise.all([
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM dev_seed'),
    db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM dev_seed WHERE table_name = 'transactions'"),
    getSetting(db, SETTING_SEEDED_AT),
  ]);
  const total = rows?.n ?? 0;
  return { seeded: total > 0, seededAt: at ? Number(at) : null, movements: movements?.n ?? 0, rows: total };
}

async function idsOf(db: SQLiteDatabase): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  for (const table of TABLES) {
    const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table}`);
    result.set(table, new Set(rows.map((r) => r.id)));
  }
  return result;
}

/**
 * Fills the app. Returns false (and does nothing) if test data is already there.
 * `now` only exists so tests get the same data every day.
 */
export async function seedDevData(db: SQLiteDatabase, now = Date.now()): Promise<boolean> {
  if ((await getDevSeedStatus(db)).seeded) return false;
  const before = await idsOf(db);

  await withNotificationsPaused(async () => {
    try {
      await populate(db, now);
    } finally {
      // Whatever was created is written down, even if populating stopped halfway, so it can be removed.
      const after = await idsOf(db);
      await writeTx(db, async () => {
        for (const table of TABLES) {
          for (const id of after.get(table) ?? []) {
            if (!before.get(table)?.has(id)) {
              await db.runAsync('INSERT OR IGNORE INTO dev_seed (table_name, row_id) VALUES (?, ?)', table, id);
            }
          }
        }
        await db.runAsync(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          SETTING_SEEDED_AT, String(now), now,
        );
      });
    }
  });
  notifyDataChanged();
  return true;
}

/**
 * Removes exactly what the seed created. Real data that ended up pointing at a seeded row is kept
 * and detached: a real movement in a test account stays "sin cuenta", one in a test category
 * "sin categoría", and one in a test list moves to Personal.
 */
export async function clearDevData(db: SQLiteDatabase): Promise<number> {
  const removed = await writeTx(db, async () => {
    const seeded = (table: string) => `(SELECT row_id FROM dev_seed WHERE table_name = '${table}')`;
    const notSeeded = `id NOT IN ${seeded('transactions')}`;
    const now = Date.now();

    // Copies that a seeded recurring template made after the seed are test data too.
    await db.runAsync(
      `INSERT OR IGNORE INTO dev_seed (table_name, row_id)
       SELECT 'transactions', id FROM transactions WHERE recurring_id IN ${seeded('recurring')}`,
    );
    // A real transfer needs both accounts: without one of them it means nothing.
    await db.runAsync(
      `DELETE FROM transactions WHERE ${notSeeded} AND kind = 'transfer'
         AND (account_id IN ${seeded('accounts')} OR to_account_id IN ${seeded('accounts')})`,
    );
    await db.runAsync(`UPDATE transactions SET account_id = NULL, updated_at = ? WHERE ${notSeeded} AND account_id IN ${seeded('accounts')}`, now);
    await db.runAsync(`UPDATE transactions SET category_id = NULL, updated_at = ? WHERE ${notSeeded} AND category_id IN ${seeded('categories')}`, now);
    await db.runAsync(`UPDATE transactions SET list_id = ?, updated_at = ? WHERE ${notSeeded} AND list_id IN ${seeded('lists')}`, PERSONAL_LIST_ID, now);
    await db.runAsync(`UPDATE transactions SET recurring_id = NULL WHERE ${notSeeded} AND recurring_id IN ${seeded('recurring')}`);
    // Anything real the user made inside a test list moves to Personal with its movements.
    for (const table of ['categories', 'recurring', 'budgets', 'ai_rules'] as const) {
      await db.runAsync(
        `UPDATE ${table} SET list_id = ? WHERE id NOT IN ${seeded(table)} AND list_id IN ${seeded('lists')}`,
        PERSONAL_LIST_ID,
      );
    }
    // Tag names are unique per list: one that Personal already has is simply dropped.
    await db.runAsync(`UPDATE OR IGNORE tags SET list_id = ? WHERE id NOT IN ${seeded('tags')} AND list_id IN ${seeded('lists')}`, PERSONAL_LIST_ID);
    await db.runAsync(`DELETE FROM tags WHERE id NOT IN ${seeded('tags')} AND list_id IN ${seeded('lists')}`);
    await db.runAsync(`UPDATE recurring SET account_id = NULL WHERE id NOT IN ${seeded('recurring')} AND account_id IN ${seeded('accounts')}`);
    await db.runAsync(`UPDATE recurring SET category_id = NULL WHERE id NOT IN ${seeded('recurring')} AND category_id IN ${seeded('categories')}`);
    await db.runAsync(`UPDATE accounts SET group_id = NULL WHERE id NOT IN ${seeded('accounts')} AND group_id IN ${seeded('account_groups')}`);
    await db.runAsync(`DELETE FROM budgets WHERE id NOT IN ${seeded('budgets')} AND category_id IN ${seeded('categories')}`);
    await db.runAsync(`DELETE FROM ai_rules WHERE id NOT IN ${seeded('ai_rules')} AND category_id IN ${seeded('categories')}`);

    let count = 0;
    for (const table of TABLES) {
      const result = await db.runAsync(`DELETE FROM ${table} WHERE id IN ${seeded(table)}`);
      count += result.changes;
    }
    await db.runAsync(`DELETE FROM settings WHERE key = ? AND value IN ${seeded('lists')}`, SETTING_CURRENT_LIST);
    await db.runAsync("DELETE FROM settings WHERE key = 'last_account_id' AND value IN (SELECT row_id FROM dev_seed WHERE table_name = 'accounts')");
    await db.runAsync('DELETE FROM settings WHERE key = ?', SETTING_SEEDED_AT);
    await db.runAsync('DELETE FROM dev_seed');
    return count;
  });
  notifyDataChanged();
  return removed;
}

// ---------- The invented life ----------

async function populate(db: SQLiteDatabase, now: number): Promise<void> {
  const random = mulberry32(20261110);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  /** Rounded like real prices: to the nearest `step` pesos. */
  const price = (min: number, max: number, step = 100) => Math.round(between(min, max) / step) * step;
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const chance = (p: number) => random() < p;

  const today = new Date(now);
  /** A moment on day `day` of the month `back` months ago, never in the future. */
  const on = (back: number, day: number, hour = between(7, 21)): number => {
    const lastDay = new Date(today.getFullYear(), today.getMonth() - back + 1, 0).getDate();
    const at = new Date(today.getFullYear(), today.getMonth() - back, Math.min(day, lastDay), hour, between(0, 59)).getTime();
    return Math.min(at, now - between(1, 90) * 60_000);
  };
  const isPast = (back: number, day: number) => back > 0 || day <= today.getDate();

  // ----- Accounts -----
  const efectivo = await createAccountGroup(db, 'Efectivo', '💵');
  const bancos = await createAccountGroup(db, 'Bancos', '🏦');
  const account = (name: string, emoji: string, color: number, extra: Partial<Parameters<typeof createAccount>[1]>) =>
    createAccount(db, { name, emoji, color: categoryPalette[color], type: 'savings', group_id: null, ...extra });
  const billetera = await account('Billetera', '👛', 6, { type: 'cash', group_id: efectivo, opening_balance: 180_000 });
  await account('Bajo el colchón', '🛏️', 5, { type: 'cash', group_id: efectivo, opening_balance: 400_000 });
  const davivienda = await account('Davivienda', '🏦', 3, { group_id: bancos, opening_balance: 2_600_000 });
  const cuentaNu = await account('Cuenta Nu', '🟣', 2, { group_id: bancos, opening_balance: 900_000 });
  const nequi = await account('Nequi', '📱', 9, { type: 'wallet', group_id: bancos, opening_balance: 250_000 });
  await account('CDT Davivienda', '🏛️', 8, { type: 'asset', opening_balance: 2_000_000, subtitle: 'Vence 14 mar 2027 · 11% E.A.' });
  const xtb = await account('XTB', '📈', 13, { type: 'broker', currency: 'USD' });
  const tarjeta = await account('Tarjeta Nu', '💳', 4, { type: 'credit', opening_balance: 0, credit_limit: 3_000_000 });

  let voiceLeft = 12;
  const add = (listId: string, input: Omit<TransactionInput, 'currency'> & { source?: TransactionSource }) =>
    createTransaction(db, listId, { currency: 'COP', ...input });
  const spend = (listId: string, title: string, amount: number, categoryId: string | null, accountId: string | null, at: number, tags: string[] = []) => {
    // A few came in by voice, to show the origin in "Más información".
    const source: TransactionSource = voiceLeft > 0 && chance(0.04) ? (voiceLeft--, 'voice') : 'manual';
    return add(listId, { kind: 'expense', amount, category_id: categoryId, account_id: accountId, title, tags, occurred_at: at, source });
  };

  // ----- Personal: six months -----
  const P = PERSONAL_LIST_ID;
  const lunches = ['Almuerzo ejecutivo', 'Corrientazo', 'Almuerzo', 'Crepes & Waffles', 'Empanadas', 'Hamburguesa', 'Pizza', 'Sushi', 'Café y pan'] as const;
  const markets = ['Mercado D1', 'Mercado Éxito', 'Mercado Ara', 'Fruver', 'Carulla', 'Tienda del barrio'] as const;
  const outings = ['Cine Colombia', 'Cervezas', 'Boletas concierto', 'Bolos', 'Teatro'] as const;
  const misc = ['Regalo', 'Peluquería', 'Papelería', 'Arreglo zapatos', 'Lavandería'] as const;
  let cardSpend = 0;

  for (let back = MONTHS_BACK - 1; back >= 0; back--) {
    // Salary twice a month.
    for (const day of [15, 30]) {
      if (isPast(back, day)) {
        await add(P, { kind: 'income', amount: 1_650_000, category_id: 'cat-salario', account_id: davivienda, title: 'Nómina quincena', occurred_at: on(back, day, 6), tags: ['trabajo'] });
      }
    }
    if (isPast(back, 5)) await spend(P, 'Arriendo', 1_100_000, 'cat-hogar', davivienda, on(back, 5, 8), ['fijo']);
    if (isPast(back, 12)) await spend(P, 'Luz y agua', price(140_000, 210_000, 50), 'cat-servicios', davivienda, on(back, 12), ['fijo']);
    if (isPast(back, 14)) await spend(P, 'Internet', 89_900, 'cat-servicios', cuentaNu, on(back, 14), ['fijo']);
    if (isPast(back, 3)) await spend(P, 'Spotify', 17_900, 'cat-suscripciones', tarjeta, on(back, 3), ['nu']);
    if (isPast(back, 8)) await spend(P, 'Plan celular', 45_000, 'cat-suscripciones', cuentaNu, on(back, 8), ['fijo']);
    if (isPast(back, 2)) await spend(P, 'Gimnasio', 90_000, 'cat-salud', tarjeta, on(back, 2), ['nu']);
    cardSpend += 17_900 + 90_000;

    for (let i = between(4, 6); i > 0; i--) {
      const day = between(1, 28);
      if (!isPast(back, day)) continue;
      const amount = price(60_000, 220_000);
      const withCard = chance(0.5);
      if (withCard) cardSpend += amount;
      await spend(P, pick(markets), amount, 'cat-mercado', withCard ? tarjeta : davivienda, on(back, day), withCard ? ['nu'] : ['debito']);
    }
    for (let i = between(8, 12); i > 0; i--) {
      const day = between(1, 28);
      if (!isPast(back, day)) continue;
      const cash = chance(0.4);
      await spend(P, pick(lunches), price(14_000, 38_000), 'cat-comer-afuera', cash ? billetera : nequi, on(back, day, between(12, 14)), cash ? ['efectivo'] : []);
    }
    for (let i = between(12, 18); i > 0; i--) {
      const day = between(1, 28);
      if (!isPast(back, day)) continue;
      await spend(P, chance(0.8) ? 'TransMilenio' : 'Taxi', chance(0.8) ? 3_200 : price(9_000, 26_000), 'cat-transporte', billetera, on(back, day, pick([6, 7, 18, 19])), ['efectivo']);
    }
    for (let i = between(1, 3); i > 0; i--) {
      const day = between(1, 28);
      if (!isPast(back, day)) continue;
      const amount = price(25_000, 140_000);
      cardSpend += amount;
      await spend(P, pick(outings), amount, 'cat-entretenimiento', tarjeta, on(back, day, between(18, 22)), ['salidas', 'nu']);
    }
    // Some without category, like real life.
    for (let i = between(1, 2); i > 0; i--) {
      const day = between(1, 28);
      if (isPast(back, day)) await spend(P, pick(misc), price(8_000, 70_000), null, nequi, on(back, day));
    }

    // Transfers: cash from the ATM, and the card paid at the end of the month.
    if (isPast(back, 6)) {
      await add(P, { kind: 'transfer', amount: 250_000, category_id: null, account_id: davivienda, to_account_id: billetera, title: 'Retiro en cajero', occurred_at: on(back, 6, 9), tags: ['cajero'] });
    }
    if (isPast(back, 16)) {
      await add(P, { kind: 'transfer', amount: 320_000, category_id: null, account_id: davivienda, to_account_id: nequi, title: 'Recarga Nequi', occurred_at: on(back, 16, 10) });
    }
    if (isPast(back, 27) && cardSpend >= 1000) {
      await add(P, { kind: 'transfer', amount: Math.round(cardSpend / 1000) * 1000, category_id: null, account_id: davivienda, to_account_id: tarjeta, title: 'Pago Tarjeta Nu', occurred_at: on(back, 27, 20) });
      cardSpend = cardSpend - Math.round(cardSpend / 1000) * 1000;
    }
  }
  // A deposit to the broker: pesos leave, dollars arrive (US$250,00).
  await add(P, { kind: 'transfer', amount: 1_025_000, category_id: null, account_id: davivienda, to_account_id: xtb, to_amount: 25_000, title: 'Depósito a XTB', occurred_at: on(2, 20, 11) });

  // ----- Budgets of this month: one over, one near 85 %, one with room -----
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const spentThisMonth = async (categoryId: string) =>
    (await db.getFirstAsync<{ total: number | null }>(
      "SELECT SUM(amount) AS total FROM transactions WHERE deleted_at IS NULL AND kind = 'expense' AND category_id = ? AND occurred_at >= ?",
      categoryId, monthStart,
    ))?.total ?? 0;
  const existing = new Set((await listBudgets(db, P)).map((b) => b.category_id));
  const budget = async (categoryId: string, ratio: number, fallback: number) => {
    // A budget the user already set is theirs: never overwritten.
    if (existing.has(categoryId)) return;
    const spent = await spentThisMonth(categoryId);
    await setBudget(db, P, categoryId, spent > 0 ? Math.max(10_000, Math.round(spent / ratio / 1000) * 1000) : fallback);
  };
  await budget('cat-mercado', 1.12, 300_000);
  await budget('cat-comer-afuera', 0.86, 250_000);
  await budget('cat-transporte', 0.4, 200_000);

  // ----- Recurring -----
  const recurring = (title: string, amount: number, categoryId: string, accountId: string, day: number, frequency: Frequency = 'monthly') =>
    createRecurringFrom(db, P, { kind: 'expense', amount, currency: 'COP', category_id: categoryId, account_id: accountId, title, tags: ['fijo'], occurred_at: on(isPast(0, day) ? 0 : 1, day, 8) }, frequency);
  await recurring('Arriendo', 1_100_000, 'cat-hogar', davivienda, 5);
  await recurring('Spotify', 17_900, 'cat-suscripciones', tarjeta, 3);
  await recurring('Plan celular', 45_000, 'cat-suscripciones', cuentaNu, 8);
  await recurring('Gimnasio', 90_000, 'cat-salud', tarjeta, 2);

  // ----- "Mejoras de IA" -----
  const rules: [string, string][] = [
    ['Combo McDonalds', 'cat-comer-afuera'],
    ['Rappi mercado', 'cat-mercado'],
    ['Tanqueo Terpel', 'cat-transporte'],
    ['Boletas Cine Colombia', 'cat-entretenimiento'],
    ['Droguería Cruz Verde', 'cat-salud'],
  ];
  for (const [phrase, categoryId] of rules) {
    // A rule the user already has for the same words is theirs: left alone.
    const taken = await db.getFirstAsync(
      'SELECT 1 FROM ai_rules WHERE list_id = ? AND keywords = ? AND deleted_at IS NULL',
      P, JSON.stringify(keywords(phrase)),
    );
    if (!taken) await createAiRule(db, P, phrase, categoryId);
  }

  // ----- Two more lists -----
  const trabajo = await createList(db, 'Trabajo', '💼');
  const tAlmuerzos = await createCategory(db, trabajo, { name: 'Almuerzos', emoji: '🍱', color: categoryPalette[1], kind: 'expense' });
  const tTransporte = await createCategory(db, trabajo, { name: 'Transporte', emoji: '🚕', color: categoryPalette[4], kind: 'expense' });
  const tInsumos = await createCategory(db, trabajo, { name: 'Insumos', emoji: '📎', color: categoryPalette[8], kind: 'expense' });
  const tReembolsos = await createCategory(db, trabajo, { name: 'Reembolsos', emoji: '💸', color: categoryPalette[6], kind: 'income' });
  for (let back = 2; back >= 0; back--) {
    for (let i = 5; i > 0; i--) {
      const day = between(1, 28);
      if (!isPast(back, day)) continue;
      const kind = pick(['almuerzo', 'taxi', 'insumo'] as const);
      if (kind === 'almuerzo') await spend(trabajo, 'Almuerzo con cliente', price(35_000, 90_000), tAlmuerzos, tarjeta, on(back, day, 13), ['cliente']);
      else if (kind === 'taxi') await spend(trabajo, 'Taxi a reunión', price(12_000, 34_000), tTransporte, nequi, on(back, day));
      else await spend(trabajo, 'Papelería', price(8_000, 60_000), tInsumos, billetera, on(back, day), ['efectivo']);
    }
    if (back > 0) {
      await add(trabajo, { kind: 'income', amount: price(150_000, 320_000, 1000), category_id: tReembolsos, account_id: davivienda, title: 'Reembolso de gastos', occurred_at: on(back, 28, 9) });
    }
  }

  const viaje = await createList(db, 'Viaje', '✈️');
  const vHotel = await createCategory(db, viaje, { name: 'Hotel', emoji: '🏨', color: categoryPalette[7], kind: 'expense' });
  const vVuelos = await createCategory(db, viaje, { name: 'Vuelos', emoji: '✈️', color: categoryPalette[11], kind: 'expense' });
  const vComida = await createCategory(db, viaje, { name: 'Comida', emoji: '🍽️', color: categoryPalette[12], kind: 'expense' });
  await spend(viaje, 'Vuelos a Cartagena', 620_000, vVuelos, tarjeta, on(2, 3), ['cartagena']);
  await spend(viaje, 'Hotel 3 noches', 780_000, vHotel, tarjeta, on(2, 10), ['cartagena']);
  for (const day of [10, 11, 11, 12, 12, 13]) {
    await spend(viaje, pick(['Cena', 'Almuerzo en la playa', 'Desayuno', 'Cocteles'] as const), price(28_000, 120_000), vComida, chance(0.5) ? billetera : nequi, on(2, day), ['cartagena']);
  }
}
