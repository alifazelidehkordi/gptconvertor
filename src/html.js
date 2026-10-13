import {escapeHtml, exportNotices, normalizePaperSize} from './format.js';

const allowed = new Set('a article aside b blockquote br code del details div em figcaption figure h1 h2 h3 h4 h5 h6 hr i img kbd li mark ol p pre s section small span strong sub summary sup table tbody td th thead tr u ul'.split(' '));
 
// Mirrored from the read-only DOM adapter's captured visual style list.
// Never accept arbitrary page CSS: positioning, overlays, animations and
// externally loaded resources are unrelated to static document export.
const allowedStyles = new Set([
  'display','color','background-color','font-family','font-size','font-weight',
  'font-style','line-height','letter-spacing','text-align','text-decoration',
  'direction','white-space','overflow-wrap','word-break','border','border-radius',
  'border-color','border-width','border-style','padding','margin','gap','row-gap',
  'column-gap','flex-direction','flex-wrap','align-items','justify-content',
  'grid-template-columns','list-style-type','vertical-align','max-width',
  'min-width','width','height'
]);
function safeStyle(raw) {
  if (typeof raw !== 'string' || raw.length > 16000) return '';
  const parts = [];
  for (const declaration of raw.split(';').slice(0,80)) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    const name = declaration.slice(0,separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!allowedStyles.has(name) || !value || value.length > 512 ||
        /url\s*\(|expression\s*\(|image-set\s*\(|@import|!important|[<>@{}\\]|\/\*|\*\//i.test(value) ||
        /[\u0000-\u001f]/.test(value)) continue;
    parts.push(name + ':' + value);
  }
  return parts.join(';');
}


export function sanitizeHtml(input, options = {}) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(String(input || ''), 'text/html');
  const clean = document.createElement('div');
  function walk(node) {
    if (node.nodeType === 3) return document.createTextNode(node.textContent || '');
    if (node.nodeType !== 1 || !allowed.has(node.localName)) return null;
    const output = document.createElement(node.localName);
    if (node.hasAttribute('dir') && /^(ltr|rtl|auto)$/.test(node.getAttribute('dir'))) output.dir = node.getAttribute('dir');
    if (node.hasAttribute('style')) {
      const style = safeStyle(node.getAttribute('style'));
      if (style) output.setAttribute('style', style);
    }
    if (node.localName === 'a' && /^https?:\/\//i.test(node.getAttribute('href') || '')) {
      output.href = node.href; output.rel = 'noopener noreferrer';
      output.referrerPolicy = 'no-referrer';
    }
    if (node.localName === 'img') {
      const src = node.getAttribute('src') || '';
      if (!/^https?:\/\//i.test(src) && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src)
          && !/^data:image\/svg\+xml;charset=utf-8,/i.test(src)) return null;
      if (/^https?:\/\//i.test(src) && options.allowExternalImages === false) {
        const placeholder = document.createElement('span');
        placeholder.className = 'visual-fallback';
        placeholder.textContent = '[External image blocked: ' +
          (node.getAttribute('alt') || 'image') + ']';
        return placeholder;
      }
      output.src = src;
      output.alt = node.getAttribute('alt') || '';
      output.referrerPolicy = 'no-referrer';
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
export function buildHtml(doc, options = {}) {
  const paperSize = normalizePaperSize(options.paperSize);
  const notices = exportNotices(doc);
  const noticeHtml = notices.length
    ? '<aside class="export-warning" role="note"><strong>Export notes</strong><ul>' +
        notices.map(note => '<li>' + escapeHtml(note) + '</li>').join('') +
      '</ul></aside>'
    : '';
  const messages = (doc.messages || []).map((m, i) => {
    const notes = (m.warnings || []).filter(Boolean);
    const noteHtml = notes.length
      ? '<p class="capture-note">Capture notes: ' +
        escapeHtml(notes.join('; ')) + '</p>'
      : '';
    return '<section class="export-message" dir="auto"><h2>' + (i + 1) + '. ' +
      (m.role === 'assistant' ? 'ChatGPT' : 'You') + '</h2><div class="message-body" dir="auto">' +
      sanitizeHtml(m.html) + '</div>' + noteHtml + '</section>';
  }).join('\n');

  // Screen-only horizontal scrolling is safe; print must restore real table
  // layout so overflow content is never silently clipped or cut off.
  const css = `
:root{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;color:#202838}
*{box-sizing:border-box}
body{font-size:15px;line-height:1.65;max-width:900px;margin:35px auto;padding:0 28px;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{overflow-wrap:anywhere}
.meta{font-size:12px;color:#64748b;overflow-wrap:anywhere}
.export-message{border-top:1px solid #e0e5ed;margin-top:20px;padding-top:15px}
.export-message>h2{font-size:12px;color:#64748b}
.message-body{min-width:0}
pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;background:#f4f5f9;padding:12px}
pre,code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
pre{direction:ltr;unicode-bidi:isolate}
img,svg,canvas{max-width:100%;height:auto;object-fit:contain}
table{border-collapse:collapse;max-width:100%}
th,td{border:1px solid #ccd3dd;padding:6px 10px;overflow-wrap:anywhere;vertical-align:top}
blockquote{border-inline-start:3px solid #94a3b8;padding-inline-start:14px}
.export-warning,.capture-note{background:#fff3d7;color:#694600;padding:10px;border-radius:6px}
.capture-note{font-size:12px}
@media screen{table{display:block;overflow-x:auto}}
@page{size:${paperSize};margin:18mm 14mm}
@media print{
  html,body{background:white;margin:0;padding:0;max-width:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}
  body{overflow:visible}
  table{display:table!important;width:100%!important;max-width:100%!important;overflow:visible!important;table-layout:auto!important}
  thead{display:table-header-group!important}
  tfoot{display:table-footer-group!important}
  tr{break-inside:avoid;page-break-inside:avoid}
  th,td{word-break:break-word;white-space:normal}
  pre{white-space:pre-wrap!important;overflow:visible!important;max-height:none!important;break-inside:auto}
  .export-message{break-inside:auto}
  .export-message>h2,h1,h2,h3,h4,h5,h6{break-after:avoid;page-break-after:avoid}
  p,li{orphans:3;widows:3}
  img,figure,svg,canvas{break-inside:avoid;page-break-inside:avoid;max-height:240mm}
  .export-warning,.capture-note{break-inside:avoid}
}`;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https: http:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; object-src \'none\'">' +
    '<meta name="referrer" content="no-referrer">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeHtml(doc.title || 'ChatGPT export') +
    '</title><style>' + css + '</style></head><body><h1 dir="auto">' +
    escapeHtml(doc.title || 'ChatGPT export') + '</h1><div class="meta">' +
    escapeHtml(doc.sourceUrl || '') + '</div>' +
    noticeHtml + messages + '</body></html>';
}
