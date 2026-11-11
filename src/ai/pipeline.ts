// High-level AI features used by the screens. Everything goes through here so the provider can be
// swapped later without touching the UI (today it is Gemini, see gemini.ts).
//
// Privacy (see project rules): Gemini only receives phrases, titles, amounts, dates, category and tag
// names. Never account numbers, balances, names of people or raw bank notifications.
// About accounts it gets only their names and kind (to pick one when dictating); the chat gets
// nothing about accounts at all.

import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createTransaction, listAiRules, listBudgets, listCategories, listRecentTransactions, listTags } from '../db/repo';
import type { AccountType, AiRule, Category, Kind, TransactionKind, TransactionSource } from '../db/types';
import { startOfDay, withCurrentTime } from '../lib/dates';
import { DEFAULT_CURRENCY, formatMoney } from '../lib/money';
import { normalizeTag, parseTags } from '../lib/tags';
import { capitalizeFirst, normalize } from '../lib/text';
import { type AccountRef, guessTransfer, pickPaymentAccount } from './accountMatcher';
import { type CategorySuggestion, type HistoryItem, matchRule, suggestLocally } from './categorizer';
import { getApiKey, getModel } from './config';
import { suggestEmojisLocally } from './emoji';
import { AiError, generate, generateJson } from './gemini';
import { parseFreeText } from './localParser';

export { AiError } from './gemini';

export interface AiContext {
  categories: Category[];
  rules: AiRule[];
  history: HistoryItem[];
  tags: string[];
  /** Name and kind of the user's accounts. Balances are deliberately not loaded here. */
  accounts: AccountRef[];
}

export async function loadAiContext(db: SQLiteDatabase, listId: string): Promise<AiContext> {
  const [categories, rules, recent, tags, accounts] = await Promise.all([
    listCategories(db, listId),
    listAiRules(db, listId),
    listRecentTransactions(db, listId, 400),
    listTags(db, listId),
    db.getAllAsync<AccountRef>('SELECT id, name, type FROM accounts WHERE deleted_at IS NULL ORDER BY sort_order, created_at'),
  ]);
  return {
    categories,
    rules,
    // Titles that came from bank notifications or SMS are never sent to Gemini.
    history: recent
      .filter((t) => t.source !== 'notification' && t.source !== 'sms')
      .flatMap((t) => (t.kind === 'transfer' ? [] : [{ title: t.title, categoryId: t.category_id, kind: t.kind }])),
    tags: tags.map((t) => t.name),
    accounts,
  };
}

export async function isAiConfigured(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

async function credentials(): Promise<{ apiKey: string; model: string }> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new AiError('Falta la clave de Gemini. Agrégala en Configuración → Inteligencia artificial.', 'key');
  }
  return { apiKey, model: await getModel() };
}

function todayLine(now = new Date()): string {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const weekday = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][now.getDay()];
  return `Hoy es ${weekday} ${iso}.`;
}

function categoryLines(categories: Category[]): string {
  return categories.map((c) => `- ${c.name} (${c.kind === 'income' ? 'ingreso' : 'gasto'})`).join('\n') || '- (sin categorías)';
}

/** Layer 3 context: corrections and habits, sent to Gemini as user preferences. */
function preferenceLines(ctx: AiContext, text: string): string {
  const byId = new Map(ctx.categories.map((c) => [c.id, c.name]));
  const words = new Set(normalize(text).split(' '));
  // Most similar rules first, then the newest; at most 25.
  const rules = [...ctx.rules]
    .map((r) => ({ r, score: normalize(r.phrase).split(' ').filter((w) => words.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .filter(({ r }) => byId.has(r.category_id))
    .map(({ r }) => `- "${r.phrase}" → ${byId.get(r.category_id)}`);
  // Habits: the category most used for each frequent title.
  const counts = new Map<string, Map<string, number>>();
  for (const h of ctx.history) {
    if (!h.categoryId || !byId.has(h.categoryId)) continue;
    const key = normalize(h.title);
    if (!key) continue;
    const inner = counts.get(key) ?? new Map<string, number>();
    inner.set(h.categoryId, (inner.get(h.categoryId) ?? 0) + 1);
    counts.set(key, inner);
  }
  const habits = [...counts.entries()]
    .map(([title, inner]) => {
      const [categoryId, n] = [...inner.entries()].sort((a, b) => b[1] - a[1])[0];
      return { title, category: byId.get(categoryId), n };
    })
    .filter((h) => h.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 30)
    .map((h) => `- "${h.title}" → ${h.category}`);
  return [
    rules.length ? `Correcciones que el usuario pidió recordar (tienen prioridad):\n${rules.join('\n')}` : '',
    habits.length ? `Costumbres del usuario:\n${habits.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------- Category suggestion ----------

/**
 * Layers 1–2 locally; Gemini only if nothing local is confident and `allowAi` is true.
 * Network errors are swallowed: a missing suggestion is not worth an error dialog.
 */
export async function suggestCategory(
  db: SQLiteDatabase,
  listId: string,
  title: string,
  kind: Kind,
  allowAi: boolean,
): Promise<CategorySuggestion | null> {
  const ctx = await loadAiContext(db, listId);
  const local = suggestLocally(title, kind, ctx.categories, ctx.rules, ctx.history);
  if (local || !allowAi || !(await isAiConfigured())) return local;
  const options = ctx.categories.filter((c) => c.kind === kind);
  if (options.length === 0) return null;
  try {
    const { apiKey, model } = await credentials();
    const answer = await generateJson<{ category: string }>({
      apiKey,
      model,
      system: [
        'Clasificas movimientos de una app de finanzas personales en Colombia.',
        'Responde con el nombre EXACTO de una de las categorías, o cadena vacía si ninguna encaja.',
        `Categorías:\n${categoryLines(options)}`,
        preferenceLines(ctx, title),
      ].filter(Boolean).join('\n\n'),
      parts: [{ type: 'text', text: `Movimiento (${kind === 'income' ? 'ingreso' : 'gasto'}): "${title}"` }],
      schema: {
        type: 'object',
        properties: { category: { type: 'string', description: 'Nombre exacto de la categoría o vacío' } },
        required: ['category'],
      },
    });
    const match = options.find((c) => normalize(c.name) === normalize(answer.category ?? ''));
    return match ? { categoryId: match.id, source: 'ai' } : null;
  } catch {
    return null;
  }
}

// ---------- Emoji suggestion ----------

export async function suggestEmojis(name: string): Promise<string[]> {
  const local = suggestEmojisLocally(name);
  if (!name.trim() || !(await isAiConfigured())) return local;
  try {
    const { apiKey, model } = await credentials();
    const answer = await generateJson<{ emojis: string[] }>({
      apiKey,
      model,
      system: 'Sugieres emojis para categorías de una app de finanzas. Devuelve 5 emojis distintos, uno por elemento, sin texto.',
      parts: [{ type: 'text', text: `Categoría: "${name.trim()}"` }],
      schema: {
        type: 'object',
        properties: { emojis: { type: 'array', items: { type: 'string' } } },
        required: ['emojis'],
      },
    });
    // Keep only short strings (one emoji, maybe with modifiers).
    const ai = (answer.emojis ?? []).filter((e) => typeof e === 'string' && e.trim() && [...e.trim()].length <= 4);
    return [...new Set([...ai.map((e) => e.trim()), ...local])].slice(0, 6);
  } catch {
    return local;
  }
}

// ---------- Creating movements from voice or text ----------

export interface CreatedMovement {
  id: string;
  title: string;
  amount: number;
  kind: TransactionKind;
  categoryId: string | null;
  occurredAt: number;
}

export interface CaptureResult {
  transcript: string;
  created: CreatedMovement[];
  /** Something that was understood but could not be saved (a transfer without its accounts). */
  warning?: string;
}

interface DraftMovement {
  title: string;
  amount: number;
  kind: TransactionKind;
  /** Category name proposed by Gemini, if any. */
  category?: string;
  occurredAt: number | null;
  tags?: string[];
  /** Account paid from / received in; for a transfer, where the money left. */
  accountId?: string | null;
  /** Only transfers: where the money arrived. */
  toAccountId?: string | null;
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    transcript: { type: 'string', description: 'Lo que dijo o escribió el usuario, en texto.' },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Descripción corta (1 a 5 palabras) en español, sin el monto.' },
          amount: { type: 'integer', description: 'Monto en pesos colombianos, entero y positivo.' },
          kind: { type: 'string', enum: ['expense', 'income', 'transfer'] },
          category: { type: 'string', description: 'Nombre exacto de una categoría de la lista, o vacío.' },
          account: { type: 'string', description: 'Nombre exacto de una cuenta del usuario, o vacío.' },
          to_account: { type: 'string', description: 'Solo si kind es transfer: nombre exacto de la cuenta de destino. Si no, vacío.' },
          date: { type: 'string', description: 'Fecha YYYY-MM-DD.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Solo etiquetas existentes que el usuario mencionó.' },
        },
        required: ['title', 'amount', 'kind', 'category', 'account', 'to_account', 'date', 'tags'],
      },
    },
  },
  required: ['transcript', 'transactions'],
};

interface ExtractionAnswer {
  transcript?: string;
  transactions?: {
    title?: string;
    amount?: number;
    kind?: string;
    category?: string;
    account?: string;
    to_account?: string;
    date?: string;
    tags?: string[];
  }[];
}

const ACCOUNT_KIND: Record<AccountType, string> = {
  cash: 'efectivo',
  savings: 'cuenta de banco',
  wallet: 'billetera digital',
  credit: 'tarjeta de crédito',
  broker: 'bróker',
  asset: 'inversión',
};

/** What Gemini learns about the accounts: names and kind, so it can pick one. Nothing else. */
function accountRules(accounts: AccountRef[]): string[] {
  if (accounts.length === 0) {
    return ['- account y to_account: siempre vacíos. kind nunca es "transfer".'];
  }
  return [
    '- account: el nombre EXACTO de la cuenta del usuario con la que pagó o donde recibió, solo si la menciona. Si no la menciona, vacío.',
    '- Si movió plata entre sus PROPIAS cuentas (retiro en cajero, pasar de una cuenta a otra, pagar la tarjeta de crédito): kind = "transfer", account = cuenta de origen, to_account = cuenta de destino, category vacío. Un retiro en cajero entra a la cuenta de efectivo. Si no puedes saber las dos cuentas, deja vacía la que falte.',
    '- Mandarle plata a otra persona NO es "transfer": es un gasto.',
    `Cuentas del usuario (solo nombres):\n${accounts.map((a) => `- ${a.name} (${ACCOUNT_KIND[a.type]})`).join('\n')}`,
  ];
}

export function extractionSystem(ctx: AiContext, text: string): string {
  return [
    'Eres el asistente de una app de finanzas personales en Colombia. Conviertes lo que dice el usuario en movimientos.',
    todayLine(),
    'Reglas:',
    '- Un movimiento por cada compra o ingreso mencionado. Si menciona varias cosas con montos separados, crea un movimiento por cada una. No sumes montos separados.',
    '- Montos en pesos colombianos (COP), enteros. "mil" = ×1.000, "luca(s)" = mil pesos cada una, "palo(s)" = un millón cada uno, "k" = mil. "25 mil" = 25000.',
    '- Si no hay monto, no crees el movimiento.',
    '- kind: "income" si le pagaron, recibió o ganó dinero; si no, "expense".',
    '- date: relativa a hoy ("ayer", "hace 3 días", "el lunes"). Si no dice fecha, usa hoy. Nunca una fecha futura.',
    '- title: corto, en español, con mayúscula inicial, sin el monto ni la fecha. Corrige errores de dictado (por ejemplo "McFlurry").',
    '- category: el nombre EXACTO de una categoría de la lista, o vacío si ninguna encaja.',
    '- tags: solo etiquetas de la lista que el usuario mencionó (por ejemplo "con tarjeta de crédito" → credito). Sin "#".',
    ...accountRules(ctx.accounts),
    `Categorías:\n${categoryLines(ctx.categories)}`,
    `Etiquetas existentes: ${ctx.tags.length ? ctx.tags.join(', ') : '(ninguna)'}`,
    preferenceLines(ctx, text),
  ]
    .filter(Boolean)
    .join('\n');
}

function parseIsoDate(value: string | undefined, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(day.getTime()) || day.getTime() > startOfDay(now).getTime()) return null;
  return withCurrentTime(day, now).getTime();
}

function draftsFromAnswer(answer: ExtractionAnswer, ctx: AiContext): DraftMovement[] {
  const known = new Set(ctx.tags);
  const accountId = (name: string | undefined) =>
    ctx.accounts.find((a) => normalize(a.name) === normalize(name ?? ''))?.id ?? null;
  return (answer.transactions ?? [])
    .filter((t) => Number.isFinite(t.amount) && (t.amount as number) > 0 && typeof t.title === 'string')
    .slice(0, 10)
    .map((t): DraftMovement => {
      const kind: TransactionKind = t.kind === 'income' ? 'income' : t.kind === 'transfer' ? 'transfer' : 'expense';
      return {
        title: capitalizeFirst(String(t.title)).slice(0, 80),
        amount: Math.round(t.amount as number),
        kind,
        category: kind === 'transfer' ? '' : t.category ?? '',
        occurredAt: parseIsoDate(t.date),
        tags: (t.tags ?? []).map(normalizeTag).filter((tag) => known.has(tag)),
        accountId: accountId(t.account),
        toAccountId: kind === 'transfer' ? accountId(t.to_account) : null,
      };
    });
}

const TRANSFER_WITHOUT_ACCOUNTS = 'Entendí una transferencia, pero no supe entre qué cuentas. Regístrala con el botón Transferir del panel de cuentas.';

/**
 * What the phone can read by itself. A transfer between own accounts is recognized first, so
 * "retiré 80 mil de Davivienda" never becomes an expense.
 */
export function localDrafts(text: string, ctx: AiContext, now = new Date()): { drafts: DraftMovement[]; confident: boolean; warning?: string } {
  const guess = guessTransfer(text, ctx.accounts);
  if (guess.status === 'unresolved') return { drafts: [], confident: false, warning: guess.reason };
  if (guess.status === 'ok') {
    const parsed = parseFreeText(text, now);
    // One transfer has one amount; anything else is left to Gemini (or to the user).
    // (`confident` is false when the phrase carries a second amount or something else to read.)
    if (parsed.movements.length !== 1 || !parsed.confident) {
      return { drafts: [], confident: false, warning: 'Entendí una transferencia, pero la frase trae algo más. Dila sola, por ejemplo: "retiré 80 mil de Davivienda".' };
    }
    const m = parsed.movements[0];
    return {
      drafts: [{ title: guess.title, amount: m.amount, kind: 'transfer', occurredAt: m.occurredAt, accountId: guess.fromId, toAccountId: guess.toId }],
      confident: true,
    };
  }
  const paid = pickPaymentAccount(text, ctx.accounts);
  const parsed = parseFreeText(paid.text, now);
  return { drafts: parsed.movements.map((m) => ({ ...m, accountId: paid.accountId })), confident: parsed.confident };
}

/** Resolves the category with the layers in priority order and saves the movements. */
async function persist(
  db: SQLiteDatabase,
  listId: string,
  drafts: DraftMovement[],
  ctx: AiContext,
  source: TransactionSource,
): Promise<{ created: CreatedMovement[]; warning?: string }> {
  const created: CreatedMovement[] = [];
  let warning: string | undefined;
  const now = Date.now();
  for (const d of drafts) {
    if (d.kind === 'transfer') {
      // Saved only when both accounts are known; a transfer guessed as an expense would be worse than none.
      if (!d.accountId || !d.toAccountId || d.accountId === d.toAccountId) {
        warning = TRANSFER_WITHOUT_ACCOUNTS;
        continue;
      }
      const occurredAt = d.occurredAt ?? now;
      try {
        const id = await createTransaction(db, listId, {
          kind: 'transfer',
          amount: d.amount,
          currency: DEFAULT_CURRENCY,
          category_id: null,
          account_id: d.accountId,
          to_account_id: d.toAccountId,
          title: d.title,
          tags: d.tags ?? [],
          occurred_at: occurredAt,
          source,
        });
        created.push({ id, title: d.title, amount: d.amount, kind: 'transfer', categoryId: null, occurredAt });
      } catch (error) {
        // For example between currencies, where the amount that arrived is needed.
        warning = error instanceof Error ? error.message : TRANSFER_WITHOUT_ACCOUNTS;
      }
      continue;
    }
    const kind: Kind = d.kind;
    const ofKind = ctx.categories.filter((c) => c.kind === kind);
    const allowed = new Set(ofKind.map((c) => c.id));
    // 1. A rule the user asked to remember always wins over Gemini.
    let categoryId = matchRule(d.title, ctx.rules, allowed);
    // 2. Gemini's choice (already informed by preferences).
    if (!categoryId && d.category) {
      categoryId = ofKind.find((c) => normalize(c.name) === normalize(d.category ?? ''))?.id ?? null;
    }
    // 3. History and dictionary.
    if (!categoryId) categoryId = suggestLocally(d.title, kind, ctx.categories, ctx.rules, ctx.history)?.categoryId ?? null;

    const occurredAt = d.occurredAt ?? now;
    const id = await createTransaction(db, listId, {
      kind,
      amount: d.amount,
      currency: DEFAULT_CURRENCY,
      category_id: categoryId,
      account_id: d.accountId ?? null,
      title: d.title,
      tags: d.tags ?? [],
      occurred_at: occurredAt,
      source,
    });
    created.push({ id, title: d.title, amount: d.amount, kind, categoryId, occurredAt });
  }
  return { created, warning };
}

/** Typed phrase: local parser first, Gemini when the phrase is complex (and a key exists). */
export async function createFromText(db: SQLiteDatabase, listId: string, text: string): Promise<CaptureResult> {
  const ctx = await loadAiContext(db, listId);
  const local = localDrafts(text, ctx);
  const aiReady = await isAiConfigured();

  if (!local.confident && aiReady) {
    const { apiKey, model } = await credentials();
    const answer = await generateJson<ExtractionAnswer>({
      apiKey,
      model,
      system: extractionSystem(ctx, text),
      parts: [{ type: 'text', text }],
      schema: EXTRACTION_SCHEMA,
    });
    const drafts = draftsFromAnswer(answer, ctx);
    if (drafts.length === 0) throw new AiError('No encontré ningún monto en lo que escribiste.', 'format');
    return finishCapture(text, await persist(db, listId, drafts, ctx, 'manual'));
  }

  if (local.drafts.length === 0) {
    throw new AiError(
      local.warning ?? (aiReady ? 'No encontré ningún monto.' : 'No encontré ningún monto. Prueba con algo como "almuerzo 18 mil".'),
      'format',
    );
  }
  return finishCapture(text, await persist(db, listId, local.drafts, ctx, 'manual'));
}

/** Nothing saved and a reason why: that reason is the error. Otherwise it travels as a warning. */
function finishCapture(transcript: string, saved: { created: CreatedMovement[]; warning?: string }): CaptureResult {
  if (saved.created.length === 0) throw new AiError(saved.warning ?? 'No se pudo guardar ningún movimiento.', 'format');
  return { transcript, created: saved.created, warning: saved.warning };
}

/** Recorded audio: Gemini transcribes and extracts the movements in a single call. */
export async function createFromAudio(db: SQLiteDatabase, listId: string, uri: string): Promise<CaptureResult> {
  const { apiKey, model } = await credentials();
  const ctx = await loadAiContext(db, listId);
  const data = await new File(uri).base64();
  const answer = await generateJson<ExtractionAnswer>({
    apiKey,
    model,
    system: extractionSystem(ctx, ''),
    parts: [
      { type: 'text', text: 'Este es el audio del usuario. Transcríbelo y extrae los movimientos.' },
      { type: 'audio', data, mimeType: 'audio/m4a' },
    ],
    schema: EXTRACTION_SCHEMA,
  });
  const transcript = (answer.transcript ?? '').trim();
  const drafts = draftsFromAnswer(answer, ctx);
  if (drafts.length === 0) {
    throw new AiError(transcript ? `Escuché "${transcript}", pero no encontré ningún monto.` : 'No se escuchó nada. Intenta de nuevo.', 'format');
  }
  return finishCapture(transcript, await persist(db, listId, drafts, ctx, 'voice'));
}

// ---------- Chat ----------

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Summary of the list that the chat answers from: monthly totals, categories, budgets, recent movements. */
async function financialSummary(db: SQLiteDatabase, listId: string): Promise<string> {
  const [all, categories, budgets] = await Promise.all([
    listRecentTransactions(db, listId, 1500),
    listCategories(db, listId),
    listBudgets(db, listId),
  ]);
  // Transfers between the user's own accounts are not spending, and the chat gets nothing about
  // accounts: no names, no balances (privacy rule).
  const recent = all.filter((t) => t.kind !== 'transfer');
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const now = new Date();
  const lines: string[] = [];

  for (let back = 5; back >= 0; back--) {
    const start = new Date(now.getFullYear(), now.getMonth() - back, 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() - back + 1, 1).getTime();
    const rows = recent.filter((t) => t.occurred_at >= start && t.occurred_at < end);
    if (rows.length === 0) continue;
    const expense = rows.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
    const income = rows.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
    const byCategory = new Map<string, number>();
    for (const t of rows.filter((r) => r.kind === 'expense')) {
      const name = t.category_id ? names.get(t.category_id) ?? t.category_name ?? 'Sin categoría' : 'Sin categoría';
      byCategory.set(name, (byCategory.get(name) ?? 0) + t.amount);
    }
    const d = new Date(start);
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${formatMoney(v)}`).join(', ');
    lines.push(`${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}: gastos ${formatMoney(expense)}, ingresos ${formatMoney(income)}. Por categoría: ${top || '—'}`);
  }

  const budgetLines = budgets
    .filter((b) => names.has(b.category_id))
    .map((b) => `${names.get(b.category_id)}: ${formatMoney(b.amount)} al mes`);

  const movements = recent.slice(0, 80).map((t) => {
    const d = new Date(t.occurred_at);
    const tags = parseTags(t.tags).map((x) => `#${x}`).join(' ');
    // Bank notification / SMS titles can carry names or account data: send the category instead.
    const title = t.source === 'notification' || t.source === 'sms' ? (t.category_name ?? 'Movimiento') : t.title;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} | ${
      t.kind === 'income' ? '+' : '-'
    }${formatMoney(t.amount)} | ${t.category_name ?? 'Sin categoría'} | ${title}${tags ? ` | ${tags}` : ''}`;
  });

  return [
    todayLine(now),
    'Moneda: pesos colombianos (COP).',
    `Totales de los últimos meses:\n${lines.join('\n') || '(sin movimientos)'}`,
    budgetLines.length ? `Presupuestos mensuales:\n${budgetLines.join('\n')}` : 'Presupuestos: ninguno.',
    `Movimientos más recientes (fecha | monto | categoría | título | etiquetas):\n${movements.join('\n') || '(ninguno)'}`,
  ].join('\n\n');
}

export async function askChat(
  db: SQLiteDatabase,
  listId: string,
  history: ChatMessage[],
  question: string,
): Promise<string> {
  const { apiKey, model } = await credentials();
  const summary = await financialSummary(db, listId);
  const conversation = history
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.text}`)
    .join('\n');
  return generate({
    apiKey,
    model,
    system: [
      'Eres el asistente financiero de una app personal. Respondes en español de Colombia, corto y directo.',
      'Usa solo los datos que aparecen abajo. Si no alcanzan para responder, dilo.',
      'Escribe montos como $25.000. Responde en texto plano, sin Markdown, sin asteriscos ni tablas.',
      `Datos del usuario:\n${summary}`,
    ].join('\n\n'),
    parts: [{ type: 'text', text: `${conversation ? `Conversación hasta ahora:\n${conversation}\n\n` : ''}Usuario: ${question}` }],
  });
}

/** Checks that the key works, including JSON answers (the format voice and suggestions use). */
export async function testConnection(apiKey: string, model: string): Promise<void> {
  const answer = await generateJson<{ ok: boolean }>({
    apiKey,
    model,
    system: 'Responde con {"ok": true}.',
    parts: [{ type: 'text', text: 'ping' }],
    schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
  });
  if (typeof answer !== 'object' || answer === null) throw new AiError('Gemini respondió algo inesperado.', 'format');
}
