/**
 * Veil Hybrid Routing Engine
 * Pure decision table mapping input parameters to execution paths:
 * - Route A: Pure Local On-Device (Gemini Nano)
 * - Route B: Direct Cloud (Public / Non-Sensitive)
 * - Route C: Redact On-Device & Send to Cloud (Sensitive / Long)
 * - REJECT: Document too long or unavailable offline
 *
 * Reference: Architecture.md section 5.2 & D2-T5
 */

import { CONFIG } from './config.js';

/**
 * Determines the routing decision for a document.
 *
 * @param {object} params
 * @param {number} params.length - Document character length
 * @param {boolean} params.sensitiveFound - Whether sensitive PII/patterns were detected
 * @param {boolean} params.onDeviceAvailable - Whether Gemini Nano is ready on device
 * @param {boolean} params.online - Whether physical internet connection is available
 * @returns {{
 *   route: 'A' | 'B' | 'C' | 'REJECT',
 *   reason: string,
 *   warning?: string,
 *   warnings: string[]
 * }}
 */
export function route({ length, sensitiveFound, onDeviceAvailable, online }) {
  const warnings = [];

  // Rule 1: Document exceeds maximum length hard cap
  if (length > CONFIG.MAX_CHARS) {
    return {
      route: 'REJECT',
      reason: `Document length (${length.toLocaleString()} chars) exceeds maximum limit of ${CONFIG.MAX_CHARS.toLocaleString()} characters.`,
      warnings: []
    };
  }

  // Rule 2: Offline with on-device model available
  if (!online && onDeviceAvailable) {
    let warning;
    if (length > CONFIG.SHORT_LIMIT) {
      warning = `Offline mode: document exceeds recommended local limit (${CONFIG.SHORT_LIMIT} chars); local analysis quality may be reduced.`;
      warnings.push(warning);
    }
    return {
      route: 'A',
      reason: 'Offline mode: forced local on-device execution with zero cloud calls.',
      warning,
      warnings
    };
  }

  // Rule 3: Offline with no on-device model available
  if (!online && !onDeviceAvailable) {
    return {
      route: 'REJECT',
      reason: 'Cannot process: device is offline and on-device Gemini Nano is unavailable.',
      warnings: []
    };
  }

  // Rule 4: Short document with on-device model available (Route A for speed & privacy)
  if (length <= CONFIG.SHORT_LIMIT && onDeviceAvailable) {
    return {
      route: 'A',
      reason: 'Short document processed via local on-device execution for maximum speed and instant privacy.',
      warnings: []
    };
  }

  // Rule 5: Sensitive document requiring redaction
  if (sensitiveFound) {
    // Special case: on-device model is unavailable, but user is online
    if (!onDeviceAvailable && online) {
      const warning = 'On-device model unavailable: only pattern-based (regex-only) redaction applied. Names may not be hidden.';
      warnings.push(warning);
      return {
        route: 'C',
        reason: 'Sensitive document routed via Route C with pattern-based regex redaction.',
        warning,
        warnings
      };
    }

    return {
      route: 'C',
      reason: 'Sensitive document: local on-device redaction applied before secure cloud analysis.',
      warnings: []
    };
  }

  // Rule 6: Long, non-sensitive document sent directly to cloud
  return {
    route: 'B',
    reason: 'Non-sensitive document routed directly to Cloud for high-fidelity analysis.',
    warnings: []
  };
}
