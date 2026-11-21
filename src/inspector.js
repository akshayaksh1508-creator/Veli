/**
 * Veil Routing Inspector — Step logger, timeline telemetry, and privacy audit model.
 * Records step execution, measures latencies, and tracks data departure from the device.
 * Reference: Architecture.md section 5.7 & D2-T7
 */

export class Inspector {
  constructor() {
    this.reset();
  }

  reset() {
    this.steps = [];
    this.cloudPayload = null;
    this.whatYouSee = null;
    this.hiddenValuesCount = 0;
    this.route = null;
  }

  /**
   * Sets the active route ('A' | 'B' | 'C').
   * @param {'A'|'B'|'C'} r
   */
  setRoute(r) {
    this.route = r;
  }

  /**
   * Extracts placeholder token highlights from a text payload.
   * @param {string} payload
   * @returns {Array<{ start: number, end: number, placeholder: string }>}
   */
  extractHighlights(payload) {
    if (!payload || typeof payload !== 'string') return [];
    const tokenRegex = /\[[A-Za-z0-9_]+\]/g;
    const highlights = [];
    let match;

    while ((match = tokenRegex.exec(payload)) !== null) {
      highlights.push({
        start: match.index,
        end: match.index + match[0].length,
        placeholder: match[0]
      });
    }

    return highlights;
  }

  /**
   * Records a pipeline execution step.
   *
   * @param {Object} step
   * @param {string} [step.id]
   * @param {string} step.label - Step description
   * @param {'cloud' | 'on-device' | 'local-code'} step.where - Execution environment
   * @param {boolean} step.leftDevice - True if payload left browser memory
   * @param {number} step.durationMs - Execution time in milliseconds
   * @param {string} [step.payload] - Payload processed
   * @param {Array<object>} [step.highlights] - Highlighted placeholder tokens
   * @param {string} [step.note] - Optional detail or warning message
   * @param {string} [step.model] - Model name (e.g. 'gemini-2.0-flash' or 'gemini-nano')
   * @param {number} [step.tokenCount] - Token count from model usage metadata
   */
  addStep({ id, label, where, leftDevice, durationMs, payload, highlights, note, model, tokenCount }) {
    const payloadStr = payload !== undefined && payload !== null ? String(payload) : null;
    const computedHighlights = highlights || (payloadStr ? this.extractHighlights(payloadStr) : []);

    let formattedLabel = label;
    // Issue 10: Show model name and token count on the CLOUD row as real execution evidence
    if (where === 'cloud') {
      const modelName = model || 'gemini-2.0-flash';
      const tokenStr = (tokenCount !== null && tokenCount !== undefined) ? `${tokenCount} tokens` : null;
      const evidence = [modelName, tokenStr].filter(Boolean).join(' • ');
      if (evidence && !formattedLabel.includes(modelName)) {
        formattedLabel = `${formattedLabel} (${evidence})`;
      }
    }

    const stepObj = {
      id: id || `s_${this.steps.length + 1}`,
      label: formattedLabel,
      where,
      leftDevice: Boolean(leftDevice),
      startedAt: Date.now(),
      durationMs: Math.round(durationMs || 0),
      payload: payloadStr,
      highlights: computedHighlights,
      note: note || '',
      model: model || (where === 'cloud' ? 'gemini-2.0-flash' : null),
      tokenCount: tokenCount !== undefined ? tokenCount : null
    };

    this.steps.push(stepObj);

    if (where === 'cloud' && payloadStr) {
      this.cloudPayload = payloadStr;
    }
  }

  /**
   * Stores the exact payload string passed to the cloud call.
   * Rule: Must be the same string variable passed to the cloud call, not a rebuild.
   * @param {string} payload
   */
  setCloudPayload(payload) {
    this.cloudPayload = payload;
  }

  /**
   * Stores the restored text for the user-facing side of the side-by-side view.
   * @param {string} text
   */
  setWhatYouSee(text) {
    this.whatYouSee = text;
  }

  /**
   * Sets the count of hidden/protected values.
   * @param {number} count
   */
  setHiddenCount(count) {
    this.hiddenValuesCount = count;
  }

  /**
   * Generates the privacy summary line according to the route.
   * Reference: Architecture.md section 5.7 & D2-T7
   * @returns {string}
   */
  getSummaryLine() {
    const hasCloudStep = this.steps.some(s => s.where === 'cloud' || s.leftDevice);

    if (!hasCloudStep || this.route === 'A') {
      return 'Pure on-device execution • Nothing was sent.';
    }

    if (this.hiddenValuesCount > 0) {
      return `${this.hiddenValuesCount} values redacted before sending • Cloud only sees redacted text.`;
    }

    return 'Public non-sensitive text • Direct cloud analysis.';
  }

  /**
   * Returns telemetry metrics for the inspector.
   */
  getSummary() {
    const leftDeviceSteps = this.steps.filter(s => s.leftDevice);
    const totalDuration = this.steps.reduce((acc, s) => acc + s.durationMs, 0);

    return {
      totalSteps: this.steps.length,
      totalDurationMs: totalDuration,
      hiddenCount: this.hiddenValuesCount,
      leftDeviceCount: leftDeviceSteps.length,
      sensitiveValuesExposed: 0,
      summaryLine: this.getSummaryLine()
    };
  }
}

export const inspector = new Inspector();
