/**
 * Veil Core Configuration
 * Reference: Architecture.md section 5.1
 */

export const CONFIG = {
  SHORT_LIMIT: 1500,  // chars: at or below this, use route A (On-Device)
  MAX_CHARS: 12000,   // hard cap for MVP; show rejection above this
  CHUNK_SIZE: 3500,   // chars per chunk for Nano entity detection (optimized single-pass for contracts)
  CLOUD_RETRY: 1,     // retries if placeholders come back mangled
  // VERIFY: confirm this model is still supported in the Firebase AI Logic docs.
  // Override without code changes via VITE_CLOUD_MODEL in .env.
  CLOUD_MODEL_NAME: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_CLOUD_MODEL) || 'gemini-3.5-flash-lite',
  // Display label only. It is NOT passed to the SDK as a model id (on-device mode uses Chrome's built-in model).
  LOCAL_MODEL_NAME: 'gemini-nano',
  // If true, runOnDevice may fall back to Chrome's LanguageModel API when the Firebase SDK on-device
  // path fails. The fallback is always labeled in the Inspector. Set false to require the SDK path.
  ALLOW_CHROME_DIRECT_FALLBACK: true,
  // PRIVACY GUARD. The Firebase SDK on-device path was observed sending the prompt to
  // https://firebasevertexai.googleapis.com/.../models/gemini-nano:generateContent (HTTP 404),
  // i.e. the "on-device" call went to the network. Keep this false until DevTools > Network shows
  // ZERO requests during Route A and during Route C entity detection with Wi-Fi on.
  ALLOW_SDK_ON_DEVICE: false,
  // Console debugging. Keep false for demos and production: even when true, the real token map
  // and restored output are never printed; only lengths, placeholders-only text and counts are.
  DEBUG_LOGS: false
};
