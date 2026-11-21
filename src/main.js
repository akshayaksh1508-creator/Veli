import { SAMPLES } from './samples.js';
import { CONFIG } from './config.js';
import { detectRegex, mergeMatches, buildRedaction } from './redact.js';
import { restore, validatePlaceholders } from './restore.js';
import { runOnDevice, runCloud, checkNanoCapabilities, isOnDeviceAvailable, prewarmNanoSession } from './ai.js';
import { inspector } from './inspector.js';
import { detectEntities, filterNanoEntities } from './nano-entities.js';
import { analyzeWithCloud, verifyZeroLeakage, computePayloadHash } from './cloud-analysis.js';
import { route } from './router.js';
import { showReviewStep } from './review.js';
import { initRemoteConfig } from './firebase.js';
import { buildLocalAnalysisPrompt } from './prompts.js';
import { renderSafeMarkdown } from './markdown.js';

// Expose test helpers strictly in dev mode (zero production test hooks)
if (typeof window !== 'undefined' && import.meta.env && import.meta.env.DEV) {
  window.detectEntities = detectEntities;
  window.verifyZeroLeakage = verifyZeroLeakage;
  window.route = route;
  window.showReviewStep = showReviewStep;
  window.CONFIG = CONFIG;
  window.setShortLimit = (n) => {
    CONFIG.SHORT_LIMIT = n;
    console.log(`[Veil] SHORT_LIMIT updated to ${n} chars.`);
  };
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

// Track physical network connectivity accurately using standard browser events
let isDeviceOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

// Check on-device status and network status on load
async function initStatus() {
  const nanoBanner = document.getElementById('nano-unavailable-banner');
  const btnDismissBanner = document.getElementById('btn-dismiss-banner');
  btnDismissBanner?.addEventListener('click', () => {
    nanoBanner?.classList.add('hidden');
  });

  // Zero background polling: purely reactive to browser online/offline events
  function updateNetworkStatus() {
    if (!dotNetwork || !textNetwork) return;
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    isDeviceOnline = online;
    dotNetwork.className = online ? 'status-dot active' : 'status-dot';
    textNetwork.textContent = online ? 'Online' : 'Offline';
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();

  // Inspect Nano capabilities (Priority 2 Fix: green when ready, orange only for downloading/unavailable)
  const check = await checkNanoCapabilities();
  if (check.available) {
    dotNano.className = 'status-dot active';
    textNano.textContent = 'Nano: Ready';
    nanoBanner?.classList.add('hidden');
    // Pre-warm base session in background for instant prompt execution
    prewarmNanoSession().catch(() => {});
  } else if (check.status === 'downloading' || check.status === 'downloadable') {
    dotNano.className = 'status-dot warning';
    textNano.textContent = 'Nano: Downloading...';
    nanoBanner?.classList.remove('hidden');
  } else {
    dotNano.className = 'status-dot warning';
    textNano.textContent = 'Nano: Unavailable';
    nanoBanner?.classList.remove('hidden');
  }

  // Initialize Firebase Remote Config (D3-T3)
  await initRemoteConfig();
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

// Track exact result and cryptographic hash passed to cloud call for verified byte-for-byte audit
let lastCloudPayloadSent = null;
let lastCloudAnalysisResult = null;

// Helper to detect non-responsive or broken model replies (Priority 1: Fix 2)
function isBrokenReply(text) {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length < 20) return true;
  if (/please provide/i.test(trimmed)) return true;
  if (/as an ai/i.test(trimmed) && trimmed.length < 50) return true;
  return false;
}

// Sample document buttons fill the textarea & toggle active state (D3-T2)
document.querySelectorAll('.sample-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sample-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const key = btn.dataset.sample;
    if (SAMPLES[key]) {
      docInput.value = SAMPLES[key].text;
      updateCharCount();
    }
  });
});

// Render Inspector steps and side-by-side viewer
function renderSideBySide() {
  const cloudContainer = document.getElementById('sidebyside-cloud');
  const userContainer = document.getElementById('sidebyside-user');
  const summaryLineText = document.getElementById('summary-line-text');
  const verifiedFooter = document.getElementById('sidebyside-verified-footer');

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
      userContainer.innerHTML = renderSafeMarkdown(inspector.whatYouSee);
    } else {
      userContainer.innerHTML = '<p class="text-muted">Awaiting analysis to view restored results.</p>';
    }
  }

  // Priority 1: Fix 7 & Issue 3 — Cryptographic byte-for-byte verification between displayed payload and cloud dispatch
  if (verifiedFooter) {
    const isRouteC = inspector.route === 'C';
    if (isRouteC && inspector.cloudPayload && lastCloudAnalysisResult && lastCloudAnalysisResult.payloadHash) {
      computePayloadHash(inspector.cloudPayload).then(displayedHash => {
        // 1) the displayed text hashes to the redacted text that was prepared for the cloud, and
        // 2) that exact text is contained in the prompt string that was passed to the SDK call.
        const dispatched = lastCloudAnalysisResult.promptDispatched || '';
        const isMatch = (displayedHash === lastCloudAnalysisResult.payloadHash)
          && dispatched.includes(inspector.cloudPayload);
        verifiedFooter.style.display = isMatch ? 'flex' : 'none';
      }).catch(() => {
        verifiedFooter.style.display = 'none';
      });
    } else {
      verifiedFooter.style.display = 'none';
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
    // Show step notes (for example: why the Firebase SDK path was skipped) as plain text
    if (step.note) {
      row.style.flexWrap = 'wrap';
      const noteEl = document.createElement('div');
      noteEl.textContent = `⚠ ${step.note}`;
      noteEl.style.cssText = 'flex-basis:100%;font-size:0.75rem;color:#b45309;margin-top:4px;';
      row.appendChild(noteEl);
    }
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
  btnAnalyze.querySelector('span').textContent = 'Evaluating...';
  if (completeBanner) completeBanner.style.display = 'none';
  inspector.reset();
  lastCloudPayloadSent = null;
  renderInspector();
  resultBox.innerHTML = `
    <div class="loading-indicator">
      <div class="spinner"></div>
      <div>
        <strong>Evaluating Privacy & Routing...</strong>
        <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Checking on-device AI capabilities and pattern matching...</div>
      </div>
    </div>
  `;

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

    // Priority 1: Fix 3 — Build banner from router's real route and reason
    if (calloutText) {
      if (decision.route === 'A') {
        calloutText.textContent = `Route A (On-Device): ${decision.reason}`;
      } else if (decision.route === 'B') {
        calloutText.textContent = `Route B (Direct Cloud): ${decision.reason}`;
      } else if (decision.route === 'C') {
        calloutText.textContent = `Route C (Hybrid): ${decision.reason}`;
      } else if (decision.route === 'REJECT') {
        calloutText.textContent = `Rejected: ${decision.reason}`;
      }
    }

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
    // Priority 1: Fix 4 & 7 — Skip redundant redaction; send original text directly to Nano (saves 7-12s and avoids multi-turn bugs)
    if (decision.route === 'A') {
      if (decision.warning) {
        inspector.addStep({
          id: 'step_offline_warn',
          label: `Offline Notice: ${decision.warning}`,
          where: 'on-device',
          leftDevice: false,
          durationMs: 0
        });
      }

      btnAnalyze.querySelector('span').textContent = 'Analyzing locally (Nano AI)...';
      resultBox.innerHTML = `
        <div class="loading-indicator">
          <div class="spinner"></div>
          <div>
            <strong>Analyzing Document on Gemini Nano</strong>
            <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Route A: Pure on-device execution. Nothing leaves your device.</div>
          </div>
        </div>
      `;

      const prompt = buildLocalAnalysisPrompt(text);
      const tNano0 = performance.now();
      let nanoResult = await runOnDevice(prompt);
      const nanoMs = Math.round(performance.now() - tNano0);

      // Priority 1: Fix 2 — Guard against broken replies (< 20 chars or "please provide") with single retry
      if (isBrokenReply(nanoResult.text)) {
        console.warn('[Route A] Nano returned incomplete response. Retrying once with fresh session...');
        nanoResult = await runOnDevice(prompt);
      }

      if (isBrokenReply(nanoResult.text)) {
        if (completeBanner) completeBanner.style.display = 'none';
        inspector.addStep({
          id: 'step_nano_incomplete',
          label: 'On-Device Analysis Returned Incomplete Output',
          where: 'on-device',
          leftDevice: false,
          durationMs: nanoMs
        });
        inspector.setRoute('A');
        inspector.setHiddenCount(0);
        inspector.setCloudPayload('');
        inspector.setWhatYouSee('');

        resultBox.innerHTML = `
          <div class="result-error-card">
            <div class="error-badge">On-Device Incomplete</div>
            <h4>Unable to Complete On-Device Analysis</h4>
            <div class="error-msg">${nanoResult.text || 'Gemini Nano returned an insufficient response.'}</div>
            <div class="error-assurance">
              🛡️ Zero data left your device. Try rephrasing or running online.
            </div>
          </div>
        `;
        return;
      }

      const nanoSourceLabel = nanoResult.source === 'firebase-sdk'
        ? 'Firebase AI Logic SDK'
        : 'Chrome LanguageModel API';

      inspector.addStep({
        id: 'step_nano',
        label: `On-Device Document Analysis (${nanoSourceLabel}) [Route A: Local Only]`,
        where: 'on-device',
        leftDevice: false,
        durationMs: nanoMs,
        source: nanoResult.source,
        note: nanoResult.sdkFallbackReason
          ? `Firebase SDK on-device path failed, so Chrome's LanguageModel API answered instead: ${nanoResult.sdkFallbackReason}`
          : undefined
      });

      inspector.setRoute('A');
      inspector.setHiddenCount(0);
      inspector.setCloudPayload('');
      inspector.setWhatYouSee(nanoResult.text);

      if (decision.warning) {
        resultBox.innerHTML = `
          <div class="result-offline-notice">
            <strong>⚡ Offline Notice:</strong> ${decision.warning}
          </div>
          <div>${renderSafeMarkdown(nanoResult.text)}</div>
        `;
      } else {
        resultBox.innerHTML = renderSafeMarkdown(nanoResult.text);
      }

      if (completeBanner) completeBanner.style.display = 'flex';
      return;
    }

    // ROUTE B: Public Non-Sensitive Document (Direct Cloud)
    if (decision.route === 'B') {
      btnAnalyze.querySelector('span').textContent = 'Analyzing in Cloud AI...';
      resultBox.innerHTML = `
        <div class="loading-indicator">
          <div class="spinner"></div>
          <div>
            <strong>Analyzing with Cloud AI (Route B: Direct Cloud)</strong>
            <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Sending public document directly to Cloud Gemini...</div>
          </div>
        </div>
      `;

      const tCloud0 = performance.now();
      lastCloudPayloadSent = text;
      const cloudResult = await analyzeWithCloud(text, new Map());
      lastCloudAnalysisResult = cloudResult;
      const cloudDur = performance.now() - tCloud0;

      if (isBrokenReply(cloudResult.text)) {
        if (completeBanner) completeBanner.style.display = 'none';
        throw new Error(`Cloud model returned broken response: "${cloudResult.text}"`);
      }

      inspector.addStep({
        id: 'step_cloud',
        label: 'Cloud Document Analysis [Route B: Public Direct Cloud]',
        where: 'cloud',
        leftDevice: true,
        durationMs: cloudDur,
        model: cloudResult.model || CONFIG.CLOUD_MODEL_NAME,
        tokenCount: cloudResult.tokenCount,
        source: cloudResult.source || 'firebase-sdk'
      });

      inspector.setRoute('B');
      inspector.setHiddenCount(0);
      inspector.setCloudPayload(text);
      inspector.setWhatYouSee(cloudResult.text);

      resultBox.innerHTML = renderSafeMarkdown(cloudResult.text);
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
        btnAnalyze.querySelector('span').textContent = 'Scanning on-device (Nano AI)...';
        resultBox.innerHTML = `
          <div class="loading-indicator">
            <div class="spinner"></div>
            <div>
              <strong>On-Device Entity Detection (Gemini Nano)</strong>
              <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Scanning locally for names, organizations, and addresses...</div>
            </div>
          </div>
        `;

        let nanoWarning = null;
        const tNer0 = performance.now();
        try {
          nanoMatches = await detectEntities(text, {
            onWarning: (w) => { nanoWarning = w; }
          });
        } catch (nerErr) {
          nanoWarning = nerErr.message || 'On-device entity detection failed';
          nanoMatches = [];
        }
        const nerDur = performance.now() - tNer0;

        // Priority 2 Quality Fix: Filter to keep only PERSON, ORG, ADDRESS and drop regex overlaps
        const validNanoMatches = filterNanoEntities(nanoMatches, regexMatches);

        inspector.addStep({
          id: 'step_nano_ner',
          label: nanoWarning
            ? `On-Device Entity Detection (Note: Model unparseable — falling back to regex-only)`
            : `On-Device Entity Detection (${validNanoMatches.length} names, orgs, addresses)`,
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

      const validNanoMatches = filterNanoEntities(nanoMatches, regexMatches);
      const mergedMatches = mergeMatches([regexMatches, validNanoMatches]);
      renderInspector();

      btnAnalyze.querySelector('span').textContent = 'Awaiting User Review...';
      const reviewed = await showReviewStep(text, mergedMatches);

      if (!reviewed.approved) {
        resultBox.innerHTML = '<strong>Cloud Dispatch Cancelled:</strong> Analysis cancelled by user. Zero data left your device.';
        return;
      }

      btnAnalyze.querySelector('span').textContent = 'Analyzing in Cloud AI...';
      resultBox.innerHTML = `
        <div class="loading-indicator">
          <div class="spinner"></div>
          <div>
            <strong>Analyzing with Cloud AI (Route C: Hybrid Cloud)</strong>
            <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">Transmitting redacted payload with zero raw secrets...</div>
          </div>
        </div>
      `;

      inspector.addStep({
        id: 'step_redact_reviewed',
        label: `User-Approved Redaction (${reviewed.matches.length} secrets protected, ${reviewed.map.size} unique tokens)`,
        where: 'local-code',
        leftDevice: false,
        durationMs: 1
      });

      // Step 5: Cloud Analysis with verified token payload (Scenario 6: failure handled in catch)
      const tCloud0 = performance.now();
      lastCloudPayloadSent = reviewed.redactedText;
      const cloudResult = await analyzeWithCloud(reviewed.redactedText, reviewed.map);
      lastCloudAnalysisResult = cloudResult;
      const cloudDur = performance.now() - tCloud0;

      if (isBrokenReply(cloudResult.text)) {
        if (completeBanner) completeBanner.style.display = 'none';
        throw new Error(`Cloud model returned broken response: "${cloudResult.text}"`);
      }

      const appCheckLabel = cloudResult.appCheckVerified
        ? 'App Check: token obtained'
        : 'App Check: unconfigured in dev';

      inspector.addStep({
        id: 'step_cloud_c',
        label: `Cloud AI Analysis (${cloudResult.retriesUsed > 0 ? 'Retried, ' : ''}${appCheckLabel})`,
        where: 'cloud',
        leftDevice: true,
        durationMs: cloudDur,
        model: cloudResult.model || CONFIG.CLOUD_MODEL_NAME,
        tokenCount: cloudResult.tokenCount,
        source: cloudResult.source || 'firebase-sdk'
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

      resultBox.innerHTML = renderSafeMarkdown(restoredAnswer);
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

// Initialize on page load (starts with empty input per user requirement)
initStatus();
if (docInput) {
  docInput.value = '';
}
if (calloutText) {
  calloutText.textContent = 'Paste any document containing sensitive personal, financial, or contract data to analyze securely.';
}
updateCharCount();
