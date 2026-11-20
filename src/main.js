import { app, initAppCheck, getAppCheckToken } from './firebase.js';

console.log('Firebase App Name:', app.name);

// Initialize App Check
const appCheckInstance = initAppCheck();
if (appCheckInstance) {
  getAppCheckToken()
    .then(({ token }) => {
      console.log('[AppCheck] Ready. Token acquired (prefix):', token.slice(0, 8) + '...');
    })
    .catch(err => {
      console.warn('[AppCheck] Token check:', err.message);
    });
}
