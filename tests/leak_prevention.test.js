import { describe, it, expect } from 'vitest';
import { SAMPLES } from '../src/samples.js';
import { detectRegex, mergeMatches, buildRedaction } from '../src/redact.js';
import { detectEntities, filterNanoEntities } from '../src/nano-entities.js';
import { restore } from '../src/restore.js';

describe('Leak Prevention & Sensitive String Assertions', () => {
  // Hand-written lists of known sensitive strings per sample
  const SAMPLE_1_SENSITIVE = [
    'Priya',
    '₹4,50,000',
    '5021-8834-2210',
    'Rahul Mehta',
    '98450 12345',
    'rahul.mehta@example.com'
  ];

  const SAMPLE_2_SENSITIVE = [
    'Apex Global Technologies Ltd.',
    '44 Residency Road',
    'Vikram Malhotra',
    'vikram.m@apextechnologies.com',
    '+91 98451 22334',
    'Rohan Sharma',
    'Flat 302, Palm Grove Apts',
    'Indiranagar',
    'rohan.sharma.dev@example.org',
    '+91 99887 76655',
    'ABCDE1234F',
    'Anita Desai',
    'anita.desai@apextechnologies.com',
    '₹3,75,000',
    '(Three Lakh Seventy-Five Thousand Indian Rupees)',
    '₹1,25,000',
    '4091-2283-9912',
    'HDFC Bank Ltd.',
    'HDFC0001234',
    '4821 9912 3014',
    '₹5,000',
    '₹50,000'
  ];

  const SAMPLE_4_SENSITIVE = [
    '+91 98450 12345',
    '(080) 4455 6677',
    '4111 1111 1111 1111',
    'ABCDE1234F',
    'Dr. Anita Rao',
    'Rao & Sons',
    '12 MG Road'
  ];

  it('asserts all known sensitive strings from Sample 1 are absent from redacted cloud payload', async () => {
    const text = SAMPLES.SAMPLE_1.text;

    // Mock NER runner for Sample 1
    const mockRunner = async () => ({
      text: JSON.stringify({
        entities: [
          { text: 'Priya', type: 'PERSON' },
          { text: 'Rahul Mehta', type: 'PERSON' }
        ]
      })
    });

    const regexMatches = detectRegex(text);
    const nanoMatches = await detectEntities(text, { modelRunner: mockRunner });
    const validNano = filterNanoEntities(nanoMatches, regexMatches);
    const merged = mergeMatches([regexMatches, validNano]);
    const { redactedText, map } = buildRedaction(text, merged);

    // 1. Assert hand-written sensitive strings are 100% absent from redactedText
    for (const secret of SAMPLE_1_SENSITIVE) {
      expect(redactedText).not.toContain(secret);
    }

    // 2. Assert no values stored in the secret map appear anywhere in redactedText
    map.forEach((secretVal) => {
      expect(redactedText).not.toContain(secretVal);
    });

    // 3. Verify clean round-trip restoration
    const restored = restore(redactedText, map);
    expect(restored).toBe(text);
  });

  it('asserts all known sensitive strings from Sample 2 (including spelled-out amounts and bank details) are absent from redacted cloud payload', async () => {
    const text = SAMPLES.SAMPLE_2.text;

    // Mock NER runner for Sample 2 representing typical Gemini Nano entity detection
    const mockRunner = async () => ({
      text: JSON.stringify({
        entities: [
          { text: 'Apex Global Technologies Ltd.', type: 'ORG' },
          { text: 'Vikram Malhotra', type: 'PERSON' },
          { text: '44 Residency Road, Bengaluru 560025', type: 'ADDRESS' },
          { text: 'Rohan Sharma', type: 'PERSON' },
          { text: 'Flat 302, Palm Grove Apts, Indiranagar, Bengaluru 560038', type: 'ADDRESS' },
          { text: 'Anita Desai', type: 'PERSON' },
          { text: 'HDFC Bank Ltd.', type: 'ORG' }
        ]
      })
    });

    const regexMatches = detectRegex(text);
    const nanoMatches = await detectEntities(text, { modelRunner: mockRunner });
    const validNano = filterNanoEntities(nanoMatches, regexMatches);
    const merged = mergeMatches([regexMatches, validNano]);
    const { redactedText, map } = buildRedaction(text, merged);

    // 1. Assert each sensitive string in hand-written list is absent from the cloud payload
    for (const secret of SAMPLE_2_SENSITIVE) {
      expect(redactedText).not.toContain(secret);
    }

    // 2. Assert all secrets in map are absent from cloud payload
    map.forEach((secretVal) => {
      expect(redactedText).not.toContain(secretVal);
    });

    // 3. Verify that spelled-out parenthesized amount is captured and absent
    expect(redactedText).not.toContain('(Three Lakh Seventy-Five Thousand Indian Rupees)');
    expect(redactedText).not.toContain('Three Lakh');
    expect(redactedText).not.toContain('4091-2283-9912');
    expect(redactedText).not.toContain('HDFC0001234');
    expect(redactedText).not.toContain('4821 9912 3014');

    // 4. Verify round-trip restoration
    const restored = restore(redactedText, map);
    expect(restored).toBe(text);
  });

  it('asserts all known sensitive strings from Sample 4 are absent from redacted cloud payload', async () => {
    const text = SAMPLES.SAMPLE_4.text;

    const mockRunner = async () => ({
      text: JSON.stringify({
        entities: [
          { text: 'Dr. Anita Rao', type: 'PERSON' },
          { text: 'Rao & Sons', type: 'ORG' },
          { text: '12 MG Road, Bengaluru 560001', type: 'ADDRESS' }
        ]
      })
    });

    const regexMatches = detectRegex(text);
    const nanoMatches = await detectEntities(text, { modelRunner: mockRunner });
    const validNano = filterNanoEntities(nanoMatches, regexMatches);
    const merged = mergeMatches([regexMatches, validNano]);
    const { redactedText, map } = buildRedaction(text, merged);

    for (const secret of SAMPLE_4_SENSITIVE) {
      expect(redactedText).not.toContain(secret);
    }

    map.forEach((secretVal) => {
      expect(redactedText).not.toContain(secretVal);
    });

    const restored = restore(redactedText, map);
    expect(restored).toBe(text);
  });
});
