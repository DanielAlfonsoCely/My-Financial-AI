// Tags are stored without '#', lowercase and without spaces, like MonAi ("ropa de verano" -> "ropadeverano").

export const MAX_TAG_LENGTH = 30;

export function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/#/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9áéíóúüñ_-]/g, '')
    .slice(0, MAX_TAG_LENGTH);
}

/** Safe parse of the JSON column. Bad data becomes an empty list instead of crashing a screen. */
export function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((t): t is string => typeof t === 'string').map(normalizeTag).filter(Boolean))];
  } catch {
    return [];
  }
}

export function serializeTags(tags: string[]): string {
  return JSON.stringify([...new Set(tags.map(normalizeTag).filter(Boolean))]);
}
