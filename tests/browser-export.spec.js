import {test, expect} from '@playwright/test';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const read = path => readFileSync(path, 'utf8');
const asData = source => 'data:text/javascript;base64,' +
  Buffer.from(source).toString('base64');
const formatUrl = asData(read('src/format.js'));
const htmlUrl = asData(read('src/html.js').replace("'./format.js'", "'" + formatUrl + "'"));
const markdownUrl = asData(read('src/markdown.js'));
const previewJs = read('src/preview.js')
  .replace("'./format.js'", "'" + formatUrl + "'")
  .replace("'./html.js'", "'" + htmlUrl + "'")
  .replace("'./markdown.js'", "'" + markdownUrl + "'");

const doc = {
  version:1, title:'Study guide', sourceUrl:'https://chatgpt.com/c/sample',
  exportedAt:'2026-10-13T00:00:00Z', warnings:[],
  messages:[{
    id:'m-1',role:'assistant',text:'سلام! Study guide',
    html:'<div><h2>درس اول</h2><p dir="rtl">سلام دنیا! Hello world.</p>'+
      '<table><tr><th>Topic</th><th>Days</th></tr>'+
      '<tr><td>Study</td><td>3</td></tr></table>'+
      '<pre><code>const answer = 42;</code></pre></div>',warnings:[]
  }]
};

test('preview exports HTML, editable Markdown and JSON and produces PDF', async ({page}) => {
  const html = read('preview.html').replace(/<script type="module"[^>]+><\/script>/,'');
  await page.setContent(html);
  await page.addStyleTag({content:read('preview.css')});
  await page.evaluate(document => {
    window.location.hash = '#gptc-00000000-0000-4000-a000-000000000001';
    window.__downloads = {};
    window.__printed = false;
    window.print = () => {window.__printed = true;};
    window.chrome = {
      storage:{session:{
        get:async key => ({[key]:{doc:document,choices:['html','markdown','json','pdf']}}),
        remove:async () => {}
      }},
      downloads:{download:async ({url,filename}) => {
        window.__downloads[filename] = await (await fetch(url)).text();
        return 1;
      }}
    };
  }, doc);
  await page.addScriptTag({type:'module',content:previewJs});
  await expect(page.locator('#paper')).toContainText('سلام دنیا');
  await expect(page.locator('#export')).toBeEnabled();
  const pdf = await page.pdf({format:'A4',printBackground:true});
  expect(pdf.subarray(0,4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(4000);
  const tmp = mkdtempSync(join(tmpdir(),'gptc-pdf-'));
  try {
    const path = join(tmp,'preview.pdf');
    writeFileSync(path,pdf);
    const extracted = execFileSync('pdftotext',[path,'-'],{encoding:'utf8'});
    expect(extracted).toContain('Study guide');
    expect(extracted).toContain('Hello world');
  } finally {rmSync(tmp,{recursive:true,force:true});}
  await page.locator('#export').click();
  await expect.poll(async () =>
    page.evaluate(() => Object.keys(window.__downloads).length)).toBe(3);
  const files = await page.evaluate(() => window.__downloads);
  expect(files['Study guide.html']).toContain('<table');
  expect(files['Study guide.md']).toContain('## درس اول');
  expect(files['Study guide.md']).toContain('| Topic | Days |');
  expect(files['Study guide.md']).toContain('const answer = 42;');
  expect(JSON.parse(files['Study guide.json']).messages[0].role).toBe('assistant');
  expect(await page.evaluate(() => window.__printed)).toBeTruthy();
});

test('HTML sanitizer removes scripts, unsafe links and handlers', async ({page}) => {
  await page.setContent('<p>test</p>');
  const output = await page.evaluate(async url => {
    const {sanitizeHtml} = await import(url);
    return sanitizeHtml('<p onclick="alert(1)">safe</p>'+
      '<script>alert(2)</script><a href="javascript:alert(3)">bad</a>'+
      '<img src="https://example.com/photo.png" onerror="alert(4)">');
  }, htmlUrl);
  expect(output).not.toContain('<script');
  expect(output).not.toContain('onclick');
  expect(output).not.toContain('onerror');
  expect(output).not.toContain('javascript:');
  expect(output).toContain('photo.png');
});
