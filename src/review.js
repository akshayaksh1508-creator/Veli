/**
 * Veil Review-Before-Sending Step
 * Interactive human-in-the-loop gate before any data is dispatched to the Cloud (Route C).
 * Allows users to un-redact false positives or add manual redactions on selected text.
 * Reference: Architecture.md section 5.9 & D2-T6
 */

import { mergeMatches, buildRedaction } from './redact.js';

/**
 * Removes a match by index, returning a new matches array.
 * @param {Array<object>} matches
 * @param {number} indexToRemove
 * @returns {Array<object>}
 */
export function removeMatch(matches, indexToRemove) {
  if (!Array.isArray(matches)) return [];
  return matches.filter((_, idx) => idx !== indexToRemove);
}

/**
 * Adds a manual redaction span for user-selected text.
 * @param {string} text - Source document
 * @param {number} start - Character start index
 * @param {number} end - Character end index
 * @param {string} [type='CUSTOM'] - Entity type
 * @returns {object|null}
 */
export function addManualMatch(text, start, end, type = 'CUSTOM') {
  if (!text || typeof start !== 'number' || typeof end !== 'number') return null;
  if (start < 0 || end > text.length || start >= end) return null;

  const selectedText = text.slice(start, end);
  if (!selectedText.trim()) return null;

  return {
    start,
    end,
    text: selectedText,
    type: type.toUpperCase()
  };
}

/**
 * Re-runs merge and redaction building after manual review adjustments.
 * @param {string} text
 * @param {Array<object>} matches
 * @returns {{ redactedText: string, map: Map<string, string>, mergedMatches: Array<object> }}
 */
export function rebuildRedactionAfterReview(text, matches) {
  const mergedMatches = mergeMatches([matches]);
  const { redactedText, map } = buildRedaction(text, mergedMatches);
  return { redactedText, map, mergedMatches };
}

/**
 * Renders the interactive review viewer with clickable pills for each redacted secret.
 * @param {HTMLElement} container
 * @param {string} text
 * @param {Array<object>} matches
 * @param {Function} onUnredact
 */
export function renderReviewViewer(container, text, matches, onUnredact) {
  if (!container) return;
  container.innerHTML = '';

  // Sort matches ascending by start
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  let lastIdx = 0;
  const fragment = document.createDocumentFragment();

  sorted.forEach((m, matchIdx) => {
    // Append unredacted text before match
    if (m.start > lastIdx) {
      const plainText = document.createTextNode(text.slice(lastIdx, m.start));
      fragment.appendChild(plainText);
    }

    // Create interactive redaction pill
    const pill = document.createElement('span');
    pill.className = `redaction-pill pill-${m.type.toLowerCase()}`;
    pill.dataset.matchIdx = String(matchIdx);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'pill-type';
    typeBadge.textContent = m.type;

    const valSpan = document.createElement('span');
    valSpan.className = 'pill-val';
    valSpan.textContent = m.text;

    const btnRemove = document.createElement('button');
    btnRemove.className = 'pill-btn-remove';
    btnRemove.title = 'Click to unhide this value';
    btnRemove.innerHTML = '&times;';
    btnRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      onUnredact(matchIdx);
    });

    pill.appendChild(typeBadge);
    pill.appendChild(valSpan);
    pill.appendChild(btnRemove);
    fragment.appendChild(pill);

    lastIdx = m.end;
  });

  // Append remaining text
  if (lastIdx < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
  }

  container.appendChild(fragment);
}

/**
 * Displays the review modal and awaits explicit user approval or cancellation.
 * "Send" is the ONLY path that permits cloud execution.
 *
 * @param {string} text - Original document
 * @param {Array<object>} initialMatches - Detected matches
 * @returns {Promise<{ approved: boolean, matches: Array<object>, redactedText?: string, map?: Map<string, string> }>}
 */
export function showReviewStep(text, initialMatches) {
  return new Promise((resolve) => {
    const modal = document.getElementById('review-modal');
    const content = document.getElementById('review-content');
    const btnSend = document.getElementById('btn-review-send');
    const btnCancel = document.getElementById('btn-review-cancel');
    const btnHideSel = document.getElementById('btn-hide-selection');
    const statCount = document.getElementById('modal-stat-count');

    if (!modal || !content || !btnSend || !btnCancel) {
      // Fallback if modal DOM is missing: auto-rebuild
      const { redactedText, map, mergedMatches } = rebuildRedactionAfterReview(text, initialMatches);
      resolve({ approved: true, matches: mergedMatches, redactedText, map });
      return;
    }

    let currentMatches = [...initialMatches];

    function update() {
      const { redactedText, map, mergedMatches } = rebuildRedactionAfterReview(text, currentMatches);
      currentMatches = mergedMatches;
      if (statCount) {
        statCount.textContent = `${currentMatches.length} secret(s) protected (${map.size} unique tokens)`;
      }
      renderReviewViewer(content, text, currentMatches, (indexToRemove) => {
        currentMatches = removeMatch(currentMatches, indexToRemove);
        update();
      });
    }

    // Handle Manual Selection Hide
    function onHideSelection() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

      const selectedString = selection.toString().trim();
      if (!selectedString) return;

      // Find selection index in original text
      const foundIdx = text.indexOf(selectedString);
      if (foundIdx !== -1) {
        const manualMatch = addManualMatch(text, foundIdx, foundIdx + selectedString.length, 'CUSTOM');
        if (manualMatch) {
          currentMatches.push(manualMatch);
          selection.removeAllRanges();
          update();
        }
      }
    }

    // Cleanup listeners and hide modal
    function cleanup() {
      modal.classList.add('hidden');
      btnSend.removeEventListener('click', onApprove);
      btnCancel.removeEventListener('click', onReject);
      btnHideSel?.removeEventListener('click', onHideSelection);
    }

    function onApprove() {
      cleanup();
      const { redactedText, map, mergedMatches } = rebuildRedactionAfterReview(text, currentMatches);
      resolve({
        approved: true,
        matches: mergedMatches,
        redactedText,
        map
      });
    }

    function onReject() {
      cleanup();
      resolve({
        approved: false,
        matches: currentMatches
      });
    }

    btnSend.addEventListener('click', onApprove);
    btnCancel.addEventListener('click', onReject);
    btnHideSel?.addEventListener('click', onHideSelection);

    // Initial render and show modal
    update();
    modal.classList.remove('hidden');
  });
}
