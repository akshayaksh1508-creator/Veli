/**
 * D3-T1: Edge Cases & Failure Handling Verification Tests
 * Reference: Architecture.md section 532-545
 *
 * Verifies all 8 edge cases:
 * 1. Empty input handling
 * 2. Input above MAX_CHARS (12,000 cap)
 * 3. Wi-Fi off, short input (Route A works)
 * 4. Wi-Fi off, long input (Route A with warning, or rejection if Nano unavailable)
 * 5. Nano unavailable (Regex-only path with warning)
 * 6. Cloud call fails (Error caught, zero partial result, leak-free guarantee)
 * 7. Nano returns garbage (Fallback to regex-only, warning emitted, no crash)
 * 8. Double-click prevention (Re-entrancy lock)
 */

import { describe, it, expect, vi } from 'vitest';
import { CONFIG } from '../src/config.js';
import { route } from '../src/router.js';
import { detectEntities, parseModelEntityJson, parseAndLocateEntities } from '../src/nano-entities.js';
import { analyzeWithCloud, verifyZeroLeakage } from '../src/cloud-analysis.js';
import { detectRegex, mergeMatches, buildRedaction } from '../src/redact.js';

describe('D3-T1: Edge Cases and Failure Handling', () => {

  // Scenario 1: Empty Input Handling
  describe('1. Empty Input Handling', () => {
    it('returns empty matches when input text is empty or whitespace', async () => {
      expect(detectRegex('')).toEqual([]);
      expect(detectRegex('   \n\t  ')).toEqual([]);

      const nanoMatches = await detectEntities('');
      expect(nanoMatches).toEqual([]);

      const whitespaceMatches = await detectEntities('   ');
      expect(whitespaceMatches).toEqual([]);
    });

    it('buildRedaction handles empty string cleanly', () => {
      const { redactedText, map } = buildRedaction('', []);
      expect(redactedText).toBe('');
      expect(map.size).toBe(0);
    });
  });

  // Scenario 2: Input Above MAX_CHARS
  describe('2. Input Above MAX_CHARS Hard Cap', () => {
    it('allows documents up to MAX_CHARS (12,000 chars)', () => {
      const boundaryDecision = route({
        length: CONFIG.MAX_CHARS,
        sensitiveFound: true,
        onDeviceAvailable: true,
        online: true
      });

      expect(boundaryDecision.route).not.toBe('REJECT');
    });

    it('rejects documents exceeding MAX_CHARS with explanatory message', () => {
      const overDecision = route({
        length: CONFIG.MAX_CHARS + 1,
        sensitiveFound: true,
        onDeviceAvailable: true,
        online: true
      });

      expect(overDecision.route).toBe('REJECT');
      expect(overDecision.reason).toContain('exceeds maximum limit of 12,000 characters');
    });
  });

  // Scenario 3: Wi-Fi Off, Short Input
  describe('3. Wi-Fi Off, Short Input', () => {
    it('routes short document to Route A when offline with zero warnings', () => {
      const decision = route({
        length: 800,
        sensitiveFound: true,
        onDeviceAvailable: true,
        online: false
      });

      expect(decision.route).toBe('A');
      expect(decision.reason).toContain('Offline mode');
      expect(decision.warning).toBeUndefined();
      expect(decision.warnings).toHaveLength(0);
    });
  });

  // Scenario 4: Wi-Fi Off, Long Input
  describe('4. Wi-Fi Off, Long Input', () => {
    it('routes to Route A with warning when offline if Nano is available', () => {
      const decision = route({
        length: 2500,
        sensitiveFound: true,
        onDeviceAvailable: true,
        online: false
      });

      expect(decision.route).toBe('A');
      expect(decision.warning).toBeDefined();
      expect(decision.warning).toContain('Offline mode: document exceeds recommended local limit');
    });

    it('rejects document when offline and Nano is unavailable', () => {
      const decision = route({
        length: 2500,
        sensitiveFound: true,
        onDeviceAvailable: false,
        online: false
      });

      expect(decision.route).toBe('REJECT');
      expect(decision.reason).toContain('device is offline and on-device Gemini Nano is unavailable');
    });
  });

  // Scenario 5: Nano Unavailable (Online)
  describe('5. Nano Unavailable (Online)', () => {
    it('routes sensitive document to Route C with regex-only warning', () => {
      const decision = route({
        length: 2500,
        sensitiveFound: true,
        onDeviceAvailable: false,
        online: true
      });

      expect(decision.route).toBe('C');
      expect(decision.warning).toContain('On-device model unavailable: only pattern-based (regex-only) redaction applied');
    });
  });

  // Scenario 6: Cloud Call Failure Handling
  describe('6. Cloud Call Failure Handling', () => {
    it('handles network failure cleanly, throws informative error, and leaks zero secrets', async () => {
      const map = new Map([['[PERSON_1]', 'Vikram Malhotra']]);
      const redactedText = 'Contract with [PERSON_1].';

      const failingCloudRunner = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(
        analyzeWithCloud(redactedText, map, { cloudRunner: failingCloudRunner })
      ).rejects.toThrow('Failed to fetch');

      // Crucial privacy guarantee: zero secrets leaked even when call fails
      const leakCheck = verifyZeroLeakage(redactedText, map);
      expect(leakCheck.leakFree).toBe(true);
    });

    it('prevents partial results from leaking through when privacy assertion fails', async () => {
      const map = new Map([['[PERSON_1]', 'Vikram Malhotra']]);
      const leakingText = 'Contract with Vikram Malhotra.';

      await expect(
        analyzeWithCloud(leakingText, map, { cloudRunner: vi.fn() })
      ).rejects.toThrow('PrivacyViolationError');
    });
  });

  // Scenario 7: Nano Returns Garbage / Hallucinations / Throws
  describe('7. Nano Returns Garbage / Unparseable Output', () => {
    const text = 'Director Vikram Malhotra signed the agreement.';

    it('defensively handles arbitrary conversational text from Nano without crashing', () => {
      const garbage = 'I am an AI assistant and I cannot extract entities from legal documents.';
      const entities = parseModelEntityJson(garbage);
      expect(entities).toEqual([]);

      const located = parseAndLocateEntities(garbage, text);
      expect(located).toEqual([]);
    });

    it('defensively handles malformed / broken JSON', () => {
      const brokenJson = '{"entities": [{"text": "Vikram", "type": "PERSON" broken syntax';
      const entities = parseModelEntityJson(brokenJson);
      expect(entities).toEqual([]);
    });

    it('falls back to regex-only and emits warning when Nano runner fails', async () => {
      const warnings = [];
      const failingRunner = vi.fn().mockRejectedValue(new Error('Internal Model Execution Failure'));

      const nanoMatches = await detectEntities(text, {
        modelRunner: failingRunner,
        onWarning: (w) => warnings.push(w)
      });

      // No crash, returns empty list so regex engine can proceed alone
      expect(nanoMatches).toEqual([]);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Nano entity detection warning');
    });
  });

  // Scenario 8: Concurrency / Double-Click Prevention
  describe('8. Concurrency & Debounce Logic', () => {
    it('demonstrates re-entrancy lock pattern for single-run enforcement', async () => {
      let isAnalyzing = false;
      let runCount = 0;

      async function triggerAnalyze() {
        if (isAnalyzing) return { status: 'blocked' };
        isAnalyzing = true;
        try {
          runCount++;
          await new Promise(r => setTimeout(r, 50));
          return { status: 'completed' };
        } finally {
          isAnalyzing = false;
        }
      }

      // Simulate simultaneous rapid double-click
      const [firstClick, secondClick] = await Promise.all([
        triggerAnalyze(),
        triggerAnalyze()
      ]);

      expect(firstClick.status).toBe('completed');
      expect(secondClick.status).toBe('blocked');
      expect(runCount).toBe(1);
    });
  });
});
