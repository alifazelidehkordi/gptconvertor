// Semantic Markdown export: keep ordinary text editable, preserve block structure,
// and use safe code delimiters for source containing literal backticks.
const TICK = String.fromCharCode(96);

function escapeText(text) {
  return String(text).replace(/([\\`*_{}\[\]<>])/g, '\\$1');
}

function fenceFor(text, minimum = 1) {
  const groups = String(text).match(/`+/g) || [];
  const longest = groups.reduce((max, group) => Math.max(max, group.length), 0);
  return TICK.repeat(Math.max(minimum, longest + 1));
}

function inlineCode(value) {
  const code = String(value).replace(/\r\n?/g, '\n');
  const fence = fenceFor(code);
  const pad = /^ | $|^`|`$/.test(code) ? ' ' : '';
  return fence + pad + code + pad + fence;
}

function codeBlock(value) {
  const code = String(value).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const fence = fenceFor(code, 3);
  return '\n' + fence + '\n' + code + '\n' + fence + '\n\n';
}

function children(node) {
  return Array.from(node.childNodes).map(render).join('');
}

function list(node, depth = 0) {
  const ordered = node.localName === 'ol';
  const first = Number(node.getAttribute('start')) || 1;
  const indent = '  '.repeat(depth);
  const lines = [];
  for (const [index, li] of Array.from(node.children)
    .filter(el => el.localName === 'li').entries()) {
    const nested = [];
    const main = [];
    for (const child of li.childNodes) {
      if (child.nodeType === 1 && ['ul','ol'].includes(child.localName)) {
        nested.push(child);
      } else {
        main.push(render(child));
      }
    }
    const label = ordered ? (first + index) + '. ' : '- ';
    const value = main.join('').trim().replace(/\n{3,}/g, '\n\n');
    const continuation = indent + ' '.repeat(label.length);
    lines.push(indent + label + value.replace(/\n/g, '\n' + continuation));
    for (const child of nested) lines.push(list(child, depth + 1).trimEnd());
  }
  return depth ? lines.join('\n') : '\n' + lines.join('\n') + '\n\n';
}

function render(node) {
  if (node.nodeType === 3) {
    return escapeText(node.textContent.replace(/[ \t\r\n]+/g, ' '));
  }
  if (node.nodeType !== 1) return '';
  const tag = node.localName;
  if (/^h[1-6]$/.test(tag)) {
    return '\n' + '#'.repeat(Number(tag[1])) + ' ' + children(node).trim() + '\n\n';
  }
  if (tag === 'br') return '\n';
  if (tag === 'hr') return '\n---\n\n';
  if (tag === 'pre') return codeBlock(node.textContent);
  if (tag === 'code') return inlineCode(node.textContent);
  if (tag === 'strong' || tag === 'b') return '**' + children(node) + '**';
  if (tag === 'em' || tag === 'i') return '*' + children(node) + '*';
  if (tag === 's' || tag === 'del') return '~~' + children(node) + '~~';
  if (tag === 'p') return children(node).trim() + '\n\n';
  if (tag === 'blockquote') {
    const content = children(node).trim().replace(/\n{3,}/g, '\n\n');
    return '\n' + content.split('\n').map(line => line ? '> ' + line : '>').join('\n') + '\n\n';
  }
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    const label = children(node);
    const target = href.replace(/\(/g, '%28').replace(/\)/g, '%29')
      .replace(/\s/g, encodeURIComponent);
    return /^https?:\/\//i.test(href) ? '[' + label + '](' + target + ')' : label;
  }
  if (tag === 'img') {
    const src = node.getAttribute('src') || '';
    const alt = (node.getAttribute('alt') || 'image').replace(/[\[\]]/g, '');
    return /^https?:\/\//i.test(src)
      ? '![' + escapeText(alt) + '](' + src.replace(/\(/g,'%28').replace(/\)/g,'%29') + ')'
      : '[Visual: ' + escapeText(alt) + ' — see HTML]';
  }
  if (tag === 'ul' || tag === 'ol') return list(node);
  if (tag === 'table') {
    const rows = Array.from(node.querySelectorAll('tr')).map(tr =>
      Array.from(tr.children).map(cell => cell.textContent.trim()
        .replace(/\|/g, '\\|').replace(/\s+/g, ' ')));
    if (!rows.length) return '';
    const line = cells => '| ' + cells.join(' | ') + ' |';
    return '\n' + line(rows[0]) + '\n' +
      line(rows[0].map(() => '---')) + '\n' +
      rows.slice(1).map(line).join('\n') + '\n\n';
  }
  return children(node);
}

export function buildMarkdown(doc) {
  const title = escapeText(String(doc.title || 'ChatGPT export'));
  return '# ' + title + '\n\nSource: ' + String(doc.sourceUrl || '') + '\n\n' +
    (doc.messages || []).map((m, i) => {
      const parsed = new DOMParser().parseFromString(m.html || '', 'text/html');
      const body = render(parsed.body).replace(/\n{3,}/g, '\n\n').trim();
      return '## ' + (i + 1) + '. ' + (m.role === 'assistant' ? 'ChatGPT' : 'You') +
        '\n\n' + body;
    }).join('\n\n---\n\n') + '\n';
}
