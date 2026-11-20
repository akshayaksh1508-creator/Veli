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

/**
 * Initializes Firebase App Check with debug token support in development
 * or ReCaptcha Enterprise in production.
 */
export function initAppCheck() {
  if (typeof window === 'undefined') return null;

  // Set debug token before initializeAppCheck in development
  const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (debugToken) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
  }

  const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  const provider = recaptchaKey
    ? new ReCaptchaEnterpriseProvider(recaptchaKey)
    : new CustomProvider({
        getToken: () => {
          return Promise.resolve({
            token: typeof self.FIREBASE_APPCHECK_DEBUG_TOKEN === 'string'
              ? self.FIREBASE_APPCHECK_DEBUG_TOKEN
              : 'debug-token-local',
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
  return await getToken(appCheck, /* forceRefresh */ false);
}
