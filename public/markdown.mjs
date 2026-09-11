import {marked} from './vendor/marked.mjs';
// Parse Markdown to an allowlisted tree. Model HTML is never assigned to innerHTML.
const node=(tag,children=[],attrs={})=>({tag,children,attrs});
export function safeLink(href){try{const u=new URL(href);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function inline(tokens=[]){return tokens.flatMap(t=>{
 if(t.type==='strong'||t.type==='em'||t.type==='del')return [node(t.type,inline(t.tokens))];
 if(t.type==='codespan')return [node('code',[t.text])];
 if(t.type==='br')return [node('br')];
 if(t.type==='link'){const href=safeLink(t.href);return href?[node('a',inline(t.tokens),{href,target:'_blank',rel:'noopener noreferrer'})]:inline(t.tokens);}
 if(t.type==='image')return [t.text||'[image]'];
 return t.tokens?inline(t.tokens):[t.text||t.raw||''];
 });}
function blocks(tokens=[]){return tokens.flatMap(t=>{
 if(t.type==='space'||t.type==='def')return [];
 if(t.type==='heading')return [node('h'+Math.min(4,t.depth+1),inline(t.tokens))];
 if(t.type==='paragraph')return [node('p',inline(t.tokens))];
 if(t.type==='text')return t.tokens?inline(t.tokens):[t.text];
 if(t.type==='code')return [node('pre',[node('code',[t.text])],{'data-language':(t.lang||'code').split(' ')[0]})];
 if(t.type==='blockquote')return [node('blockquote',blocks(t.tokens))];
 if(t.type==='hr')return [node('hr')];
 if(t.type==='list')return [node(t.ordered?'ol':'ul',t.items.map(i=>node('li',[...(i.task?[i.checked?'[x] ':'[ ] ']:[]),...blocks(i.tokens)])),t.ordered?{start:String(t.start)}:{})];
 if(t.type==='table')return [node('div',[node('table',[node('thead',[node('tr',t.header.map(c=>node('th',inline(c.tokens))))]),node('tbody',t.rows.map(row=>node('tr',row.map(c=>node('td',inline(c.tokens))))))])],{class:'table-scroll'})];
 // HTML, including scripts and event handlers, remains inert visible text.
 return t.text||t.raw?[node('p',[t.text||t.raw])]:[];
 });}
export function markdownTree(text){return blocks(marked.lexer(text,{gfm:true,breaks:false}));}
export function renderMarkdown(container,text,agents=[]){
 const doc=container.ownerDocument;
 function textNode(value){const fragment=doc.createDocumentFragment();for(const part of value.split(/(@[a-zA-Z][a-zA-Z0-9_]*)/g)){const a=agents.find(a=>'@'+a.id===part);if(a){const n=doc.createElement('span');n.className='mention';n.textContent='@'+a.name;n.title=part;fragment.append(n);}else fragment.append(doc.createTextNode(part));}return fragment;}
 function build(x,inCode=false){if(typeof x==='string')return inCode?doc.createTextNode(x):textNode(x);const n=doc.createElement(x.tag);for(const [k,v]of Object.entries(x.attrs))n.setAttribute(k,v);for(const c of x.children)n.append(build(c,inCode||x.tag==='code'));return n;}
 container.replaceChildren(...markdownTree(text).map(x=>build(x)));
 for(const pre of container.querySelectorAll('pre')){const code=pre.querySelector('code'),bar=doc.createElement('div'),label=doc.createElement('span'),copy=doc.createElement('button');bar.className='code-toolbar';label.textContent=pre.dataset.language;copy.type='button';copy.textContent='Copy code';copy.onclick=()=>navigator.clipboard.writeText(code.textContent).then(()=>copy.textContent='Copied').catch(()=>copy.textContent='Select code to copy');bar.append(label,copy);pre.prepend(bar);}
}
