const TICK=String.fromCharCode(96);
function children(el) {return Array.from(el.childNodes).map(render).join('');}
function render(node) {
  if(node.nodeType===3) return node.textContent.replace(/[ \t\r\n]+/g,' ');
  if(node.nodeType!==1) return '';
  const tag=node.localName;
  if(/^h[1-6]$/.test(tag))return '\n'+'#'.repeat(Number(tag[1]))+' '+children(node).trim()+'\n\n';
  if(tag==='br')return '\n';
  if(tag==='hr')return '\n---\n\n';
  if(tag==='pre')return '\n'+TICK.repeat(3)+'\n'+node.textContent.trimEnd()+'\n'+TICK.repeat(3)+'\n\n';
  if(tag==='code')return TICK+children(node)+TICK;
  if(tag==='strong'||tag==='b')return '**'+children(node)+'**';
  if(tag==='em'||tag==='i')return '*'+children(node)+'*';
  if(tag==='s'||tag==='del')return '~~'+children(node)+'~~';
  if(tag==='p')return children(node).trim()+'\n\n';
  if(tag==='blockquote')return '\n'+children(node).trim().split('\n').map(t=>'> '+t).join('\n')+'\n\n';
  if(tag==='a'){
    const link=node.getAttribute('href')||'';
    return /^https?:\/\//i.test(link)?'['+children(node)+']('+link+')':children(node);
  }
  if(tag==='img'){
    const src=node.getAttribute('src')||'';
    const alt=(node.getAttribute('alt')||'image').replace(/[\[\]]/g,'');
    return /^https?:\/\//i.test(src)?'!['+alt+']('+src+')':'[Visual: '+alt+' — see HTML]';
  }
  if(tag==='ul'||tag==='ol'){
    const start=Number(node.getAttribute('start'))||1;
    return '\n'+Array.from(node.children).filter(el=>el.localName==='li').map((li,i)=>
      (tag==='ol'?(start+i)+'. ':'- ')+children(li).trim()).join('\n')+'\n\n';
  }
  if(tag==='table'){
    const rows=Array.from(node.querySelectorAll('tr')).map(tr=>Array.from(tr.children).map(c=>
      c.textContent.trim().replace(/\|/g,'\\|').replace(/\s+/g,' ')));
    if(!rows.length)return '';
    const row=a=>'| '+a.join(' | ')+' |';
    return '\n'+row(rows[0])+'\n'+row(rows[0].map(()=>'---'))+'\n'+rows.slice(1).map(row).join('\n')+'\n\n';
  }
  return children(node);
}
export function buildMarkdown(doc) {
  return '# '+String(doc.title||'ChatGPT export')+'\n\nSource: '+String(doc.sourceUrl||'')+'\n\n'+
    (doc.messages||[]).map((m,i)=>{
      const parsed=new DOMParser().parseFromString(m.html||'', 'text/html');
      const part=render(parsed.body).replace(/\n{3,}/g,'\n\n').trim();
      return '## '+(i+1)+'. '+(m.role==='assistant'?'ChatGPT':'You')+'\n\n'+part;
    }).join('\n\n---\n\n')+'\n';
}
