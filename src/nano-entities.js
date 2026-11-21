/**
 * Veil On-Device Named Entity Recognition (NER)
 * Detects PERSON, ORG, and ADDRESS using Chrome's on-device Gemini Nano.
 * Reference: Architecture.md section 5.4
 */

import { runOnDevice } from './ai.js';
import { buildEntityPrompt } from './prompts.js';
import { CONFIG } from './config.js';

/**
 * Normalizes entity type into standard set: PERSON, ORG, ADDRESS, LOCATION.
 * @param {string} type
 * @returns {'PERSON'|'ORG'|'ADDRESS'|'LOCATION'}
 */
export function normalizeEntityType(type) {
  const upper = String(type || '').toUpperCase().trim();
  if (['PERSON', 'NAME', 'PEOPLE', 'INDIVIDUAL'].includes(upper)) return 'PERSON';
  if (['ORG', 'ORGANIZATION', 'COMPANY', 'CORP', 'INSTITUTION'].includes(upper)) return 'ORG';
  if (['ADDRESS', 'ADDR', 'STREET', 'POSTAL'].includes(upper)) return 'ADDRESS';
  if (['LOCATION', 'LOC', 'PLACE', 'CITY', 'STATE', 'COUNTRY'].includes(upper)) return 'LOCATION';
  return 'PERSON';
}

/**
 * Splits input text into manageable chunks on paragraph or sentence boundaries.
 *
 * @param {string} text
 * @param {number} [maxChunkSize=1500]
 * @returns {string[]}
 */
export function chunkText(text, maxChunkSize = 1500) {
  if (!text || typeof text !== 'string') return [];
  if (text.length <= maxChunkSize) return [text];

  const chunks = [];
  const paragraphs = text.split(/(\n\s*\n)/);
  let currentChunk = '';

  for (const part of paragraphs) {
    if ((currentChunk + part).length <= maxChunkSize) {
      currentChunk += part;
    } else {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      // If a single paragraph is longer than maxChunkSize, split by sentence or newline
      if (part.length > maxChunkSize) {
        const sentences = part.split(/([.?!]\s+|\n)/);
        for (const s of sentences) {
          if ((currentChunk + s).length <= maxChunkSize) {
            currentChunk += s;
          } else {
            if (currentChunk.trim().length > 0) {
              chunks.push(currentChunk);
            }
            currentChunk = s;
          }
        }
      } else {
        currentChunk = part;
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Defensively extracts and parses JSON entities from raw model response text.
 * Handles code fences (```json), leading/trailing prose, and invalid responses.
 *
 * @param {string} rawReply
 * @returns {Array<{ text: string, type: string }>}
 */
export function parseModelEntityJson(rawReply) {
  if (!rawReply || typeof rawReply !== 'string') return [];

  let cleaned = rawReply.trim();
  // Strip code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Extract substring between first '{' and last '}'
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    let list = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && Array.isArray(parsed.entities)) {
      list = parsed.entities;
    }

    return list
      .map(item => ({
        text: typeof item === 'string' ? item.trim() : (item.text || item.name || item.value || '').trim(),
        type: normalizeEntityType(item.type)
      }))
      .filter(item => item.text && item.text.length >= 2);
  } catch {
    // Return empty array on parse failure (defensive requirement)
    return [];
  }
}

/**
 * Finds all verbatim occurrences of targetText within sourceText.
 * Do not trust model offsets; locate strictly by verbatim search.
 *
 * @param {string} targetText
 * @param {string} sourceText
 * @param {string} type
 * @returns {Array<{ start: number, end: number, text: string, type: string }>}
 */
export function locateAllOccurrences(targetText, sourceText, type) {
  if (!targetText || !sourceText) return [];
  const matches = [];
  const targetLen = targetText.length;
  let startIndex = 0;

  while (startIndex < sourceText.length) {
    const foundPos = sourceText.indexOf(targetText, startIndex);
    if (foundPos === -1) break;

    matches.push({
      start: foundPos,
      end: foundPos + targetLen,
      text: targetText,
      type: normalizeEntityType(type)
    });

    startIndex = foundPos + targetLen;
  }

  return matches;
}

/**
 * Parses raw model output and locates verbatim mentions within sourceText.
 * Discards hallucinations (entities not found verbatim in sourceText).
 *
 * @param {string} rawReply
 * @param {string} sourceText
 * @returns {Array<{ start: number, end: number, text: string, type: string }>}
 */
export function parseAndLocateEntities(rawReply, sourceText) {
  if (!sourceText || typeof sourceText !== 'string') return [];
  const parsedEntities = parseModelEntityJson(rawReply);
  if (!parsedEntities.length) return [];

  const allMatches = [];
  const seenSpans = new Set();

  for (const ent of parsedEntities) {
    if (!ent.text) continue;
    // Check verbatim presence (hallucination defense)
    const occurrences = locateAllOccurrences(ent.text, sourceText, ent.type);
    for (const match of occurrences) {
      const spanKey = `${match.start}:${match.end}`;
      if (!seenSpans.has(spanKey)) {
        seenSpans.add(spanKey);
        allMatches.push(match);
      }
    }
  }

  return allMatches.sort((a, b) => a.start - b.start);
}

/**
 * Detects named entities (PERSON, ORG, ADDRESS) using Gemini Nano on-device.
 *
 * Flow:
 * 1. Split text into chunks (~1500 chars).
 * 2. Prompt Gemini Nano with entity detection instruction.
 * 3. Defensively parse JSON output.
 * 4. Locate verbatim occurrences in source text.
 * 5. Discard hallucinations not found in source text.
 * 6. Return Match[] array.
 *
 * On any failure: returns [] and logs warning; never crashes.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.chunkSize=1500]
 * @param {Function} [options.modelRunner=runOnDevice]
 * @param {Function} [options.onWarning]
 * @returns {Promise<Array<{ start: number, end: number, text: string, type: string }>>}
 */
export async function detectEntities(text, options = {}) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }

  const {
    chunkSize = CONFIG.CHUNK_SIZE || 3500,
    modelRunner = runOnDevice,
    onWarning = null
  } = options;

  try {
    const chunks = chunkText(text, chunkSize);
    const allMatches = [];
    const seenSpans = new Set();

    for (const chunk of chunks) {
      try {
        const prompt = buildEntityPrompt(chunk);
        const { text: modelReply } = await modelRunner(prompt);
        const matches = parseAndLocateEntities(modelReply, text);

        for (const m of matches) {
          const key = `${m.start}:${m.end}`;
          if (!seenSpans.has(key)) {
            seenSpans.add(key);
            allMatches.push(m);
          }
        }
      } catch (chunkErr) {
        const warnMsg = `Nano entity detection warning: ${chunkErr.message}`;
        console.warn('[NanoEntities]', warnMsg);
        if (typeof onWarning === 'function') {
          onWarning(warnMsg);
        }
      }
    }

    return allMatches.sort((a, b) => a.start - b.start);
  } catch (err) {
    const warnMsg = 'Nano entity detection failed: regex-only redaction fallback';
    console.warn('[NanoEntities]', warnMsg, err);
    if (typeof onWarning === 'function') {
      onWarning(warnMsg);
    }
    return [];
  }
}

export const GENERIC_STOPWORDS = new Set([
  'agreement', 'contract', 'article', 'document', 'project', 'client',
  'contractor', 'service', 'services', 'party', 'parties', 'section',
  'company', 'terms', 'clause', 'schedule', 'annexure', 'exhibit',
  'author', 'developer', 'engineer', 'manager', 'director', 'lead',
  'email', 'phone', 'account', 'note', 'reminder', 'hi', 'hello',
  'report', 'summary', 'details', 'queries'
]);

/**
 * Filters detected Nano entities to ensure count accuracy:
 * - Keeps strictly PERSON, ORG, and ADDRESS
 * - Drops single generic stop words
 * - Drops entities that overlap with any regex match (e.g. emails, phone numbers, amounts)
 *
 * @param {Array<object>} nanoMatches - Raw matches from detectEntities
 * @param {Array<object>} [regexMatches=[]] - Matches found by detectRegex
 * @returns {Array<object>}
 */
export function filterNanoEntities(nanoMatches, regexMatches = []) {
  if (!Array.isArray(nanoMatches)) return [];

  if (CONFIG.DEBUG_LOGS) console.log('[NanoNER] Raw detected entities (count):', nanoMatches.length);

  const filtered = nanoMatches.filter(nano => {
    // 1. Keep strictly PERSON, ORG, and ADDRESS
    const type = String(nano.type || '').toUpperCase();
    if (!['PERSON', 'ORG', 'ADDRESS'].includes(type)) {
      return false;
    }

    // 2. Drop single generic words
    const cleanWord = nano.text.trim().toLowerCase();
    if (GENERIC_STOPWORDS.has(cleanWord)) {
      return false;
    }
    if (cleanWord.length < 2 || !/[A-Za-z0-9]/.test(cleanWord)) {
      return false;
    }

    // 3. Drop entities that overlap with any regex match
    if (Array.isArray(regexMatches) && regexMatches.length > 0) {
      const overlaps = regexMatches.some(regex => {
        return Math.max(nano.start, regex.start) < Math.min(nano.end, regex.end);
      });
      if (overlaps) {
        return false;
      }
    }

    return true;
  });

  if (CONFIG.DEBUG_LOGS) console.log('[NanoNER] Filtered entities (count):', filtered.length);
  return filtered;
}
