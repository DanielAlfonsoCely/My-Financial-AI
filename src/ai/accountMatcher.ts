// Finds the user's own accounts in a typed or dictated phrase, and tells apart a transfer between
// them ("retiré 80 mil de Davivienda") from an expense. Runs on the phone, no network.
// Only account names are ever used here: no balances, no numbers.

import type { AccountType } from '../db/types';
import { normalize } from '../lib/text';

export interface AccountRef {
  id: string;
  name: string;
  type: AccountType;
}

export interface AccountMention {
  account: AccountRef;
  /** Word positions in the phrase, [start, end). */
  start: number;
  end: number;
  /** Normalized word right before the mention ("de", "a", "con"...), or ''. */
  before: string;
}

/** Words of an account name that say nothing about which account it is. */
const GENERIC = new Set(['cuenta', 'tarjeta', 'de', 'del', 'la', 'el', 'mi', 'credito', 'debito', 'ahorros', 'ahorro', 'banco', 'bajo']);

const key = (word: string) => normalize(word).replace(/ /g, '');
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
const keysOf = (text: string) => wordsOf(text).map(key);

/**
 * Accounts named in the phrase. The full name wins ("tarjeta nu"); otherwise one distinctive word
 * of the name is enough ("davivienda" for "Cuenta Davivienda"), as long as no other account shares
 * it: "nu" alone says nothing when there is a "Cuenta Nu" and a "Tarjeta Nu".
 */
export function findAccountMentions(text: string, accounts: AccountRef[]): AccountMention[] {
  const keys = keysOf(text);
  const taken = new Array<boolean>(keys.length).fill(false);
  const mentions: AccountMention[] = [];
  const named = accounts.map((account) => ({ account, name: keysOf(account.name).filter(Boolean) })).filter((a) => a.name.length > 0);

  const claim = (account: AccountRef, start: number, end: number) => {
    for (let i = start; i < end; i++) taken[i] = true;
    mentions.push({ account, start, end, before: start > 0 ? keys[start - 1] : '' });
  };

  // 1. Full names, longest first.
  for (const { account, name } of [...named].sort((a, b) => b.name.length - a.name.length)) {
    for (let i = 0; i + name.length <= keys.length; i++) {
      if (name.every((word, k) => keys[i + k] === word && !taken[i + k])) claim(account, i, i + name.length);
    }
  }

  // 2. One distinctive word, for accounts not found by their full name.
  const owners = new Map<string, number>();
  for (const { name } of named) for (const word of new Set(name)) owners.set(word, (owners.get(word) ?? 0) + 1);
  for (const { account, name } of named) {
    if (mentions.some((m) => m.account.id === account.id)) continue;
    const distinctive = name.filter((word) => word.length >= 2 && !GENERIC.has(word) && owners.get(word) === 1);
    for (let i = 0; i < keys.length; i++) {
      if (!taken[i] && distinctive.includes(keys[i])) claim(account, i, i + 1);
    }
  }
  return mentions.sort((a, b) => a.start - b.start);
}

const PAID_WITH = new Set(['con', 'de', 'desde', 'del', 'en', 'por', 'a', 'al']);

/**
 * For an everyday expense or income: the one account the phrase names ("taxi 12 mil con nequi"),
 * and the phrase without it, so the account does not end up in the title.
 */
export function pickPaymentAccount(text: string, accounts: AccountRef[]): { accountId: string | null; text: string } {
  const mentions = findAccountMentions(text, accounts);
  const ids = new Set(mentions.map((m) => m.account.id));
  if (ids.size !== 1) return { accountId: null, text };
  const words = wordsOf(text);
  const drop = new Set<number>();
  for (const m of mentions) {
    // Without a preposition it may be part of what was bought ("recarga nequi 20 mil"): keep the words.
    if (!PAID_WITH.has(m.before)) continue;
    for (let i = m.start - 1; i < m.end; i++) drop.add(i);
  }
  const rest = words.filter((_, i) => !drop.has(i)).join(' ');
  return { accountId: mentions[0].account.id, text: rest.trim() ? rest : text };
}

export type TransferGuess =
  | { status: 'none' }
  /** It reads like a transfer, but the accounts could not be told. `reason` is shown to the user. */
  | { status: 'unresolved'; reason: string }
  | { status: 'ok'; fromId: string; toId: string; title: string };

const WITHDRAW = /\b(retire|retiro|retiramos|saque|saco|sacamos)\b/;
const MOVE = /\b(pase|paso|pasamos|transferi|transfiero|movi|muevo|traslade|traslado|envie|envio|consigne|consigno)\b/;
const PAY = /\b(pague|pago|pagamos|abone|abono)\b/;
const FROM_WORDS = new Set(['de', 'desde', 'del']);
const TO_WORDS = new Set(['a', 'al', 'hacia', 'para', 'en']);

/**
 * Is this phrase a movement between the user's own accounts?
 * - "retiré / saqué X de A" → from A to the cash account;
 * - "pasé / transferí X de A a B" → from A to B (both must be the user's accounts: sending money
 *   to another person is an expense, not a transfer);
 * - "pagué la tarjeta [con A]" → from A to the credit card.
 */
export function guessTransfer(text: string, accounts: AccountRef[]): TransferGuess {
  const plain = ` ${keysOf(text).join(' ')} `;
  const mentions = findAccountMentions(text, accounts);
  const credit = accounts.filter((a) => a.type === 'credit');
  const cash = accounts.filter((a) => a.type === 'cash');

  if (PAY.test(plain) && /\btarjeta\b/.test(plain) && credit.length > 0) {
    const card = mentions.find((m) => m.account.type === 'credit')?.account ?? (credit.length === 1 ? credit[0] : null);
    const payer = mentions.find((m) => m.account.type !== 'credit')?.account ?? null;
    if (!card) return { status: 'unresolved', reason: 'Parece el pago de una tarjeta, pero no supe cuál. Dime el nombre de la tarjeta.' };
    if (!payer) return { status: 'unresolved', reason: `Parece el pago de ${card.name}, pero no supe desde qué cuenta. Por ejemplo: "pagué la tarjeta con Davivienda 300 mil".` };
    return { status: 'ok', fromId: payer.id, toId: card.id, title: `Pago ${card.name}` };
  }

  if (WITHDRAW.test(plain)) {
    const source = mentions.find((m) => m.account.type !== 'cash')?.account ?? null;
    // "saqué 20 mil para el almuerzo" names no account: it is not a withdrawal from one of them.
    if (!source) return { status: 'none' };
    const target = mentions.find((m) => m.account.type === 'cash')?.account ?? (cash.length === 1 ? cash[0] : null);
    if (!target) {
      return {
        status: 'unresolved',
        reason: cash.length === 0
          ? 'Parece un retiro, pero no tienes una cuenta de efectivo donde ponerlo. Créala en el panel de cuentas.'
          : 'Parece un retiro, pero tienes varias cuentas de efectivo. Dime a cuál entra.',
      };
    }
    return { status: 'ok', fromId: source.id, toId: target.id, title: 'Retiro' };
  }

  if (MOVE.test(plain)) {
    const distinct = mentions.filter((m, i) => mentions.findIndex((o) => o.account.id === m.account.id) === i);
    if (distinct.length < 2) return { status: 'none' };
    const from = distinct.find((m) => FROM_WORDS.has(m.before)) ?? distinct[0];
    const to = distinct.find((m) => m.account.id !== from.account.id && TO_WORDS.has(m.before)) ?? distinct.find((m) => m.account.id !== from.account.id);
    if (!to) return { status: 'none' };
    return { status: 'ok', fromId: from.account.id, toId: to.account.id, title: to.account.type === 'credit' ? `Pago ${to.account.name}` : 'Transferencia' };
  }

  return { status: 'none' };
}
