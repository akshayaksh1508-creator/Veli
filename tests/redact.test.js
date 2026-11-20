import { describe, it, expect } from 'vitest';
import { detectRegex, mergeMatches, buildRedaction, luhnCheck } from '../src/redact.js';
import { restore } from '../src/restore.js';

describe('D1-T5: Regex Redaction Engine & Luhn Validation', () => {
  it('detects emails and assigns one placeholder used twice for identical values', () => {
    const text = 'Mail a@b.com and a@b.com';
    const matches = detectRegex(text);
    const { redactedText, map } = buildRedaction(text, matches);

    expect(map.size).toBe(1);
    expect(map.get('[EMAIL_1]')).toBe('a@b.com');
    expect(redactedText).toBe('Mail [EMAIL_1] and [EMAIL_1]');
  });

  it('detects currency amounts: ₹4,50,000 and Rs. 2,000', () => {
    const text = 'Pay ₹4,50,000 and Rs. 2,000';
    const matches = detectRegex(text);
    const { redactedText, map } = buildRedaction(text, matches);

    expect(map.size).toBe(2);
    expect(redactedText).toBe('Pay [AMOUNT_1] and [AMOUNT_2]');
  });

  it('detects valid credit card numbers with Luhn check', () => {
    const text = 'Card is 4111 1111 1111 1111';
    const matches = detectRegex(text);
    const { redactedText, map } = buildRedaction(text, matches);

    expect(map.get('[CARD_1]')).toBe('4111 1111 1111 1111');
    expect(redactedText).toBe('Card is [CARD_1]');
  });

  it('does not mark a number as a card if it fails the Luhn check', () => {
    const text = 'Fake card: 1234 5678 9012 3456';
    const matches = detectRegex(text);
    const { redactedText, map } = buildRedaction(text, matches);

    expect(map.has('[CARD_1]')).toBe(false);
    expect(redactedText).not.toContain('[CARD_1]');
  });

  it('leaves general order numbers like "Order number 123456" unchanged', () => {
    const text = 'Order number 123456';
    const matches = detectRegex(text);
    const { redactedText } = buildRedaction(text, matches);

    expect(redactedText).toBe('Order number 123456');
  });

  it('detects PAN numbers like ABCDE1234F', () => {
    const text = 'Tax PAN: ABCDE1234F';
    const matches = detectRegex(text);
    const { redactedText, map } = buildRedaction(text, matches);

    expect(map.get('[PAN_1]')).toBe('ABCDE1234F');
    expect(redactedText).toBe('Tax PAN: [PAN_1]');
  });

  it('resolves overlap when card number also matches the phone rule into a single [CARD_1]', () => {
    const text = 'Call 4111 1111 1111 1111';
    const matches = detectRegex(text);
    const merged = mergeMatches([matches]);
    const { redactedText, map } = buildRedaction(text, merged);

    expect(map.size).toBe(1);
    expect(map.has('[CARD_1]')).toBe(true);
    expect(redactedText).toBe('Call [CARD_1]');
  });

  it('round-trips buildRedaction then restore back to the exact original text', () => {
    const text = 'Contact Priya at priya@example.com, call +91 98450 12345, pay ₹4,50,000 for account 5021-8834-2210.';
    const matches = detectRegex(text);
    const merged = mergeMatches([matches]);
    const { redactedText, map } = buildRedaction(text, merged);

    // Verify zero original sensitive values in redacted text
    for (const [placeholder, raw] of map.entries()) {
      expect(redactedText).not.toContain(raw);
    }

    // Verify exact restoration
    const restored = restore(redactedText, map);
    expect(restored).toBe(text);
  });
});
