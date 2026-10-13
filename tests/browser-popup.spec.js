import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const popup = readFileSync('popup.html','utf8')
  .replace(/<script type="module"[^>]+><\/script>/,'');
const messages = [
  {id:'m-0',role:'user',signature:'user:Request',preview:'Request'},
  {id:'m-1',role:'assistant',signature:'assistant:Answer',preview:'Answer'},
  {id:'m-2',role:'assistant',signature:'assistant:Diagram',preview:'Diagram'}
];

async function openPopup(page, sampleMessages = messages) {
  await page.setContent(popup);
  await page.addStyleTag({content:readFileSync('popup.css','utf8')});
  await page.evaluate(messages => {
    Object.defineProperty(window.crypto, 'randomUUID', {configurable:true, value:() => '00000000-0000-4000-a000-000000000001'});
    window.__saved = null;
    window.__opened = null;
    window.close = () => {};
    window.chrome = {
      tabs:{
        query:async () => [{id:5,url:'https://chatgpt.com/c/sample'}],
        sendMessage:async (_,payload) => payload.type === 'GPTC_SCAN'
          ? {ok:true,data:{title:'Fixture',messages}}
          : {ok:true,data:{
              title:'Fixture',sourceUrl:'https://chatgpt.com/c/sample',
              exportedAt:'2026-10-13T00:00:00Z',warnings:[],
              messages:payload.selected.map(s => ({
                id:s.id,role:messages.find(m => m.id===s.id).role,
                text:s.signature,html:'<p>'+s.id+'</p>',warnings:[]
              }))
            }},
        create:async ({url}) => {window.__opened=url;}
      },
      scripting:{executeScript:async () => {}},
      storage:{session:{set:async data => {window.__saved=Object.values(data)[0];}}},
      runtime:{getURL: path => 'chrome-extension://sample/' + path}
    };
  }, sampleMessages);
  await page.addScriptTag({content:readFileSync('src/popup.js','utf8')});
  if (sampleMessages.some(m => m.role === 'assistant')) {
    await expect(page.locator('#export')).toBeEnabled();
  } else {
    await expect(page.locator('#export')).toBeDisabled();
  }
}

test('assistant-only default and selected formats are respected', async ({page}) => {
  await openPopup(page);
  await expect(page.locator('#assistantOnly')).toBeChecked();
  await expect(page.locator('#messages .message')).toHaveCount(2);
  await page.locator('#messages input[type=checkbox]').nth(1).uncheck();
  await page.locator('#json').check();
  await page.locator('#export').click();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__saved))).toBeTruthy();
  const saved = await page.evaluate(() => window.__saved);
  expect(saved.doc.messages.map(m => m.id)).toEqual(['m-1']);
  expect(saved.choices.sort()).toEqual(['html','json','markdown','pdf']);
  expect(await page.evaluate(() => window.__opened)).toContain('preview.html#gptc-');
});

test('including user turns is opt-in', async ({page}) => {
  await openPopup(page);
  await page.locator('#assistantOnly').uncheck();
  await expect(page.locator('#messages .message')).toHaveCount(3);
  await page.locator('#export').click();
  await expect.poll(async () => page.evaluate(() => Boolean(window.__saved))).toBeTruthy();
  const roles = await page.evaluate(() => window.__saved.doc.messages.map(m => m.role));
  expect(roles).toEqual(['user','assistant','assistant']);
});

test('full scan is opt-in, warns about partial discovery, and enables cached export', async ({page}) => {
  await openPopup(page);
  await expect(page.locator('#scanAll')).toBeEnabled();
  await page.evaluate(() => {
    const original = window.chrome.tabs.sendMessage;
    window.chrome.tabs.sendMessage = async (id, payload) => {
      if (payload.type === 'GPTC_SCAN_ALL') return {ok:true,data:{
        title:'Long fixture',sourceUrl:'https://chatgpt.com/c/sample',
        messages:[
          {id:'m-0',role:'user',signature:'user:Request',preview:'Request'},
          {id:'m-1',role:'assistant',signature:'assistant:Answer',preview:'Answer'},
          {id:'m-2',role:'assistant',signature:'assistant:Diagram',preview:'Diagram'}
        ],
        scan:{complete:false,reason:'Scan step limit reached (48).',found:3,steps:48}
      }};
      if (payload.type === 'GPTC_SCAN_STATUS') return {ok:true,data:{active:true,found:2,steps:5}};
      if (payload.type === 'GPTC_COLLECT') window.__collectPayload = payload;
      return original(id,payload);
    };
  });
  await page.locator('#scanAll').click();
  await expect(page.locator('#scanStatus')).toContainText('Incomplete scan: 3 messages');
  await expect(page.locator('#cancelScan')).toBeHidden();
  await expect(page.locator('#messages .message')).toHaveCount(2);
  await page.locator('#export').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__saved))).toBeTruthy();
  expect(await page.evaluate(() => window.__collectPayload.useScanCache)).toBe(true);
  expect(await page.evaluate(() => window.__collectPayload.sourceUrl))
    .toBe('https://chatgpt.com/c/sample');
});

test('empty message lists explain next steps and disable selection controls', async ({page}) => {
  await openPopup(page, []);
  await expect(page.locator('#messages .message')).toHaveCount(0);
  await expect(page.locator('#messages .empty-state'))
    .toContainText('No messages match this filter');
  await expect(page.locator('#toggleAll')).toBeDisabled();
  await expect(page.locator('#export')).toBeDisabled();
  await expect(page.locator('#count')).toContainText('(0/0)');
  await expect(page.locator('#messages')).toHaveAttribute('role','group');
});

test('checkboxes have useful names and keyboard activation toggles selection', async ({page}) => {
  await openPopup(page);
  const checkbox = page.locator('#messages input[type="checkbox"]').first();
  await expect(checkbox).toHaveAttribute('aria-label', 'ChatGPT response: Answer');
  await checkbox.focus();
  const focus = await checkbox.evaluate(node => getComputedStyle(node.closest('.message')).outlineStyle);
  expect(focus).toBe('solid');
  await page.keyboard.press('Space');
  await expect(checkbox).not.toBeChecked();
  await expect(page.locator('#count')).toHaveAttribute('aria-live','polite');
  await expect(page.locator('#count')).toContainText('(1/2)');
});

test('scanning suspends selections and Escape cancels a long scan', async ({page}) => {
  await openPopup(page);
  await page.evaluate(() => {
    const original = chrome.tabs.sendMessage;
    chrome.tabs.sendMessage = async (id, payload) => {
      if (payload.type === 'GPTC_SCAN_ALL') {
        return new Promise(resolve => {window.__resolveFullScan = resolve;});
      }
      if (payload.type === 'GPTC_SCAN_CANCEL') {
        window.__resolveFullScan({ok:true,data:{
          title:'Cancelled fixture',sourceUrl:'https://chatgpt.com/c/sample',
          messages:[],scan:{complete:false,found:0,steps:1,reason:'Scan cancelled by user.'}
        }});
        return {ok:true};
      }
      if (payload.type === 'GPTC_SCAN_STATUS') return {ok:true,data:{active:true,found:0,steps:1}};
      return original(id,payload);
    };
  });
  await page.locator('#scanAll').click();
  await expect(page.locator('#cancelScan')).toBeVisible();
  await expect(page.locator('#assistantOnly')).toBeDisabled();
  await expect(page.locator('#toggleAll')).toBeDisabled();
  await expect(page.locator('#messages')).toHaveAttribute('aria-busy','true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#scanStatus')).toContainText('Incomplete scan');
  await expect(page.locator('#scanAll')).toBeEnabled();
  await expect(page.locator('#assistantOnly')).toBeEnabled();
  await expect(page.locator('#messages')).toHaveAttribute('aria-busy','false');
});
