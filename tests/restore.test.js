import { describe, it, expect } from 'vitest';
import { restore, validatePlaceholders } from '../src/restore.js';

describe('D2-T3: Restoration and Placeholder Validation', () => {
  const map = new Map([
    ['[PERSON_1]', 'Priya'],
    ['[AMOUNT_1]', '₹4,50,000'],
    ['[ACCOUNT_1]', '5021-8834-2210']
  ]);

  it('restores bracketed placeholders accurately ([PERSON_1] must pay [AMOUNT_1])', () => {
    const answer = '[PERSON_1] must pay [AMOUNT_1].';
    const restored = restore(answer, map);
    expect(restored).toBe('Priya must pay ₹4,50,000.');
  });

  it('restores unbracketed placeholders (PERSON_1 must pay)', () => {
    const answer = 'PERSON_1 must pay AMOUNT_1.';
    const restored = restore(answer, map);
    expect(restored).toBe('Priya must pay ₹4,50,000.');
  });

  it('reports [PERSON_9] in unknown and leaves it unreplaced', () => {
    const answer = '[PERSON_1] must pay [AMOUNT_1], but [PERSON_9] will guarantee it.';
    const validation = validatePlaceholders(answer, map);

    expect(validation.ok).toBe(false);
    expect(validation.unknown).toEqual(['[PERSON_9]']);

    // Assert that unknown placeholder remains unreplaced in restored text
    const restored = restore(answer, map);
    expect(restored).toContain('[PERSON_9]');
    expect(restored).toBe('Priya must pay ₹4,50,000, but [PERSON_9] will guarantee it.');
  });

  it('reports omitted [ACCOUNT_1] in missing as informational', () => {
    const answer = '[PERSON_1] must pay [AMOUNT_1].';
    const validation = validatePlaceholders(answer, map);

    expect(validation.ok).toBe(true);
    expect(validation.unknown).toEqual([]);
    expect(validation.missing).toEqual(['[ACCOUNT_1]']);
  });

  it('restores possessive placeholder intact ([PERSON_1]\'s)', () => {
    const answer = "[PERSON_1]'s total liability is [AMOUNT_1].";
    const restored = restore(answer, map);
    expect(restored).toBe("Priya's total liability is ₹4,50,000.");
  });

  it('handles case-tolerant placeholders (e.g. [person_1] and person_1)', () => {
    const answer = '[person_1] owes amount_1.';
    const restored = restore(answer, map);
    expect(restored).toBe('Priya owes ₹4,50,000.');
  });
});
