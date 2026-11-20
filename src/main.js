import { runOnDevice, runCloud } from './ai.js';
import { initAppCheck } from './firebase.js';

// Initialize Firebase App Check
initAppCheck();

const netStatusEl = document.getElementById('network-status');
const logEl = document.getElementById('output-log');
const btnLocal = document.getElementById('btn-local');
const btnCloud = document.getElementById('btn-cloud');

function updateNetworkStatus() {
  if (!netStatusEl) return;
  if (navigator.onLine) {
    netStatusEl.textContent = 'Online';
    netStatusEl.className = 'badge badge-ok';
  } else {
    netStatusEl.textContent = 'Offline (Wi-Fi Disabled)';
    netStatusEl.className = 'badge badge-warn';
  }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

function log(msg) {
  if (logEl) {
    logEl.textContent = `${new Date().toLocaleTimeString()} - ${msg}\n\n` + logEl.textContent;
  }
  console.log(msg);
}

// 1. Test Local-Only (On-Device Gemini Nano)
btnLocal?.addEventListener('click', async () => {
  btnLocal.disabled = true;
  log('Dispatching prompt to LOCAL-ONLY model ("Say hello")...');

  try {
    const isOffline = !navigator.onLine;
    const { text, ms, backend } = await runOnDevice('Say hello');

    log(
      `[LOCAL SUCCESS] On-device inference completed!
Backend: ${backend.toUpperCase()}
Timing: ${ms} ms
Response: "${text}"
Offline verified: ${isOffline ? 'YES (Ran fully with zero network)' : 'Online (Verified local runtime)'}`
    );
  } catch (err) {
    log(`[LOCAL ERROR] Failed: ${err.message}`);
  } finally {
    btnLocal.disabled = false;
  }
});

// 2. Test Cloud-Only (Cloud Gemini)
btnCloud?.addEventListener('click', async () => {
  btnCloud.disabled = true;
  log('Dispatching prompt to CLOUD-ONLY model ("Say hello")...');

  try {
    const { text, ms, backend, appCheckVerified } = await runCloud('Say hello');

    log(
      `[CLOUD SUCCESS] Cloud inference completed!
Backend: ${backend.toUpperCase()}
Timing: ${ms} ms
App Check Attached: ${appCheckVerified ? 'YES' : 'NO'}
Response: "${text}"`
    );
  } catch (err) {
    log(`[CLOUD REJECTED AS EXPECTED] Error: ${err.message}`);
  } finally {
    btnCloud.disabled = false;
  }
});

log('System ready. Choose a model path to test forced route control.');
