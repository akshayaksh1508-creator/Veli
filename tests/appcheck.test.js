import { describe, it, expect } from 'vitest';
import { getAppCheckToken } from '../src/firebase.js';

describe('D1-T2: App Check handling in Veil code', () => {
  it('returns null (never a fake token string) when App Check is not initialized', async () => {
    const res = await getAppCheckToken();
    expect(res).toBeNull();
  });
});
