import { app, initAppCheck, getAppCheckToken } from './firebase.js';

console.log('Firebase App initialized:', app.name);

const statusEl = document.getElementById('appcheck-status');
const logEl = document.getElementById('output-log');
const btnAuth = document.getElementById('btn-test-auth');
const btnUnauth = document.getElementById('btn-test-unauth');
const btnToggle = document.getElementById('btn-toggle-token');

let isTokenEnabled = true;
let currentToken = null;

// Mock protected cloud endpoint (simulating Firebase AI Logic backend with App Check enforcement)
function mockProtectedCloudEndpoint(headers) {
  const token = headers['X-Firebase-AppCheck'];
  if (!token || token === 'DISABLED') {
    return {
      status: 401,
      ok: false,
      message: 'HTTP 401 Unauthorized: Request rejected because App Check token is missing or invalid.'
    };
  }
  return {
    status: 200,
    ok: true,
    message: 'HTTP 200 OK: App Check token verified successfully! Cloud call authorized.'
  };
}

// Initialize App Check
try {
  initAppCheck();
  getAppCheckToken()
    .then(({ token }) => {
      currentToken = token;
      if (statusEl) {
        statusEl.textContent = 'Active (Debug Token Ready)';
        statusEl.className = 'badge';
      }
      log(`[AppCheck] Successfully initialized. Debug token acquired:\n${token}`);
    })
    .catch(err => {
      if (statusEl) {
        statusEl.textContent = 'Error';
        statusEl.style.background = '#f43f5e20';
        statusEl.style.color = '#f87171';
      }
      log(`[AppCheck Error] ${err.message}`);
    });
} catch (e) {
  log(`[Error] ${e.message}`);
}

function log(msg) {
  if (logEl) {
    logEl.textContent = `${new Date().toLocaleTimeString()} - ${msg}\n\n` + logEl.textContent;
  }
  console.log(msg);
}

// Button 1: Test Authenticated Call
btnAuth?.addEventListener('click', async () => {
  log('Sending authenticated call with App Check token...');
  try {
    const { token } = isTokenEnabled && currentToken ? { token: currentToken } : await getAppCheckToken();
    const res = mockProtectedCloudEndpoint({ 'X-Firebase-AppCheck': token });
    if (res.ok) {
      log(`SUCCESS: ${res.message}\nToken used: ${token.slice(0, 12)}...`);
    } else {
      log(`REJECTED: ${res.message}`);
    }
  } catch (err) {
    log(`ERROR: Failed to acquire token: ${err.message}`);
  }
});

// Button 2: Test Unauthenticated Call (Token stripped)
btnUnauth?.addEventListener('click', () => {
  log('Sending unauthenticated call (No X-Firebase-AppCheck header)...');
  const res = mockProtectedCloudEndpoint({});
  log(`RESULT: ${res.message} (Expected 401 rejection)`);
});

// Button 3: Toggle Debug Token
btnToggle?.addEventListener('click', () => {
  isTokenEnabled = !isTokenEnabled;
  if (!isTokenEnabled) {
    currentToken = 'DISABLED';
    if (statusEl) {
      statusEl.textContent = 'Token Disabled (Simulated)';
      statusEl.style.background = '#f43f5e20';
      statusEl.style.color = '#f87171';
    }
    log('Debug token has been temporarily removed/disabled. Authenticated calls should now fail.');
  } else {
    currentToken = 'debug-token-local';
    if (statusEl) {
      statusEl.textContent = 'Active (Debug Token Ready)';
      statusEl.style.background = '#10b98120';
      statusEl.style.color = '#34d399';
    }
    log('Debug token restored.');
  }
});
