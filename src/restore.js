/**
 * Veil Restoration Engine — Replaces opaque placeholders with original values locally on-device.
 * Pure function: zero DOM, zero network calls, zero persistence.
 * Reference: Architecture.md section 5.5
 */

/**
 * Restores placeholders in model responses to their original unredacted values.
 * Tolerant to missing brackets, case variations, and possessive forms (e.g. [PERSON_1]'s).
 *
 * @param {string} text - Response text containing placeholders
 * @param {Map<string, string>} map - In-memory placeholder mapping
 * @returns {string}
 */
export function restore(text, map) {
  if (!text || !map || map.size === 0) return text || '';

  let restored = text;

  // Pass 1: Bracketed placeholders (e.g. [PERSON_1], [person_1], [PERSON_1]'s)
  for (const [placeholder, original] of map.entries()) {
    const escaped = placeholder.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    const regex = new RegExp(escaped, 'gi');
    restored = restored.replace(regex, original);
  }

  // Pass 2: Unbracketed placeholders with word boundaries (e.g. PERSON_1, person_1, PERSON_1's)
  for (const [placeholder, original] of map.entries()) {
    const unbracketed = placeholder.replace(/[\[\]]/g, '');
    const regex = new RegExp(`\\b${unbracketed}\\b`, 'gi');
    restored = restored.replace(regex, original);
  }

  return restored;
}

/**
 * Validates placeholders found in an AI response against known placeholders in the map.
 * Detects missing (informational) and unknown/hallucinated (error) placeholders.
 *
 * @param {string} text
 * @param {Map<string, string>} map
 * @returns {{ ok: boolean, missing: string[], unknown: string[] }}
 */
export function validatePlaceholders(text, map) {
  if (!text) {
    return {
      ok: true,
      missing: map ? Array.from(map.keys()) : [],
      unknown: []
    };
  }

  // Normalize known map keys for fast, case-insensitive comparison
  const knownKeysUpper = new Set();
  const knownUnbracketedUpper = new Set();

  if (map) {
    for (const key of map.keys()) {
      const upper = key.toUpperCase();
      knownKeysUpper.add(upper);
      knownUnbracketedUpper.add(upper.replace(/[\[\]]/g, ''));
    }
  }

  // 1. Detect bracketed tokens in text (e.g. [PERSON_1], [PERSON_9])
  const bracketedRegex = /\[[A-Za-z0-9_]+\]/g;
  const foundTokens = new Set();
  let match;

  while ((match = bracketedRegex.exec(text)) !== null) {
    foundTokens.add(match[0]);
  }

  // 2. Detect unbracketed placeholder tokens (e.g. PERSON_9, AMOUNT_9)
  const unbracketedPattern = /\b(?:PERSON|ORG|ADDRESS|EMAIL|PHONE|CARD|PAN|AADHAAR|ACCOUNT|AMOUNT|IFSC|SSN|URL)_[0-9]+\b/gi;
  while ((match = unbracketedPattern.exec(text)) !== null) {
    foundTokens.add(match[0]);
  }

  const unknown = [];
  for (const token of foundTokens) {
    const upper = token.toUpperCase();
    const isBracketed = upper.startsWith('[') && upper.endsWith(']');
    const rawName = upper.replace(/[\[\]]/g, '');

    if (!knownKeysUpper.has(upper) && !knownUnbracketedUpper.has(rawName)) {
      // Format as bracketed token for consistency
      const formatted = isBracketed ? token : `[${token}]`;
      if (!unknown.includes(formatted)) {
        unknown.push(formatted);
      }
    }
  }

  // 3. Detect missing tokens (present in map but omitted by model)
  const missing = [];
  if (map) {
    for (const placeholder of map.keys()) {
      const unbracketed = placeholder.replace(/[\[\]]/g, '');
      const searchBracketed = new RegExp(placeholder.replace(/\[/g, '\\[').replace(/\]/g, '\\]'), 'i');
      const searchUnbracketed = new RegExp(`\\b${unbracketed}\\b`, 'i');

      if (!searchBracketed.test(text) && !searchUnbracketed.test(text)) {
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
