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
 * @param {boolean} [isRetry=false]
 * @returns {string}
 */
export function buildCloudAnalysisPrompt(redactedText, isRetry = false) {
  let prompt = `You are a careful document analyst.
The text may contain placeholders like [PERSON_1], [AMOUNT_2], [ACCOUNT_1].
Treat each placeholder as an opaque value. Never guess what it is.
Copy placeholders EXACTLY as written, including the square brackets.`;

  if (isRetry) {
    prompt += `\nCRITICAL: Use only the placeholders present in the text. Do not invent or alter placeholder names.`;
  }

  prompt += `\n\nReturn these sections in plain text:
1. Summary (3 to 5 sentences)
2. Key risks or concerns
3. Deadlines and dates
4. Action items (who, what, when)

TEXT:
"""
${redactedText}
"""`;

  return prompt;
}

/**
 * Builds the on-device analysis prompt for Route A (pure local).
 *
 * @param {string} text
 * @returns {string}
 */
export function buildLocalAnalysisPrompt(text) {
  return `You are a careful document analyst. Analyze the following document text and provide a concise summary with key points and action items.

DOCUMENT:
"""
${text}
"""

Provide your analysis below:`;
}
