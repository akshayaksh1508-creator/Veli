import { checkNanoCapabilities, runOnDevice } from './ai.js';

const statusEl = document.getElementById('nano-status');
const netStatusEl = document.getElementById('network-status');
const logEl = document.getElementById('nano-log');
const instructionsEl = document.getElementById('flag-instructions');
const btnRun = document.getElementById('btn-run-nano');
const btnRecheck = document.getElementById('btn-recheck');

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

async function verifyCapabilities() {
  log('Inspecting Chrome on-device AI capabilities...');
  const check = await checkNanoCapabilities();

  if (!statusEl) return;

  if (check.available) {
    statusEl.textContent = `Nano Ready (${check.status})`;
    statusEl.className = 'badge badge-ok';
    if (instructionsEl) instructionsEl.style.display = 'none';
    log(`Capabilities verified: ${check.status}`);
  } else {
    statusEl.textContent = `Unavailable: ${check.status}`;
    statusEl.className = 'badge badge-err';
    if (instructionsEl) instructionsEl.style.display = 'block';
    log(`On-Device AI not active: ${check.error || check.status}.\nDiagnostics: Browser=${check.details?.userAgent}\nwindow.ai present=${check.details?.hasWindowAi}`);
  }
}

btnRun?.addEventListener('click', async () => {
  btnRun.disabled = true;
  btnRun.textContent = 'Running Prompt...';
  log('Executing on-device prompt: "Reply with the word OK"');

  try {
    const isOffline = !navigator.onLine;
    const { text, ms, backend } = await runOnDevice('Reply with the word OK');

    const backendLabel = backend === 'native-nano' ? '[NATIVE CHROME GEMINI NANO]' : '[DEV SIMULATOR FALLBACK]';

    log(
      `SUCCESS: Model responded!\nBackend: ${backendLabel}\nOutput: "${text}"\nLatency: ${ms} ms\nOffline verified: ${isOffline ? 'YES (No internet)' : 'NO (Connected to internet)'}`
    );
  } catch (err) {
    log(`ERROR: On-device prompt failed: ${err.message}`);
  } finally {
    btnRun.disabled = false;
    btnRun.textContent = 'Run On-Device Prompt ("Reply with the word OK")';
  }
});

btnRecheck?.addEventListener('click', verifyCapabilities);

// Initial capability inspection
verifyCapabilities();
