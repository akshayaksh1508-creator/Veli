import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runOnDevice, localModel } from '../src/ai.js';
import { CONFIG } from '../src/config.js';

describe('On-device source attribution (Firebase SDK vs Chrome direct)', () => {
  let spy;
  beforeEach(() => {
    CONFIG.ALLOW_CHROME_DIRECT_FALLBACK = true;
    CONFIG.ALLOW_SDK_ON_DEVICE = true;   // individual tests exercise the SDK path
  });
  afterEach(() => {
    spy?.mockRestore();
    vi.unstubAllGlobals();
    CONFIG.ALLOW_CHROME_DIRECT_FALLBACK = true;
    CONFIG.ALLOW_SDK_ON_DEVICE = false;  // production default
  });

  it('PRIVACY: with the SDK path disabled (default) the SDK model is never called with the prompt', async () => {
    CONFIG.ALLOW_SDK_ON_DEVICE = false;
    spy = vi.spyOn(localModel, 'generateContent');
    vi.stubGlobal('LanguageModel', {
      create: async () => ({ prompt: async () => 'Chrome answer', destroy() {} })
    });
    const out = await runOnDevice('SENSITIVE: account 5021-8834-2210');
    expect(spy).not.toHaveBeenCalled();
    expect(out.source).toBe('chrome-direct');
    expect(out.sdkFallbackReason).toContain('disabled');
  });

  it('reports source "firebase-sdk" when the SDK on-device model answers', async () => {
    spy = vi.spyOn(localModel, 'generateContent').mockResolvedValue({
      response: Promise.resolve({ text: () => 'SDK answer', usageMetadata: { totalTokenCount: 3 } })
    });
    const out = await runOnDevice('hi');
    expect(out.source).toBe('firebase-sdk');
    expect(out.sdkFallbackReason).toBeUndefined();
  });

  it('labels the Chrome-direct fallback and records why the SDK path failed', async () => {
    spy = vi.spyOn(localModel, 'generateContent').mockRejectedValue(new Error('mode not supported'));
    vi.stubGlobal('LanguageModel', {
      create: async () => ({ prompt: async () => 'Chrome answer', destroy() {} })
    });
    const out = await runOnDevice('hi');
    expect(out.source).toBe('chrome-direct');
    expect(out.sdkFallbackReason).toContain('mode not supported');
    expect(out.text).toBe('Chrome answer');
  });

  it('throws instead of falling back when ALLOW_CHROME_DIRECT_FALLBACK is false', async () => {
    CONFIG.ALLOW_CHROME_DIRECT_FALLBACK = false;
    spy = vi.spyOn(localModel, 'generateContent').mockRejectedValue(new Error('boom'));
    await expect(runOnDevice('hi')).rejects.toThrow('OnDeviceSdkFailed');
  });

  it('throws when neither the SDK nor Chrome can answer (no canned text)', async () => {
    spy = vi.spyOn(localModel, 'generateContent').mockRejectedValue(new Error('boom'));
    await expect(runOnDevice('hi')).rejects.toThrow('OnDeviceModelUnavailable');
  });
});
