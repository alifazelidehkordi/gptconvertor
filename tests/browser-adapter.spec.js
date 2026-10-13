import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const adapter = readFileSync('src/content.js', 'utf8');
const fixture = `
<main>
<div data-message-author-role="user"><p>Plan my trip</p></div>
<div data-message-author-role="assistant">
  <h2>Travel plan</h2>
  <p dir="rtl">سلام دنیا! روز اول در رم.</p>
  <ul><li>Colosseum</li><li>Trastevere</li></ul>
  <table><thead><tr><th>Day</th><th>Place</th></tr></thead>
    <tbody><tr><td>1</td><td>Rome</td></tr></tbody></table>
  <pre><code>const days = 3;</code></pre>
  <svg xmlns="http://www.w3.org/2000/svg" width="130" height="40" aria-label="Chart">
    <rect width="100" height="35" fill="green" />
  </svg>
  <iframe title="Map" srcdoc="<p>hidden</p>"></iframe>
  <button aria-label="Copy">Copy</button>
</div>
</main>`;

test('DOM adapter reads roles, Persian, tables and unsupported visuals', async ({page}) => {
  await page.setContent(fixture);
  await page.evaluate(() => {
    window.chrome = {runtime: {onMessage: {addListener: callback => {
      window.__gptcHandle = callback;
    }}}};
  });
  await page.addScriptTag({content: adapter});
  const scan = await page.evaluate(() => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_SCAN'}, {}, resolve)));
  expect(scan.ok).toBeTruthy();
  expect(scan.data.messages.map(m => m.role)).toEqual(['user','assistant']);
  const assistant = scan.data.messages[1];
  const captured = await page.evaluate(selected => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_COLLECT',selected}, {}, resolve)),
    [{id:assistant.id,signature:assistant.signature}]);
  expect(captured.data.messages).toHaveLength(1);
  const msg = captured.data.messages[0];
  expect(msg.text).toContain('سلام دنیا');
  expect(msg.html).toContain('<table');
  expect(msg.html).toContain('<pre');
  expect(msg.html).toContain('data:image/svg+xml');
  expect(msg.html).not.toContain('<iframe');
  expect(msg.warnings.some(w => w.includes('iframe'))).toBeTruthy();
  expect(msg.html).not.toContain('aria-label="Copy"');
});

test('modified message is not silently exported', async ({page}) => {
  await page.setContent(fixture);
  await page.evaluate(() => {
    window.chrome = {runtime: {onMessage: {addListener: cb => window.__gptcHandle = cb}}};
  });
  await page.addScriptTag({content: adapter});
  const scan = await page.evaluate(() => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_SCAN'}, {}, resolve)));
  const selection = scan.data.messages[1];
  await page.locator('[data-message-author-role="assistant"] p').first().evaluate(el => {
    el.textContent = 'Updated text';
  });
  const capture = await page.evaluate(selected => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_COLLECT',selected}, {}, resolve)),
    [{id:selection.id,signature:selection.signature}]);
  expect(capture.data.messages).toHaveLength(0);
  expect(capture.data.warnings).toHaveLength(1);
});

test('visual-only messages appear in scan and survive export', async ({page}) => {
  await page.setContent(`
    <main>
      <div data-message-author-role="assistant">
        <img src="data:image/png;base64,AA==" alt="Diagram">
      </div>
      <div data-message-author-role="assistant">
        <svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">
          <rect width="120" height="40" fill="blue"></rect>
        </svg>
      </div>
      <div data-message-author-role="assistant"></div>
    </main>`);
  await page.evaluate(() => {
    window.chrome = {runtime:{onMessage:{addListener: cb => window.__gptcHandle = cb}}};
  });
  await page.addScriptTag({content:adapter});
  const scan = await page.evaluate(() => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_SCAN'}, {}, resolve)));
  expect(scan.data.messages).toHaveLength(2);
  expect(scan.data.messages.map(m => m.preview)).toEqual([
    '[Visual-only message]', '[Visual-only message]'
  ]);
  const captured = await page.evaluate(selected => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_COLLECT',selected}, {}, resolve)),
    scan.data.messages.map(({id,signature}) => ({id,signature})));
  expect(captured.data.messages).toHaveLength(2);
  expect(captured.data.messages[0].html).toContain('data:image/png;base64,');
  expect(captured.data.messages[1].html).toContain('data:image/svg+xml');
});
