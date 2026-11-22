import { describe, it, expect } from 'vitest';
import { analyzeWithCloud, computePayloadHash } from '../src/cloud-analysis.js';
import { detectRegex, mergeMatches, buildRedaction } from '../src/redact.js';
import { SAMPLES } from '../src/samples.js';

// Strings a human knows are sensitive in each sample. Hand-written on purpose:
// verifyZeroLeakage only checks values the redactor already caught.
const STRUCTURED = {
  SAMPLE_1: ['5021-8834-2210', '98450 12345', 'rahul.mehta@example.com', '4,50,000'],
  SAMPLE_2: [
    'vikram.m@apextechnologies.com', '+91 98451 22334', 'rohan.sharma.dev@example.org',
    '+91 99887 76655', 'ABCDE1234F', 'anita.desai@apextechnologies.com',
    '3,75,000', 'Three Lakh Seventy-Five Thousand', '1,25,000', '4091-2283-9912'
  ]
};
const NAMES = {
  SAMPLE_1: ['Meera Nair', 'Rahul Mehta', 'Priya'],
  SAMPLE_2: ['Vikram Malhotra', 'Rohan Sharma', 'Anita Desai', 'Apex Global Technologies', 'HDFC Bank Ltd.', '44 Residency Road', 'Flat 302, Palm Grove Apts']
};

function manualMatches(text, strings, type) {
  const out = [];
  for (const s of strings) {
    let i = text.indexOf(s);
    while (i !== -1) { out.push({ start: i, end: i + s.length, text: s, type }); i = text.indexOf(s, i + s.length); }
  }
  return out;
}
const norm = (t) => t.replace(/\r/g, '');

describe('Known sensitive strings never reach the dispatched prompt', () => {
  for (const key of Object.keys(STRUCTURED)) {
    it(`${key}: regex layer alone hides every structured value`, () => {
      const text = norm(SAMPLES[key].text);
      const { redactedText } = buildRedaction(text, mergeMatches([detectRegex(text)]));
      for (const s of STRUCTURED[key]) expect(redactedText).not.toContain(s);
    });

    it(`${key}: regex + entity matches hide names, orgs and addresses too`, async () => {
      const text = norm(SAMPLES[key].text);
      const entities = manualMatches(text, NAMES[key], 'PERSON');
      const { redactedText, map } = buildRedaction(text, mergeMatches([detectRegex(text), entities]));

      let dispatched = null;
      await analyzeWithCloud(redactedText, map, {
        cloudRunner: async (prompt) => { dispatched = prompt; return { text: 'ok '.repeat(10), ms: 1, backend: 'cloud' }; }
      });

      for (const s of [...STRUCTURED[key], ...NAMES[key]]) expect(dispatched).not.toContain(s);
    });
  }
});

describe('Dispatched prompt verification', () => {
  it('returns the exact prompt passed to the model and a hash of the redacted text', async () => {
    const redacted = 'Pay [AMOUNT_1] to [PERSON_1] by 15 Jan.';
    const map = new Map([['[AMOUNT_1]', '₹1,000'], ['[PERSON_1]', 'Asha']]);
    let seen = null;
    const res = await analyzeWithCloud(redacted, map, {
      cloudRunner: async (prompt) => { seen = prompt; return { text: 'Summary: [PERSON_1] pays [AMOUNT_1].', ms: 1, backend: 'cloud' }; }
    });
    expect(res.promptDispatched).toBe(seen);
    expect(seen).toContain(redacted);
    expect(res.payloadHash).toBe(await computePayloadHash(redacted));
  });

  it('a tampered display string is not contained in the dispatched prompt', async () => {
    const redacted = 'Pay [AMOUNT_1] to [PERSON_1].';
    const map = new Map([['[AMOUNT_1]', '₹1,000'], ['[PERSON_1]', 'Asha']]);
    const res = await analyzeWithCloud(redacted, map, {
      cloudRunner: async () => ({ text: 'Result: [PERSON_1] pays [AMOUNT_1].', ms: 1, backend: 'cloud' })
    });
    expect(res.promptDispatched.includes(redacted)).toBe(true);
    expect(res.promptDispatched.includes('Pay [AMOUNT_1] to Asha.')).toBe(false);
  });
});
