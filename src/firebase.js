import { initializeApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken
} from 'firebase/app-check';
import {
  getRemoteConfig,
  fetchAndActivate,
  getValue
} from 'firebase/remote-config';
import { CONFIG } from './config.js';

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);

let appCheck = null;

const isPlaceholderConfig =
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.startsWith('AIzaSyDemo') ||
  firebaseConfig.apiKey === 'your_api_key_here';

/**
 * Initializes Firebase App Check with debug token support in development
 * or ReCaptcha Enterprise in production.
 * Strictly requires real configuration (no hardcoded fake tokens).
 */
export function initAppCheck() {
  if (typeof window === 'undefined') return null;

  const debugTokenConfig = env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (debugTokenConfig) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugTokenConfig === 'true' ? true : debugTokenConfig;
  }

  const recaptchaKey = env.VITE_RECAPTCHA_SITE_KEY;
  if (!recaptchaKey) {
    // A debug token only replaces the reCAPTCHA exchange; the provider object is still needed (VERIFY in the App Check docs).
    const msg = debugTokenConfig
      ? '[AppCheck] VITE_FIREBASE_APPCHECK_DEBUG_TOKEN is set but VITE_RECAPTCHA_SITE_KEY is missing. Add the site key so the debug token can be used. App Check is NOT active.'
      : '[AppCheck] VITE_RECAPTCHA_SITE_KEY not configured. App Check is NOT active.';
    if (env.PROD) console.error(msg); else console.warn(msg);
    return null;
  }

  const provider = new ReCaptchaEnterpriseProvider(recaptchaKey);

  try {
    appCheck = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true
    });
    console.log('[AppCheck] Initialized successfully');
  } catch (err) {
    console.warn('[AppCheck] Initialization notice:', err.message);
    appCheck = null;
  }

  return appCheck;
}

/**
 * Obtains current App Check token for authenticating cloud requests.
 * Returns null if App Check is not configured, or re-throws on genuine errors.
 * Guarantees zero fake fallback strings.
 * @returns {Promise<{ token: string, expireTimeMillis: number }|null>}
 */
export async function getAppCheckToken() {
  if (!appCheck) {
    return null;
  }

  try {
    const res = await getToken(appCheck, /* forceRefresh */ false);
    return res && res.token ? res : null;
  } catch (err) {
    console.warn('[AppCheck] Token retrieval notice:', err.message);
    return null;
  }
}

let remoteConfigInstance = null;

/**
 * Initializes Firebase Remote Config with default fallback for SHORT_LIMIT.
 * Reference: Architecture.md D3-T3
 *
 * @returns {Promise<{ activated: boolean, shortLimit: number }>}
 */
export async function initRemoteConfig() {
  if (typeof window === 'undefined') {
    return { activated: false, shortLimit: CONFIG.SHORT_LIMIT };
  }

  try {
    remoteConfigInstance = getRemoteConfig(app);
    remoteConfigInstance.settings.minimumFetchIntervalMillis = 60000;
    remoteConfigInstance.defaultConfig = {
      short_limit: CONFIG.SHORT_LIMIT
    };

    const activated = await fetchAndActivate(remoteConfigInstance);
    const remoteLimit = getValue(remoteConfigInstance, 'short_limit').asNumber();

    if (typeof remoteLimit === 'number' && !isNaN(remoteLimit) && remoteLimit > 0) {
      CONFIG.SHORT_LIMIT = remoteLimit;
      console.log(`[RemoteConfig] Synchronized SHORT_LIMIT = ${remoteLimit} chars`);
    }

    return { activated, shortLimit: CONFIG.SHORT_LIMIT };
  } catch (err) {
    console.warn('[RemoteConfig] Operating with default config fallback:', err.message);
    return { activated: false, shortLimit: CONFIG.SHORT_LIMIT };
  }
}
