/**
 * Veil Prompt Templates
 * Standardized prompts for on-device NER and hybrid document analysis.
 * Reference: Architecture.md section 5.8
 */

/**
 * Builds the on-device entity detection prompt for a given text chunk.
 * Target entity types: PERSON, ORG, ADDRESS
 *
 * @param {string} chunk
 * @returns {string}
 */
export function buildEntityPrompt(chunk) {
  return `You find personal information in text.
Return ONLY valid JSON, no explanation, in this exact shape:
{"entities":[{"text":"<exact text from input>","type":"PERSON|ORG|ADDRESS"}]}
Rules:
- "text" must be copied exactly from the input.
- Include people's names, organization names, and street or postal addresses.
- Do not include dates, amounts, or generic words.
- If there are none, return {"entities":[]}.

TEXT:
"""
${chunk}
"""`;
}

/**
 * Unified prompt builder for all analysis routes (A, B, and C).
 * Guarantees consistent 4-section output structure across both on-device and cloud models:
 * 1. Summary (summarize purpose, obligations, and say who owes whom. Do not list contact details.)
 * 2. Key Risks and Concerns
 * 3. Deadlines and Dates
 * 4. Action Items (who, what, when)
 *
 * Shorter on Route A (concise 1-2 sentences on summary).
 *
 * @param {object} options
 * @param {string} options.text - Input document (or redacted text for cloud)
 * @param {boolean} [options.isCloud=true] - Whether targeting cloud model (includes placeholder handling)
 * @param {boolean} [options.isRetry=false] - Whether this is a retry attempt
 * @returns {string}
 */
export function buildAnalysisPrompt({ text, isCloud = true, isRetry = false }) {
  let instructions = `You are a careful document analyst. Output plain text only without markdown formatting (no asterisks, hash headers, or bullet symbols).`;

  if (isCloud) {
    instructions += `
The text may contain placeholders like [PERSON_1], [AMOUNT_2], [ACCOUNT_1].
Treat each placeholder as an opaque value. Never guess what it is.
Copy placeholders EXACTLY as written, including the square brackets.`;

    if (isRetry) {
      instructions += `\nCRITICAL: Use only the placeholders present in the text. Do not invent or alter placeholder names.`;
    }
  }

  const summaryConstraint = isCloud
    ? 'Summary (3 to 5 sentences summarizing purpose, obligations, and payment structure. Only mention payments or who owes whom if the text actually contains them. Say who owes whom. If a role is not stated, write "not stated". Do not list contact details or repeat emails/phone numbers.)'
    : 'Summary (1 to 2 concise sentences summarizing purpose and obligations. Only mention payments or who owes whom if the text actually contains them. Say who owes whom. If a role is not stated, write "not stated". Do not list contact details.)';

  return `${instructions}

Analyze the document and return plain text only using these exact four sections:
1. ${summaryConstraint}
2. Key Risks and Concerns
3. Deadlines and Dates
4. Action Items (who, what, when)

DOCUMENT:
"""
${text}
"""`;
}

/**
 * Builds the cloud analysis prompt for Route B & C.
 *
 * @param {string} redactedText
 * @param {boolean} [isRetry=false]
 * @returns {string}
 */
export function buildCloudAnalysisPrompt(redactedText, isRetry = false) {
  return buildAnalysisPrompt({ text: redactedText, isCloud: true, isRetry });
}

/**
 * Builds the on-device analysis prompt for Route A (pure local).
 *
 * @param {string} text
 * @returns {string}
 */
export function buildLocalAnalysisPrompt(text) {
  return buildAnalysisPrompt({ text, isCloud: false, isRetry: false });
}
