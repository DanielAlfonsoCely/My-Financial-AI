// Pure math of the accounts panel: totals, groups and percentages. No database here.

import { INVESTMENTS_GROUP_ID } from '../db/seed';
import type { AccountGroup, AccountType, AccountWithBalance } from '../db/types';
import { DEFAULT_CURRENCY } from './money';

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: 'Efectivo',
  savings: 'Cuenta de ahorros',
  wallet: 'Billetera digital',
  credit: 'Tarjeta de crédito',
  broker: 'Bróker',
  asset: 'Inversión',
};

/** Types offered when creating an account in a normal group, in "Inversiones" or as a liability. */
export const EVERYDAY_TYPES: AccountType[] = ['cash', 'savings', 'wallet'];

/** A liability: what it holds is debt, and it is subtracted from "Tu dinero hoy". */
export function isLiability(account: { type: AccountType }): boolean {
  return account.type === 'credit';
}

export function isInvestment(account: { type: AccountType; group_id: string | null }): boolean {
  return account.type === 'broker' || account.type === 'asset' || account.group_id === INVESTMENTS_GROUP_ID;
}

export interface AccountsSummary {
  /** Cash and banks. */
  available: number;
  /** The "Inversiones" group. */
  invested: number;
  /** Liabilities, as a positive number. */
  debt: number;
  /** available + invested. */
  assets: number;
  /** "Tu dinero hoy": assets − debt. */
  net: number;
  /** Accounts in another currency: shown, but never added to the totals in pesos. */
  foreign: AccountWithBalance[];
}

export function summarizeAccounts(accounts: AccountWithBalance[], currency = DEFAULT_CURRENCY): AccountsSummary {
  let available = 0;
  let invested = 0;
  let debt = 0;
  const foreign: AccountWithBalance[] = [];
  for (const a of accounts) {
    if (a.currency !== currency) foreign.push(a);
    else if (isLiability(a)) debt += a.balance;
    else if (isInvestment(a)) invested += a.balance;
    else available += a.balance;
  }
  const assets = available + invested;
  return { available, invested, debt, assets, net: assets - debt, foreign };
}

export interface GroupSection {
  /** null = accounts without a group. */
  id: string | null;
  name: string;
  emoji: string;
  /** The fixed "Inversiones" group. */
  system: boolean;
  /** Sum of its accounts in pesos. */
  total: number;
  /** Part of all the assets, 0–1. */
  share: number;
  accounts: AccountWithBalance[];
}

/**
 * The asset accounts by group, in the order of the groups. Every group appears even when empty
 * (so there is somewhere to add the first account); "Sin grupo" only when it has accounts.
 * Liabilities are not here: they have their own section.
 */
export function groupAccounts(accounts: AccountWithBalance[], groups: AccountGroup[], currency = DEFAULT_CURRENCY): GroupSection[] {
  const assets = accounts.filter((a) => !isLiability(a));
  const sum = (list: AccountWithBalance[]) => list.filter((a) => a.currency === currency).reduce((s, a) => s + a.balance, 0);
  const all = sum(assets);
  const known = new Set(groups.map((g) => g.id));
  const section = (id: string | null, name: string, emoji: string, system: boolean, list: AccountWithBalance[]): GroupSection => {
    const total = sum(list);
    return { id, name, emoji, system, total, share: all > 0 ? Math.max(0, total) / all : 0, accounts: list };
  };
  const sections = groups.map((g) =>
    section(g.id, g.name, g.emoji, g.system_key !== null, assets.filter((a) => a.group_id === g.id)),
  );
  const loose = assets.filter((a) => a.group_id === null || !known.has(a.group_id));
  if (loose.length > 0) sections.push(section(null, 'Sin grupo', '🗂️', false, loose));
  return sections;
}

/** How much of the credit limit is used, 0–100 (can go above when over the limit). null without a limit. */
export function creditUsage(account: AccountWithBalance): number | null {
  if (!isLiability(account) || !account.credit_limit) return null;
  return Math.round((Math.max(0, account.balance) / account.credit_limit) * 100);
}

/** "48,7%" */
export function formatShare(share: number): string {
  return `${(Math.round(share * 1000) / 10).toString().replace('.', ',')}%`;
}

/** The parts of a movement that move money in an account. */
export interface MovementMoney {
  kind: 'expense' | 'income' | 'transfer';
  amount: number;
  account_id: string | null;
  to_account_id: string | null;
  to_amount: number | null;
}

/**
 * How much a movement changes the balance of an account (0 if it does not touch it). For a credit
 * account the balance is debt, so the sign is the opposite: buying raises it, paying lowers it.
 */
export function movementEffect(account: { id: string; type: AccountType }, m: MovementMoney): number {
  let change = 0;
  if (m.account_id === account.id) change += m.kind === 'income' ? m.amount : -m.amount;
  if (m.kind === 'transfer' && m.to_account_id === account.id) change += m.to_amount ?? m.amount;
  return isLiability(account) ? -change : change;
}

/**
 * Balance the account will show after saving `next`. When editing, `previous` is the movement as
 * it is saved now: its effect is already inside the balance and is taken out first.
 */
export function balanceAfter(account: AccountWithBalance, next: MovementMoney, previous: MovementMoney | null): number {
  return account.balance - (previous ? movementEffect(account, previous) : 0) + movementEffect(account, next);
}
