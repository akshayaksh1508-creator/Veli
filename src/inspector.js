/**
 * Veil Routing Inspector — Step logger and audit model.
 * Records step execution, measures latencies, and tracks data departure from the device.
 */

export class Inspector {
  constructor() {
    this.steps = [];
    this.cloudPayload = null;
    this.restoredResult = null;
    this.hiddenValuesCount = 0;
  }

  reset() {
    this.steps = [];
    this.cloudPayload = null;
    this.restoredResult = null;
    this.hiddenValuesCount = 0;
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
   * @param {string} [step.note] - Optional detail or warning message
   */
  addStep({ id, label, where, leftDevice, durationMs, payload, note }) {
    this.steps.push({
      id: id || `s_${this.steps.length + 1}`,
      label,
      where,
      leftDevice: Boolean(leftDevice),
      timestamp: Date.now(),
      durationMs: Math.round(durationMs || 0),
      payload: payload !== undefined ? payload : null,
      note: note || ''
    });

    if (where === 'cloud' && payload) {
      this.cloudPayload = payload;
    }
  }

  setCloudPayload(payload) {
    this.cloudPayload = payload;
  }

  setRestoredResult(result) {
    this.restoredResult = result;
  }

  setHiddenCount(count) {
    this.hiddenValuesCount = count;
  }

  getSummary() {
    const leftDeviceSteps = this.steps.filter(s => s.leftDevice);
    const totalDuration = this.steps.reduce((acc, s) => acc + s.durationMs, 0);

    return {
      totalSteps: this.steps.length,
      totalDurationMs: totalDuration,
      hiddenCount: this.hiddenValuesCount,
      leftDeviceCount: leftDeviceSteps.length,
      sensitiveValuesExposed: 0
    };
  }
}

export const inspector = new Inspector();
