/**
 * File: src/lib/names.test.ts
 *
 * Tests: first names and initials skip titles like "Dr".
 */
import { describe, expect, it } from 'vitest';
import { firstName, initials } from './names';

describe('names', () => {
  it('first name skips titles', () => {
    expect(firstName('Dr Maya Lindqvist')).toBe('Maya');
    expect(firstName('Arjun Mehta')).toBe('Arjun');
    expect(firstName('Prof. Ana Lima')).toBe('Ana');
  });

  it('initials use the first two real name words', () => {
    expect(initials('Dr Maya Lindqvist')).toBe('ML');
    expect(initials('Sam Taylor')).toBe('ST');
    expect(initials('Cher')).toBe('C');
  });
});
