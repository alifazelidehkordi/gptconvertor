import {safeFilename, exportNotices, normalizePaperSize} from './format.js';
import {sanitizeHtml, buildHtml} from './html.js';
import {buildMarkdown} from './markdown.js';

const $ = id => document.getElementById(id);
const jobId = location.hash.slice(1);
let job = null;
let downloads = [];

function setInfo(text) {$('info').textContent = text;}
function addText(tag, text, parent) {
  const el = document.createElement(tag);
  el.textContent = text;
  parent.append(el);
  return el;
}
function render(doc) {
  const root = $('paper');
  root.replaceChildren();
  addText('h1', doc.title || 'ChatGPT export', root);
  const meta = addText('div', doc.sourceUrl + ' · ' + doc.exportedAt, root);
  meta.className = 'meta';
  const notices = exportNotices(doc);
  if (notices.length) {
    const warning = document.createElement('div');
    warning.className = 'warning';
    warning.setAttribute('role', 'alert');
    addText('strong', 'Export notes', warning);
    const list = document.createElement('ul');
    for (const note of notices) addText('li', note, list);
    warning.append(list);
    root.append(warning);
  }
  for (const [index, message] of doc.messages.entries()) {
    const section = document.createElement('section');
    section.className = 'export-message';
    section.dir = 'auto';
    addText('h2', (index+1) + '. ' + (message.role === 'assistant' ? 'ChatGPT' : 'You'), section);
    const body = document.createElement('div');
    body.className = 'message-body';
    body.innerHTML = sanitizeHtml(message.html);
    section.append(body);
    if (message.warnings?.length) {
      const warn = addText('div', 'Capture notes: ' + message.warnings.join('; '), section);
      warn.className = 'warning';
    }
    root.append(section);
  }
}
async function saveFile(name, data, mime) {
  const blob = new Blob([data], {type:mime});
  const url = URL.createObjectURL(blob);
  downloads.push(url);
  await chrome.downloads.download({url,filename:name,saveAs:false,conflictAction:'uniquify'});
}
async function exportSelected() {
  if (!job) return;
  const {doc, choices} = job;
  const name = safeFilename(doc.title || 'chatgpt-export');
  $('export').disabled = true;
  try {
    if (choices.includes('html')) {
      await saveFile(name + '.html', buildHtml(doc,{paperSize:$('paperSize').value}), 'text/html;charset=utf-8');
    }
    if (choices.includes('markdown')) {
      await saveFile(name + '.md', buildMarkdown(doc), 'text/markdown;charset=utf-8');
    }
    if (choices.includes('json')) {
      await saveFile(name + '.json', JSON.stringify(doc,null,2), 'application/json;charset=utf-8');
    }
    setInfo('Files downloaded. ' + (choices.includes('pdf') ? 'Save as PDF in the print dialog.' : 'Export complete.'));
    if (choices.includes('pdf')) window.print();
  } catch (err) {
    setInfo('Download failed: ' + err.message + '. Try again or print separately.');
  } finally {
    $('export').disabled = false;
  }
}
function setPaperSize(value) {
  const paper = normalizePaperSize(value);
  $('paperSize').value = paper;
  // A late stylesheet overrides the default A4 rule during native print.
  let sheet = document.getElementById('gptcPrintPaper');
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = 'gptcPrintPaper';
    document.head.append(sheet);
  }
  sheet.textContent = '@page{size:' + paper + ';margin:18mm 14mm}';
}
$('paperSize').addEventListener('change', () => setPaperSize($('paperSize').value));
setPaperSize('A4');
$('export').addEventListener('click', exportSelected);
$('print').addEventListener('click', () => window.print());
$('clear').addEventListener('click', async () => {
  if (jobId) await chrome.storage.session.remove(jobId);
  job = null;
  $('export').disabled = true;
  $('print').disabled = true;
  $('paper').replaceChildren();
  setInfo('Temporary export data cleared.');
});
async function start() {
  if (!/^gptc-[a-f0-9-]+$/.test(jobId)) {setInfo('Invalid preview link.');return;}
  const data = await chrome.storage.session.get(jobId);
  job = data[jobId];
  if (!job?.doc?.messages?.length) {setInfo('Preview expired or empty. Reopen the extension.');return;}
  render(job.doc);
  const summary = job.doc.captureSummary;
  const label = summary?.missing > 0
    ? summary.captured + '/' + summary.requested + ' messages · ' + summary.missing + ' missing'
    : job.doc.messages.length + ' messages';
  const scanLabel = job.doc.scan?.complete === false ? ' · incomplete scan' : '';
  setInfo(label + scanLabel + ' · ' + job.choices.join(', '));
  $('export').disabled = false;
  $('print').disabled = false;
}
window.addEventListener('pagehide', () => {
  // Chrome may still need blob URLs for downloads; revoke when preview actually closes.
  downloads.forEach(url => URL.revokeObjectURL(url));
  downloads = [];
});
start().catch(err => setInfo('Could not load preview: ' + err.message));
