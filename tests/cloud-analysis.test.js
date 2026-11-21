import { describe, it, expect, vi } from 'vitest';
import { verifyZeroLeakage, analyzeWithCloud } from '../src/cloud-analysis.js';
import { detectRegex, mergeMatches, buildRedaction } from '../src/redact.js';
import { locateAllOccurrences } from '../src/nano-entities.js';
import { SAMPLES } from '../src/samples.js';

describe('D2-T4: Cloud Analysis Prompt & Retry Logic', () => {
  describe('1. Outgoing Payload Leakage Verification', () => {
    it('detects and flags any raw secret found in outgoing payload', () => {
      const map = new Map([
        ['[PERSON_1]', 'Rohan Sharma'],
        ['[AMOUNT_1]', '₹3,75,000']
      ]);
      const leakingPayload = 'Agreement with Rohan Sharma for [AMOUNT_1].';
      const check = verifyZeroLeakage(leakingPayload, map);

      expect(check.leakFree).toBe(false);
      expect(check.leakedSecrets).toEqual([
        { placeholder: '[PERSON_1]', secret: 'Rohan Sharma' }
      ]);
    });

    it('confirms leak-free payload when all secrets are cleanly replaced by tokens', () => {
      const map = new Map([
        ['[PERSON_1]', 'Rohan Sharma'],
        ['[AMOUNT_1]', '₹3,75,000']
      ]);
      const cleanPayload = 'Agreement with [PERSON_1] for [AMOUNT_1].';
      const check = verifyZeroLeakage(cleanPayload, map);

      expect(check.leakFree).toBe(true);
      expect(check.leakedSecrets).toEqual([]);
    });

    it('asserts ZERO secrets from Sample 2 appear in the outgoing redacted payload', () => {
      const text = SAMPLES.SAMPLE_2.text;
      const regexMatches = detectRegex(text);
      // Locate all recurring mentions of named entities using locateAllOccurrences
      const nanoMatches = [
        ...locateAllOccurrences('Vikram Malhotra', text, 'PERSON'),
        ...locateAllOccurrences('Rohan Sharma', text, 'PERSON'),
        ...locateAllOccurrences('Anita Desai', text, 'PERSON'),
        ...locateAllOccurrences('Apex Global Technologies Ltd.', text, 'ORG'),
        ...locateAllOccurrences('HDFC Bank Ltd.', text, 'ORG')
      ];

      const merged = mergeMatches([regexMatches, nanoMatches]);
      const { redactedText, map } = buildRedaction(text, merged);

      // Automated assertion: no map value may appear in the outgoing payload
      const leakCheck = verifyZeroLeakage(redactedText, map);
      expect(leakCheck.leakFree).toBe(true);
      expect(leakCheck.leakedSecrets).toEqual([]);

      // Explicit spot checks for Sample 2 secrets
      for (const [, secret] of map.entries()) {
        expect(redactedText).not.toContain(secret);
      }
    });

    it('asserts ZERO secrets from Sample 1 (Loan Note) appear in the outgoing payload', () => {
      const text = SAMPLES.SAMPLE_1.text;
      const regexMatches = detectRegex(text);
      const nanoMatches = [
        ...locateAllOccurrences('Priya', text, 'PERSON'),
        ...locateAllOccurrences('Rahul Mehta', text, 'PERSON')
      ];

      const merged = mergeMatches([regexMatches, nanoMatches]);
      const { redactedText, map } = buildRedaction(text, merged);

      const leakCheck = verifyZeroLeakage(redactedText, map);
      expect(leakCheck.leakFree).toBe(true);
    });
  });

  describe('2. analyzeWithCloud Execution & Retry on Unknown Placeholders', () => {
    it('executes successfully on first attempt when placeholders are valid', async () => {
      const map = new Map([
        ['[PERSON_1]', 'Priya'],
        ['[AMOUNT_1]', '₹4,50,000']
      ]);
      const redactedText = 'Loan for [PERSON_1] totaling [AMOUNT_1].';

      const mockRunner = vi.fn().mockResolvedValue({
        text: 'Summary: Agreement requires [PERSON_1] to repay [AMOUNT_1].',
        ms: 320,
        backend: 'cloud',
        appCheckVerified: true
      });

      const result = await analyzeWithCloud(redactedText, map, {
        cloudRunner: mockRunner,
        maxRetries: 1
      });

      expect(mockRunner).toHaveBeenCalledTimes(1);
      expect(result.retriesUsed).toBe(0);
      expect(result.validation.ok).toBe(true);
      expect(result.backend).toBe('cloud');
      expect(result.leakFree).toBe(true);
    });

    it('retries when response contains unknown placeholder and succeeds on retry', async () => {
      const map = new Map([
        ['[PERSON_1]', 'Priya'],
        ['[AMOUNT_1]', '₹4,50,000']
      ]);
      const redactedText = 'Loan for [PERSON_1] totaling [AMOUNT_1].';

      // First call returns unknown token [PERSON_9]; second call corrects it to [PERSON_1]
      const mockRunner = vi.fn()
        .mockResolvedValueOnce({
          text: 'Summary: [PERSON_9] must repay [AMOUNT_1].',
          ms: 310,
          backend: 'cloud'
        })
        .mockResolvedValueOnce({
          text: 'Summary: [PERSON_1] must repay [AMOUNT_1].',
          ms: 305,
          backend: 'cloud'
        });

      const warnings = [];
      const result = await analyzeWithCloud(redactedText, map, {
        cloudRunner: mockRunner,
        maxRetries: 1,
        onWarning: (w) => warnings.push(w)
      });

      expect(mockRunner).toHaveBeenCalledTimes(2);
      expect(result.retriesUsed).toBe(1);
      expect(result.validation.ok).toBe(true);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('[PERSON_9]');
    });

    it('throws PrivacyViolationError if outgoing payload contains raw secrets', async () => {
      const map = new Map([
        ['[PERSON_1]', 'Priya']
      ]);
      const leakingText = 'Loan for Priya totaling [AMOUNT_1].';

      await expect(analyzeWithCloud(leakingText, map)).rejects.toThrow('PrivacyViolationError');
    });
  });
});
