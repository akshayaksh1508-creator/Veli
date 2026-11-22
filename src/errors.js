// Pure helper: turns any thrown error into a user-friendly message plus a short technical detail.
// No DOM, no network. Order matters: more specific checks come first.
export function friendlyError(err) {
  const raw = String((err && err.message) || err || 'Unknown error');
  const lower = raw.toLowerCase();
  const detail = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;

  if (/offline|navigator\.onLine/.test(lower)) {
    return { kind: 'offline', title: 'You appear to be offline',
      message: 'Cloud analysis needs an internet connection. Check your connection and try again.', detail };
  }
  if (/\b429\b|quota|resource_exhausted|rate.?limit|too many requests/.test(lower)) {
    return { kind: 'quota', title: 'Cloud analysis is temporarily unavailable',
      message: 'The cloud service is busy or its usage limit was reached. Please try again shortly.', detail };
  }
  if (/app ?check|\b403\b|permission_denied|attestation/.test(lower)) {
    return { kind: 'auth', title: 'Cloud access was refused',
      message: 'The request could not be verified. Please try again. If it keeps failing, contact the site owner.', detail };
  }
  if (/empty ?response|returned an empty/.test(lower)) {
    return { kind: 'empty', title: 'The cloud model returned no analysis',
      message: 'Please try again.', detail };
  }
  if (/fetch|network|failed to fetch|blocked|timeout|unreachable/.test(lower)) {
    return { kind: 'network', title: "Couldn't reach the cloud service",
      message: 'Check your connection or any content blockers, then try again.', detail };
  }
  return { kind: 'unknown', title: 'Analysis could not be completed',
    message: 'Something went wrong. Please try again.', detail };
}
