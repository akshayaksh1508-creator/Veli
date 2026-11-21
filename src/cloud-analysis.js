/**
 * Veil Cloud Analysis Engine (Route B & C)
 * Builds secure analysis prompts, verifies zero secrets in outgoing payload,
 * calls cloud model with App Check token, and retries on mangled/unknown placeholders.
 * Reference: Architecture.md section 486-494 (D2-T4)
 */

import { runCloud } from './ai.js';
import { buildCloudAnalysisPrompt } from './prompts.js';
import { validatePlaceholders } from './restore.js';

/**
 * Asserts that none of the protected secrets in the placeholder map appear in the redacted text payload.
 *
 * @param {string} payload
 * @param {Map<string, string>} map
 * @returns {{ leakFree: boolean, leakedSecrets: Array<{ placeholder: string, secret: string }> }}
 */
export function verifyZeroLeakage(payload, map) {
  if (!map || map.size === 0) {
    return { leakFree: true, leakedSecrets: [] };
  }

  const leakedSecrets = [];
  for (const [placeholder, secret] of map.entries()) {
    // Check non-trivial secrets (> 1 char)
    if (secret && secret.length > 1 && payload.includes(secret)) {
      leakedSecrets.push({ placeholder, secret });
    }
  }

  return {
    leakFree: leakedSecrets.length === 0,
    leakedSecrets
  };
}

/**
 * Executes cloud document analysis with retry on unknown/mangled placeholders.
 *
 * Flow:
 * 1. Verify zero leakage of map secrets into redactedText payload.
 * 2. Build cloud analysis prompt from prompts.js.
 * 3. Call runCloud (with App Check authentication).
 * 4. Run validatePlaceholders on cloud response.
 * 5. If unknown.length > 0 and retry is available, re-send with strict placeholder instruction.
 * 6. Return response, telemetry, and validation metrics.
 *
 * @param {string} redactedText
 * @param {Map<string, string>} map
 * @param {object} [options]
 * @param {number} [options.maxRetries=1]
 * @param {Function} [options.cloudRunner=runCloud]
 * @param {Function} [options.onStep]
 * @param {Function} [options.onWarning]
 * @returns {Promise<{
 *   text: string,
 *   ms: number,
 *   backend: 'cloud',
 *   validation: { ok: boolean, missing: string[], unknown: string[] },
 *   retriesUsed: number,
 *   leakFree: boolean,
 *   appCheckVerified?: boolean
 * }>}
 */
export async function analyzeWithCloud(redactedText, map, options = {}) {
  const {
    maxRetries = 1,
    cloudRunner = runCloud,
    onStep = null,
    onWarning = null
  } = options;

  // 1. Safety Assertion: Outgoing payload must contain ZERO real secrets
  const leakCheck = verifyZeroLeakage(redactedText, map);
  if (!leakCheck.leakFree) {
    const leakDetails = leakCheck.leakedSecrets.map(s => `${s.placeholder}: "${s.secret}"`).join(', ');
    throw new Error(`PrivacyViolationError: Outgoing cloud payload contains unredacted secrets: ${leakDetails}`);
  }

  let attempt = 0;
  let lastResult = null;
  let validation = null;

  while (attempt <= maxRetries) {
    const isRetry = attempt > 0;
    const prompt = buildCloudAnalysisPrompt(redactedText, isRetry);

    if (typeof onStep === 'function') {
      onStep({ attempt, isRetry, prompt });
    }

    lastResult = await cloudRunner(prompt);
    validation = validatePlaceholders(lastResult.text, map);

    if (validation.ok) {
      return {
        text: lastResult.text,
        ms: lastResult.ms,
        backend: lastResult.backend,
        validation,
        retriesUsed: attempt,
        leakFree: true,
        appCheckVerified: lastResult.appCheckVerified
      };
    }

    // Unknown placeholders detected in model response
    if (attempt < maxRetries) {
      const warnMsg = `Unknown placeholder(s) [${validation.unknown.join(', ')}] in cloud response. Retrying with strict token constraint (attempt ${attempt + 1}/${maxRetries})...`;
      console.warn('[CloudAnalysis]', warnMsg);
      if (typeof onWarning === 'function') {
        onWarning(warnMsg);
      }
    }

    attempt++;
  }

  return {
    text: lastResult.text,
    ms: lastResult.ms,
    backend: lastResult.backend,
    validation,
    retriesUsed: attempt - 1,
    leakFree: true,
    appCheckVerified: lastResult.appCheckVerified
  };
}
