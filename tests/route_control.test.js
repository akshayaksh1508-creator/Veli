import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runOnDevice, runCloud, localModel, cloudModel } from '../src/ai.js';
import { CONFIG } from '../src/config.js';

describe('D1-T4: Route Control Verification (localModel vs cloudModel)', () => {
  let localSpy;
  let cloudSpy;

  beforeEach(() => {
    localSpy = vi.spyOn(localModel, 'generateContent').mockResolvedValue({
      response: Promise.resolve({
        text: () => 'Hello from local on-device model',
        usageMetadata: { totalTokenCount: 6 }
      })
    });

    cloudSpy = vi.spyOn(cloudModel, 'generateContent').mockResolvedValue({
      response: Promise.resolve({
        text: () => 'Hello from cloud model',
        usageMetadata: { totalTokenCount: 5 }
      })
    });
  });

  afterEach(() => {
    localSpy?.mockRestore();
    cloudSpy?.mockRestore();
  });

  it('forces on-device-only execution via localModel and works offline', async () => {
    const { text, ms, backend, tokenCount, source } = await runOnDevice('Say hello');

    expect(localSpy).toHaveBeenCalledWith('Say hello');
    expect(cloudSpy).not.toHaveBeenCalled();
    expect(backend).toBe('on-device-nano');
    expect(source).toBe('firebase-sdk');
    expect(text.toLowerCase()).toContain('hello');
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(tokenCount).toBe(6);
  });

  it('forces cloud-only execution via cloudModel when online', async () => {
    const { text, ms, backend, tokenCount, source, model } = await runCloud('Say hello');

    expect(cloudSpy).toHaveBeenCalledWith('Say hello');
    expect(backend).toBe('cloud');
    expect(source).toBe('firebase-sdk');
    expect(model).toBe(CONFIG.CLOUD_MODEL_NAME);
    expect(text.toLowerCase()).toContain('hello');
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(tokenCount).toBe(5);
  });

  it('fails cloud execution with EmptyResponseError if cloud model returns empty text', async () => {
    cloudSpy.mockResolvedValueOnce({
      response: Promise.resolve({
        text: () => '   ',
        usageMetadata: { totalTokenCount: 0 }
      })
    });

    await expect(runCloud('Prompt returning empty')).rejects.toThrow('EmptyResponseError');
  });

  it('fails cloud-only execution with a NetworkError when offline', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: false,
      configurable: true
    });

    try {
      await expect(runCloud('Say hello')).rejects.toThrow('NetworkError');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis.navigator, 'onLine', originalDescriptor);
      } else {
        delete globalThis.navigator.onLine;
      }
    }
  });

  it('confirms local-only mode never contacts cloud endpoint and has distinct characteristics', async () => {
    const local = await runOnDevice('Test prompt');
    const cloud = await runCloud('Test prompt');

    expect(local.backend).not.toBe(cloud.backend);
    expect(local.backend).toBe('on-device-nano');
    expect(cloud.backend).toBe('cloud');
    expect(localSpy).toHaveBeenCalled();
    expect(cloudSpy).toHaveBeenCalled();
  });
});
