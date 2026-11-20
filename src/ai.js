/**
 * Veil AI Interface — On-Device Gemini Nano
 * Supports modern W3C LanguageModel standard (Chrome modern), window.ai, and development fallback.
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
    hasWindowModel: typeof window.model !== 'undefined',
  };

  // 1. Modern W3C Standard Prompt API: LanguageModel global constructor
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

  // 2. Chrome Preview iteration: window.ai.languageModel
  if (window.ai && window.ai.languageModel) {
    try {
      let status = 'readily';
      if (typeof window.ai.languageModel.availability === 'function') {
        status = await window.ai.languageModel.availability();
      } else if (typeof window.ai.languageModel.capabilities === 'function') {
        const caps = await window.ai.languageModel.capabilities();
        status = caps.available;
      }

      const isAvail = status === 'readily' || status === 'after-download';
      return {
        available: isAvail,
        status: `ai.languageModel: ${status}`,
        details: diagnostics
      };
    } catch (err) {
      return { available: false, status: 'error', error: err.message, details: diagnostics };
    }
  }

  // 3. Early Canary iteration: window.ai.assistant
  if (window.ai && window.ai.assistant) {
    try {
      const caps = await window.ai.assistant.capabilities();
      const status = caps.available;
      return {
        available: status === 'readily' || status === 'after-download',
        status: `ai.assistant: ${status}`,
        details: diagnostics
      };
    } catch (err) {
      return { available: false, status: 'error', error: err.message, details: diagnostics };
    }
  }

  // 4. Alternate iteration: window.model
  if (window.model && typeof window.model.prompt === 'function') {
    return { available: true, status: 'readily (window.model)', details: diagnostics };
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
 * @returns {Promise<{ text: string, ms: number, backend: 'native-nano' | 'simulator-fallback' }>}
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
        activeNanoSession = await LMConstructor.create({
          initialPrompts: [{ role: 'system', content: 'You are an on-device AI assistant running locally in Google Chrome.' }]
        });
      }
      const response = await activeNanoSession.prompt(prompt);
      const ms = Math.round(performance.now() - start);
      return { text: response.trim(), ms, backend: 'native-nano' };
    } catch (err) {
      console.warn('[AI:OnDevice] Native LanguageModel prompt failed:', err);
    }
  }

  // Try 2: window.ai.languageModel
  if (typeof window !== 'undefined' && window.ai && window.ai.languageModel) {
    try {
      if (!activeNanoSession) {
        activeNanoSession = await window.ai.languageModel.create({
          systemPrompt: 'You are an on-device AI assistant running locally in Google Chrome.'
        });
      }
      const response = await activeNanoSession.prompt(prompt);
      const ms = Math.round(performance.now() - start);
      return { text: response.trim(), ms, backend: 'native-nano' };
    } catch (err) {
      console.warn('[AI:OnDevice] Native languageModel failed:', err);
    }
  }

  // Fallback simulator for development when Chrome flags or APIs are not yet enabled
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
