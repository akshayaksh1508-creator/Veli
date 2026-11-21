import { describe, it, expect } from 'vitest';
import { detectRegex, mergeMatches, buildRedaction, luhnCheck } from '../src/redact.js';
import { restore } from '../src/restore.js';
import { SAMPLES } from '../src/samples.js';

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

describe('D2-T2: Merge Regex & Nano Matches and Build Placeholder Map', () => {
  it('keeps EMAIL type when Nano detects name inside email (e.g. priya@example.com)', () => {
    const text = 'Send contract to priya@example.com immediately.';
    const regexMatches = detectRegex(text);
    // Simulate Nano detecting "priya" as PERSON inside the email address
    const priyaIndex = text.indexOf('priya');
    const nanoMatches = [
      { start: priyaIndex, end: priyaIndex + 5, text: 'priya', type: 'PERSON' }
    ];

    const merged = mergeMatches([regexMatches, nanoMatches]);
    const { redactedText, map } = buildRedaction(text, merged);

    expect(map.size).toBe(1);
    expect(map.has('[EMAIL_1]')).toBe(true);
    expect(map.get('[EMAIL_1]')).toBe('priya@example.com');
    expect(map.has('[PERSON_1]')).toBe(false);
    expect(redactedText).toBe('Send contract to [EMAIL_1] immediately.');
  });

  it('keeps regex type when Nano returns an overlapping broad ADDRESS for phone or PAN', () => {
    const text = 'PAN is ABCDE1234F and phone is +91 98450 12345.';
    const regexMatches = detectRegex(text);
    // Simulate Nano returning ADDRESS for the phone number
    const phoneIdx = text.indexOf('+91 98450 12345');
    const nanoMatches = [
      { start: phoneIdx, end: phoneIdx + 15, text: '+91 98450 12345', type: 'ADDRESS' }
    ];

    const merged = mergeMatches([regexMatches, nanoMatches]);
    const { redactedText, map } = buildRedaction(text, merged);

    expect(map.has('[PHONE_1]')).toBe(true);
    expect(map.has('[ADDRESS_1]')).toBe(false);
    expect(redactedText).toContain('[PHONE_1]');
    expect(redactedText).toContain('[PAN_1]');
  });

  it('assigns one placeholder when same person appears with different casing ("Rahul Mehta" and "rahul mehta")', () => {
    const text = 'Rahul Mehta signed the contract. Please confirm with rahul mehta today.';
    // Simulate Nano detecting both mentions
    const idx1 = text.indexOf('Rahul Mehta');
    const idx2 = text.indexOf('rahul mehta');
    const nanoMatches = [
      { start: idx1, end: idx1 + 'Rahul Mehta'.length, text: 'Rahul Mehta', type: 'PERSON' },
      { start: idx2, end: idx2 + 'rahul mehta'.length, text: 'rahul mehta', type: 'PERSON' }
    ];

    const merged = mergeMatches([nanoMatches]);
    const { redactedText, map } = buildRedaction(text, merged);

    // Only one placeholder [PERSON_1] should be created
    expect(map.size).toBe(1);
    expect(map.has('[PERSON_1]')).toBe(true);
    expect(map.has('[PERSON_2]')).toBe(false);
    expect(redactedText).toBe('[PERSON_1] signed the contract. Please confirm with [PERSON_1] today.');
  });

  it('round trips Sample 2 (Freelance Contract) back to exact original text', () => {
    const text = SAMPLES.SAMPLE_2.text;
    const regexMatches = detectRegex(text);

    // Simulate Nano detecting key entities from Sample 2
    const nanoMatches = [
      { start: text.indexOf('Apex Global Technologies Ltd.'), end: text.indexOf('Apex Global Technologies Ltd.') + 29, text: 'Apex Global Technologies Ltd.', type: 'ORG' },
      { start: text.indexOf('Vikram Malhotra'), end: text.indexOf('Vikram Malhotra') + 15, text: 'Vikram Malhotra', type: 'PERSON' },
      { start: text.indexOf('Rohan Sharma'), end: text.indexOf('Rohan Sharma') + 12, text: 'Rohan Sharma', type: 'PERSON' },
      { start: text.indexOf('Anita Desai'), end: text.indexOf('Anita Desai') + 11, text: 'Anita Desai', type: 'PERSON' }
    ];

    const merged = mergeMatches([regexMatches, nanoMatches]);
    const { redactedText, map } = buildRedaction(text, merged);

    // Verify all sensitive elements are replaced
    expect(redactedText).toContain('[ORG_1]');
    expect(redactedText).toContain('[PERSON_1]');
    expect(redactedText).toContain('[AMOUNT_1]');
    expect(redactedText).toContain('[EMAIL_1]');
    expect(redactedText).not.toContain('ABCDE1234F');
    expect(redactedText).not.toContain('4091-2283-9912');

    // Verify exact round trip restoration
    const restored = restore(redactedText, map);
    expect(restored).toBe(text);
  });
});
