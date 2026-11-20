import { SAMPLES } from './samples.js';
import { detectRegex, buildRedaction } from './redact.js';
import { runOnDevice, checkNanoCapabilities } from './ai.js';
import { inspector } from './inspector.js';

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

// Check on-device status and network status on load
async function initStatus() {
  function updateNetwork() {
    if (!netStatusEl()) return;
    if (navigator.onLine) {
      dotNetwork.className = 'status-dot active';
      textNetwork.textContent = 'Online';
    } else {
      dotNetwork.className = 'status-dot';
      textNetwork.textContent = 'Offline';
    }
  }

  function netStatusEl() {
    return dotNetwork && textNetwork;
  }

  window.addEventListener('online', updateNetwork);
  window.addEventListener('offline', updateNetwork);
  updateNetwork();

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

// Sample document buttons fill the textarea
document.querySelectorAll('.sample-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.sample;
    if (SAMPLES[key]) {
      docInput.value = SAMPLES[key].text;
      updateCharCount();
    }
  });
});

// Render Inspector steps
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

    const whereClass = step.where === 'cloud' ? 'badge-cloud' : step.where === 'on-device' ? 'badge-nano' : 'badge-local';

    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="step-badge ${whereClass}">${step.where.toUpperCase()}</span>
        <span>${step.label}</span>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-muted);">${step.durationMs} ms</div>
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

  // Disable button while running (D1-T6 requirement)
  btnAnalyze.disabled = true;
  btnAnalyze.textContent = 'Analyzing...';
  inspector.reset();
  renderInspector();
  resultBox.textContent = 'Executing privacy redaction and document analysis...';

  const t0 = performance.now();

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

    resultBox.textContent = modelAnswer;
  } catch (err) {
    resultBox.textContent = `Error during analysis: ${err.message}`;
  } finally {
    // Re-enable Analyze button
    btnAnalyze.disabled = false;
    btnAnalyze.textContent = 'Analyze Document';
    renderInspector();
  }
});

// Initialize on page load
initStatus();
updateCharCount();
