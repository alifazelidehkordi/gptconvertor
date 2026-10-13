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

test('selection stays on the correct message after DOM insertion', async ({page}) => {
  await page.setContent(`
    <main>
      <div data-message-author-role="assistant"><p>First answer</p></div>
      <div data-message-author-role="assistant"><p>Second answer</p></div>
    </main>`);
  await page.evaluate(() => {
    window.chrome = {runtime:{onMessage:{addListener: cb => window.__gptcHandle = cb}}};
  });
  await page.addScriptTag({content:adapter});
  const scan = await page.evaluate(() => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_SCAN'}, {}, resolve)));
  const second = scan.data.messages[1];
  await page.locator('main').evaluate(root => {
    const first = document.createElement('div');
    first.setAttribute('data-message-author-role', 'user');
    first.textContent = 'A new earlier prompt';
    root.prepend(first);
  });
  const captured = await page.evaluate(selected => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_COLLECT',selected}, {}, resolve)),
    [{id:second.id,signature:second.signature}]);
  expect(captured.data.messages).toHaveLength(1);
  expect(captured.data.messages[0].text).toBe('Second answer');
  expect(captured.data.captureSummary).toEqual({requested:1,captured:1,missing:0});
});

test('changes beyond 80 characters are detected and missing turns reported', async ({page}) => {
  await page.setContent(`
    <main>
      <div data-message-author-role="assistant">
        <p>${'a'.repeat(100)} original ending</p>
      </div>
      <div data-message-author-role="assistant"><p>Unaffected</p></div>
    </main>`);
  await page.evaluate(() => {
    window.chrome = {runtime:{onMessage:{addListener: cb => window.__gptcHandle = cb}}};
  });
  await page.addScriptTag({content:adapter});
  const scan = await page.evaluate(() => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_SCAN'}, {}, resolve)));
  await page.locator('p').first().evaluate(node => {
    node.textContent = node.textContent.replace('original ending','changed ending');
  });
  const captured = await page.evaluate(selected => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_COLLECT',selected}, {}, resolve)),
    scan.data.messages.map(({id,signature}) => ({id,signature})));
  expect(captured.data.messages.map(m => m.text)).toEqual(['Unaffected']);
  expect(captured.data.captureSummary).toEqual({requested:2,captured:1,missing:1});
  expect(captured.data.skipped).toHaveLength(1);
  expect(captured.data.skipped[0].id).toBe(scan.data.messages[0].id);
  expect(captured.data.warnings[0]).toContain('Message changed or disappeared');
});

test('duplicate text turns have distinct IDs and nested role wrappers do not duplicate', async ({page}) => {
  await page.setContent(`
    <main>
      <div data-message-author-role="assistant">
        <div data-message-author-role="assistant"><p>Same answer</p></div>
      </div>
      <div data-message-author-role="assistant"><p>Same answer</p></div>
    </main>`);
  await page.evaluate(() => {
    window.chrome = {runtime:{onMessage:{addListener: cb => window.__gptcHandle = cb}}};
  });
  await page.addScriptTag({content:adapter});
  const scan = await page.evaluate(() => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_SCAN'}, {}, resolve)));
  expect(scan.data.messages).toHaveLength(2);
  expect(scan.data.messages[0].id).not.toBe(scan.data.messages[1].id);
  const captured = await page.evaluate(selected => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_COLLECT',selected}, {}, resolve)),
    scan.data.messages.map(({id,signature}) => ({id,signature})));
  expect(captured.data.captureSummary).toEqual({requested:2,captured:2,missing:0});
});

test('conversation changes reject stale scan selections', async ({page}) => {
  await page.setContent('<main><div data-message-author-role="assistant">Answer</div></main>');
  await page.evaluate(() => {
    window.chrome = {runtime:{onMessage:{addListener: cb => window.__gptcHandle = cb}}};
  });
  await page.addScriptTag({content:adapter});
  const scan = await page.evaluate(() => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_SCAN'}, {}, resolve)));
  const capture = await page.evaluate(selected => new Promise(resolve =>
    window.__gptcHandle({
      type:'GPTC_COLLECT',selected,sourceUrl:'https://chatgpt.com/c/another-conversation'
    }, {}, resolve)), scan.data.messages.map(({id,signature}) => ({id,signature})));
  expect(capture.data.messages).toHaveLength(0);
  expect(capture.data.captureSummary).toEqual({requested:1,captured:0,missing:1});
  expect(capture.data.warnings[0]).toContain('Conversation changed');
});

async function virtualizedConversation(page, height = 1180) {
  await page.setContent(`
    <div id="scroll" style="height:180px;width:500px;overflow-y:auto;position:relative">
      <div style="height:${height}px;position:relative">
        <div id="visible" style="position:absolute;left:0;width:400px"></div>
      </div>
    </div>`);
  await page.evaluate(() => {
    const viewport = document.getElementById('scroll');
    const visible = document.getElementById('visible');
    const render = () => {
      const index = Math.min(10, Math.floor(viewport.scrollTop / 90));
      visible.style.top = viewport.scrollTop + 'px';
      visible.replaceChildren();
      for (const i of [index, index+1]) {
        const turn = document.createElement('div');
        turn.setAttribute('data-message-author-role', i % 2 ? 'user' : 'assistant');
        const p = document.createElement('p');
        p.textContent = 'Virtualized message ' + i;
        turn.append(p);
        visible.append(turn);
      }
    };
    viewport.addEventListener('scroll', render);
    viewport.scrollTop = 230;
    render();
    window.chrome = {runtime:{onMessage:{addListener: cb => window.__gptcHandle = cb}}};
  });
  await page.addScriptTag({content:adapter});
}

test('bounded scan captures virtualized turns, restores scroll, exports offscreen snapshots', async ({page}) => {
  await virtualizedConversation(page);
  const startScroll = await page.locator('#scroll').evaluate(el => el.scrollTop);
  const result = await page.evaluate(() => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_SCAN_ALL'}, {}, resolve)));
  expect(result.ok).toBeTruthy();
  expect(result.data.scan.complete).toBeTruthy();
  expect(result.data.messages.length).toBeGreaterThan(7);
  expect(result.data.messages.some(m => m.preview.includes('Virtualized message 0'))).toBeTruthy();
  expect(result.data.messages.some(m => m.preview.includes('Virtualized message 11'))).toBeTruthy();
  expect(await page.locator('#scroll').evaluate(el => el.scrollTop)).toBe(startScroll);

  const first = result.data.messages.find(m => m.preview.includes('Virtualized message 0'));
  const last = result.data.messages.find(m => m.preview.includes('Virtualized message 11'));
  const collected = await page.evaluate(({selected,sourceUrl}) => new Promise(resolve =>
    window.__gptcHandle({
      type:'GPTC_COLLECT', selected, sourceUrl, useScanCache:true
    }, {}, resolve)), {
      selected:[first,last].map(({id,signature}) => ({id,signature})),
      sourceUrl:result.data.sourceUrl
    });
  expect(collected.data.messages).toHaveLength(2);
  expect(collected.data.messages[0].text).toContain('Virtualized message 0');
  expect(collected.data.messages[1].text).toContain('Virtualized message 11');
  expect(collected.data.messages[0].warnings.join(' ')).toContain('could not be revalidated');
  expect(collected.data.captureSummary).toEqual({requested:2,captured:2,missing:0});
});

test('user can cancel a long scan without leaving page scrolled', async ({page}) => {
  await virtualizedConversation(page, 30000);
  const startScroll = await page.locator('#scroll').evaluate(el => el.scrollTop);
  const outcome = await page.evaluate(async () => {
    const scanning = new Promise(resolve =>
      window.__gptcHandle({type:'GPTC_SCAN_ALL'}, {}, resolve));
    await new Promise(resolve => setTimeout(resolve, 240));
    const progress = await new Promise(resolve =>
      window.__gptcHandle({type:'GPTC_SCAN_STATUS'}, {}, resolve));
    const cancelled = await new Promise(resolve =>
      window.__gptcHandle({type:'GPTC_SCAN_CANCEL'}, {}, resolve));
    return {result:await scanning, progress, cancelled};
  });
  expect(outcome.progress.data.active).toBeTruthy();
  expect(outcome.cancelled.ok).toBeTruthy();
  expect(outcome.result.ok).toBeTruthy();
  expect(outcome.result.data.scan.complete).toBeFalsy();
  expect(outcome.result.data.scan.reason).toContain('cancelled');
  expect(await page.locator('#scroll').evaluate(el => el.scrollTop)).toBe(startScroll);
});

test('bounded scan reports incomplete result when its step limit is reached', async ({page}) => {
  await virtualizedConversation(page, 30000);
  const result = await page.evaluate(() => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_SCAN_ALL'}, {}, resolve)));
  expect(result.ok).toBeTruthy();
  expect(result.data.scan.complete).toBeFalsy();
  expect(result.data.scan.reason).toContain('step limit');
  expect(result.data.scan.steps).toBe(48);
  const item = result.data.messages[0];
  const collected = await page.evaluate(({selected,sourceUrl}) => new Promise(resolve =>
    window.__gptcHandle({type:'GPTC_COLLECT',selected,sourceUrl,useScanCache:true}, {}, resolve)),
    {selected:[{id:item.id,signature:item.signature}],sourceUrl:result.data.sourceUrl});
  expect(collected.data.warnings.join(' ')).toContain('Full conversation scan incomplete');
  expect(collected.data.scan.complete).toBeFalsy();
});
