import { describe, it, expect } from 'vitest';
import { runOnDevice, checkNanoCapabilities } from '../src/ai.js';

describe('D1-T3: On-Device Gemini Nano Verification', () => {
  it('detects browser capabilities accurately', async () => {
    const caps = await checkNanoCapabilities();
    expect(caps).toBeDefined();
    expect(typeof caps.available).toBe('boolean');
  });

  it('runs prompt "Reply with the word OK" and returns latency measurement', async () => {
    const { text, ms } = await runOnDevice('Reply with the word OK');
    
    expect(text).toContain('OK');
    expect(ms).toBeGreaterThan(0);
    expect(typeof ms).toBe('number');
  });
});
