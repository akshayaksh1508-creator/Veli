/**
 * Veil Redaction Engine — Regex rules, Luhn algorithm, overlap resolution, and in-memory placeholder mapping.
 * Pure function: zero DOM, zero network calls, zero disk persistence.
 */

/**
 * Validates a credit card number using the Luhn checksum algorithm.
 * @param {string} value
 * @returns {boolean}
 */
export function luhnCheck(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alternate = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

// Priority for tie-breaking overlapping matches of identical length
const TYPE_PRIORITY = {
  CARD: 100,
  ACCOUNT: 90,
  PHONE: 80,
  PAN: 70,
  AADHAAR: 70,
  SSN: 70,
  IFSC: 60,
  EMAIL: 50,
  AMOUNT: 40,
  URL: 30,
  PERSON: 20,
  ORG: 20,
  ADDRESS: 20
};

/**
 * Scans text with regular expression rules for sensitive data types.
 *
 * @param {string} text
 * @returns {Array<{ start: number, end: number, text: string, type: string }>}
 */
export function detectRegex(text) {
  if (!text) return [];

  const matches = [];

  const patterns = [
    { type: 'EMAIL', regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
    { type: 'PHONE', regex: /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g },
    { type: 'PHONE', regex: /\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g },
    { type: 'AADHAAR', regex: /\b\d{4}\s\d{4}\s\d{4}\b/g },
    { type: 'PAN', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
    { type: 'IFSC', regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
    { type: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
    { type: 'AMOUNT', regex: /(?:₹|Rs\.?|INR|\$|€|£)\s?\d[\d,]*(?:\.\d+)?/g },
    { type: 'URL', regex: /https?:\/\/[^\s]+/g }
  ];

  for (const { type, regex } of patterns) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type
      });
    }
  }

  // Credit card detection with Luhn validation
  const cardRegex = /\b(?:\d[ -]?){13,19}\b/g;
  let cardMatch;
  while ((cardMatch = cardRegex.exec(text)) !== null) {
    if (luhnCheck(cardMatch[0])) {
      matches.push({
        start: cardMatch.index,
        end: cardMatch.index + cardMatch[0].length,
        text: cardMatch[0],
        type: 'CARD'
      });
    }
  }

  // Account numbers: Block format (e.g. 5021-8834-2210)
  const acctBlockRegex = /\b\d{4}[- ]\d{4}[- ]\d{4}\b/g;
  let acctMatch;
  while ((acctMatch = acctBlockRegex.exec(text)) !== null) {
    matches.push({
      start: acctMatch.index,
      end: acctMatch.index + acctMatch[0].length,
      text: acctMatch[0],
      type: 'ACCOUNT'
    });
  }

  // Account numbers: Keyword format (e.g. "a/c 123456789012" or "account 123456789012")
  const acctKeywordRegex = /(?:a\/c|account)\D{0,15}(\d{9,18})/gi;
  let kwMatch;
  while ((kwMatch = acctKeywordRegex.exec(text)) !== null) {
    const fullMatch = kwMatch[0];
    const digitsOnly = kwMatch[1];
    const offsetInMatch = fullMatch.lastIndexOf(digitsOnly);
    const start = kwMatch.index + offsetInMatch;
    matches.push({
      start,
      end: start + digitsOnly.length,
      text: digitsOnly,
      type: 'ACCOUNT'
    });
  }

  return matches;
}

/**
 * Resolves overlapping and nested matches.
 * Keeps longer matches; on tie breaks by type priority.
 *
 * @param {Array<Array<{start: number, end: number, text: string, type: string}>>} matchLists
 * @returns {Array<{start: number, end: number, text: string, type: string}>}
 */
export function mergeMatches(matchLists) {
  const all = matchLists.flat();
  if (all.length === 0) return [];

  // Sort ascending by start; if start equal, sort descending by length; if length equal, by priority
  all.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenA !== lenB) return lenB - lenA;
    return (TYPE_PRIORITY[b.type] || 0) - (TYPE_PRIORITY[a.type] || 0);
  });

  const merged = [];

  for (const match of all) {
    if (merged.length === 0) {
      merged.push(match);
      continue;
    }

    const prev = merged[merged.length - 1];

    // Check for overlap
    if (match.start < prev.end) {
      const prevLen = prev.end - prev.start;
      const currLen = match.end - match.start;
      const prevPrio = TYPE_PRIORITY[prev.type] || 0;
      const currPrio = TYPE_PRIORITY[match.type] || 0;

      let replace = false;
      if (currLen > prevLen) {
        replace = true;
      } else if (currLen === prevLen && currPrio > prevPrio) {
        replace = true;
      }

      if (replace) {
        merged[merged.length - 1] = match;
      }
    } else {
      merged.push(match);
    }
  }

  return merged;
}

/**
 * Normalizes values to guarantee consistent placeholder assignments.
 * @param {string} val
 * @returns {string}
 */
function normalizeKey(val) {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Builds redacted text and in-memory placeholder mapping.
 * Replaces backwards from end of string to start to preserve character indices.
 *
 * @param {string} text
 * @param {Array<{start: number, end: number, text: string, type: string}>} matches
 * @returns {{ redactedText: string, map: Map<string, string> }}
 */
export function buildRedaction(text, matches) {
  const map = new Map();
  const valueToPlaceholder = new Map();
  const counters = {};

  // Resolve any overlaps using mergeMatches
  const sorted = mergeMatches([matches]);

  for (const m of sorted) {
    const key = `${m.type}::${normalizeKey(m.text)}`;
    if (!valueToPlaceholder.has(key)) {
      counters[m.type] = (counters[m.type] || 0) + 1;
      const placeholder = `[${m.type}_${counters[m.type]}]`;
      valueToPlaceholder.set(key, placeholder);
      map.set(placeholder, m.text);
    }
  }

  // Replace from end to start so earlier indices remain valid
  const reverseSorted = [...sorted].sort((a, b) => b.start - a.start);
  let redacted = text;

  for (const m of reverseSorted) {
    const key = `${m.type}::${normalizeKey(m.text)}`;
    const placeholder = valueToPlaceholder.get(key);
    redacted = redacted.slice(0, m.start) + placeholder + redacted.slice(m.end);
  }

  return {
    redactedText: redacted,
    map
  };
}
