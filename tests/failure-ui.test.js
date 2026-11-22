import { describe, it, expect } from 'vitest';
import { friendlyError } from '../src/errors.js';
import { Inspector } from '../src/inspector.js';

describe('friendlyError', () => {
  const cases = [
    ['NetworkError: Cloud inference unavailable while offline. Check internet connection.', 'offline'],
    ['AI: Error fetching from https://x/models/m:generateContent: [429 ] Resource has been exhausted (quota)', 'quota'],
    ['AppCheck: Fetch server returned an HTTP error status. HTTP status: 403.', 'auth'],
    ['EmptyResponseError: Cloud model returned an empty response.', 'empty'],
    ['AI: Error fetching from https://x: Failed to fetch (AI/fetch-error)', 'network'],
    ['something odd', 'unknown']
  ];
  for (const [raw, kind] of cases) {
    it(`classifies "${raw.slice(0, 40)}…" as ${kind}`, () => {
      const info = friendlyError(new Error(raw));
      expect(info.kind).toBe(kind);
      expect(info.message.length).toBeGreaterThan(10);
    });
  }
});

describe('Inspector failure state', () => {
  it('never claims a successful direct-cloud analysis after a failure', () => {
    const insp = new Inspector();
    insp.setRoute('C');
    insp.addStep({ id: 'e', label: 'Analysis failed', where: 'cloud', leftDevice: false, durationMs: 0 });
    insp.setFailed(true);
    const line = insp.getSummaryLine();
    expect(line).toContain('failed');
    expect(line).not.toContain('Direct cloud analysis');
  });
  it('reset() clears the failed flag', () => {
    const insp = new Inspector();
    insp.setFailed(true);
    insp.reset();
    expect(insp.failed).toBe(false);
  });
});
