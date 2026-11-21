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
 * Builds the cloud analysis prompt for Route B & C.
 *
 * @param {string} redactedText
 * @returns {string}
 */
export function buildCloudAnalysisPrompt(redactedText) {
  return `You are a careful document analyst.
The text may contain placeholders like [PERSON_1], [AMOUNT_2], [ACCOUNT_1].
Treat each placeholder as an opaque value. Never guess what it is.
Copy placeholders EXACTLY as written, including the square brackets.

Return these sections in plain text:
1. Summary (3 to 5 sentences)
2. Key risks or concerns
3. Deadlines and dates
4. Action items (who, what, when)

TEXT:
"""
${redactedText}
"""`;
}

/**
 * Builds the on-device analysis prompt for Route A (pure local).
 *
 * @param {string} text
 * @returns {string}
 */
export function buildLocalAnalysisPrompt(text) {
  return `You are a careful document analyst. Summarize key points and action items. Keep it brief (2-4 sentences).

TEXT:
"""
${text}
"""`;
}
