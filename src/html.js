import {escapeHtml} from './format.js';

const allowed = new Set('a article aside b blockquote br code del details div em figcaption figure h1 h2 h3 h4 h5 h6 hr i img kbd li mark ol p pre s section small span strong sub summary sup table tbody td th thead tr u ul'.split(' '));

export function sanitizeHtml(input) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(String(input || ''), 'text/html');
  const clean = document.createElement('div');
  function walk(node) {
    if (node.nodeType === 3) return document.createTextNode(node.textContent || '');
    if (node.nodeType !== 1 || !allowed.has(node.localName)) return null;
    const output = document.createElement(node.localName);
    if (node.hasAttribute('dir') && /^(ltr|rtl|auto)$/.test(node.getAttribute('dir'))) output.dir = node.getAttribute('dir');
    if (node.hasAttribute('style')) {
      const style = node.getAttribute('style').split(';').filter(s =>
        /^[a-z-]+\s*:/.test(s.trim()) && !/url\s*\(|expression\s*\(|[<>@\\]/i.test(s)
      ).join(';');
      if (style) output.setAttribute('style', style);
    }
    if (node.localName === 'a' && /^https?:\/\//i.test(node.getAttribute('href') || '')) {
      output.href = node.href; output.rel = 'noopener noreferrer';
    }
    if (node.localName === 'img') {
      const src = node.getAttribute('src') || '';
      if (!/^https?:\/\//i.test(src) && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src)
          && !/^data:image\/svg\+xml;charset=utf-8,/i.test(src)) return null;
      output.src = src;
      output.alt = node.getAttribute('alt') || '';
      // Retain intrinsic dimensions of captured canvas/chart images.
      for (const name of ['width', 'height']) {
        const value = node.getAttribute(name);
        if (/^[0-9]+$/.test(value || '') && Number(value) > 0 && Number(value) <= 8192) {
          output.setAttribute(name, value);
        }
      }
    }
    if (node.localName === 'th' || node.localName === 'td') {
      for (const name of ['colspan', 'rowspan']) {
        const value = node.getAttribute(name);
        if (/^[0-9]+$/.test(value || '') && Number(value) > 1 && Number(value) <= 100) {
          output.setAttribute(name, value);
        }
      }
    }
    if (node.localName === 'ol' && /^[0-9]+$/.test(node.getAttribute('start') || '')) {
      output.start = Number(node.getAttribute('start'));
    }
    if (node.classList.contains('visual-fallback')) output.className = 'visual-fallback';
    for (const child of node.childNodes) {
      const converted = walk(child);
      if (converted) output.append(converted);
    }
    return output;
  }
  for (const child of parsed.body.childNodes) {
    const converted = walk(child);
    if (converted) clean.append(converted);
  }
  return clean.innerHTML;
}
export function buildHtml(doc) {
  const messages = (doc.messages || []).map((m, i) =>
    '<section class="export-message"><h2>' + (i+1) + '. ' +
    (m.role === 'assistant' ? 'ChatGPT' : 'You') + '</h2><div dir="auto">' +
    sanitizeHtml(m.html) + '</div></section>'
  ).join('\n');
  const css = 'body{font:15px/1.65 system-ui,Arial,sans-serif;max-width:900px;margin:35px auto;padding:0 28px;overflow-wrap:anywhere;color:#202838}' +
    'img{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f9;padding:12px}' +
    'table{display:block;max-width:100%;overflow:auto;border-collapse:collapse}td,th{border:1px solid #ccd3dd;padding:6px 10px}' +
    '.export-message{border-top:1px solid #e0e5ed;margin-top:20px;padding-top:15px}.export-message h2,.meta{font-size:12px;color:#64748b}' +
    '@page{size:A4;margin:18mm 14mm}@media print{body{margin:0;padding:0;max-width:none;print-color-adjust:exact}}';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(doc.title) +
    '</title><style>' + css + '</style></head><body><h1>' + escapeHtml(doc.title) +
    '</h1><div class="meta">' + escapeHtml(doc.sourceUrl) + '</div>' +
    messages + '</body></html>';
}
