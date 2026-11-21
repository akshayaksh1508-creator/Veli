/**
 * Veil Markdown & Text Formatter
 * Safely renders markdown bolding, section numbers, headings, and bullet points
 * into safe HTML while strictly escaping all raw HTML entities to prevent XSS.
 */

/**
 * Safely renders basic markdown formatting (bold, headings, bullet lists, numbered sections)
 * into safe HTML while strictly escaping all raw HTML entities to prevent XSS.
 *
 * @param {string} rawText
 * @returns {string} Safe HTML string
 */
export function renderSafeMarkdown(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';

  // 1. Strict HTML escaping
  const escaped = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // 2. Parse line by line
  const lines = escaped.split('\n');
  const result = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (!line) {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Bold formatting: **bold** or __bold__
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Section headings (e.g. ## Heading or ### Heading)
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(`<h4 style="margin:10px 0 4px 0;font-size:0.92rem;font-weight:700;color:#0f172a;">${headingMatch[1]}</h4>`);
      continue;
    }

    // Bullet list items (* item or - item or • item)
    const bulletMatch = line.match(/^[\*\-\•]\s+(.+)$/);
    if (bulletMatch) {
      if (!inList) {
        result.push('<ul style="margin:4px 0 8px 18px;padding:0;list-style-type:disc;">');
        inList = true;
      }
      result.push(`<li style="margin-bottom:3px;font-size:0.83rem;line-height:1.45;">${bulletMatch[1]}</li>`);
      continue;
    }

    // Numbered sections (e.g. 1. Summary: ... or 2. Key Risks: ...)
    const sectionMatch = line.match(/^(\d+\.)\s+(.+)$/);
    if (sectionMatch) {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(`<div style="margin:8px 0 4px 0;font-size:0.85rem;line-height:1.5;"><strong>${sectionMatch[1]}</strong> ${sectionMatch[2]}</div>`);
      continue;
    }

    // Standard paragraph line
    if (inList) {
      result.push('</ul>');
      inList = false;
    }
    result.push(`<p style="margin:4px 0 6px 0;font-size:0.83rem;line-height:1.45;">${line}</p>`);
  }

  if (inList) {
    result.push('</ul>');
  }

  return result.join('\n');
}
