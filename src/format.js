export const safeFilename = (name) => String(name || 'chatgpt-export').replace(/[\\/:*?"<>|]/g, '').slice(0,70);
export const escapeHtml = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
