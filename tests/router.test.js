import { describe, it, expect } from 'vitest';
import { route } from '../src/router.js';

describe('D2-T5: Router Decision Table Verification', () => {
  it('routes short sensitive document to Route A (length: 500, sensitive: true, onDevice: true, online: true)', () => {
    const decision = route({
      length: 500,
      sensitiveFound: true,
      onDeviceAvailable: true,
      online: true
    });

    expect(decision.route).toBe('A');
    expect(decision.reason).toContain('local on-device');
    expect(decision.warnings).toHaveLength(0);
  });

  it('routes long sensitive document to Route C (length: 3000, sensitive: true, onDevice: true, online: true)', () => {
    const decision = route({
      length: 3000,
      sensitiveFound: true,
      onDeviceAvailable: true,
      online: true
    });

    expect(decision.route).toBe('C');
    expect(decision.reason).toContain('local on-device redaction');
    expect(decision.warnings).toHaveLength(0);
  });

  it('routes long non-sensitive document to Route B (length: 3000, sensitive: false, onDevice: true, online: true)', () => {
    const decision = route({
      length: 3000,
      sensitiveFound: false,
      onDeviceAvailable: true,
      online: true
    });

    expect(decision.route).toBe('B');
    expect(decision.reason).toContain('directly to Cloud');
    expect(decision.warnings).toHaveLength(0);
  });

  it('routes offline long document to Route A with warning (length: 3000, sensitive: true, onDevice: true, online: false)', () => {
    const decision = route({
      length: 3000,
      sensitiveFound: true,
      onDeviceAvailable: true,
      online: false
    });

    expect(decision.route).toBe('A');
    expect(decision.warning).toBeDefined();
    expect(decision.warning).toContain('Offline mode');
    expect(decision.warnings).toHaveLength(1);
  });

  it('rejects document when offline and on-device model is unavailable (length: 3000, sensitive: true, onDevice: false, online: false)', () => {
    const decision = route({
      length: 3000,
      sensitiveFound: true,
      onDeviceAvailable: false,
      online: false
    });

    expect(decision.route).toBe('REJECT');
    expect(decision.reason).toContain('offline and on-device Gemini Nano is unavailable');
  });

  it('routes to Route C with regex-only warning when online but on-device model is unavailable (length: 3000, sensitive: true, onDevice: false, online: true)', () => {
    const decision = route({
      length: 3000,
      sensitiveFound: true,
      onDeviceAvailable: false,
      online: true
    });

    expect(decision.route).toBe('C');
    expect(decision.warning).toBeDefined();
    expect(decision.warning).toContain('pattern-based (regex-only)');
  });

  it('rejects document exceeding MAX_CHARS hard cap (length: 13000, sensitive: any, onDevice: any, online: any)', () => {
    const decision = route({
      length: 13000,
      sensitiveFound: true,
      onDeviceAvailable: true,
      online: true
    });

    expect(decision.route).toBe('REJECT');
    expect(decision.reason).toContain('exceeds maximum limit');
  });
});
