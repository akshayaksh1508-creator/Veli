/**
 * Veil Restoration Engine — Replaces opaque placeholders with original values locally on-device.
 * Pure function: zero DOM, zero network calls, zero persistence.
 */

/**
 * Restores placeholders in model responses to their original unredacted values.
 *
 * @param {string} text - Response text containing placeholders
 * @param {Map<string, string>} map - In-memory placeholder mapping
 * @returns {string}
 */
export function restore(text, map) {
  if (!text || !map || map.size === 0) return text || '';

  let restored = text;

  // Pass 1: Bracketed placeholders [TYPE_N]
  for (const [placeholder, original] of map.entries()) {
    const escaped = placeholder.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    const regex = new RegExp(escaped, 'g');
    restored = restored.replace(regex, original);
  }

  // Pass 2: Unbracketed placeholders (e.g. TYPE_N) with word boundaries
  for (const [placeholder, original] of map.entries()) {
    const unbracketed = placeholder.replace(/[\[\]]/g, '');
    const regex = new RegExp(`\\b${unbracketed}\\b`, 'g');
    restored = restored.replace(regex, original);
  }

  return restored;
}

/**
 * Validates placeholders found in an AI response against known placeholders.
 *
 * @param {string} text
 * @param {Map<string, string>} map
 * @returns {{ ok: boolean, missing: string[], unknown: string[] }}
 */
export function validatePlaceholders(text, map) {
  const tokenRegex = /\[[A-Z0-9_]+\]/g;
  const foundTokens = new Set();
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    foundTokens.add(match[0]);
  }

  const unknown = [];
  for (const token of foundTokens) {
    if (!map.has(token)) {
      unknown.push(token);
    }
  }

  const missing = [];
  for (const placeholder of map.keys()) {
    if (!text.includes(placeholder)) {
      const unbracketed = placeholder.replace(/[\[\]]/g, '');
      if (!text.includes(unbracketed)) {
        missing.push(placeholder);
      }
    }
  }

  return {
    ok: unknown.length === 0,
    missing,
    unknown
  };
}
