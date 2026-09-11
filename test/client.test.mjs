import test from 'node:test';
import assert from 'node:assert/strict';
import {DraftStore,switchDraft,finishSend,appendFiles,applyDelta} from '../public/client-state.mjs';
import {renderMarkdown} from '../public/markdown.mjs';
test('drafts survive room switches and reload; damaged storage does not stop startup',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},drafts=new DraftStore(storage);
 drafts.set('b',{text:'Draft B',files:[]});assert.equal(switchDraft(drafts,'a','b',{text:'Draft A',files:[]}).text,'Draft B');assert.equal(new DraftStore(storage).get('a').text,'Draft A');data.set('roundtable-drafts','broken');assert.equal(new DraftStore(storage).size,0);
});
test('an attachment finishing after a room switch stays in its original room',async()=>{
 const drafts=new DraftStore();let selected='a';const original=selected;let finish;const upload=new Promise(resolve=>finish=resolve);const completion=upload.then(files=>appendFiles(drafts,original,files));switchDraft(drafts,'a','b',{text:'Original draft',files:[]});selected='b';drafts.set(selected,{text:'Other draft',files:[]});finish([{id:'file',name:'photo.jpg'}]);await completion;assert.equal(drafts.get('a').files.length,1);assert.equal(drafts.get('b').files.length,0);assert.equal(drafts.get('b').text,'Other draft');
});
test('send completion preserves edited text and newly attached files',()=>{
 const old={name:'old.txt',text:'old'},added={name:'new.txt',text:'new'};assert.deepEqual(finishSend({text:'Still typing',files:[old,added]},{text:'Sent',files:[old]}),{text:'Still typing',files:[added]});assert.equal(finishSend({text:'Sent',files:[]},{text:'Sent',files:[]}).text,'');
});
// This tiny DOM implements only renderer operations, avoiding runtime dependencies.
class Node{constructor(tag,doc,text=''){this.tag=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.dataset={};this.text=text;}append(...nodes){for(const n of nodes)this.children.push(...(n.tag==='#fragment'?n.children:[n]));}prepend(...nodes){this.children.unshift(...nodes);}replaceChildren(...nodes){this.children=[];this.append(...nodes);}setAttribute(k,v){this.attrs[k]=v;if(k==='data-language')this.dataset.language=v;}set textContent(v){this.children=[];this.text=v;}get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tag===tag?[n]:[]),...n.querySelectorAll(tag)]);}querySelector(tag){return this.querySelectorAll(tag)[0];}}
const doc={createElement:tag=>new Node(tag,doc),createTextNode:text=>new Node('#text',doc,text),createDocumentFragment:()=>new Node('#fragment',doc)};
test('real Markdown DOM has no active script, javascript URL or remote image; reference definitions stay hidden',()=>{
 const root=doc.createElement('div');renderMarkdown(root,'<script>alert(1)</script>\n\n[x](javascript:alert%281%29)\n\n![pixel](https://evil.example/pixel)\n\n[ref]: https://example.com\n\n[OK][ref]\n\n```js\nconst safe = true;\n```');for(const tag of ['script','img','iframe'])assert.equal(root.querySelectorAll(tag).length,0);assert.ok(root.querySelectorAll('a').every(n=>!n.attrs.href.startsWith('javascript:')));assert.ok(!root.textContent.includes('[ref]:'));assert.ok(root.querySelector('code').textContent.includes('const safe'));assert.ok(root.querySelector('button'));
});
test('delta touches only its message, ignores background rooms and preserves selected text',()=>{
 const node={contains:()=>true},other={};let writes=0,status='';const state={id:'a',agents:[{id:'codex',name:'Codex'}],messages:[{id:'reply',text:''}]},rendered=new Map([['reply',{text:node}],['other',other]]);const hooks={write:(n,t)=>{assert.equal(n,node);writes++;},status:t=>status=t};const delta={roomId:'a',id:'reply',text:'Hi',activeAgent:'codex'};
 assert.equal(applyDelta({...delta,roomId:'b'},state,rendered,hooks),false);assert.equal(writes,0);applyDelta(delta,state,rendered,hooks);assert.equal(writes,1);assert.equal(state.messages[0].text,'Hi');assert.equal(rendered.get('other'),other);assert.match(status,/Codex/);applyDelta({...delta,text:'More'},state,rendered,{...hooks,selection:{isCollapsed:false,anchorNode:node}});assert.equal(writes,1);assert.equal(rendered.get('reply').deferred,'More');
});
import {avatarMarkup,avatarSVG,avatarShape} from '../public/avatar.mjs';
test('generated avatars are deterministic per agent, differ between agents and load nothing external',()=>{
 const a={id:'codex_a1b2c3',name:'Codex',provider:'codex'},b={id:'claude_9f8e7d',name:'Codex',provider:'codex'};
 assert.deepEqual(avatarMarkup(a),avatarMarkup(a));assert.notDeepEqual(avatarMarkup(a),avatarMarkup(b));
 const serialized=JSON.stringify([avatarMarkup(a),avatarMarkup(b)]);assert.ok(!/"tag":"image"|href|url\(|http/.test(serialized));
 assert.equal(avatarShape(a).initial,'C');assert.equal(avatarShape({id:'x',name:'  élan'}).initial,'É');assert.ok(avatarShape(a).segments>=3&&avatarShape(a).segments<=6);
 const made=[];const stubDoc={createElementNS:(ns,tag)=>{const n={ns,tag,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(c){this.children.push(c);}};made.push(n);return n;},createTextNode:t=>({text:t})};
 const svg=avatarSVG(a,stubDoc);assert.equal(svg.tag,'svg');assert.ok(made.every(n=>n.ns==='http://www.w3.org/2000/svg'));assert.ok(svg.children.some(n=>n.tag==='g'&&n.attrs.class==='ring'));assert.equal(svg.children.at(-1).children[0].text,'C');
});
