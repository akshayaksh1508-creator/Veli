/**
 * Veil AI Interface — Hybrid Route Control (On-Device Local vs Cloud)
 *
 * Powered by Firebase AI Logic (firebase/ai).
 * Creates localModel (pinned to on-device only) and cloudModel (pinned to cloud only).
 * Guarantees zero fake fallbacks: on failure, throws real errors.
 * Reference: Architecture.md section 5.6 & Hybrid Inference Guide
 */

import * as FirebaseAI from 'firebase/ai';
import { app, getAppCheckToken } from './firebase.js';
import { CONFIG } from './config.js';

const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } = FirebaseAI;

// VERIFY against the Firebase AI Logic hybrid inference guide:
//  - the InferenceMode constant names (ONLY_ON_DEVICE / ONLY_IN_CLOUD)
//  - where the cloud model id goes in hybrid mode (inCloudParams.model vs. top-level model)
// If InferenceMode is missing from the installed SDK version we fall back to the string values
// and record that in sdkStatus so the problem is visible instead of silent.
const MODE_ON_DEVICE = InferenceMode?.ONLY_ON_DEVICE ?? 'only_on_device';
const MODE_IN_CLOUD = InferenceMode?.ONLY_IN_CLOUD ?? 'only_in_cloud';

export const sdkStatus = {
  inferenceModeConstants: Boolean(InferenceMode),
  initError: null
};

// 1. Initialize Firebase AI Logic service instance
export const ai = getAI(app, { backend: new GoogleAIBackend() });

function createModel(label, config) {
  try {
    return getGenerativeModel(ai, config);
  } catch (err) {
    sdkStatus.initError = `${label}: ${err.message}`;
    console.error(`[AI] Failed to create ${label}:`, err);
    return null;
  }
}

// 2. localModel pinned to on-device only. Required model parameter is provided as 'gemini-nano'.
export const localModel = createModel('localModel', {
  model: CONFIG.LOCAL_MODEL_NAME || 'gemini-nano',
  mode: MODE_ON_DEVICE
});

// 3. cloudModel pinned to cloud only. Top-level model property is the official SDK parameter.
export const cloudModel = createModel('cloudModel', {
  mode: MODE_IN_CLOUD,
  model: CONFIG.CLOUD_MODEL_NAME
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
      if (CONFIG.DEBUG_LOGS) console.log(`[AI:OnDevice] Response received in ${ms}ms (${isCloned ? 'cloned session' : 'fresh session'}), length:`, String(response).length);
      if (!response || typeof response !== 'string' || !response.trim()) {
        throw new Error('EmptyResponseError: On-device model returned an empty response.');
      }
      return { text: response.trim(), ms, source: 'chrome-direct', backend: 'on-device-nano' };
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
      if (!response || typeof response !== 'string' || !response.trim()) {
        throw new Error('EmptyResponseError: On-device model returned an empty response.');
      }
      return { text: response.trim(), ms, source: 'chrome-direct', backend: 'on-device-nano' };
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
  if (CONFIG.DEBUG_LOGS) console.log('[AI:OnDevice] Running on-device prompt, length:', prompt.length);

  let sdkFailure = null;

  // 1. Route through Firebase AI Logic SDK localModel (pinned to on-device only).
  //    Disabled by default: this path has been observed making a cloud request with the raw prompt.
  try {
    if (!CONFIG.ALLOW_SDK_ON_DEVICE) {
      sdkFailure = 'SDK on-device path disabled (CONFIG.ALLOW_SDK_ON_DEVICE=false) because it was seen sending requests to the cloud endpoint; not verified as fully local yet';
    } else if (localModel && typeof localModel.generateContent === 'function') {
      const result = await localModel.generateContent(prompt);
      if (result && result.response) {
        const response = await result.response;
        const text = typeof response.text === 'function' ? response.text() : response.text;
        if (text && typeof text === 'string' && text.trim()) {
          const ms = Math.round(performance.now() - start);
          const tokenCount = response.usageMetadata?.totalTokenCount || null;
          return { text: text.trim(), ms, tokenCount, source: 'firebase-sdk', backend: 'on-device-nano' };
        }
      }
    }
    if (!sdkFailure) {
      sdkFailure = !localModel
        ? (sdkStatus.initError || 'localModel was not created')
        : 'Firebase SDK on-device model returned no text';
    }
  } catch (sdkErr) {
    sdkFailure = sdkErr?.message || String(sdkErr);
    console.warn('[AI:OnDevice] Firebase SDK on-device path failed:', sdkFailure);
  }

  // 2. Optional, clearly-labeled fallback to Chrome's LanguageModel API.
  //    Never silent: the result carries source + sdkFallbackReason for the Inspector.
  if (!CONFIG.ALLOW_CHROME_DIRECT_FALLBACK) {
    throw new Error(`OnDeviceSdkFailed: Firebase AI Logic on-device path failed (${sdkFailure}) and Chrome-direct fallback is disabled.`);
  }
  const directResult = await executeIsolatedChromeLanguageModel(prompt, start);
  if (directResult) {
    return { ...directResult, sdkFallbackReason: sdkFailure };
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
 * @returns {Promise<{ text: string, ms: number, backend: 'cloud', tokenCount?: number|null, appCheckVerified: boolean, appCheckToken?: string|null, model: string, source: 'firebase-sdk' }>}
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

  // Obtain App Check token for cloud authorization (only real tokens, no fake fallback strings)
  let appCheckToken = null;
  try {
    const tokenObj = await getAppCheckToken();
    appCheckToken = tokenObj ? tokenObj.token : null;
  } catch (err) {
    console.warn('[AI:Cloud] App Check notice:', err.message);
  }

  if (!cloudModel) {
    throw new Error(`CloudModelUnavailable: Firebase AI Logic cloudModel was not created (${sdkStatus.initError || 'unknown reason'}).`);
  }

  console.log('[AI:Cloud] Calling cloudModel.generateContent (Firebase AI Logic)...');

  // Real Firebase AI Logic call pinned to cloud-only (generateContent)
  try {
    const result = await cloudModel.generateContent(prompt);
    const response = await result.response;
    const text = typeof response.text === 'function' ? response.text() : response.text;

    // Issue 7: Guard against empty or non-string response before trim
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('EmptyResponseError: Cloud model returned an empty response.');
    }

    const ms = Math.round(performance.now() - start);

    const tokenCount = response.usageMetadata?.totalTokenCount 
      || response.usageMetadata?.candidatesTokenCount
      || null;

    return {
      text: text.trim(),
      ms,
      tokenCount,
      model: CONFIG.CLOUD_MODEL_NAME,
      source: 'firebase-sdk',
      backend: 'cloud',
      appCheckVerified: Boolean(appCheckToken),
      appCheckToken: appCheckToken
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
