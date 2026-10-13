const $ = (id) => document.getElementById(id);
let sourceTab, scanData;
let selected = new Set();
const types = ['html','markdown','pdf','json'];
function shown() {
  return (scanData?.messages || []).filter(m => !$('assistantOnly').checked || m.role === 'assistant');
}
function refresh() {
  const items = shown();
  $('messages').replaceChildren();
  items.forEach(m => {
    const label = document.createElement('label');
    label.className = 'message';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selected.has(m.id);
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
  $('toggleAll').textContent = visible.every(m => selected.has(m.id)) ? 'Select none' : 'Select all';
  $('export').disabled = !selected.size || !types.some(t => $(t).checked);
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
$('export').addEventListener('click', async () => {
  $('export').disabled = true;
  try {
    const selectedMessages = scanData.messages.filter(m => selected.has(m.id))
      .map(m => ({id:m.id,signature:m.signature}));
    const result = await chrome.tabs.sendMessage(sourceTab.id,
      {type:'GPTC_COLLECT',selected:selectedMessages});
    if (!result?.ok || !result.data.messages.length) throw Error('No messages captured.');
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
    refresh();
    status(scanData.messages.length + ' rendered messages found.');
  } catch(e) { status('Scan failed: ' + e.message); }
}
start();
