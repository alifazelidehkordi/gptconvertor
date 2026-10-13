import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const popup = readFileSync('popup.html','utf8')
  .replace(/<script type="module"[^>]+><\/script>/,'');
const messages = [
  {id:'m-0',role:'user',signature:'user:Request',preview:'Request'},
  {id:'m-1',role:'assistant',signature:'assistant:Answer',preview:'Answer'},
  {id:'m-2',role:'assistant',signature:'assistant:Diagram',preview:'Diagram'}
];

async function openPopup(page) {
  await page.setContent(popup);
  await page.addStyleTag({content:readFileSync('popup.css','utf8')});
  await page.evaluate(messages => {
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
  }, messages);
  await page.addScriptTag({content:readFileSync('src/popup.js','utf8')});
  await expect(page.locator('#export')).toBeEnabled();
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
