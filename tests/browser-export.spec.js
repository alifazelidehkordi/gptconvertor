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
const markdownUrl = asData(read('src/markdown.js')
  .replace("'./format.js'", "'" + formatUrl + "'"));
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

test('HTML export retains table spans and captured visual dimensions', async ({page}) => {
  await page.setContent('<p>test</p>');
  const output = await page.evaluate(async ({url, fixture}) => {
    const {sanitizeHtml,buildHtml} = await import(url);
    const html = '<table><tr><th colspan="2">Summary</th></tr>'+
      '<tr><td rowspan="2">A</td><td>1</td></tr>'+
      '<tr><td>2</td></tr></table>'+
      '<img src="data:image/png;base64,AA==" width="640" height="300">'+
      '<img src="https://example.com/i.png" width="999999" height="-1">';
    return {
      clean:sanitizeHtml(html),
      exported:buildHtml({...fixture,messages:[{...fixture.messages[0],html}]})
    };
  }, {url:htmlUrl,fixture:doc});
  expect(output.clean).toContain('colspan="2"');
  expect(output.clean).toContain('rowspan="2"');
  expect(output.clean).toContain('width="640"');
  expect(output.clean).toContain('height="300"');
  expect(output.clean).not.toContain('999999');
  expect(output.clean).not.toContain('height="-1"');
  expect(output.exported).toContain('colspan="2"');
  expect(output.exported).toContain('width="640"');
});

test('preview visibly flags incomplete exports before download', async ({page}) => {
  const html = read('preview.html').replace(/<script type="module"[^>]+><\/script>/,'');
  await page.setContent(html);
  await page.addStyleTag({content:read('preview.css')});
  const incomplete = {
    ...doc,
    captureSummary:{requested:2,captured:1,missing:1},
    skipped:[{id:'m-missing',reason:'Message changed or disappeared'}],
    warnings:['Message changed or disappeared: m-missing']
  };
  await page.evaluate(fixture => {
    window.location.hash = '#gptc-00000000-0000-4000-a000-000000000001';
    window.chrome = {
      storage:{session:{get:async key => ({[key]:{doc:fixture,choices:['json']}})}},
      downloads:{download:async () => 1}
    };
  }, incomplete);
  await page.addScriptTag({type:'module',content:previewJs});
  await expect(page.locator('#paper [role="alert"]'))
    .toContainText('Incomplete capture: 1 of 2 selected messages exported');
  await expect(page.locator('#info')).toContainText('1/2 messages');
  await expect(page.locator('#paper')).toContainText('Message changed or disappeared');
  await expect(page.locator('#export')).toBeEnabled();
});

test('Markdown preserves nested lists, inline literals, and fenced code with backticks', async ({page}) => {
  await page.setContent('<p>test</p>');
  const markdown = await page.evaluate(async url => {
    const {buildMarkdown} = await import(url);
    return buildMarkdown({
      title:'Guide * Draft',sourceUrl:'https://chatgpt.com/c/test',
      messages:[{role:'assistant',html:
        '<ol start="3"><li>Parent<ul><li>Nested item</li><li>Another</li></ul></li>'+
        '<li>Second</li></ol>'+
        '<pre><code>const template = "```";\nnextLine();</code></pre>'+
        '<p dir="rtl">سلام <code>value`x</code> and <strong>bold</strong></p>'+
        '<p><a href="https://example.com/a(b)">read more</a></p>'
      }]
    });
  }, markdownUrl);
  expect(markdown).toContain('# Guide \\* Draft');
  expect(markdown).toContain('3. Parent\n  - Nested item\n  - Another\n4. Second');
  expect(markdown).toContain('````\nconst template = "```";\nnextLine();\n````');
  expect(markdown).toContain('``value`x``');
  expect(markdown).toContain('سلام');
  expect(markdown).toContain('**bold**');
  expect(markdown).toContain('[read more](https://example.com/a%28b%29)');
});

test('incomplete scan and per-message media warnings survive HTML and Markdown export', async ({page}) => {
  await page.setContent('<p>test</p>');
  const result = await page.evaluate(async ({htmlUrl, markdownUrl, fixture}) => {
    const {buildHtml} = await import(htmlUrl);
    const {buildMarkdown} = await import(markdownUrl);
    return {html:buildHtml(fixture,{paperSize:'Letter'}),md:buildMarkdown(fixture)};
  }, {htmlUrl,markdownUrl,fixture:{
    ...doc,
    title:'Review <unsafe>',
    scan:{complete:false,reason:'Scan step limit reached (48).'},
    captureSummary:{requested:3,captured:1,missing:2},
    warnings:['Message changed or disappeared: <hidden>'],
    messages:[{...doc.messages[0],
      warnings:['External images may require a network connection','Some <visual> unavailable']
    }]
  }});
  expect(result.html).toContain('Conversation scan incomplete');
  expect(result.html).toContain('Incomplete capture: 1 of 3');
  expect(result.html).toContain('External images may require a network connection');
  expect(result.html).not.toContain('<unsafe>');
  expect(result.html).not.toContain('<hidden>');
  expect(result.html).not.toContain('<visual>');
  expect(result.html).toContain('@page{size:Letter;');
  expect(result.md).toContain('## Export notes');
  expect(result.md).toContain('Conversation scan incomplete');
  expect(result.md).toContain('Incomplete capture: 1 of 3');
  expect(result.md).toContain('Capture notes: External images may require a network connection');
});

test('print layouts keep long tables and end-of-document text in searchable PDF', async ({page}) => {
  await page.setContent('<p>Initial</p>');
  const rows = Array.from({length:72}, (_,i) =>
    '<tr><td>' + (i+1) + '</td><td>Printable row ' + (i+1) +
    ' - سلام دنیا Hello world</td></tr>').join('');
  const data = {
    ...doc,
    title:'Long printable report',
    messages:[{...doc.messages[0],
      html:'<h2>Study summary</h2><p dir="rtl">سلام دنیا 123 ABC</p>'+
        '<table><thead><tr><th>Number</th><th>Description</th></tr></thead><tbody>'+
        rows+'</tbody></table><pre><code>' + 'a'.repeat(3000) +
        '\nTERMINAL_CODE_LINE</code></pre><p>FINAL_PAGE_SENTINEL</p>'}]
  };
  const exported = await page.evaluate(async ({htmlUrl,fixture}) => {
    const {buildHtml} = await import(htmlUrl);
    return buildHtml(fixture,{paperSize:'Letter'});
  }, {htmlUrl,fixture:data});
  await page.setContent(exported);
  await page.emulateMedia({media:'print'});
  const styles = await page.evaluate(() => ({
    table:getComputedStyle(document.querySelector('table')).display,
    overflow:getComputedStyle(document.querySelector('table')).overflowX,
    pre:getComputedStyle(document.querySelector('pre')).whiteSpace,
    rtl:document.querySelector('p[dir="rtl"]').getAttribute('dir')
  }));
  expect(styles.table).toBe('table');
  expect(styles.overflow).toBe('visible');
  expect(styles.pre).toBe('pre-wrap');
  expect(styles.rtl).toBe('rtl');
  const pdf = await page.pdf({printBackground:true,preferCSSPageSize:true});
  const folder = mkdtempSync(join(tmpdir(),'gptc-long-pdf-'));
  try {
    const path = join(folder,'print.pdf');
    writeFileSync(path,pdf);
    const info = execFileSync('pdfinfo',[path],{encoding:'utf8'});
    const count = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
    expect(count).toBeGreaterThan(1);
    expect(info).toMatch(/Page size:\s+612 x 792 pts/);
    const text = execFileSync('pdftotext',[path,'-'],{encoding:'utf8'});
    expect(text).toContain('Printable row 1');
    expect(text).toContain('Printable row 72');
    expect(text).toContain('TERMINAL_CODE_LINE');
    expect(text).toContain('FINAL_PAGE_SENTINEL');
    expect(text).toContain('Hello world');
  } finally {rmSync(folder,{recursive:true,force:true});}
});

test('preview print size changes CSS and HTML download option without unsafe CSS', async ({page}) => {
  const markup = read('preview.html').replace(/<script type="module"[^>]+><\/script>/,'');
  await page.setContent(markup);
  await page.addStyleTag({content:read('preview.css')});
  await page.evaluate(fixture => {
    window.location.hash = '#gptc-00000000-0000-4000-a000-000000000001';
    window.__downloaded = '';
    window.chrome = {
      storage:{session:{get:async key => ({[key]:{doc:fixture,choices:['html']}})}},
      downloads:{download:async ({url}) => {
        window.__downloaded = await (await fetch(url)).text();
      }}
    };
  }, doc);
  await page.addScriptTag({type:'module',content:previewJs});
  await expect(page.locator('#paperSize')).toHaveValue('A4');
  await page.locator('#paperSize').selectOption('Letter');
  expect(await page.locator('#gptcPrintPaper').textContent()).toContain('size:Letter;');
  await page.locator('#export').click();
  await expect.poll(() => page.evaluate(() => window.__downloaded)).toContain('@page{size:Letter;');
  const cleaned = await page.evaluate(async url => {
    const {buildHtml} = await import(url);
    return buildHtml({title:'Safe',messages:[]},{paperSize:'</style><script>alert(1)</script>'});
  }, htmlUrl);
  expect(cleaned).toContain('@page{size:A4;');
  expect(cleaned).not.toContain('<script>');
});

test('one failed download does not prevent other formats or PDF printing', async ({page}) => {
  const markup = read('preview.html').replace(/<script type="module"[^>]+><\/script>/,'');
  await page.setContent(markup);
  await page.addStyleTag({content:read('preview.css')});
  await page.evaluate(fixture => {
    window.location.hash = '#gptc-00000000-0000-4000-a000-000000000001';
    window.__attempts = [];
    window.__printed = false;
    window.print = () => {window.__printed = true;};
    window.chrome = {
      storage:{session:{get:async key => ({[key]:{
        doc:fixture, choices:['html','markdown','json','pdf']
      }})}},
      downloads:{download:async ({filename}) => {
        window.__attempts.push(filename);
        if (filename.endsWith('.html')) throw Error('HTML was blocked');
        return window.__attempts.length;
      }}
    };
  }, doc);
  await page.addScriptTag({type:'module',content:previewJs});
  await page.locator('#export').click();
  await expect(page.locator('#info')).toContainText('Failed: HTML: HTML was blocked.');
  await expect(page.locator('#info')).toContainText('Started: Markdown, JSON, PDF print dialog.');
  expect(await page.evaluate(() => window.__attempts)).toEqual([
    'Study guide.html','Study guide.md','Study guide.json'
  ]);
  expect(await page.evaluate(() => window.__printed)).toBeTruthy();
  await expect(page.locator('#export')).toBeEnabled();
});

test('failed preview-data cleanup leaves content available and reports the error', async ({page}) => {
  const markup = read('preview.html').replace(/<script type="module"[^>]+><\/script>/,'');
  await page.setContent(markup);
  await page.addStyleTag({content:read('preview.css')});
  await page.evaluate(fixture => {
    window.location.hash = '#gptc-00000000-0000-4000-a000-000000000001';
    window.chrome = {
      storage:{session:{
        get:async key => ({[key]:{doc:fixture,choices:['json']}}),
        remove:async () => {throw Error('Storage not available');}
      }},
      downloads:{download:async () => 1}
    };
  }, doc);
  await page.addScriptTag({type:'module',content:previewJs});
  await expect(page.locator('#export')).toBeEnabled();
  await page.locator('#clear').click();
  await expect(page.locator('#info')).toContainText('Could not clear temporary export data');
  await expect(page.locator('#paper')).toContainText('Study guide');
  await expect(page.locator('#export')).toBeEnabled();
});

test('preview keyboard skip-link reaches the document and focus rings are visible', async ({page}) => {
  const markup = read('preview.html').replace(/<script type="module"[^>]+><\/script>/,'');
  await page.setContent(markup);
  await page.addStyleTag({content:read('preview.css')});
  await page.evaluate(fixture => {
    window.location.hash = '#gptc-00000000-0000-4000-a000-000000000001';
    window.chrome = {
      storage:{session:{get:async key => ({[key]:{doc:fixture,choices:['json']}})}},
      downloads:{download:async () => 1}
    };
  },doc);
  await page.addScriptTag({type:'module',content:previewJs});
  await expect(page.locator('#paper')).toContainText('Study guide');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  const visual = await page.locator('.skip-link').evaluate(el => ({
    transform:getComputedStyle(el).transform,
    outline:getComputedStyle(el).outlineStyle
  }));
  expect(visual.transform).toBe('none');
  expect(visual.outline).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('#paper')).toBeFocused();
  await expect(page.locator('.toolbar')).toHaveAttribute('aria-label','Export actions');
  await expect(page.locator('#paper')).toHaveAttribute('aria-label','Exported document');
});

test('HTML sanitizer rejects arbitrary CSS while preserving captured typography', async ({page}) => {
  await page.setContent('<p>fixture</p>');
  const result = await page.evaluate(async url => {
    const {sanitizeHtml} = await import(url);
    return sanitizeHtml(
      '<div dir="rtl" style="position:fixed;inset:0;z-index:99999;'+
      'background-image:url(https://tracker.example/steal);color:rgb(10,20,30);'+
      'font-family:Tahoma,Arial;white-space:pre-wrap;direction:rtl;'+
      'transform:scale(100);border-color:#abcdef">سلام &amp; welcome</div>'+
      '<a href="https://example.com/info" onclick="alert(1)">Read</a>'+
      '<img src="https://images.example.org/chart.png" onerror="alert(2)">'
    );
  }, htmlUrl);
  expect(result).toContain('dir="rtl"');
  expect(result).toContain('color:rgb(10,20,30)');
  expect(result).toContain('font-family:Tahoma,Arial');
  expect(result).toContain('white-space:pre-wrap');
  expect(result).toContain('border-color:#abcdef');
  expect(result).not.toContain('position:fixed');
  expect(result).not.toContain('z-index:');
  expect(result).not.toContain('inset:');
  expect(result).not.toContain('tracker.example');
  expect(result).not.toContain('transform:');
  expect(result).not.toContain('onclick');
  expect(result).not.toContain('onerror');
  expect(result).toContain('referrerpolicy="no-referrer"');
  expect(result).toContain('rel="noopener noreferrer"');
});

test('standalone HTML has a no-script CSP and safe referrer defaults', async ({page}) => {
  await page.setContent('<p>fixture</p>');
  const exported = await page.evaluate(async ({url,fixture}) => {
    const {buildHtml} = await import(url);
    return buildHtml({
      ...fixture,
      messages:[{...fixture.messages[0],
        html:'<script>window.__injectedScript = true;</script>'+
          '<p style="color:blue;position:fixed" dir="rtl">نوشته فارسی</p>'+
          '<a href="https://example.com">External link</a>'}]
    });
  },{url:htmlUrl,fixture:doc});
  await page.setContent(exported);
  const checked = await page.evaluate(() => ({
    csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
    referrer:document.querySelector('meta[name="referrer"]')?.content,
    html:document.querySelector('.message-body').innerHTML,
    injected:Boolean(window.__injectedScript)
  }));
  expect(checked.csp).toContain("default-src 'none'");
  expect(checked.csp).toContain("form-action 'none'");
  expect(checked.referrer).toBe('no-referrer');
  expect(checked.injected).toBe(false);
  expect(checked.html).not.toContain('position:fixed');
  expect(checked.html).toContain('dir="rtl"');
  expect(checked.html).toContain('نوشته فارسی');
});
