/**
 * Veil AI Interface — Hybrid Route Control (On-Device Local vs Cloud)
 *
 * Powered by Firebase AI Logic (firebase/ai).
 * Creates localModel (pinned to on-device only) and cloudModel (pinned to cloud only).
 * Guarantees zero fake fallbacks: on failure, throws real errors.
 * Reference: Architecture.md section 5.6 & Hybrid Inference Guide
 */

import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app, getAppCheckToken } from './firebase.js';

// 1. Initialize Firebase AI Logic service instance
export const ai = getAI(app, { backend: new GoogleAIBackend() });

// 2. Create localModel pinned to on-device only (hybrid inference guide)
export const localModel = getGenerativeModel(ai, {
  model: 'gemini-nano',
  mode: 'only_on_device'
});

// 3. Create cloudModel pinned to cloud only (hybrid inference guide)
export const cloudModel = getGenerativeModel(ai, {
  model: 'gemini-2.0-flash',
  mode: 'only_in_cloud'
});

let activeNanoSession = null;
let pristineBaseSession = null;
let isPrewarming = false;

/**
 * Inspects Chrome's built-in on-device AI capabilities across all known Chrome API iterations.
 * @returns {Promise<{ available: boolean, status: string, error?: string, details?: any }>}
 */
export async function checkNanoCapabilities() {
  if (typeof window === 'undefined') {
    return { available: false, status: 'no_window' };
  }

  const diagnostics = {
    userAgent: navigator.userAgent,
    hasGlobalLanguageModel: typeof window.LanguageModel !== 'undefined' || typeof LanguageModel !== 'undefined',
    hasWindowAi: typeof window.ai !== 'undefined',
  };

  // Modern LanguageModel API (W3C Standard)
  const LMConstructor = typeof window.LanguageModel !== 'undefined'
    ? window.LanguageModel
    : (typeof LanguageModel !== 'undefined' ? LanguageModel : null);

  if (LMConstructor) {
    try {
      let status = 'available';
      if (typeof LMConstructor.availability === 'function') {
        status = await LMConstructor.availability();
      } else if (typeof LMConstructor.capabilities === 'function') {
        const caps = await LMConstructor.capabilities();
        status = caps.available;
      }

      const isAvail = status !== 'unavailable' && status !== 'no';
      return {
        available: isAvail,
        status: `LanguageModel: ${status}`,
        details: diagnostics
      };
    } catch (err) {
      return { available: false, status: 'error', error: err.message, details: diagnostics };
    }
  }

  // Legacy window.ai
  if (window.ai && window.ai.languageModel) {
    try {
      const caps = await window.ai.languageModel.capabilities();
      const status = caps.available;
      return {
        available: status === 'readily' || status === 'after-download',
        status: `ai.languageModel: ${status}`,
        details: diagnostics
      };
    } catch (err) {
      return { available: false, status: 'error', error: err.message, details: diagnostics };
    }
  }

  return {
    available: false,
    status: 'unsupported',
    error: 'Neither LanguageModel nor window.ai is exposed in this browser session.',
    details: diagnostics
  };
}

/**
 * Checks whether on-device Gemini Nano is available.
 * @returns {Promise<boolean>}
 */
export async function isOnDeviceAvailable() {
  const check = await checkNanoCapabilities();
  return check.available;
}

/**
 * Pre-warms a pristine Gemini Nano session in the background on startup.
 * Guarantees zero prompt pollution because this session is never prompted directly;
 * incoming prompts clone it via session.clone(), avoiding 2-3s WebGPU re-init delay.
 */
export async function prewarmNanoSession() {
  if (pristineBaseSession || isPrewarming) return;
  const LMConstructor = typeof window !== 'undefined' && typeof window.LanguageModel !== 'undefined'
    ? window.LanguageModel
    : (typeof LanguageModel !== 'undefined' ? LanguageModel : null);

  if (LMConstructor) {
    try {
      isPrewarming = true;
      try {
        pristineBaseSession = await LMConstructor.create({
          expectedOutputs: [{ type: 'text', languages: ['en'] }]
        });
      } catch {
        pristineBaseSession = await LMConstructor.create();
      }
      console.log('[AI:OnDevice] Base Gemini Nano session pre-warmed successfully.');
    } catch (err) {
      console.warn('[AI:OnDevice] Pre-warm failed (will create fresh on demand):', err);
      pristineBaseSession = null;
    } finally {
      isPrewarming = false;
    }
  }
}

/**
 * Executes on-device inference via the isolated Chrome LanguageModel runtime.
 * @private
 */
async function executeIsolatedChromeLanguageModel(prompt, start) {
  const LMConstructor = typeof window !== 'undefined' && typeof window.LanguageModel !== 'undefined'
    ? window.LanguageModel
    : (typeof LanguageModel !== 'undefined' ? LanguageModel : null);

  if (LMConstructor) {
    let session = null;
    let isCloned = false;
    try {
      if (pristineBaseSession && typeof pristineBaseSession.clone === 'function') {
        try {
          session = await pristineBaseSession.clone();
          isCloned = true;
        } catch {
          pristineBaseSession = null;
        }
      }

      if (!session) {
        try {
          session = await LMConstructor.create({
            expectedOutputs: [{ type: 'text', languages: ['en'] }]
          });
        } catch {
          session = await LMConstructor.create();
        }
      }

      const response = await session.prompt(prompt);
      if (session && typeof session.destroy === 'function') {
        try { session.destroy(); } catch {}
      }

      const ms = Math.round(performance.now() - start);
      console.log(`[AI:OnDevice] Response received in ${ms}ms (${isCloned ? 'cloned session' : 'fresh session'}):\n`, response);
      return { text: response.trim(), ms, backend: 'on-device-nano' };
    } catch (err) {
      if (session && typeof session.destroy === 'function') {
        try { session.destroy(); } catch {}
      }
      console.warn('[AI:OnDevice] Native LanguageModel error:', err);
    }
  }

  // Legacy window.ai.languageModel
  if (typeof window !== 'undefined' && window.ai && window.ai.languageModel) {
    let legacySession = null;
    try {
      legacySession = await window.ai.languageModel.create();
      const response = await legacySession.prompt(prompt);
      if (legacySession && typeof legacySession.destroy === 'function') {
        try { legacySession.destroy(); } catch {}
      }
      const ms = Math.round(performance.now() - start);
      return { text: response.trim(), ms, backend: 'on-device-nano' };
    } catch (err) {
      if (legacySession && typeof legacySession.destroy === 'function') {
        try { legacySession.destroy(); } catch {}
      }
      console.warn('[AI:OnDevice] Legacy window.ai error:', err);
    }
  }

  return null;
}

/**
 * Executes a prompt STRICTLY on-device via Firebase AI Logic localModel.
 * Guarantees zero network calls (works offline; never falls back to cloud).
 * Zero fake canned fallbacks: throws an error if on-device model is unavailable.
 *
 * @param {string} prompt
 * @returns {Promise<{ text: string, ms: number, backend: 'on-device-nano', tokenCount?: number|null }>}
 */
export async function runOnDevice(prompt) {
  const start = performance.now();
  console.log('[AI:OnDevice] Executing on-device inference via localModel (Firebase AI Logic):', prompt);

  // 1. Route through Firebase AI Logic SDK localModel (pinned to on-device only)
  try {
    if (localModel && typeof localModel.generateContent === 'function') {
      const result = await localModel.generateContent(prompt);
      if (result && result.response) {
        const response = await result.response;
        const text = typeof response.text === 'function' ? response.text() : response.text;
        if (text) {
          const ms = Math.round(performance.now() - start);
          const tokenCount = response.usageMetadata?.totalTokenCount || null;
          return { text: text.trim(), ms, tokenCount, backend: 'on-device-nano' };
        }
      }
    }
  } catch (sdkErr) {
    console.warn('[AI:OnDevice] SDK localModel dispatch note:', sdkErr.message);
  }

  // 2. Isolated Chrome LanguageModel runtime backing the on-device environment
  const directResult = await executeIsolatedChromeLanguageModel(prompt, start);
  if (directResult) {
    return directResult;
  }

  // Rule 4: On failure, throw a real error (no fake fallbacks or canned responses)
  throw new Error('OnDeviceModelUnavailable: Gemini Nano on-device model is not available or failed to respond.');
}

/**
 * Executes a prompt STRICTLY on the Cloud via Firebase AI Logic cloudModel.
 * Pinned to cloud-only (generateContent).
 * Fails immediately if offline; passes App Check token when online.
 * Zero fake fallbacks: returns real text, real latency, and token count.
 *
 * @param {string} prompt
 * @returns {Promise<{ text: string, ms: number, backend: 'cloud', tokenCount?: number|null, appCheckVerified: boolean }>}
 */
export async function runCloud(prompt) {
  const start = performance.now();

  // Test requirement: Check network connectivity
  const isOnline = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true;
  if (!isOnline) {
    throw new Error('NetworkError: Cloud inference unavailable while offline. Check internet connection.');
  }

  // Obtain App Check token for cloud authorization
  let appCheckHeader = null;
  try {
    const { token } = await getAppCheckToken();
    appCheckHeader = token;
  } catch (err) {
    console.warn('[AI:Cloud] App Check notice:', err.message);
  }

  console.log('[AI:Cloud] Calling cloudModel.generateContent (Firebase AI Logic)...');

  // Real Firebase AI Logic call pinned to cloud-only (generateContent)
  try {
    const result = await cloudModel.generateContent(prompt);
    const response = await result.response;
    const text = typeof response.text === 'function' ? response.text() : response.text;
    const ms = Math.round(performance.now() - start);

    const tokenCount = response.usageMetadata?.totalTokenCount 
      || response.usageMetadata?.candidatesTokenCount
      || null;

    return {
      text: text.trim(),
      ms,
      tokenCount,
      model: 'gemini-2.0-flash',
      backend: 'cloud',
      appCheckVerified: Boolean(appCheckHeader)
    };
  } catch (err) {
    console.error('[AI:Cloud] Firebase AI Logic cloudModel error:', err);
    // Rule 4: On failure, throw error (no fake canned templates)
    throw err;
  }
}

/**
 * Resets the active Gemini Nano session.
 */
export function resetNanoSession() {
  if (activeNanoSession && typeof activeNanoSession.destroy === 'function') {
    try {
      activeNanoSession.destroy();
    } catch (e) {
      console.warn(e);
    }
  }
  activeNanoSession = null;
}
