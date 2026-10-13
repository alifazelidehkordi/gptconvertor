/* GPT Convertor: isolated, read-only DOM adapter. Runs only after user opens popup. */
(() => {
  if (globalThis.__gptConvertorLoaded) return;
  globalThis.__gptConvertorLoaded = true;

  const ALLOWED = new Set([
    'a','article','aside','b','blockquote','br','button','caption','code','dd','del',
    'details','div','dl','dt','em','figcaption','figure','footer','h1','h2','h3','h4',
    'h5','h6','header','hr','i','img','kbd','label','li','main','mark','ol','p','pre',
    's','section','small','span','strong','sub','summary','sup','table','tbody',
    'td','th','thead','time','tr','u','ul'
  ]);
  const STYLE_KEYS = [
    'display','color','background-color','font-family','font-size','font-weight',
    'font-style','line-height','letter-spacing','text-align','text-decoration',
    'direction','white-space','overflow-wrap','word-break','border','border-radius',
    'border-color','border-width','border-style','padding','margin','gap','row-gap',
    'column-gap','flex-direction','flex-wrap','align-items','justify-content',
    'grid-template-columns','list-style-type','vertical-align','max-width',
    'min-width','width','height'
  ];
  const SKIP = '[aria-hidden="true"],[hidden],[data-gptconvertor-skip]';
  const CONTROLS = /^(copy|share|edit|regenerate|retry|good response|bad response|thumbs up|thumbs down|read aloud|more|open menu)$/i;

  // Selectors and DOM positions may shift between scanning and exporting.
  // Identify a rendered turn by its *whole* text and media fingerprint instead
  // of a transient index or the first 80 characters.
  function fingerprint(role, text, body) {
    const visual = Array.from(body.querySelectorAll('img, svg, canvas, iframe')).map(node => {
      const tag = node.localName;
      if (tag === 'img') return 'img:' + (node.currentSrc || node.getAttribute('src') || '') +
        ':' + (node.getAttribute('alt') || '');
      if (tag === 'svg') return 'svg:' + node.outerHTML;
      if (tag === 'canvas') return 'canvas:' + node.width + 'x' + node.height +
        ':' + (node.getAttribute('aria-label') || '');
      return 'iframe:' + (node.getAttribute('src') || '');
    }).join('\u0000');
    const value = role + '\u0000' + text + '\u0000' + visual;
    let h1 = 2166136261, h2 = 3339675911;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ char, 16777619);
      h2 = Math.imul(h2 ^ char, 2246822519);
    }
    return role + '-' + value.length.toString(36) + '-' +
      (h1 >>> 0).toString(36) + '-' + (h2 >>> 0).toString(36);
  }

  function nodes() {
    const roleNodes = Array.from(document.querySelectorAll('[data-message-author-role]'))
      .filter(root => !root.parentElement?.closest('[data-message-author-role]'));
    const roots = roleNodes.length ? roleNodes :
      Array.from(document.querySelectorAll('article[data-testid^="conversation-turn-"]'));
    const occurrences = new Map();
    return roots.map(root => {
      const role = root.getAttribute('data-message-author-role') ||
        root.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role') || '';
      const body = root.hasAttribute('data-message-author-role') ? root :
        root.querySelector('[data-message-author-role]') || root;
      const text = (body.innerText || body.textContent || '').trim();
      const hasVisual = !!body.querySelector('img, svg, canvas, iframe');
      if ((role !== 'assistant' && role !== 'user') || (!text && !hasVisual)) return null;
      const signature = fingerprint(role, text, body);
      const occurrence = occurrences.get(signature) || 0;
      occurrences.set(signature, occurrence + 1);
      return {
        id: 'm-' + signature + '-' + occurrence, role, body, text, signature
      };
    }).filter(Boolean);
  }

  function scan() {
    return {
      title: document.title || 'ChatGPT conversation',
      sourceUrl: location.href,
      messages: nodes().map(x => ({
        id: x.id,
        role: x.role,
        signature: x.signature,
        preview: x.text ? x.text.replace(/\s+/g, ' ').slice(0, 150) : '[Visual-only message]'
      }))
    };
  }

  function validUrl(raw, kind) {
    try {
      const u = new URL(raw, location.href);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
      if (kind === 'img' && u.protocol === 'data:' &&
          /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(raw)) return raw;
    } catch { /* blocked */ }
    return '';
  }

  function placeholder(message, warnings) {
    warnings.add(message);
    const div = document.createElement('div');
    div.className = 'visual-fallback';
    div.textContent = '[Visual component not captured: ' + message + ']';
    return div;
  }

  function stringifySvg(source, warnings) {
    try {
      const svg = source.cloneNode(true);
      svg.querySelectorAll('script,foreignObject,animate,set,iframe').forEach(n => n.remove());
      const tree = [svg, ...svg.querySelectorAll('*')];
      tree.forEach(node => {
        for (const a of Array.from(node.attributes)) {
          if (/^on/i.test(a.name) || /^(href|xlink:href)$/i.test(a.name) ||
              /url\s*\(/i.test(a.value)) node.removeAttribute(a.name);
        }
      });
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const data = new XMLSerializer().serializeToString(svg);
      const image = document.createElement('img');
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
      image.alt = source.getAttribute('aria-label') || 'SVG visual';
      const rect = source.getBoundingClientRect();
      if (rect.width) image.width = Math.round(rect.width);
      if (rect.height) image.height = Math.round(rect.height);
      return image;
    } catch {
      return placeholder('SVG could not be serialized', warnings);
    }
  }

  function capture(root) {
    const warnings = new Set();
    let count = 0;
    function walk(node, depth = 0) {
      count++;
      if (count > 4500 || depth > 45) return placeholder('capture size limit reached', warnings);
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '');
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const tag = node.localName.toLowerCase();
      if (node.matches(SKIP) || ['script','style','noscript','template','object','embed','audio','video'].includes(tag)) return null;
      const computed = getComputedStyle(node);
      if (computed.display === 'none' || computed.visibility === 'hidden') return null;
      if (tag === 'iframe') return placeholder('embedded iframe', warnings);
      if (tag === 'svg') return stringifySvg(node, warnings);
      if (tag === 'canvas') {
        try {
          const img = document.createElement('img');
          img.src = node.toDataURL('image/png');
          img.alt = node.getAttribute('aria-label') || 'Canvas chart';
          img.width = node.width;
          img.height = node.height;
          return img;
        } catch {
          return placeholder('cross-origin or protected canvas', warnings);
        }
      }
      if (tag === 'button' && CONTROLS.test(
        (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 80))) return null;
      if (['input','textarea','select'].includes(tag)) {
        const out = document.createElement('span');
        if (tag === 'input' && ['checkbox','radio'].includes(node.type)) {
          out.textContent = node.checked ? '☑' : '☐';
        } else if (tag === 'select') {
          out.textContent = node.selectedOptions?.[0]?.textContent || '';
        } else {
          out.textContent = node.value || node.getAttribute('aria-label') || '';
        }
        return out;
      }
      const safeTag = ALLOWED.has(tag) ? (tag === 'button' ? 'span' : tag) : 'div';
      const out = document.createElement(safeTag);
      if (tag === 'img') {
        const src = validUrl(node.currentSrc || node.getAttribute('src') || '', 'img');
        if (src) out.src = src;
        else return placeholder('image source was unavailable', warnings);
        out.alt = node.getAttribute('alt') || '';
        if (/^https?:/.test(src)) warnings.add('External images may require a network connection');
        const w = node.getAttribute('width'), h = node.getAttribute('height');
        if (w && /^\d+$/.test(w)) out.setAttribute('width', w);
        if (h && /^\d+$/.test(h)) out.setAttribute('height', h);
      }
      if (tag === 'a') {
        const href = validUrl(node.getAttribute('href') || '', 'link');
        if (href) {
          out.setAttribute('href', href);
          out.setAttribute('rel', 'noopener noreferrer');
        }
      }
      if (tag === 'ol' && node.hasAttribute('start')) {
        const start = Number(node.getAttribute('start'));
        if (Number.isSafeInteger(start) && start >= 1) out.setAttribute('start', String(start));
      }
      if (tag === 'th' || tag === 'td') {
        for (const attr of ['colspan','rowspan']) {
          const num = Number(node.getAttribute(attr));
          if (Number.isInteger(num) && num > 1 && num <= 100) out.setAttribute(attr, String(num));
        }
      }
      const styles = STYLE_KEYS.map(key => {
        const value = computed.getPropertyValue(key);
        return value && !/url\s*\(|expression\s*\(/i.test(value) ? key + ':' + value : '';
      }).filter(Boolean).join(';');
      if (styles) out.setAttribute('style', styles);
      if (node.getAttribute('dir') && /^(ltr|rtl|auto)$/.test(node.getAttribute('dir'))) {
        out.setAttribute('dir', node.getAttribute('dir'));
      }
      if (node.shadowRoot) {
        for (const child of node.shadowRoot.childNodes) {
          const element = walk(child, depth + 1);
          if (element) out.append(element);
        }
      } else {
        for (const child of node.childNodes) {
          const element = walk(child, depth + 1);
          if (element) out.append(element);
        }
      }
      return out;
    }
    const result = walk(root);
    return {html: result?.outerHTML || '', warnings: [...warnings]};
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === 'GPTC_SCAN') {
      respond({ok:true, data:scan()});
      return;
    }
    if (message?.type === 'GPTC_COLLECT') {
      const selected = Array.isArray(message.selected) ? message.selected : [];
      const sameConversation = !message.sourceUrl || message.sourceUrl === location.href;
      const available = sameConversation ? new Map(nodes().map(x => [x.id, x])) : new Map();
      const warnings = [];
      const messages = [];
      const skipped = [];
      if (!sameConversation) warnings.push('Conversation changed since the message list was scanned. Reopen the extension.');
      for (const selection of selected) {
        const entry = available.get(selection.id);
        if (!entry || entry.signature !== selection.signature) {
          const reason = sameConversation ? 'Message changed or disappeared' : 'Conversation changed';
          warnings.push(reason + ': ' + String(selection.id));
          skipped.push({id: String(selection.id), reason});
          continue;
        }
        const part = capture(entry.body);
        messages.push({
          id: entry.id, role: entry.role, text: entry.text,
          html: part.html, warnings: part.warnings
        });
      }
      respond({ok:true,data:{
        version:1,title:document.title || 'ChatGPT conversation',
        sourceUrl:location.href, exportedAt:new Date().toISOString(),
        messages, warnings,
        captureSummary:{requested:selected.length,captured:messages.length,missing:skipped.length},
        skipped
      }});
    }
  });
})();
