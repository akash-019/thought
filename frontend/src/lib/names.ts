/**
 * File: src/lib/names.ts
 *
 * Small helpers for showing people's names.
 */
const TITLES = /^(dr|mr|mrs|ms|mx|prof)\.?$/i;

/** "Dr Maya Lindqvist" -> "Maya" (titles are skipped). */
export function firstName(fullName: string): string {
  return fullName.split(/\s+/).find((word) => word && !TITLES.test(word)) ?? fullName;
}

/** "Dr Maya Lindqvist" -> "ML", for the round avatar. */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word) && !TITLES.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
