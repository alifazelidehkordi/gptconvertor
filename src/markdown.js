export function buildMarkdown(doc) {
  const title = String(doc.title || 'ChatGPT export');
  const chunks = (doc.messages || []).map((item, i) => {
    const label = item.role === 'assistant' ? 'ChatGPT' : 'You';
    return '## ' + (i + 1) + '. ' + label + '\n\n' + String(item.text || '');
  });
  return '# ' + title + '\n\n' + chunks.join('\n\n---\n\n') + '\n';
}
