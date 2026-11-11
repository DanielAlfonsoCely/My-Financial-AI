// Text helpers shared by search, tags and the local categorizer.

const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e', í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o', ú: 'u', ù: 'u', ü: 'u', û: 'u', ç: 'c',
};

/**
 * "Café  McDonald's!" -> "cafe mcdonalds" (lowercase, no accents, no punctuation). Keeps ñ.
 * Uses a small map instead of String.normalize so it does not depend on the engine's Intl support.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áàäâéèëêíìïîóòöôúùüûç]/g, (c) => ACCENTS[c] ?? c)
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'en', 'y', 'a', 'al', 'con', 'por',
  'para', 'mi', 'mis', 'me', 'se', 'que', 'lo', 'le', 'su', 'sus', 'es', 'o', 'pesos', 'peso', 'mil',
  'gaste', 'pague', 'compre', 'hoy', 'ayer', 'mas', 'tambien',
]);

/**
 * Meaningful words of a phrase, plus each pair of neighbors glued together so that
 * "mc donalds" and "mcdonalds" produce a common keyword.
 */
export function keywords(text: string): string[] {
  const words = normalize(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const glued = words.slice(0, -1).map((w, i) => w + words[i + 1]);
  return [...new Set([...words, ...glued])];
}

/** True if every word of `query` appears somewhere in `haystack` (accent-insensitive). */
export function matchesAllWords(haystack: string, query: string): boolean {
  const target = normalize(haystack);
  return normalize(query)
    .split(' ')
    .filter(Boolean)
    .every((word) => target.includes(word));
}

export function capitalizeFirst(text: string): string {
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
