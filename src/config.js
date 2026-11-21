/**
 * Veil Core Configuration
 * Reference: Architecture.md section 5.1
 */

export const CONFIG = {
  SHORT_LIMIT: 1500,  // chars: at or below this, use route A (On-Device)
  MAX_CHARS: 12000,   // hard cap for MVP; show rejection above this
  CHUNK_SIZE: 1200,   // chars per chunk for Nano entity detection
  CLOUD_RETRY: 1      // retries if placeholders come back mangled
};
