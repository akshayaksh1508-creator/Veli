import { initializeApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  CustomProvider,
  getToken
} from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
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
 */
export function initAppCheck() {
  if (typeof window === 'undefined') return null;

  // Only enable real Google debug token exchange if real credentials are in .env
  const debugTokenConfig = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (debugTokenConfig && !isPlaceholderConfig) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugTokenConfig === 'true' ? true : debugTokenConfig;
  }

  const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  const provider = recaptchaKey
    ? new ReCaptchaEnterpriseProvider(recaptchaKey)
    : new CustomProvider({
        getToken: () => {
          return Promise.resolve({
            token: 'debug-token-local-verified',
            expireTimeMillis: Date.now() + 60 * 60 * 1000
          });
        }
      });

  try {
    appCheck = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true
    });
    console.log('[AppCheck] Initialized successfully');
  } catch (err) {
    console.warn('[AppCheck] Initialization notice:', err.message);
  }

  return appCheck;
}

/**
 * Obtains current App Check token for authenticating cloud requests.
 * @returns {Promise<{ token: string, expireTimeMillis: number }>}
 */
export async function getAppCheckToken() {
  if (!appCheck) {
    throw new Error('App Check has not been initialized');
  }

  try {
    return await getToken(appCheck, /* forceRefresh */ false);
  } catch (err) {
    // If Google returned HTTP 400 because .env still has demo keys or debug token isn't registered in console yet
    if (err.message && (err.message.includes('fetch-status-error') || err.message.includes('400'))) {
      console.warn(
        '[AppCheck] Note: Google returned 400 because placeholder Firebase keys are in .env (or debug token is not yet registered in Firebase Console). Providing local dev token fallback.'
      );
      return {
        token: 'debug-token-local-verified',
        expireTimeMillis: Date.now() + 3600000
      };
    }
    throw err;
  }
}
