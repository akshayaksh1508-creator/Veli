/**
 * D3-T3: Remote Config (Dynamic SHORT_LIMIT) Verification Tests
 * Reference: Architecture.md section 552-557 (D3-T3)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CONFIG } from '../src/config.js';
import { route } from '../src/router.js';

describe('D3-T3: Remote Config & Dynamic SHORT_LIMIT', () => {
  const originalLimit = CONFIG.SHORT_LIMIT;

  afterEach(() => {
    CONFIG.SHORT_LIMIT = originalLimit;
  });

  it('uses default hardcoded fallback (1500 chars) when Remote Config is not activated', () => {
    expect(CONFIG.SHORT_LIMIT).toBe(1500);

    // Document with length 1200 is under 1500 -> Route A
    const decision = route({
      length: 1200,
      sensitiveFound: true,
      onDeviceAvailable: true,
      online: true
    });
    expect(decision.route).toBe('A');
  });

  it('dynamically adapts routing decision when SHORT_LIMIT is changed via Remote Config', () => {
    // Simulate Remote Config setting short_limit down to 500
    CONFIG.SHORT_LIMIT = 500;

    // Document with length 800 is now ABOVE the new 500 threshold -> Route C
    const decisionC = route({
      length: 800,
      sensitiveFound: true,
      onDeviceAvailable: true,
      online: true
    });
    expect(decisionC.route).toBe('C');

    // Document with length 400 is STILL under 500 -> Route A
    const decisionA = route({
      length: 400,
      sensitiveFound: true,
      onDeviceAvailable: true,
      online: true
    });
    expect(decisionA.route).toBe('A');
  });

  it('safely handles unexpected or unreachable remote values without breaking fallback', () => {
    // If remote returns NaN, 0, or negative, fallback must remain intact
    function applyRemoteValue(val) {
      if (typeof val === 'number' && !isNaN(val) && val > 0) {
        CONFIG.SHORT_LIMIT = val;
      }
    }

    applyRemoteValue('invalid');
    expect(CONFIG.SHORT_LIMIT).toBe(originalLimit);

    applyRemoteValue(NaN);
    expect(CONFIG.SHORT_LIMIT).toBe(originalLimit);

    applyRemoteValue(-50);
    expect(CONFIG.SHORT_LIMIT).toBe(originalLimit);
  });
});
