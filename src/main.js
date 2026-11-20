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
    statusEl.textContent = `Nano: ${check.status}`;
    statusEl.className = 'badge badge-warn';
    log(`Notice: ${check.status}. LanguageModel API is present in browser. You can click 'Run On-Device Prompt' to test.`);
  }
}

btnRun?.addEventListener('click', async () => {
  btnRun.disabled = true;
  btnRun.textContent = 'Running Prompt...';
  log('Executing on-device prompt: "Reply with the word OK"');

  try {
    const isOffline = !navigator.onLine;
    const { text, ms, backend, errorDetails } = await runOnDevice('Reply with the word OK');

    const backendLabel = backend === 'native-nano' ? '[NATIVE CHROME GEMINI NANO]' : '[DEVELOPMENT SIMULATOR FALLBACK]';

    let resultMsg = `SUCCESS: Prompt completed!\nBackend: ${backendLabel}\nOutput: "${text}"\nLatency: ${ms} ms\nOffline verified: ${isOffline ? 'YES (No internet)' : 'NO (Connected to internet)'}`;

    if (errorDetails) {
      resultMsg += `\n${errorDetails}`;
    }

    log(resultMsg);
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
