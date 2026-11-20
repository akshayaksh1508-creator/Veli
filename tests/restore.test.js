import { describe, it, expect } from 'vitest';
import { restore, validatePlaceholders } from '../src/restore.js';

describe('Restoration and Placeholder Validation', () => {
  it('restores bracketed placeholders accurately', () => {
    const map = new Map([
      ['[PERSON_1]', 'Priya'],
      ['[AMOUNT_1]', '₹4,50,000']
    ]);
    const answer = '[PERSON_1] must pay [AMOUNT_1].';
    const restored = restore(answer, map);

    expect(restored).toBe('Priya must pay ₹4,50,000.');
  });

  it('restores unbracketed placeholders when the model drops brackets', () => {
    const map = new Map([
      ['[PERSON_1]', 'Priya'],
      ['[AMOUNT_1]', '₹4,50,000']
    ]);
    const answer = 'PERSON_1 must pay AMOUNT_1.';
    const restored = restore(answer, map);

    expect(restored).toBe('Priya must pay ₹4,50,000.');
  });

  it('detects unknown / hallucinated placeholders', () => {
    const map = new Map([
      ['[PERSON_1]', 'Priya']
    ]);
    const answer = '[PERSON_1] and [PERSON_9] must sign.';
    const validation = validatePlaceholders(answer, map);

    expect(validation.ok).toBe(false);
    expect(validation.unknown).toEqual(['[PERSON_9]']);
  });
});
