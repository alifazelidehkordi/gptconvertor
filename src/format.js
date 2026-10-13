export const safeFilename = (name) => String(name || 'chatgpt-export').replace(/[\\/:*?"<>|]/g, '').slice(0,70);
export const escapeHtml = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/** Visible, human-readable disclosures shared by preview and exported formats. */
export function exportNotices(doc) {
  const notices = [];
  if (doc?.scan?.complete === false) {
    notices.push('Conversation scan incomplete: ' +
      (doc.scan.reason || 'not all conversation turns could be scanned.'));
  }
  const summary = doc?.captureSummary;
  if (summary && summary.missing > 0) {
    notices.push('Incomplete capture: ' + summary.captured + ' of ' +
      summary.requested + ' selected messages exported (' + summary.missing + ' missing).');
  }
  for (const warning of doc?.warnings || []) {
    if (warning) notices.push(String(warning));
  }
  return [...new Set(notices)];
}

/** Do not accept arbitrary CSS in the print page-size option. */
export function normalizePaperSize(value) {
  return value === 'Letter' ? 'Letter' : 'A4';
}
