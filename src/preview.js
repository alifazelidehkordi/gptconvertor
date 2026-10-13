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
  try {
    const id = await chrome.downloads.download({
      url,filename:name,saveAs:false,conflictAction:'uniquify'
    });
    if (!Number.isInteger(id) || id < 0) {
      throw Error('Browser did not confirm that the download started.');
    }
    // The browser may still be downloading; retain the object URL until the
    // preview closes rather than revoking immediately after scheduling.
    downloads.push(url);
    return id;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
async function exportSelected() {
  if (!job) return;
  const {doc, choices} = job;
  const name = safeFilename(doc.title || 'chatgpt-export');
  const files = [
    {type:'html', label:'HTML', extension:'.html',
      mime:'text/html;charset=utf-8',
      build:() => buildHtml(doc,{paperSize:$('paperSize').value})},
    {type:'markdown',label:'Markdown',extension:'.md',
      mime:'text/markdown;charset=utf-8',build:() => buildMarkdown(doc)},
    {type:'json',label:'JSON',extension:'.json',
      mime:'application/json;charset=utf-8',build:() => JSON.stringify(doc,null,2)}
  ];
  const started = [];
  const failures = [];
  $('export').disabled = true;
  try {
    for (const file of files) {
      if (!choices.includes(file.type)) continue;
      setInfo('Starting ' + file.label + ' download…');
      try {
        await saveFile(name + file.extension,file.build(),file.mime);
        started.push(file.label);
      } catch (error) {
        failures.push(file.label + ': ' + (error?.message || String(error)));
      }
    }
    // The print dialog remains available even if another format failed.
    if (choices.includes('pdf')) {
      setInfo('Opening Print / Save as PDF…');
      try {
        window.print();
        started.push('PDF print dialog');
      } catch (error) {
        failures.push('PDF: ' + (error?.message || String(error)));
      }
    }
    const messages = [];
    if (started.length) messages.push('Started: ' + started.join(', ') + '.');
    if (failures.length) messages.push('Failed: ' + failures.join('; ') + '.');
    if (!started.length && !failures.length) messages.push('No export format selected.');
    setInfo(messages.join(' ') + (failures.length ? ' You can retry the export; successful downloads may be duplicated.' : ''));
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
  try {
    if (jobId) await chrome.storage.session.remove(jobId);
  } catch (error) {
    setInfo('Could not clear temporary export data: ' + (error?.message || String(error)));
    return;
  }
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
