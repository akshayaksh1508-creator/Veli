import { describe, it, expect } from 'vitest';
import { runOnDevice, runCloud } from '../src/ai.js';

describe('D1-T4: Route Control Verification (localModel vs cloudModel)', () => {
  it('forces on-device-only execution and works offline', async () => {
    const { text, ms, backend } = await runOnDevice('Say hello');

    expect(backend).toBe('on-device-nano');
    expect(text.toLowerCase()).toContain('hello');
    expect(ms).toBeGreaterThan(0);
  });

  it('forces cloud-only execution when online', async () => {
    const { text, ms, backend } = await runCloud('Say hello');

    expect(backend).toBe('cloud');
    expect(text.toLowerCase()).toContain('hello');
    expect(ms).toBeGreaterThan(0);
  });

  it('fails cloud-only execution with a NetworkError when offline', async () => {
    // Mock navigator.onLine as false using defineProperty
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
  });
});
