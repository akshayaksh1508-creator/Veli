import { describe, it, expect, vi } from 'vitest';
import {
  normalizeEntityType,
  chunkText,
  parseModelEntityJson,
  locateAllOccurrences,
  parseAndLocateEntities,
  detectEntities
} from '../src/nano-entities.js';

describe('D2-T1: Nano Entity Detection (NER)', () => {
  const sampleDoc = `INDEPENDENT CONTRACTOR SERVICES AGREEMENT
This Agreement is entered into on 1st November 2026 by and between:
Client: Apex Global Technologies Ltd., located at 44 Residency Road, Bengaluru 560025, represented by Director Vikram Malhotra.
Contractor: Rohan Sharma, residing at Flat 302, Palm Grove Apts, Indiranagar, Bengaluru 560038.
Contact Rohan Sharma for project queries. Project lead is Anita Desai.`;

  describe('1. Defensive JSON Parsing', () => {
    it('parses valid JSON response', () => {
      const raw = '{"entities":[{"text":"Vikram Malhotra","type":"PERSON"},{"text":"Apex Global Technologies Ltd.","type":"ORG"}]}';
      const parsed = parseModelEntityJson(raw);
      expect(parsed).toEqual([
        { text: 'Vikram Malhotra', type: 'PERSON' },
        { text: 'Apex Global Technologies Ltd.', type: 'ORG' }
      ]);
    });

    it('parses JSON wrapped in markdown code fences', () => {
      const raw = `\`\`\`json
{
  "entities": [
    { "text": "Rohan Sharma", "type": "PERSON" },
    { "text": "44 Residency Road", "type": "ADDRESS" }
  ]
}
\`\`\``;
      const parsed = parseModelEntityJson(raw);
      expect(parsed).toEqual([
        { text: 'Rohan Sharma', type: 'PERSON' },
        { text: '44 Residency Road', type: 'ADDRESS' }
      ]);
    });

    it('parses JSON with conversational prose prefix and suffix', () => {
      const raw = `Sure! Here are the entities I found in the text:
{"entities":[{"text":"Anita Desai","type":"PERSON"}]}
Hope this helps!`;
      const parsed = parseModelEntityJson(raw);
      expect(parsed).toEqual([
        { text: 'Anita Desai', type: 'PERSON' }
      ]);
    });

    it('returns empty array on completely invalid JSON without crashing', () => {
      const raw = 'Sorry, as an AI language model I cannot parse this text.';
      const parsed = parseModelEntityJson(raw);
      expect(parsed).toEqual([]);
    });

    it('returns empty array on empty input or non-string input', () => {
      expect(parseModelEntityJson('')).toEqual([]);
      expect(parseModelEntityJson(null)).toEqual([]);
    });

    it('normalizes entity types cleanly', () => {
      expect(normalizeEntityType('name')).toBe('PERSON');
      expect(normalizeEntityType('COMPANY')).toBe('ORG');
      expect(normalizeEntityType('Street')).toBe('ADDRESS');
      expect(normalizeEntityType('City')).toBe('LOCATION');
    });
  });

  describe('2. Verbatim Locator & Hallucination Defense', () => {
    it('locates all occurrences of a recurring entity in text', () => {
      const matches = locateAllOccurrences('Rohan Sharma', sampleDoc, 'PERSON');
      // "Rohan Sharma" appears twice in sampleDoc
      expect(matches.length).toBe(2);
      expect(matches[0].start).toBeGreaterThan(0);
      expect(matches[1].start).toBeGreaterThan(matches[0].end);
      expect(sampleDoc.slice(matches[0].start, matches[0].end)).toBe('Rohan Sharma');
      expect(sampleDoc.slice(matches[1].start, matches[1].end)).toBe('Rohan Sharma');
    });

    it('discards hallucinated entities not found verbatim in text', () => {
      const hallucinatedRaw = `{"entities":[
        {"text":"Vikram Malhotra","type":"PERSON"},
        {"text":"John Doe (Not In Doc)","type":"PERSON"},
        {"text":"Silicon Valley Bank","type":"ORG"}
      ]}`;

      const matches = parseAndLocateEntities(hallucinatedRaw, sampleDoc);
      // Only "Vikram Malhotra" actually exists in sampleDoc
      expect(matches.length).toBe(1);
      expect(matches[0].text).toBe('Vikram Malhotra');
      expect(matches[0].type).toBe('PERSON');
      expect(sampleDoc.slice(matches[0].start, matches[0].end)).toBe('Vikram Malhotra');
    });
  });

  describe('3. Text Chunking', () => {
    it('returns single chunk when text is under maxChunkSize', () => {
      const chunks = chunkText('Short contract document text.', 100);
      expect(chunks).toEqual(['Short contract document text.']);
    });

    it('splits text on paragraph boundaries when exceeding maxChunkSize', () => {
      const p1 = 'Paragraph 1 with some details.'.padEnd(100, ' a');
      const p2 = 'Paragraph 2 with other details.'.padEnd(100, ' b');
      const text = `${p1}\n\n${p2}`;
      const chunks = chunkText(text, 120);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain('Paragraph 1');
      expect(chunks[1]).toContain('Paragraph 2');
    });
  });

  describe('4. detectEntities Integration with Mocked Runner', () => {
    it('orchestrates chunking, prompting, parsing, and deduplicated location', async () => {
      const mockRunner = vi.fn().mockResolvedValue({
        text: '{"entities":[{"text":"Vikram Malhotra","type":"PERSON"},{"text":"Anita Desai","type":"PERSON"}]}',
        ms: 120
      });

      const matches = await detectEntities(sampleDoc, { modelRunner: mockRunner });
      expect(mockRunner).toHaveBeenCalled();
      expect(matches.length).toBe(2);
      expect(matches.map(m => m.text)).toEqual(['Vikram Malhotra', 'Anita Desai']);
      expect(matches[0].start).toBeLessThan(matches[1].start);
    });

    it('handles model runtime failure gracefully without throwing and logs warning', async () => {
      const mockFailingRunner = vi.fn().mockRejectedValue(new Error('GPU Out of Memory'));
      const warnings = [];

      const matches = await detectEntities(sampleDoc, {
        modelRunner: mockFailingRunner,
        onWarning: (w) => warnings.push(w)
      });

      expect(matches).toEqual([]);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Nano entity detection warning');
    });
  });
});
