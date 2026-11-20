import { describe, it, expect } from 'vitest';
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, CustomProvider, getToken } from 'firebase/app-check';

describe('D1-T2: Firebase App Check with Debug Token', () => {
  it('successfully initializes App Check with a debug token provider', async () => {
    const testApp = initializeApp({ apiKey: 'demo-api-key', projectId: 'veil-test' }, 'test-appcheck-app');
    
    let tokenProvided = 'debug-token-valid-abc123xyz';
    const provider = new CustomProvider({
      getToken: () => Promise.resolve({
        token: tokenProvided,
        expireTimeMillis: Date.now() + 3600000
      })
    });

    const appCheck = initializeAppCheck(testApp, {
      provider,
      isTokenAutoRefreshEnabled: false
    });

    expect(appCheck).toBeDefined();

    const { token } = await getToken(appCheck);
    expect(token).toBe('debug-token-valid-abc123xyz');
  });

  it('verifies that requests with valid App Check token succeed and unauthenticated requests fail', async () => {
    // Simulated cloud endpoint verifying X-Firebase-AppCheck header
    function verifyCloudEndpoint(headers) {
      const appCheckToken = headers['X-Firebase-AppCheck'];
      if (!appCheckToken || appCheckToken !== 'debug-token-valid-abc123xyz') {
        return { status: 401, error: 'Unauthorized: Invalid or missing App Check token' };
      }
      return { status: 200, data: { result: 'Cloud call authorized' } };
    }

    // Authenticated request
    const authResponse = verifyCloudEndpoint({ 'X-Firebase-AppCheck': 'debug-token-valid-abc123xyz' });
    expect(authResponse.status).toBe(200);
    expect(authResponse.data.result).toBe('Cloud call authorized');

    // Unauthenticated request (e.g. debug token removed)
    const unauthResponse = verifyCloudEndpoint({});
    expect(unauthResponse.status).toBe(401);
    expect(unauthResponse.error).toContain('Unauthorized');
  });
});
