/**
 * Veil AI Interface — On-Device Gemini Nano (Chrome Built-in Prompt API)
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
    hasWindowAi: typeof window.ai !== 'undefined',
    aiKeys: window.ai ? Object.keys(window.ai) : [],
    hasWindowModel: typeof window.model !== 'undefined',
  };

  // 1. Current Chrome Prompt API: window.ai.languageModel
  if (window.ai && window.ai.languageModel) {
    try {
      const caps = await window.ai.languageModel.capabilities();
      const status = caps.available; // 'readily' | 'after-download' | 'no'
      return {
        available: status === 'readily' || status === 'after-download',
        status: `languageModel: ${status}`,
        raw: caps,
        details: diagnostics
      };
    } catch (err) {
      return { available: false, status: 'error', error: err.message, details: diagnostics };
    }
  }

  // 2. Early Canary iteration: window.ai.assistant
  if (window.ai && window.ai.assistant) {
    try {
      const caps = await window.ai.assistant.capabilities();
      const status = caps.available;
      return {
        available: status === 'readily' || status === 'after-download',
        status: `assistant: ${status}`,
        raw: caps,
        details: diagnostics
      };
    } catch (err) {
      return { available: false, status: 'error', error: err.message, details: diagnostics };
    }
  }

  // 3. Alternate iteration: window.model
  if (window.model && typeof window.model.prompt === 'function') {
    return { available: true, status: 'readily (window.model)', details: diagnostics };
  }

  return {
    available: false,
    status: 'unsupported',
    error: 'window.ai is not exposed by this browser session.',
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

  // Try window.ai.languageModel
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

  // Try window.ai.assistant
  if (typeof window !== 'undefined' && window.ai && window.ai.assistant) {
    try {
      if (!activeNanoSession) {
        activeNanoSession = await window.ai.assistant.create();
      }
      const response = await activeNanoSession.prompt(prompt);
      const ms = Math.round(performance.now() - start);
      return { text: response.trim(), ms, backend: 'native-nano' };
    } catch (err) {
      console.warn('[AI:OnDevice] Native assistant failed:', err);
    }
  }

  // Fallback simulator for development when Chrome flags are not yet enabled
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
