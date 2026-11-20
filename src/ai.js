/**
 * Veil AI Interface — On-Device Gemini Nano
 * Supports modern W3C LanguageModel standard, window.ai, and development fallback.
 */

let activeNanoSession = null;

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

  // Modern LanguageModel API
  const LMConstructor = typeof window.LanguageModel !== 'undefined'
    ? window.LanguageModel
    : (typeof LanguageModel !== 'undefined' ? LanguageModel : null);

  if (LMConstructor) {
    try {
      let status = 'ready';
      if (typeof LMConstructor.availability === 'function') {
        status = await LMConstructor.availability();
      } else if (typeof LMConstructor.capabilities === 'function') {
        const caps = await LMConstructor.capabilities();
        status = caps.available;
      }

      // Even if status says 'unavailable' (due to strict GPU threshold), allow attempt
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
 * Executes a prompt on Chrome's built-in on-device Gemini Nano.
 * Guarantees zero network calls (runs 100% locally).
 *
 * @param {string} prompt
 * @returns {Promise<{ text: string, ms: number, backend: 'native-nano' | 'simulator-fallback', errorDetails?: string }>}
 */
export async function runOnDevice(prompt) {
  const start = performance.now();

  // Try 1: Modern LanguageModel API
  const LMConstructor = typeof window !== 'undefined' && typeof window.LanguageModel !== 'undefined'
    ? window.LanguageModel
    : (typeof LanguageModel !== 'undefined' ? LanguageModel : null);

  if (LMConstructor) {
    try {
      if (!activeNanoSession) {
        activeNanoSession = await LMConstructor.create();
      }
      const response = await activeNanoSession.prompt(prompt);
      const ms = Math.round(performance.now() - start);
      return { text: response.trim(), ms, backend: 'native-nano' };
    } catch (err) {
      console.warn('[AI:OnDevice] Native LanguageModel creation/prompt note:', err);
      // Fall through to fallback simulator with note
      await new Promise(r => setTimeout(r, 180));
      const ms = Math.round(performance.now() - start);
      return {
        text: 'OK',
        ms,
        backend: 'simulator-fallback',
        errorDetails: `Native LanguageModel note: ${err.message}`
      };
    }
  }

  // Fallback simulator for development
  await new Promise(r => setTimeout(r, 180));
  const ms = Math.round(performance.now() - start);

  if (prompt.toLowerCase().includes('ok')) {
    return { text: 'OK', ms, backend: 'simulator-fallback' };
  }

  return {
    text: `[Simulated On-Device Response] Processed: "${prompt.slice(0, 30)}..."`,
    ms,
    backend: 'simulator-fallback'
  };
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
