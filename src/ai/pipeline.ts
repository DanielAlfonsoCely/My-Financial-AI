// High-level AI features used by the screens. Everything goes through here so the provider can be
// swapped later without touching the UI (today it is Gemini, see gemini.ts).
//
// Privacy (see project rules): Gemini only receives phrases, titles, amounts, dates, category and tag
// names. Never account numbers, balances, names of people or raw bank notifications.

import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createTransaction, listAiRules, listBudgets, listCategories, listRecentTransactions, listTags } from '../db/repo';
import type { AiRule, Category, Kind, TransactionSource } from '../db/types';
import { startOfDay, withCurrentTime } from '../lib/dates';
import { DEFAULT_CURRENCY, formatMoney } from '../lib/money';
import { normalizeTag, parseTags } from '../lib/tags';
import { capitalizeFirst, normalize } from '../lib/text';
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
}

export async function loadAiContext(db: SQLiteDatabase, listId: string): Promise<AiContext> {
  const [categories, rules, recent, tags] = await Promise.all([
    listCategories(db, listId),
    listAiRules(db, listId),
    listRecentTransactions(db, listId, 400),
    listTags(db, listId),
  ]);
  return {
    categories,
    rules,
    // Titles that came from bank notifications or SMS are never sent to Gemini.
    history: recent
      .filter((t) => t.source !== 'notification' && t.source !== 'sms')
      .map((t) => ({ title: t.title, categoryId: t.category_id, kind: t.kind })),
    tags: tags.map((t) => t.name),
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
  kind: Kind;
  categoryId: string | null;
  occurredAt: number;
}

export interface CaptureResult {
  transcript: string;
  created: CreatedMovement[];
}

interface DraftMovement {
  title: string;
  amount: number;
  kind: Kind;
  /** Category name proposed by Gemini, if any. */
  category?: string;
  occurredAt: number | null;
  tags?: string[];
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
          kind: { type: 'string', enum: ['expense', 'income'] },
          category: { type: 'string', description: 'Nombre exacto de una categoría de la lista, o vacío.' },
          date: { type: 'string', description: 'Fecha YYYY-MM-DD.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Solo etiquetas existentes que el usuario mencionó.' },
        },
        required: ['title', 'amount', 'kind', 'category', 'date', 'tags'],
      },
    },
  },
  required: ['transcript', 'transactions'],
};

interface ExtractionAnswer {
  transcript?: string;
  transactions?: { title?: string; amount?: number; kind?: string; category?: string; date?: string; tags?: string[] }[];
}

function extractionSystem(ctx: AiContext, text: string): string {
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
  return (answer.transactions ?? [])
    .filter((t) => Number.isFinite(t.amount) && (t.amount as number) > 0 && typeof t.title === 'string')
    .slice(0, 10)
    .map((t) => ({
      title: capitalizeFirst(String(t.title)).slice(0, 80),
      amount: Math.round(t.amount as number),
      kind: t.kind === 'income' ? 'income' : 'expense',
      category: t.category ?? '',
      occurredAt: parseIsoDate(t.date),
      tags: (t.tags ?? []).map(normalizeTag).filter((tag) => known.has(tag)),
    }));
}

/** Resolves the category with the layers in priority order and saves the movements. */
async function persist(
  db: SQLiteDatabase,
  listId: string,
  drafts: DraftMovement[],
  ctx: AiContext,
  source: TransactionSource,
): Promise<CreatedMovement[]> {
  const created: CreatedMovement[] = [];
  const now = Date.now();
  for (const d of drafts) {
    const ofKind = ctx.categories.filter((c) => c.kind === d.kind);
    const allowed = new Set(ofKind.map((c) => c.id));
    // 1. A rule the user asked to remember always wins over Gemini.
    let categoryId = matchRule(d.title, ctx.rules, allowed);
    // 2. Gemini's choice (already informed by preferences).
    if (!categoryId && d.category) {
      categoryId = ofKind.find((c) => normalize(c.name) === normalize(d.category ?? ''))?.id ?? null;
    }
    // 3. History and dictionary.
    if (!categoryId) categoryId = suggestLocally(d.title, d.kind, ctx.categories, ctx.rules, ctx.history)?.categoryId ?? null;

    const occurredAt = d.occurredAt ?? now;
    const id = await createTransaction(db, listId, {
      kind: d.kind,
      amount: d.amount,
      currency: DEFAULT_CURRENCY,
      category_id: categoryId,
      title: d.title,
      tags: d.tags ?? [],
      occurred_at: occurredAt,
      source,
    });
    created.push({ id, title: d.title, amount: d.amount, kind: d.kind, categoryId, occurredAt });
  }
  return created;
}

/** Typed phrase: local parser first, Gemini when the phrase is complex (and a key exists). */
export async function createFromText(db: SQLiteDatabase, listId: string, text: string): Promise<CaptureResult> {
  const ctx = await loadAiContext(db, listId);
  const local = parseFreeText(text);
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
    return { transcript: text, created: await persist(db, listId, drafts, ctx, 'manual') };
  }

  if (local.movements.length === 0) {
    throw new AiError(
      aiReady ? 'No encontré ningún monto.' : 'No encontré ningún monto. Prueba con algo como "almuerzo 18 mil".',
      'format',
    );
  }
  return { transcript: text, created: await persist(db, listId, local.movements, ctx, 'manual') };
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
  return { transcript, created: await persist(db, listId, drafts, ctx, 'voice') };
}

// ---------- Chat ----------

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Summary of the list that the chat answers from: monthly totals, categories, budgets, recent movements. */
async function financialSummary(db: SQLiteDatabase, listId: string): Promise<string> {
  const [recent, categories, budgets] = await Promise.all([
    listRecentTransactions(db, listId, 1500),
    listCategories(db, listId),
    listBudgets(db, listId),
  ]);
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
