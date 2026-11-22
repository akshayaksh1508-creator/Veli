// Renders an error card using textContent only, so error text or model output can never inject HTML.
export function renderErrorCard(container, { badge, title, message, detail, assurance }) {
  container.textContent = '';
  const card = document.createElement('div');
  card.className = 'result-error-card';

  const add = (tag, cls, text, style) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (style) el.style.cssText = style;
    el.textContent = text;
    card.appendChild(el);
    return el;
  };

  if (badge) add('div', 'error-badge', badge);
  if (title) add('h4', '', title);
  if (message) add('div', 'error-msg', message);
  if (detail) add('div', 'error-detail', `Technical detail: ${detail}`, 'font-size:0.75rem;opacity:0.7;margin-top:8px;word-break:break-word;');
  if (assurance) add('div', 'error-assurance', assurance);
  container.appendChild(card);
}
