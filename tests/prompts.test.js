import { describe, it, expect } from 'vitest';
import {
  buildAnalysisPrompt,
  buildCloudAnalysisPrompt,
  buildLocalAnalysisPrompt,
  buildEntityPrompt
} from '../src/prompts.js';

describe('Priority 2: Unified Prompt Builder Verification', () => {
  const sampleDoc = 'Priya, you must repay the loan of ₹4,50,000 for account 5021-8834-2210 by 15 Jan. Rahul Mehta at 98450 12345 will confirm.';

  it('builds local prompt with the four required sections', () => {
    const prompt = buildLocalAnalysisPrompt(sampleDoc);

    expect(prompt).toContain('1. Summary');
    expect(prompt).toContain('2. Key Risks and Concerns');
    expect(prompt).toContain('3. Deadlines and Dates');
    expect(prompt).toContain('4. Action Items (who, what, when)');
    expect(prompt).toContain('Do not list contact details');
    expect(prompt).toContain('who owes whom');
    expect(prompt).toContain(sampleDoc);
  });

  it('builds cloud prompt with the four required sections and placeholder guidance', () => {
    const redactedText = 'Priya, you must repay the loan of [AMOUNT_1] for [ACCOUNT_1] by 15 Jan.';
    const prompt = buildCloudAnalysisPrompt(redactedText);

    expect(prompt).toContain('1. Summary');
    expect(prompt).toContain('2. Key Risks and Concerns');
    expect(prompt).toContain('3. Deadlines and Dates');
    expect(prompt).toContain('4. Action Items (who, what, when)');
    expect(prompt).toContain('Do not list contact details');
    expect(prompt).toContain('who owes whom');
    expect(prompt).toContain('The text may contain placeholders like [PERSON_1]');
    expect(prompt).toContain(redactedText);
  });

  it('includes strict token instructions on cloud retry', () => {
    const prompt = buildCloudAnalysisPrompt('Test text', true);
    expect(prompt).toContain('CRITICAL: Use only the placeholders present in the text');
  });

  it('builds entity prompt with JSON schema constraint', () => {
    const prompt = buildEntityPrompt('Some text');
    expect(prompt).toContain('Return ONLY valid JSON');
    expect(prompt).toContain('PERSON|ORG|ADDRESS');
  });
});
