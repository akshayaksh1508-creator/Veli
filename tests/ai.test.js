import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runOnDevice, checkNanoCapabilities, localModel } from '../src/ai.js';

describe('D1-T3: On-Device Gemini Nano Verification', () => {
  let generateContentSpy;

  beforeEach(() => {
    generateContentSpy = vi.spyOn(localModel, 'generateContent').mockResolvedValue({
      response: Promise.resolve({
        text: () => 'OK',
        usageMetadata: { totalTokenCount: 1 }
      })
    });
  });

  afterEach(() => {
    generateContentSpy?.mockRestore();
  });

  it('detects browser capabilities accurately', async () => {
    const caps = await checkNanoCapabilities();
    expect(caps).toBeDefined();
    expect(typeof caps.available).toBe('boolean');
  });

  it('runs prompt "Reply with the word OK" via localModel and returns latency measurement', async () => {
    const { text, ms, backend } = await runOnDevice('Reply with the word OK');
    
    expect(generateContentSpy).toHaveBeenCalledWith('Reply with the word OK');
    expect(text).toContain('OK');
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(typeof ms).toBe('number');
    expect(backend).toBe('on-device-nano');
  });
});
