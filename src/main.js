import { SAMPLES } from './samples.js';
import { CONFIG } from './config.js';
import { detectRegex, mergeMatches, buildRedaction } from './redact.js';
import { restore, validatePlaceholders } from './restore.js';
import { runOnDevice, runCloud, checkNanoCapabilities, isOnDeviceAvailable } from './ai.js';
import { inspector } from './inspector.js';
import { detectEntities } from './nano-entities.js';
import { analyzeWithCloud, verifyZeroLeakage } from './cloud-analysis.js';
import { route } from './router.js';
import { showReviewStep } from './review.js';

// Expose for DevTools testing & inspection
if (typeof window !== 'undefined') {
  window.detectEntities = detectEntities;
  window.analyzeWithCloud = analyzeWithCloud;
  window.verifyZeroLeakage = verifyZeroLeakage;
  window.route = route;
  window.showReviewStep = showReviewStep;
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

// Track physical network connectivity accurately across Windows virtual adapters
let isDeviceOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

// Check on-device status and network status on load
async function initStatus() {
  const nanoBanner = document.getElementById('nano-unavailable-banner');
  const btnDismissBanner = document.getElementById('btn-dismiss-banner');
  btnDismissBanner?.addEventListener('click', () => {
    nanoBanner?.classList.add('hidden');
  });

  async function checkRealConnectivity() {
    if (!dotNetwork || !textNetwork) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      isDeviceOnline = false;
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
      isDeviceOnline = true;
      dotNetwork.className = 'status-dot active';
      textNetwork.textContent = 'Online';
    } catch {
      isDeviceOnline = false;
      dotNetwork.className = 'status-dot';
      textNetwork.textContent = 'Offline';
    }
  }

  window.addEventListener('online', checkRealConnectivity);
  window.addEventListener('offline', checkRealConnectivity);
  checkRealConnectivity();
  // Poll network status every 4 seconds to catch Wi-Fi drops despite Windows virtual adapters
  setInterval(checkRealConnectivity, 4000);

  // Inspect Nano capabilities (Scenario 5: Nano unavailable banner)
  const check = await checkNanoCapabilities();
  if (check.available) {
    dotNano.className = 'status-dot nano';
    textNano.textContent = 'Nano: Ready';
    nanoBanner?.classList.add('hidden');
  } else {
    dotNano.className = 'status-dot';
    textNano.textContent = 'Nano: Local Fallback';
    nanoBanner?.classList.remove('hidden');
  }
}

// Character counter update and button state control (Scenario 1 & 2)
function updateCharCount() {
  if (!docInput) return;
  const len = docInput.value.length;
  const trimmedLen = docInput.value.trim().length;

  if (charCounter) {
    if (len > CONFIG.MAX_CHARS) {
      charCounter.classList.add('char-counter-over');
      charCounter.textContent = `${len.toLocaleString()} / ${CONFIG.MAX_CHARS.toLocaleString()} chars (exceeds cap)`;
    } else {
      charCounter.classList.remove('char-counter-over');
      charCounter.textContent = `${len.toLocaleString()} chars`;
    }
  }

  // Auto-disable Analyze button if document input is empty (Scenario 1)
  if (!isAnalyzing && btnAnalyze) {
    btnAnalyze.disabled = (trimmedLen === 0);
  }
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

// Render Inspector steps and side-by-side viewer
function renderSideBySide() {
  const cloudContainer = document.getElementById('sidebyside-cloud');
  const userContainer = document.getElementById('sidebyside-user');
  const summaryLineText = document.getElementById('summary-line-text');

  if (summaryLineText) {
    summaryLineText.textContent = inspector.getSummaryLine();
  }

  if (cloudContainer) {
    if (inspector.cloudPayload) {
      // Escape HTML and highlight placeholders
      const escaped = inspector.cloudPayload
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const highlighted = escaped.replace(/(\[[A-Za-z0-9_]+\])/g, '<span class="token-highlight">$1</span>');
      cloudContainer.innerHTML = highlighted;
    } else {
      cloudContainer.innerHTML = '<div style="color:#64748b;padding:8px 0;"><strong>Zero Cloud Transmission:</strong> Document was analyzed 100% on-device. Nothing was sent to the cloud.</div>';
    }
  }

  if (userContainer) {
    if (inspector.whatYouSee) {
      const escaped = inspector.whatYouSee
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      userContainer.innerHTML = escaped;
    } else {
      userContainer.innerHTML = '<p class="text-muted">Awaiting analysis to view restored results.</p>';
    }
  }
}

// Tab Switcher for Inspector Panel
const tabBtnResult = document.getElementById('tab-btn-result');
const tabBtnSideBySide = document.getElementById('tab-btn-sidebyside');
const tabPaneResult = document.getElementById('tab-pane-result');
const tabPaneSideBySide = document.getElementById('tab-pane-sidebyside');

tabBtnResult?.addEventListener('click', () => {
  tabBtnResult.classList.add('active');
  tabBtnSideBySide.classList.remove('active');
  tabPaneResult.classList.add('active');
  tabPaneSideBySide.classList.remove('active');
});

tabBtnSideBySide?.addEventListener('click', () => {
  tabBtnSideBySide.classList.add('active');
  tabBtnResult.classList.remove('active');
  tabPaneSideBySide.classList.add('active');
  tabPaneResult.classList.remove('active');
  renderSideBySide();
});

// Render Inspector steps matching reference design
function renderInspector() {
  renderSideBySide();
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

// Re-entrancy guard to prevent rapid double-clicks (Scenario 8)
let isAnalyzing = false;

// Analyze button handler
btnAnalyze?.addEventListener('click', async () => {
  // Scenario 8: Guard against duplicate concurrent execution
  if (isAnalyzing) {
    console.warn('[Veil] Analysis currently running. Duplicate click ignored.');
    return;
  }

  const text = docInput ? docInput.value.trim() : '';

  // Scenario 1: Friendly empty input handling (no blocking alert popup)
  if (!text) {
    resultBox.innerHTML = `
      <div class="result-prompt">
        <div class="prompt-icon">ℹ️</div>
        <div>
          <strong>No Document Entered</strong>
          <p>Please type or paste a document into the input field above before analyzing.</p>
        </div>
      </div>
    `;
    return;
  }

  isAnalyzing = true;
  btnAnalyze.disabled = true;
  btnAnalyze.querySelector('span').textContent = 'Analyzing...';
  if (completeBanner) completeBanner.style.display = 'none';
  inspector.reset();
  renderInspector();
  resultBox.textContent = 'Evaluating routing and document privacy...';

  try {
    const onDevice = await isOnDeviceAvailable();
    const regexMatches = detectRegex(text);
    const decision = route({
      length: text.length,
      sensitiveFound: regexMatches.length > 0,
      onDeviceAvailable: onDevice,
      online: isDeviceOnline
    });

    console.log('[Router] Decision:', decision);

    // Scenario 2 & 4: Hard Rejection (length cap or offline without Nano)
    if (decision.route === 'REJECT') {
      inspector.addStep({
        id: 'step_reject',
        label: `Rejected: ${decision.reason}`,
        where: 'local-code',
        leftDevice: false,
        durationMs: 0
      });
      renderInspector();

      resultBox.innerHTML = `
        <div class="result-rejection-card">
          <div class="card-badge-reject">Processing Blocked</div>
          <h4>Request Cannot Be Completed</h4>
          <p>${decision.reason}</p>
          <p class="rejection-hint">${text.length > CONFIG.MAX_CHARS ? 'Please shorten or split your document to under 12,000 characters.' : 'Connect to the internet or open in Chrome with on-device Gemini Nano enabled.'}</p>
        </div>
      `;
      return;
    }

    // Scenario 5: Nano unavailable with sensitive document -> Confirmation prompt
    if (decision.route === 'C' && !onDevice) {
      const proceed = window.confirm(
        'On-device Gemini Nano is not available in this browser.\n\n' +
        'Veil will redact structured patterns (payment cards, phones, emails, amounts, PAN, Aadhaar) using local regex patterns.\n\n' +
        'Unstructured names and addresses cannot be detected automatically by AI.\n\n' +
        'You will be able to review all redactions and manually hide names in the next step.\n\n' +
        'Do you wish to proceed with pattern-only redaction?'
      );

      if (!proceed) {
        resultBox.innerHTML = '<strong>Analysis Cancelled:</strong> Operation cancelled by user. Zero data left your device.';
        return;
      }
    }

    // ROUTE A: Pure Local On-Device (Short or Offline)
    if (decision.route === 'A') {
      // Scenario 4: Offline long document warning notice
      if (decision.warning) {
        inspector.addStep({
          id: 'step_offline_warn',
          label: `Offline Notice: ${decision.warning}`,
          where: 'on-device',
          leftDevice: false,
          durationMs: 0
        });
      }

      const tRegex0 = performance.now();
      const regexDur = performance.now() - tRegex0;

      inspector.addStep({
        id: 'step_regex',
        label: `Pattern Scan (${regexMatches.length} regex matches)`,
        where: 'local-code',
        leftDevice: false,
        durationMs: regexDur
      });

      // Scenario 7: Defensive Nano NER with warning note in Inspector
      let nanoWarning = null;
      const tNer0 = performance.now();
      const nerRunner = (typeof window !== 'undefined' && window.detectEntities) ? window.detectEntities : detectEntities;
      const nanoMatches = await nerRunner(text, {
        onWarning: (w) => { nanoWarning = w; }
      });
      const nerDur = performance.now() - tNer0;

      inspector.addStep({
        id: 'step_nano_ner',
        label: nanoWarning
          ? `On-Device Entity Detection (Note: Model unparseable — falling back to regex-only)`
          : `On-Device Entity Detection (${nanoMatches.length} names, orgs, addresses)`,
        where: 'on-device',
        leftDevice: false,
        durationMs: nerDur
      });

      const tMerge0 = performance.now();
      const mergedMatches = mergeMatches([regexMatches, nanoMatches]);
      const { redactedText, map } = buildRedaction(text, mergedMatches);
      const mergeDur = performance.now() - tMerge0;

      inspector.addStep({
        id: 'step_redact',
        label: `Merge & Redaction (${mergedMatches.length} matches, ${map.size} tokens)`,
        where: 'local-code',
        leftDevice: false,
        durationMs: mergeDur
      });

      const tNano0 = performance.now();
      const prompt = `Analyze this document. Summarize key points in 2-3 sentences:\n\n${redactedText}`;
      const { text: modelAnswer, ms: nanoMs } = await runOnDevice(prompt);

      inspector.addStep({
        id: 'step_nano',
        label: 'On-Device Document Analysis (Gemini Nano) [Route A: Local Only]',
        where: 'on-device',
        leftDevice: false,
        durationMs: nanoMs
      });

      const tRest0 = performance.now();
      const validation = validatePlaceholders(modelAnswer, map);
      const restoredAnswer = restore(modelAnswer, map);
      const restDur = performance.now() - tRest0;

      inspector.addStep({
        id: 'step_restore',
        label: `Local Restoration (${map.size} placeholders restored to real values)`,
        where: 'local-code',
        leftDevice: false,
        durationMs: restDur
      });

      inspector.setRoute('A');
      inspector.setHiddenCount(map.size);
      inspector.setWhatYouSee(restoredAnswer);

      if (decision.warning) {
        resultBox.innerHTML = `
          <div class="result-offline-notice">
            <strong>⚡ Offline Notice:</strong> ${decision.warning}
          </div>
          <div>${restoredAnswer}</div>
        `;
      } else {
        resultBox.textContent = restoredAnswer;
      }

      if (completeBanner) completeBanner.style.display = 'flex';
      return;
    }

    // ROUTE B: Public Non-Sensitive Document (Direct Cloud)
    if (decision.route === 'B') {
      const tCloud0 = performance.now();
      const cloudRunner = (typeof window !== 'undefined' && window.analyzeWithCloud) ? window.analyzeWithCloud : analyzeWithCloud;
      const cloudResult = await cloudRunner(text, new Map());
      const cloudDur = performance.now() - tCloud0;

      inspector.addStep({
        id: 'step_cloud',
        label: 'Cloud Document Analysis [Route B: Public Direct Cloud]',
        where: 'cloud',
        leftDevice: true,
        durationMs: cloudDur
      });

      inspector.setRoute('B');
      inspector.setHiddenCount(0);
      inspector.setCloudPayload(text);
      inspector.setWhatYouSee(cloudResult.text);

      resultBox.textContent = cloudResult.text;
      if (completeBanner) completeBanner.style.display = 'flex';
      return;
    }

    // ROUTE C: Sensitive Hybrid (Redact On-Device, Interactive Review, Send to Cloud)
    if (decision.route === 'C') {
      const tRegex0 = performance.now();
      const regexDur = performance.now() - tRegex0;

      inspector.addStep({
        id: 'step_regex',
        label: `Pattern Scan (${regexMatches.length} regex matches)`,
        where: 'local-code',
        leftDevice: false,
        durationMs: regexDur
      });

      let nanoMatches = [];
      if (onDevice) {
        let nanoWarning = null;
        const tNer0 = performance.now();
        const nerRunner = (typeof window !== 'undefined' && window.detectEntities) ? window.detectEntities : detectEntities;
        nanoMatches = await nerRunner(text, {
          onWarning: (w) => { nanoWarning = w; }
        });
        const nerDur = performance.now() - tNer0;

        inspector.addStep({
          id: 'step_nano_ner',
          label: nanoWarning
            ? `On-Device Entity Detection (Note: Model unparseable — falling back to regex-only)`
            : `On-Device Entity Detection (${nanoMatches.length} names, orgs, addresses)`,
          where: 'on-device',
          leftDevice: false,
          durationMs: nerDur
        });
      } else {
        inspector.addStep({
          id: 'step_nano_ner_skip',
          label: 'On-Device Entity Detection Skipped (Nano unavailable — regex-only fallback)',
          where: 'local-code',
          leftDevice: false,
          durationMs: 0
        });
      }

      const mergedMatches = mergeMatches([regexMatches, nanoMatches]);
      renderInspector();

      btnAnalyze.querySelector('span').textContent = 'Awaiting User Review...';
      const reviewed = await showReviewStep(text, mergedMatches);

      if (!reviewed.approved) {
        resultBox.innerHTML = '<strong>Cloud Dispatch Cancelled:</strong> Analysis cancelled by user. Zero data left your device.';
        return;
      }

      btnAnalyze.querySelector('span').textContent = 'Analyzing in Cloud...';

      inspector.addStep({
        id: 'step_redact_reviewed',
        label: `User-Approved Redaction (${reviewed.matches.length} secrets protected, ${reviewed.map.size} unique tokens)`,
        where: 'local-code',
        leftDevice: false,
        durationMs: 1
      });

      // Step 5: Cloud Analysis with verified token payload (Scenario 6: failure handled in catch)
      const tCloud0 = performance.now();
      const cloudRunner = (typeof window !== 'undefined' && window.analyzeWithCloud) ? window.analyzeWithCloud : analyzeWithCloud;
      const cloudResult = await cloudRunner(reviewed.redactedText, reviewed.map);
      const cloudDur = performance.now() - tCloud0;

      inspector.addStep({
        id: 'step_cloud_c',
        label: `Cloud AI Analysis (${cloudResult.retriesUsed > 0 ? 'Retried, ' : ''}App Check Verified)`,
        where: 'cloud',
        leftDevice: true,
        durationMs: cloudDur
      });

      const tRest0 = performance.now();
      const validation = validatePlaceholders(cloudResult.text, reviewed.map);
      const restoredAnswer = restore(cloudResult.text, reviewed.map);
      const restDur = performance.now() - tRest0;

      inspector.addStep({
        id: 'step_restore_c',
        label: `Local Restoration (${reviewed.map.size} placeholders restored in local memory)`,
        where: 'local-code',
        leftDevice: false,
        durationMs: restDur
      });

      inspector.setRoute('C');
      inspector.setHiddenCount(reviewed.matches.length);
      inspector.setCloudPayload(reviewed.redactedText);
      inspector.setWhatYouSee(restoredAnswer);

      // DevTools Inspection Logging
      console.group('🛡️ [Veil Route C: Secure Cloud Analysis]');
      console.log('%c[1. User-Approved Redacted Payload]', 'color: #e11d48; font-weight: bold;', '\n' + reviewed.redactedText);
      console.log('%c[2. Protected Token Map]', 'color: #2563eb; font-weight: bold;');
      console.table(Array.from(reviewed.map.entries()).map(([token, val]) => ({ 'Placeholder': token, 'Secret': val })));
      console.log('%c[3. Cloud AI Response with Placeholders]', 'color: #d97706; font-weight: bold;', '\n' + cloudResult.text);
      console.log('%c[4. Final Restored Output]', 'color: #16a34a; font-weight: bold;', '\n' + restoredAnswer);
      console.groupEnd();

      resultBox.textContent = restoredAnswer;
      if (completeBanner) completeBanner.style.display = 'flex';
    }
  } catch (err) {
    // Scenario 6: Failure handling — Error displayed, NO partial result presented as complete
    console.error('[Veil Analysis Failure]', err);
    inspector.addStep({
      id: 'step_error',
      label: `Analysis Failure: ${err.message}`,
      where: 'cloud',
      leftDevice: true,
      durationMs: 0
    });
    inspector.setWhatYouSee('');
    if (completeBanner) completeBanner.style.display = 'none';

    resultBox.innerHTML = `
      <div class="result-error-card">
        <div class="error-badge">Analysis Failed</div>
        <h4>Unable to Complete Analysis</h4>
        <div class="error-msg">${err.message}</div>
        <div class="error-assurance">
          🛡️ <strong>Zero Data Compromise:</strong> All secrets remained strictly protected on-device. No partial or unverified result is accepted.
        </div>
      </div>
    `;
  } finally {
    isAnalyzing = false;
    updateCharCount();
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
