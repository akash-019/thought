/**
 * File: src/lib/search.ts
 *
 * Matching for the search boxes: case- and accent-insensitive "contains".
 */
const normalise = (text: string) =>
  text
    .normalize('NFD')
    // After NFD, accents become separate "combining" characters (U+0300 to U+036F); remove them.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** True if the query is empty, or any of the texts contains it ("sao" matches "São Paulo"). */
export function matches(query: string, ...texts: (string | null | undefined)[]): boolean {
  const q = normalise(query.trim());
  return !q || texts.some((t) => t && normalise(t).includes(q));
}
