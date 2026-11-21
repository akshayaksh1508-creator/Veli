import { describe, it, expect } from 'vitest';
import {
  removeMatch,
  addManualMatch,
  rebuildRedactionAfterReview
} from '../src/review.js';
import { detectRegex, mergeMatches } from '../src/redact.js';

describe('D2-T6: Review-Before-Sending Step Logic', () => {
  const sampleText = 'Send ₹50,000 to Priya at priya@example.com for project Alpha.';

  it('un-redacting a match removes it from the outgoing payload and map', () => {
    const initialMatches = [
      { start: 5, end: 12, text: '₹50,000', type: 'AMOUNT' },
      { start: 16, end: 21, text: 'Priya', type: 'PERSON' },
      { start: 25, end: 42, text: 'priya@example.com', type: 'EMAIL' }
    ];

    // Initial build
    const initial = rebuildRedactionAfterReview(sampleText, initialMatches);
    expect(initial.map.has('[PERSON_1]')).toBe(true);
    expect(initial.redactedText).toContain('[PERSON_1]');

    // User un-redacts "Priya" (index 1)
    const afterUnredact = removeMatch(initial.mergedMatches, 1);
    const rebuilt = rebuildRedactionAfterReview(sampleText, afterUnredact);

    // Verify "Priya" is no longer redacted
    expect(rebuilt.map.has('[PERSON_1]')).toBe(false);
    expect(rebuilt.redactedText).not.toContain('[PERSON_1]');
    expect(rebuilt.redactedText).toContain('Priya');
    // Amount and Email should remain safely redacted
    expect(rebuilt.map.has('[AMOUNT_1]')).toBe(true);
    expect(rebuilt.map.has('[EMAIL_1]')).toBe(true);
  });

  it('adding a manual redaction creates a new placeholder and updates outgoing payload', () => {
    const initialMatches = [
      { start: 5, end: 12, text: '₹50,000', type: 'AMOUNT' }
    ];

    // User manually highlights "project Alpha" (indices 47 to 60)
    const alphaStart = sampleText.indexOf('project Alpha');
    const manualMatch = addManualMatch(sampleText, alphaStart, alphaStart + 'project Alpha'.length, 'CUSTOM');
    expect(manualMatch).toEqual({
      start: alphaStart,
      end: alphaStart + 13,
      text: 'project Alpha',
      type: 'CUSTOM'
    });

    const updatedMatches = [...initialMatches, manualMatch];
    const rebuilt = rebuildRedactionAfterReview(sampleText, updatedMatches);

    expect(rebuilt.map.has('[CUSTOM_1]')).toBe(true);
    expect(rebuilt.map.get('[CUSTOM_1]')).toBe('project Alpha');
    expect(rebuilt.redactedText).toContain('[CUSTOM_1]');
    expect(rebuilt.redactedText).not.toContain('project Alpha');
  });

  it('handles invalid manual selection indices gracefully without throwing', () => {
    expect(addManualMatch(sampleText, -1, 5)).toBeNull();
    expect(addManualMatch(sampleText, 20, 10)).toBeNull();
    expect(addManualMatch(sampleText, 5, 5)).toBeNull();
    expect(addManualMatch(sampleText, 10, 1000)).toBeNull();
  });
});
