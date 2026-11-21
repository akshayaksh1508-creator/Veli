import { SAMPLES } from './samples.js';
import { detectRegex, buildRedaction } from './redact.js';
import { restore } from './restore.js';
import { runOnDevice, checkNanoCapabilities } from './ai.js';
import { inspector } from './inspector.js';
import { detectEntities } from './nano-entities.js';

// Expose for DevTools testing & inspection
if (typeof window !== 'undefined') {
  window.detectEntities = detectEntities;
}

// DOM Elements
const docInput = document.getElementById('doc-input');
const charCounter = document.getElementById('char-counter');
const btnAnalyze = document.getElementById('btn-analyze');
const resultBox = document.getElementById('result-box');
const inspectorPanel = document.getElementById('inspector-panel');
const textNano = document.getElementById('text-nano');
const dotNano = document.getElementById('dot-nano');
const textNetwork = document.getElementById('text-network');
const dotNetwork = document.getElementById('dot-network');
const calloutText = document.getElementById('callout-text');
const completeBanner = document.getElementById('complete-banner');

// Check on-device status and network status on load
async function initStatus() {
  async function checkRealConnectivity() {
    if (!dotNetwork || !textNetwork) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      dotNetwork.className = 'status-dot';
      textNetwork.textContent = 'Offline';
      return;
    }
    try {
      await fetch('https://www.google.com/generate_204', {
        mode: 'no-cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(2000)
      });
      dotNetwork.className = 'status-dot active';
      textNetwork.textContent = 'Online';
    } catch {
      dotNetwork.className = 'status-dot';
      textNetwork.textContent = 'Offline';
    }
  }

  window.addEventListener('online', checkRealConnectivity);
  window.addEventListener('offline', checkRealConnectivity);
  checkRealConnectivity();
  // Poll network status every 4 seconds to catch Wi-Fi drops despite Windows virtual adapters
  setInterval(checkRealConnectivity, 4000);

  // Inspect Nano capabilities
  const check = await checkNanoCapabilities();
  if (check.available) {
    dotNano.className = 'status-dot nano';
    textNano.textContent = 'Nano: Ready';
  } else {
    dotNano.className = 'status-dot';
    textNano.textContent = 'Nano: Local Fallback';
  }
}

// Character counter update
function updateCharCount() {
  const len = docInput.value.length;
  charCounter.textContent = `${len.toLocaleString()} chars`;
}

docInput?.addEventListener('input', updateCharCount);

// Sample document buttons fill the textarea & toggle active state
document.querySelectorAll('.sample-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sample-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const key = btn.dataset.sample;
    if (SAMPLES[key]) {
      docInput.value = SAMPLES[key].text;
      updateCharCount();

      // Update bottom contextual callout based on sample
      if (calloutText) {
        if (key === 'SAMPLE_1') {
          calloutText.textContent = 'Rahul Mehta at 98450 12345 will confirm. Email him at rahul.mehta@example.com.';
        } else if (key === 'SAMPLE_2') {
          calloutText.textContent = 'Payments shall be made via NEFT/RTGS to Contractor\'s designated bank account:';
        } else if (key === 'SAMPLE_3') {
          calloutText.textContent = 'Public infrastructure article with zero personal or financial identifiable data.';
        } else {
          calloutText.textContent = 'Tricky entities: Luhn card validation, phone overlaps, and addresses.';
        }
      }
    }
  });
});

// Render Inspector steps matching reference design
function renderInspector() {
  if (!inspectorPanel) return;

  if (inspector.steps.length === 0) {
    inspectorPanel.className = 'inspector-empty';
    inspectorPanel.innerHTML = '<p>Inspector is ready. Pipeline execution steps will appear here.</p>';
    return;
  }

  inspectorPanel.className = '';
  inspectorPanel.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'timeline';

  inspector.steps.forEach(step => {
    const row = document.createElement('div');
    row.className = 'timeline-step';

    let badgeClass = 'badge-local';
    let badgeText = 'LOCAL-CODE';

    if (step.where === 'on-device') {
      badgeClass = 'badge-on-device';
      badgeText = 'ON-DEVICE';
    } else if (step.where === 'cloud') {
      badgeClass = 'badge-cloud';
      badgeText = 'CLOUD';
    }

    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="step-badge ${badgeClass}">${badgeText}</span>
        <span>${step.label}</span>
      </div>
      <div class="step-timing">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>${step.durationMs} ms</span>
      </div>
    `;
    container.appendChild(row);
  });

  inspectorPanel.appendChild(container);
}

// Analyze button handler
btnAnalyze?.addEventListener('click', async () => {
  const text = docInput.value.trim();
  if (!text) {
    alert('Please enter or select a document to analyze.');
    return;
  }

  // Disable button while running
  btnAnalyze.disabled = true;
  btnAnalyze.querySelector('span').textContent = 'Analyzing...';
  inspector.reset();
  renderInspector();
  resultBox.textContent = 'Executing privacy redaction and document analysis...';

  try {
    // 1. Regex Redaction Step
    const tRegex0 = performance.now();
    const matches = detectRegex(text);
    const { redactedText, map } = buildRedaction(text, matches);
    const regexDur = performance.now() - tRegex0;

    inspector.addStep({
      id: 'step_redact',
      label: `Pattern Scan & Redaction (${matches.length} matches, ${map.size} tokens)`,
      where: 'local-code',
      leftDevice: false,
      durationMs: regexDur
    });

    // 2. On-Device Model Step
    const tNano0 = performance.now();
    const prompt = `Analyze this document. Summarize key points in 2-3 sentences:\n\n${redactedText}`;
    const { text: modelAnswer, ms: nanoMs } = await runOnDevice(prompt);

    inspector.addStep({
      id: 'step_nano',
      label: 'On-Device Document Analysis (Gemini Nano)',
      where: 'on-device',
      leftDevice: false,
      durationMs: nanoMs
    });

    // 3. Local Restoration Step
    const tRest0 = performance.now();
    const restoredAnswer = restore(modelAnswer, map);
    const restDur = performance.now() - tRest0;

    inspector.addStep({
      id: 'step_restore',
      label: `Local Restoration (${map.size} placeholders restored to real values)`,
      where: 'local-code',
      leftDevice: false,
      durationMs: restDur
    });

    // DevTools Privacy Verification Logging
    console.group('🛡️ [Veil Privacy Engine] Redaction & Inference Inspection');
    console.log('%c[1. Redacted Text Sent to AI Model]', 'color: #e11d48; font-weight: bold;', '\n' + redactedText);
    console.log('%c[2. Protected Token Map]', 'color: #2563eb; font-weight: bold;');
    console.table(Array.from(map.entries()).map(([token, val]) => ({ 'Placeholder Token': token, 'Protected Secret': val })));
    console.log('%c[3. Raw AI Response with Tokens]', 'color: #d97706; font-weight: bold;', '\n' + modelAnswer);
    console.log('%c[4. Final Restored Output]', 'color: #16a34a; font-weight: bold;', '\n' + restoredAnswer);
    console.groupEnd();

    resultBox.textContent = restoredAnswer;
  } catch (err) {
    resultBox.textContent = `Error during analysis: ${err.message}`;
  } finally {
    // Re-enable Analyze button
    btnAnalyze.disabled = false;
    btnAnalyze.querySelector('span').innerHTML = 'Analyze Document &rarr;';
    renderInspector();
  }
});

// Initialize on page load
initStatus();
updateCharCount();
if (calloutText) {
  calloutText.textContent = 'Paste any document containing sensitive personal, financial, or contract data to analyze securely.';
}
