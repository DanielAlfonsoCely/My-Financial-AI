import { migrateDatabase } from '../../db/migrations';
import { createAccount, createTransaction, getAccount, getTransaction } from '../../db/repo';
import { PERSONAL_LIST_ID } from '../../db/seed';
import { count, openTestDatabase, type TestDatabase } from '../../test/sqlite';
import { AiError, askChat, createFromText, extractionSystem, loadAiContext } from '../pipeline';

let mockKey: string | null = null;
const mockGenerate = jest.fn(async (_request: { system: string; parts: { text?: string }[] }) => 'respuesta');
const mockGenerateJson = jest.fn(async (_request: { system: string }): Promise<unknown> => ({ transcript: '', transactions: [] }));

jest.mock('../config', () => ({
  getApiKey: async () => mockKey,
  getModel: async () => 'modelo-de-prueba',
}));
jest.mock('../gemini', () => ({
  ...jest.requireActual('../gemini'),
  generate: (request: { system: string; parts: { text?: string }[] }) => mockGenerate(request),
  generateJson: (request: { system: string }) => mockGenerateJson(request),
}));

const LIST = PERSONAL_LIST_ID;

/** Balances chosen so their digits are easy to spot if they ever leaked into a prompt. */
async function setup() {
  const db: TestDatabase = openTestDatabase();
  await migrateDatabase(db);
  const davivienda = await createAccount(db, { name: 'Davivienda', emoji: '🏦', color: '#fff', type: 'savings', group_id: null, opening_balance: 7_654_321 });
  const billetera = await createAccount(db, { name: 'Billetera', emoji: '👛', color: '#fff', type: 'cash', group_id: null, opening_balance: 123_456 });
  const nequi = await createAccount(db, { name: 'Nequi', emoji: '📱', color: '#fff', type: 'wallet', group_id: null, opening_balance: 98_765 });
  const tarjeta = await createAccount(db, { name: 'Tarjeta Nu', emoji: '💳', color: '#fff', type: 'credit', group_id: null, opening_balance: 456_789, credit_limit: 3_210_000 });
  return { db, davivienda, billetera, nequi, tarjeta };
}

beforeEach(() => {
  mockKey = null;
  mockGenerate.mockClear();
  mockGenerateJson.mockClear();
});

describe('texto libre sin Gemini', () => {
  test('"retiré 80 mil de Davivienda" es una transferencia a efectivo, no un gasto', async () => {
    const { db, davivienda, billetera } = await setup();
    const result = await createFromText(db, LIST, 'Retiré 80 mil de Davivienda');
    expect(result.created).toHaveLength(1);
    const saved = await getTransaction(db, result.created[0].id);
    expect(saved).toMatchObject({ kind: 'transfer', amount: 80_000, account_id: davivienda, to_account_id: billetera, category_id: null, title: 'Retiro' });
    expect((await getAccount(db, davivienda))?.balance).toBe(7_654_321 - 80_000);
    expect((await getAccount(db, billetera))?.balance).toBe(123_456 + 80_000);
  });

  test('"pagué la tarjeta con davivienda 300 mil" baja la deuda', async () => {
    const { db, tarjeta } = await setup();
    await createFromText(db, LIST, 'pagué la tarjeta con davivienda 300 mil');
    expect((await getAccount(db, tarjeta))?.balance).toBe(456_789 - 300_000);
  });

  test('un gasto que nombra la cuenta queda con esa cuenta y sin ella en el título', async () => {
    const { db, nequi } = await setup();
    const result = await createFromText(db, LIST, 'taxi 12 mil con nequi');
    const saved = await getTransaction(db, result.created[0].id);
    expect(saved).toMatchObject({ kind: 'expense', amount: 12_000, account_id: nequi, title: 'Taxi' });
  });

  test('un gasto normal sigue igual y queda sin cuenta', async () => {
    const { db } = await setup();
    const result = await createFromText(db, LIST, 'almuerzo 18 mil');
    expect(await getTransaction(db, result.created[0].id)).toMatchObject({ kind: 'expense', account_id: null, title: 'Almuerzo' });
  });

  test('una transferencia que no se puede resolver no se guarda como gasto: explica por qué', async () => {
    const { db } = await setup();
    await expect(createFromText(db, LIST, 'pagué la tarjeta 300 mil')).rejects.toThrow('desde qué cuenta');
    await expect(createFromText(db, LIST, 'pagué la tarjeta 300 mil')).rejects.toBeInstanceOf(AiError);
    expect(await count(db, 'transactions')).toBe(0);
  });
});

describe('privacidad: qué recibe Gemini', () => {
  test('el contexto de IA solo carga id, nombre y tipo de las cuentas', async () => {
    const { db } = await setup();
    const ctx = await loadAiContext(db, LIST);
    expect(ctx.accounts).toHaveLength(4);
    for (const account of ctx.accounts) expect(Object.keys(account).sort()).toEqual(['id', 'name', 'type']);
  });

  test('el prompt de voz lleva los nombres de las cuentas y ningún saldo ni cupo', async () => {
    const { db } = await setup();
    await createTransaction(db, LIST, { kind: 'expense', amount: 55_555, currency: 'COP', category_id: 'cat-mercado', title: 'Mercado', occurred_at: Date.now() });
    const prompt = extractionSystem(await loadAiContext(db, LIST), 'retiré plata');
    for (const name of ['Davivienda', 'Billetera', 'Nequi', 'Tarjeta Nu']) expect(prompt).toContain(name);
    const digits = prompt.replace(/\D/g, '');
    for (const secret of ['7654321', '123456', '98765', '456789', '3210000', '7599321']) expect(digits).not.toContain(secret);
  });

  test('con Gemini: una transferencia dictada se guarda con las cuentas que nombra', async () => {
    const { db, davivienda, nequi } = await setup();
    mockKey = 'clave';
    mockGenerateJson.mockResolvedValueOnce({
      transcript: 'pasé cien mil de davivienda a nequi y un café de cinco mil',
      transactions: [
        { title: 'Transferencia', amount: 100000, kind: 'transfer', category: '', account: 'davivienda', to_account: 'Nequi', date: '', tags: [] },
        { title: 'Café', amount: 5000, kind: 'expense', category: '', account: '', to_account: '', date: '', tags: [] },
        { title: 'Otra', amount: 7000, kind: 'transfer', category: '', account: 'Davivienda', to_account: 'Banco inventado', date: '', tags: [] },
      ],
    });
    // Two amounts in one piece: the local parser hands it over to Gemini.
    const result = await createFromText(db, LIST, 'pasé cien mil de davivienda a nequi café cinco mil');
    expect(result.created.map((c) => c.kind)).toEqual(['transfer', 'expense']);
    expect(result.warning).toContain('transferencia');
    expect(await getTransaction(db, result.created[0].id)).toMatchObject({ account_id: davivienda, to_account_id: nequi });
    expect(await count(db, 'transactions')).toBe(2);
  });

  test('el chat no recibe nada de cuentas: ni nombres, ni saldos, ni transferencias', async () => {
    const { db, davivienda, billetera } = await setup();
    mockKey = 'clave';
    await createTransaction(db, LIST, { kind: 'expense', amount: 18_000, currency: 'COP', category_id: 'cat-comer-afuera', account_id: davivienda, title: 'Almuerzo', occurred_at: Date.now() });
    await createTransaction(db, LIST, { kind: 'transfer', amount: 222_222, currency: 'COP', category_id: null, account_id: davivienda, to_account_id: billetera, title: 'Retiro secreto', occurred_at: Date.now() });

    await askChat(db, LIST, [], '¿cuánto gasté?');

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(mockGenerate.mock.calls[0][0]);
    expect(sent).toContain('Almuerzo');
    for (const hidden of ['Davivienda', 'Billetera', 'Nequi', 'Tarjeta Nu', 'Retiro secreto']) expect(sent).not.toContain(hidden);
    const digits = sent.replace(/\D/g, '');
    for (const secret of ['7654321', '123456', '98765', '456789', '222222']) expect(digits).not.toContain(secret);
    // The transfer is not counted as spending either.
    expect(sent).toContain('gastos $18.000');
  });
});
