// HARDCODED: sample data for the accounts panel mockup. Nothing here is saved or connected.
// It only exists so Daniel can review the design before we build the real model.

export type AccountType = 'cash' | 'savings' | 'wallet' | 'credit';

export interface MockAccount {
  id: string;
  name: string;
  emoji: string;
  color: string;
  type: AccountType;
  /** For credit cards this is the debt (amount used). */
  balance: number;
  /** Credit limit, only for credit cards. */
  limit?: number;
  monthOut: number;
  monthIn: number;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: 'Efectivo',
  savings: 'Cuenta de ahorros',
  wallet: 'Billetera digital',
  credit: 'Tarjeta de crédito',
};

export const MOCK_ACCOUNTS: MockAccount[] = [
  { id: 'davivienda', name: 'Davivienda', emoji: '🏦', color: '#FAD3D7', type: 'savings', balance: 2_450_000, monthOut: 640_000, monthIn: 3_000_000 },
  { id: 'nu', name: 'Cuenta Nu', emoji: '🟣', color: '#E5E0F7', type: 'savings', balance: 1_285_000, monthOut: 120_000, monthIn: 400_000 },
  { id: 'nequi', name: 'Nequi', emoji: '📱', color: '#F6D8EB', type: 'wallet', balance: 320_000, monthOut: 95_000, monthIn: 150_000 },
  { id: 'efectivo', name: 'Efectivo', emoji: '💵', color: '#D3EFE2', type: 'cash', balance: 180_000, monthOut: 220_000, monthIn: 200_000 },
  { id: 'tarjeta-nu', name: 'Tarjeta Nu', emoji: '💳', color: '#CFE6F6', type: 'credit', balance: 820_000, limit: 3_000_000, monthOut: 820_000, monthIn: 0 },
];

export interface MockMovement {
  id: string;
  emoji: string;
  color: string;
  title: string;
  /** Text of the account chip, e.g. "Davivienda" or "Davivienda → Efectivo". */
  accountLabel: string;
  amount: number;
  kind: 'expense' | 'income' | 'transfer';
  when: string;
}

export const MOCK_MOVEMENTS: MockMovement[] = [
  { id: 'm1', emoji: '🍔', color: '#F8D8C6', title: 'Hamburguesa', accountLabel: '🏦 Davivienda', amount: 25_000, kind: 'expense', when: 'Hoy' },
  { id: 'm2', emoji: '🛒', color: '#E4EFC7', title: 'Mercado D1', accountLabel: '💳 Tarjeta Nu · vía Google Wallet', amount: 86_500, kind: 'expense', when: 'Hoy' },
  { id: 'm3', emoji: '🏧', color: '#DEE5EC', title: 'Retiro en cajero', accountLabel: '🏦 Davivienda → 💵 Efectivo', amount: 200_000, kind: 'transfer', when: 'Ayer' },
  { id: 'm4', emoji: '🚌', color: '#CFE6F6', title: 'TransMilenio', accountLabel: '💵 Efectivo', amount: 3_200, kind: 'expense', when: 'Ayer' },
  { id: 'm5', emoji: '💰', color: '#D3EFE2', title: 'Salario', accountLabel: '🏦 Davivienda', amount: 3_000_000, kind: 'income', when: 'lun 27 oct' },
];
