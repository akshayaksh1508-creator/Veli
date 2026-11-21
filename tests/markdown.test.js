import { describe, it, expect } from 'vitest';
import { renderSafeMarkdown } from '../src/markdown.js';

describe('Markdown & Safe HTML Rendering', () => {
  it('escapes raw HTML to prevent XSS attacks', () => {
    const raw = '<script>alert("hack")</script><img src="x" onerror="alert(1)">';
    const rendered = renderSafeMarkdown(raw);

    expect(rendered).not.toContain('<script>');
    expect(rendered).toContain('&lt;script&gt;');
    expect(rendered).not.toContain('<img');
    expect(rendered).toContain('&lt;img');
  });

  it('renders bold markdown safely (**bold** and __bold__)', () => {
    const raw = 'This is **important text** and __critical value__.';
    const rendered = renderSafeMarkdown(raw);

    expect(rendered).toContain('<strong>important text</strong>');
    expect(rendered).toContain('<strong>critical value</strong>');
    expect(rendered).not.toContain('**');
    expect(rendered).not.toContain('__');
  });

  it('renders bullet lists (* and - and •)', () => {
    const raw = `Key Points:
* First bullet item
* Second bullet item
- Third item with **bold**`;

    const rendered = renderSafeMarkdown(raw);
    expect(rendered).toContain('<ul');
    expect(rendered).toContain('<li');
    expect(rendered).toContain('First bullet item</li>');
    expect(rendered).toContain('<strong>bold</strong></li>');
    expect(rendered).toContain('</ul>');
  });

  it('renders numbered sections cleanly', () => {
    const raw = `1. Summary: Contract between client and vendor.
2. Key Risks: Delay penalties apply.`;

    const rendered = renderSafeMarkdown(raw);
    expect(rendered).toContain('<strong>1.</strong> Summary: Contract between client and vendor.');
    expect(rendered).toContain('<strong>2.</strong> Key Risks: Delay penalties apply.');
  });
});
