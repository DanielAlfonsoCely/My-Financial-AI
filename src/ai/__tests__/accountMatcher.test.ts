import { type AccountRef, findAccountMentions, guessTransfer, pickPaymentAccount } from '../accountMatcher';

const ACCOUNTS: AccountRef[] = [
  { id: 'davi', name: 'Davivienda', type: 'savings' },
  { id: 'nu', name: 'Cuenta Nu', type: 'savings' },
  { id: 'nequi', name: 'Nequi', type: 'wallet' },
  { id: 'billetera', name: 'Billetera', type: 'cash' },
  { id: 'tarjeta', name: 'Tarjeta Nu', type: 'credit' },
];
const names = (text: string, accounts = ACCOUNTS) => findAccountMentions(text, accounts).map((m) => m.account.id);

describe('findAccountMentions', () => {
  test('nombre completo, sin importar tildes ni mayúsculas', () => {
    expect(names('pagué con la TARJETA NU ayer')).toEqual(['tarjeta']);
    expect(names('de davivienda a nequi')).toEqual(['davi', 'nequi']);
  });

  test('una palabra compartida por dos cuentas no decide nada', () => {
    expect(names('almuerzo con nu')).toEqual([]);
  });

  test('una palabra propia de la cuenta basta', () => {
    const accounts: AccountRef[] = [{ id: 'd', name: 'Cuenta Davivienda', type: 'savings' }, { id: 'n', name: 'Cuenta Nequi', type: 'wallet' }];
    expect(names('saqué 50 mil de davivienda', accounts)).toEqual(['d']);
    expect(names('abrí una cuenta', accounts)).toEqual([]);
  });

  test('sin cuentas no encuentra nada', () => {
    expect(names('retiré 80 mil de davivienda', [])).toEqual([]);
  });
});

describe('guessTransfer', () => {
  test('retiro: de la cuenta al efectivo', () => {
    expect(guessTransfer('Retiré 80 mil de Davivienda', ACCOUNTS)).toEqual({ status: 'ok', fromId: 'davi', toId: 'billetera', title: 'Retiro' });
    expect(guessTransfer('saqué 200 lucas de nequi', ACCOUNTS)).toMatchObject({ status: 'ok', fromId: 'nequi', toId: 'billetera' });
  });

  test('pasar plata entre dos cuentas propias, en cualquier orden', () => {
    expect(guessTransfer('pasé 500 mil de Davivienda a Nequi', ACCOUNTS)).toMatchObject({ status: 'ok', fromId: 'davi', toId: 'nequi', title: 'Transferencia' });
    expect(guessTransfer('pasé a nequi 500 mil desde davivienda', ACCOUNTS)).toMatchObject({ status: 'ok', fromId: 'davi', toId: 'nequi' });
  });

  test('pagar la tarjeta', () => {
    expect(guessTransfer('pagué la tarjeta con davivienda 300 mil', ACCOUNTS)).toEqual({ status: 'ok', fromId: 'davi', toId: 'tarjeta', title: 'Pago Tarjeta Nu' });
    expect(guessTransfer('pagué la tarjeta 300 mil', ACCOUNTS)).toMatchObject({ status: 'unresolved' });
  });

  test('mandarle plata a otra persona es un gasto, no una transferencia', () => {
    expect(guessTransfer('le transferí 50 mil a mi mamá desde nequi', ACCOUNTS)).toEqual({ status: 'none' });
    expect(guessTransfer('pasé por un café 5 mil', ACCOUNTS)).toEqual({ status: 'none' });
  });

  test('"saqué" sin nombrar una cuenta no es un retiro', () => {
    expect(guessTransfer('saqué 20 mil para el almuerzo', ACCOUNTS)).toEqual({ status: 'none' });
  });

  test('retiro sin saber a qué efectivo entra', () => {
    const two = [...ACCOUNTS, { id: 'colchon', name: 'Bajo el colchón', type: 'cash' as const }];
    expect(guessTransfer('retiré 80 mil de davivienda', two)).toMatchObject({ status: 'unresolved' });
    expect(guessTransfer('retiré 80 mil de davivienda para el colchón', two)).toMatchObject({ status: 'ok', toId: 'colchon' });
    expect(guessTransfer('retiré 80 mil de davivienda', ACCOUNTS.filter((a) => a.type !== 'cash'))).toMatchObject({ status: 'unresolved' });
  });

  test('un gasto normal no es transferencia', () => {
    expect(guessTransfer('almuerzo 18 mil con nequi', ACCOUNTS)).toEqual({ status: 'none' });
    expect(guessTransfer('pagué el arriendo 1 millón', ACCOUNTS)).toEqual({ status: 'none' });
  });
});

describe('pickPaymentAccount', () => {
  test('saca la cuenta de la frase para que no quede en el título', () => {
    expect(pickPaymentAccount('taxi 12 mil con nequi', ACCOUNTS)).toEqual({ accountId: 'nequi', text: 'taxi 12 mil' });
    expect(pickPaymentAccount('mercado 80 mil con la tarjeta nu', ACCOUNTS)).toMatchObject({ accountId: 'tarjeta' });
  });

  test('sin preposición la deja en el título', () => {
    expect(pickPaymentAccount('recarga nequi 20 mil', ACCOUNTS)).toEqual({ accountId: 'nequi', text: 'recarga nequi 20 mil' });
  });

  test('ninguna o varias cuentas: no elige', () => {
    expect(pickPaymentAccount('taxi 12 mil', ACCOUNTS)).toEqual({ accountId: null, text: 'taxi 12 mil' });
    expect(pickPaymentAccount('de davivienda y de nequi 10 mil', ACCOUNTS).accountId).toBeNull();
  });
});
