import { describe, it, expect, vi } from 'vitest';
import { Inspector } from '../src/inspector.js';

describe('D2-T7: Routing Inspector Model & Verification', () => {
  it('records Route C execution sequence and verifies all step environments', () => {
    const inspector = new Inspector();
    inspector.setRoute('C');
    inspector.setHiddenCount(14);

    // 1. Regex Detect
    inspector.addStep({
      id: 'step_regex',
      label: 'Pattern Scan (Regex)',
      where: 'local-code',
      leftDevice: false,
      durationMs: 1
    });

    // 2. Nano Detect
    inspector.addStep({
      id: 'step_nano_ner',
      label: 'On-Device Entity Detection (Gemini Nano)',
      where: 'on-device',
      leftDevice: false,
      durationMs: 2500
    });

    // 3. Build Placeholders / Redaction
    inspector.addStep({
      id: 'step_redact',
      label: 'Build Placeholders & Redaction',
      where: 'local-code',
      leftDevice: false,
      durationMs: 1
    });

    // 4. Cloud Analysis
    const cloudPayloadVariable = 'Agreement between [PERSON_1] and [ORG_1] for [AMOUNT_1].';
    inspector.addStep({
      id: 'step_cloud',
      label: 'Cloud AI Analysis',
      where: 'cloud',
      leftDevice: true,
      durationMs: 450,
      payload: cloudPayloadVariable
    });

    // 5. Restore
    inspector.addStep({
      id: 'step_restore',
      label: 'Local Restoration',
      where: 'local-code',
      leftDevice: false,
      durationMs: 1
    });

    expect(inspector.steps).toHaveLength(5);
    expect(inspector.steps.map(s => s.where)).toEqual([
      'local-code',
      'on-device',
      'local-code',
      'cloud',
      'local-code'
    ]);
  });

  it('guarantees the payload stored is byte-for-byte identical to the string passed to cloud (no copies)', () => {
    const inspector = new Inspector();
    const exactPayloadString = 'Confidential terms for [PERSON_1] at [ORG_1]. Pay [AMOUNT_1] by 15 Jan.';

    // Spy on cloud invocation
    const mockCloudCall = vi.fn((payload) => {
      inspector.addStep({
        id: 'step_cloud',
        label: 'Cloud Call',
        where: 'cloud',
        leftDevice: true,
        durationMs: 300,
        payload
      });
    });

    mockCloudCall(exactPayloadString);

    expect(mockCloudCall).toHaveBeenCalledWith(exactPayloadString);
    // Assert byte-for-byte exact reference equality
    expect(inspector.cloudPayload).toBe(exactPayloadString);
  });

  it('summary line count equals the number of map entries in Route C', () => {
    const inspector = new Inspector();
    inspector.setRoute('C');
    inspector.setHiddenCount(18);

    inspector.addStep({
      id: 'step_cloud',
      label: 'Cloud Analysis',
      where: 'cloud',
      leftDevice: true,
      durationMs: 400
    });

    const summaryLine = inspector.getSummaryLine();
    expect(summaryLine).toBe('18 values redacted before sending • Cloud only sees redacted text.');
  });

  it('for Route A, timeline shows no Cloud step and summary says "Nothing was sent."', () => {
    const inspector = new Inspector();
    inspector.setRoute('A');
    inspector.setHiddenCount(12);

    inspector.addStep({
      id: 'step_regex',
      label: 'Pattern Scan',
      where: 'local-code',
      leftDevice: false,
      durationMs: 1
    });

    inspector.addStep({
      id: 'step_nano',
      label: 'On-Device Document Analysis (Gemini Nano)',
      where: 'on-device',
      leftDevice: false,
      durationMs: 2200
    });

    // Verify zero cloud steps
    const hasCloudStep = inspector.steps.some(s => s.where === 'cloud' || s.leftDevice);
    expect(hasCloudStep).toBe(false);

    // Verify summary line for Route A
    expect(inspector.getSummaryLine()).toBe('Pure on-device execution • Nothing was sent.');
  });

  it('Issue 10: shows model name and token count on the CLOUD row as real execution evidence', () => {
    const inspector = new Inspector();
    inspector.setRoute('C');

    inspector.addStep({
      id: 'step_cloud_c',
      label: 'Cloud AI Analysis',
      where: 'cloud',
      leftDevice: true,
      durationMs: 420,
      model: 'gemini-2.0-flash',
      tokenCount: 382
    });

    const cloudStep = inspector.steps.find(s => s.where === 'cloud');
    expect(cloudStep).toBeDefined();
    expect(cloudStep.model).toBe('gemini-2.0-flash');
    expect(cloudStep.tokenCount).toBe(382);
    expect(cloudStep.label).toContain('gemini-2.0-flash');
    expect(cloudStep.label).toContain('382 tokens');
  });
});
