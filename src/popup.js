const $ = (id) => document.getElementById(id);
let sourceTab, scanData;
let selected = new Set();
let busy = false;
const types = ['html','markdown','pdf','json'];
function shown() {
  return (scanData?.messages || []).filter(m => !$('assistantOnly').checked || m.role === 'assistant');
}
function refresh() {
  const items = shown();
  $('messages').replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = scanData
      ? 'No messages match this filter. Change the filter or scan the conversation.'
      : 'No messages to select yet.';
    $('messages').append(empty);
  }
  items.forEach(m => {
    const label = document.createElement('label');
    label.className = 'message';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selected.has(m.id);
    input.disabled = busy;
    input.setAttribute('aria-label',
      (m.role === 'assistant' ? 'ChatGPT response' : 'Your message') + ': ' + m.preview);
    input.addEventListener('change', () => {
      input.checked ? selected.add(m.id) : selected.delete(m.id);
      update();
    });
    const span = document.createElement('span');
    const small = document.createElement('small');
    small.textContent = m.role === 'assistant' ? 'ChatGPT response' : 'Your message';
    span.append(small, document.createTextNode(m.preview));
    label.append(input, span);
    $('messages').append(label);
  });
  update();
}
function update() {
  const visible = shown();
  $('count').textContent = '(' + selected.size + '/' + visible.length + ')';
  $('toggleAll').textContent = visible.length && visible.every(m => selected.has(m.id))
    ? 'Select none' : 'Select all';
  $('toggleAll').disabled = busy || !visible.length;
  $('assistantOnly').disabled = busy;
  $('messages').setAttribute('aria-busy', String(busy));
  $('messages').querySelectorAll('input[type="checkbox"]').forEach(input => {input.disabled = busy;});
  $('export').disabled = busy || !selected.size || !types.some(t => $(t).checked);
}
function status(text) { $('status').textContent = text; }
$('assistantOnly').addEventListener('change', () => {
  selected = new Set(shown().map(m => m.id));
  refresh();
});
$('toggleAll').addEventListener('click', () => {
  const items = shown();
  const all = items.every(m => selected.has(m.id));
  selected = new Set(all ? [] : items.map(m => m.id));
  refresh();
});
types.forEach(t => $(t).addEventListener('change', update));

$('scanAll').addEventListener('click', async () => {
  if (!sourceTab?.id || busy) return;
  busy = true;
  $('scanAll').disabled = true;
  $('cancelScan').hidden = false;
  $('scanStatus').textContent = 'Scanning locally; returning to your original scroll position afterwards…';
  update();
  let polling = false;
  const timer = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const result = await chrome.tabs.sendMessage(sourceTab.id, {type:'GPTC_SCAN_STATUS'});
      if (result?.ok && result.data?.active) {
        const p = result.data;
        $('scanStatus').textContent = 'Scanning: ' + p.steps +
          ' scroll steps · ' + p.found + ' unique messages captured.';
      }
    } catch { /* The scan request will surface navigation/injection errors. */ }
    finally {polling = false;}
  }, 250);
  try {
    const result = await chrome.tabs.sendMessage(sourceTab.id, {type:'GPTC_SCAN_ALL'});
    if (!result?.ok) throw Error(result?.error || 'Full scan could not complete.');
    scanData = result.data;
    selected = new Set(scanData.messages.filter(m => m.role === 'assistant').map(m => m.id));
    refresh();
    const meta = scanData.scan;
    $('scanStatus').textContent = meta.complete
      ? 'Scan finished: ' + meta.found + ' messages captured in ' + meta.steps + ' steps.'
      : 'Incomplete scan: ' + meta.found + ' messages captured. ' +
        meta.reason + ' Exported JSON and preview will disclose this limitation.';
    status(meta.complete ? 'Full conversation scanned.' : 'Partial scan: review the warning before export.');
  } catch (error) {
    $('scanStatus').textContent = 'Scan failed: ' + error.message;
    status('Previous message selection kept.');
  } finally {
    clearInterval(timer);
    busy = false;
    $('scanAll').disabled = !sourceTab;
    $('cancelScan').hidden = true;
    update();
    if (sourceTab && document.hasFocus()) $('scanAll').focus();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && busy && !$('cancelScan').hidden &&
      !$('cancelScan').disabled) {
    event.preventDefault();
    $('cancelScan').click();
  }
});
$('cancelScan').addEventListener('click', async () => {
  $('cancelScan').disabled = true;
  $('scanStatus').textContent = 'Cancelling scan and restoring scroll position…';
  try { await chrome.tabs.sendMessage(sourceTab.id, {type:'GPTC_SCAN_CANCEL'}); }
  catch { /* In-flight scan will report failure after navigation. */ }
  finally { $('cancelScan').disabled = false; }
});
$('export').addEventListener('click', async () => {
  $('export').disabled = true;
  try {
    const selectedMessages = scanData.messages.filter(m => selected.has(m.id))
      .map(m => ({id:m.id,signature:m.signature}));
    const result = await chrome.tabs.sendMessage(sourceTab.id,
      {type:'GPTC_COLLECT',selected:selectedMessages,sourceUrl:scanData.sourceUrl,
       useScanCache:!!scanData.scan});
    if (!result?.ok) throw Error('Capture failed. Please scan again.');
    if (!result.data?.messages?.length) {
      throw Error(result.data?.warnings?.[0] || 'No messages captured. Please scan again.');
    }
    const jobId = 'gptc-' + crypto.randomUUID();
    await chrome.storage.session.set({[jobId]:{
      doc:result.data, choices:types.filter(t => $(t).checked)
    }});
    await chrome.tabs.create({url:chrome.runtime.getURL('preview.html#' + jobId)});
    window.close();
  } catch(e) { status('Export failed: ' + e.message); update(); }
});
async function start() {
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url || '')) {
      status('Open a ChatGPT conversation first.');
      return;
    }
    sourceTab = tab;
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['src/content.js']});
    const result = await chrome.tabs.sendMessage(tab.id,{type:'GPTC_SCAN'});
    if (!result?.ok) throw Error('Conversation scan failed.');
    scanData = result.data;
    selected = new Set(scanData.messages.filter(m => m.role === 'assistant').map(m => m.id));
    $('scanAll').disabled = false;
    refresh();
    status(scanData.messages.length + ' rendered messages found.');
  } catch(e) { status('Scan failed: ' + e.message); }
}
start();
