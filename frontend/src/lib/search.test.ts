/**
 * File: src/lib/search.test.ts
 *
 * Tests: search matching ignores case and accents, and an empty search matches everything.
 */
import { describe, expect, it } from 'vitest';
import { matches } from './search';

describe('matches', () => {
  it('matches part of any text, ignoring case', () => {
    expect(matches('anx', 'Dr Maya', 'Counsellor for anxiety')).toBe(true);
    expect(matches('KOLKATA', 'Arjun', 'Kolkata')).toBe(true);
    expect(matches('berlin', 'Arjun', 'Kolkata')).toBe(false);
  });

  it('ignores accents', () => {
    expect(matches('sao paulo', 'America/Sao_Paulo'.replace('_', ' '))).toBe(true);
    expect(matches('jose', 'José Ramírez')).toBe(true);
  });

  it('an empty or blank search matches everything; missing texts are skipped', () => {
    expect(matches('', 'anything')).toBe(true);
    expect(matches('   ', 'anything')).toBe(true);
    expect(matches('x', null, undefined)).toBe(false);
  });
});
