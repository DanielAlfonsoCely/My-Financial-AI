// Local category suggestion ("Mejoras de IA", layers 1 and 2). No network.
//   1. Rules the user asked to remember (ai_rules), matched by keywords.
//   2. History: what this list did with similar titles before (implicit learning).
//   3. A Colombian keyword dictionary matched against the names of the list's categories.
// Gemini (layer 3) is only asked when none of these is confident; see pipeline.ts.

import type { AiRule, Category, Kind } from '../db/types';
import { keywords, normalize } from '../lib/text';

export type SuggestionSource = 'rule' | 'history' | 'dictionary' | 'ai';

export interface CategorySuggestion {
  categoryId: string;
  source: SuggestionSource;
}

export interface HistoryItem {
  title: string;
  categoryId: string | null;
  kind: Kind;
}

/** Words common enough that matching only on them would be a guess. */
const GENERIC = new Set(['combo', 'plan', 'pago', 'compra', 'cuota', 'factura', 'servicio', 'pedido', 'recarga', 'mes']);

function strongOverlap(a: string[], b: string[]): { matched: string[]; strong: boolean } {
  const setB = new Set(b);
  const matched = a.filter((w) => setB.has(w));
  const strong = matched.some((w) => w.length >= 5 && !GENERIC.has(w));
  return { matched, strong };
}

function safeKeywords(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === 'string') : [];
  } catch {
    return [];
  }
}

/** Layer 1: user rules. Newest rule wins on ties (rules come sorted newest first). */
export function matchRule(title: string, rules: AiRule[], allowed: Set<string>): string | null {
  const words = keywords(title);
  let best: { id: string; score: number } | null = null;
  for (const rule of rules) {
    if (!allowed.has(rule.category_id)) continue;
    const ruleWords = safeKeywords(rule.keywords);
    // Glued pairs ("combomcdonalds") help matching but should not dilute the score.
    const base = ruleWords.filter((w, i, all) => !all.some((o, k) => k !== i && o.length < w.length && w.startsWith(o) && all.includes(w.slice(o.length))));
    if (base.length === 0) continue;
    const { matched, strong } = strongOverlap(ruleWords, words);
    const score = matched.filter((w) => base.includes(w)).length / base.length;
    if ((strong || score >= 0.6) && (!best || score > best.score)) best = { id: rule.category_id, score };
  }
  return best?.id ?? null;
}

/** Layer 2: the most frequent category among past transactions with a similar title. */
export function matchHistory(title: string, kind: Kind, history: HistoryItem[], allowed: Set<string>): string | null {
  const target = normalize(title);
  if (!target) return null;
  const words = keywords(title);
  const votes = new Map<string, number>();
  for (const h of history) {
    if (h.kind !== kind || !h.categoryId || !allowed.has(h.categoryId)) continue;
    const other = normalize(h.title);
    let weight = 0;
    if (other === target) weight = 3;
    else if (strongOverlap(words, keywords(h.title)).strong) weight = 1;
    if (weight) votes.set(h.categoryId, (votes.get(h.categoryId) ?? 0) + weight);
  }
  let best: [string, number] | null = null;
  for (const entry of votes) if (!best || entry[1] > best[1]) best = entry;
  // One identical title (weight 3), or two similar ones, is enough evidence.
  return best && best[1] >= 2 ? best[0] : null;
}

/** Layer 3 (local): keywords → words that usually appear in the category name. */
const DICTIONARY: { words: string[]; targets: string[]; kind: Kind }[] = [
  {
    kind: 'expense',
    targets: ['domicilio', 'domicilios'],
    words: ['domicilio', 'domicilios', 'rappi', 'ifood', 'didifood', 'pedido'],
  },
  {
    kind: 'expense',
    targets: ['comer afuera', 'restaurante', 'comida', 'salidas'],
    words: [
      'hamburguesa', 'burger', 'pizza', 'almuerzo', 'desayuno', 'cena', 'comida', 'restaurante', 'cafe', 'tinto',
      'empanada', 'empanadas', 'arepa', 'mcdonalds', 'kfc', 'frisby', 'crepes', 'corral', 'subway', 'sushi', 'helado',
      'postre', 'cerveza', 'cervezas', 'bar', 'pollo', 'perro caliente', 'salchipapa', 'jugo', 'panaderia', 'onces',
      'juan valdez', 'starbucks', 'oma', 'dominos', 'papas',
    ],
  },
  {
    kind: 'expense',
    targets: ['mercado', 'compras', 'supermercado'],
    words: [
      'mercado', 'supermercado', 'd1', 'ara', 'exito', 'jumbo', 'carulla', 'olimpica', 'makro', 'isimo', 'tienda',
      'verduras', 'fruta', 'frutas', 'leche', 'huevos', 'pan', 'carne', 'pollo crudo', 'aseo', 'viveres',
    ],
  },
  {
    kind: 'expense',
    targets: ['transporte', 'auto', 'carro', 'gasolina', 'moto'],
    words: [
      'gasolina', 'tanqueo', 'tanquear', 'terpel', 'primax', 'texaco', 'uber', 'didi', 'taxi', 'cabify', 'indriver',
      'transmilenio', 'sitp', 'bus', 'buseta', 'peaje', 'parqueadero', 'parqueo', 'soat', 'llanta', 'taller',
      'tecnomecanica', 'pasaje', 'mio', 'metro de medellin',
    ],
  },
  {
    kind: 'expense',
    targets: ['hogar', 'casa', 'arriendo', 'vivienda'],
    words: ['arriendo', 'administracion', 'muebles', 'ferreteria', 'homecenter', 'easy', 'decoracion', 'cortinas'],
  },
  {
    kind: 'expense',
    targets: ['plan celular', 'celular'],
    words: ['plan datos', 'plandatos', 'datos', 'minutos', 'recarga celular'],
  },
  {
    kind: 'expense',
    targets: ['servicios', 'plan celular', 'celular', 'internet'],
    words: [
      'luz', 'agua', 'gas', 'internet', 'enel', 'codensa', 'epm', 'vanti', 'acueducto', 'claro', 'movistar', 'tigo',
      'wom', 'etb', 'celular', 'recarga', 'energia', 'servicios',
    ],
  },
  {
    kind: 'expense',
    targets: ['salud', 'gimnasio', 'farmacia'],
    words: [
      'drogueria', 'farmacia', 'medicina', 'medicamento', 'medicamentos', 'eps', 'cita', 'medico', 'doctor',
      'odontologo', 'dentista', 'gimnasio', 'gym', 'smartfit', 'bodytech', 'suplementos', 'proteina', 'examen',
      'laboratorio', 'cruz verde', 'cafam', 'colsubsidio',
    ],
  },
  {
    kind: 'expense',
    targets: ['ropa', 'vestuario'],
    words: [
      'ropa', 'camisa', 'camiseta', 'pantalon', 'jean', 'jeans', 'zapatos', 'tenis', 'gorra', 'chaqueta', 'vestido',
      'buzo', 'medias', 'zara', 'h&m', 'koaj', 'arturo calle', 'studio f', 'bershka',
    ],
  },
  {
    kind: 'expense',
    targets: ['suscripciones', 'suscripcion', 'streaming'],
    words: [
      'netflix', 'spotify', 'disney', 'hbo', 'max', 'prime', 'youtube', 'icloud', 'chatgpt', 'suscripcion', 'crunchyroll',
      'apple', 'google one', 'xbox', 'playstation plus', 'canva',
    ],
  },
  {
    kind: 'expense',
    targets: ['entretenimiento', 'ocio', 'diversion', 'salidas'],
    words: ['cine', 'cinecolombia', 'cinemark', 'procinal', 'concierto', 'fiesta', 'rumba', 'discoteca', 'juego', 'videojuego', 'steam', 'boleta', 'boletas', 'teatro', 'bolos'],
  },
  {
    kind: 'expense',
    targets: ['educacion', 'estudio', 'universidad'],
    words: ['universidad', 'matricula', 'semestre', 'curso', 'libro', 'libros', 'colegio', 'udemy', 'platzi', 'fotocopias', 'cuaderno', 'icfes'],
  },
  {
    kind: 'expense',
    targets: ['mascotas', 'mascota'],
    words: ['veterinario', 'veterinaria', 'concentrado', 'mascota', 'gato', 'purina', 'dog chow', 'arena gato', 'peluqueria canina'],
  },
  {
    kind: 'expense',
    targets: ['lujo', 'regalos', 'tecnologia'],
    words: ['joya', 'reloj', 'perfume', 'joyeria'],
  },
  {
    kind: 'expense',
    targets: ['tecnologia', 'tecnologia'],
    words: ['audifonos', 'computador', 'portatil', 'mouse', 'teclado', 'cargador', 'tablet', 'iphone', 'samsung', 'ktronix', 'alkosto'],
  },
  {
    kind: 'income',
    targets: ['salario', 'sueldo', 'nomina', 'trabajo'],
    words: ['salario', 'sueldo', 'nomina', 'quincena', 'prima', 'comisiones', 'comision', 'bono', 'honorarios'],
  },
  {
    kind: 'income',
    targets: ['otros ingresos', 'ingresos', 'ventas', 'extra'],
    words: ['transferencia', 'consignacion', 'venta', 'vendi', 'devolucion', 'reembolso', 'regalo', 'intereses', 'cashback'],
  },
];

export function matchDictionary(title: string, kind: Kind, categories: Category[]): string | null {
  const text = ` ${normalize(title)} `;
  const words = new Set(keywords(title));
  for (const entry of DICTIONARY) {
    if (entry.kind !== kind) continue;
    const hit = entry.words.some((w) => (w.includes(' ') ? text.includes(` ${w} `) : words.has(w)));
    if (!hit) continue;
    for (const target of entry.targets) {
      const category = categories.find((c) => c.kind === kind && normalize(c.name) === target)
        ?? categories.find((c) => c.kind === kind && normalize(c.name).includes(target));
      if (category) return category.id;
    }
  }
  return null;
}

/** Runs layers 1–3 locally. Returns null when nothing is reliable enough. */
export function suggestLocally(
  title: string,
  kind: Kind,
  categories: Category[],
  rules: AiRule[],
  history: HistoryItem[],
): CategorySuggestion | null {
  if (!title.trim()) return null;
  const ofKind = categories.filter((c) => c.kind === kind);
  const allowed = new Set(ofKind.map((c) => c.id));
  const rule = matchRule(title, rules, allowed);
  if (rule) return { categoryId: rule, source: 'rule' };
  const past = matchHistory(title, kind, history, allowed);
  if (past) return { categoryId: past, source: 'history' };
  const dictionary = matchDictionary(title, kind, ofKind);
  if (dictionary) return { categoryId: dictionary, source: 'dictionary' };
  return null;
}
