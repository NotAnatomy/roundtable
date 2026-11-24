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
import {avatarMarkup,avatarSVG,avatarShape,blobPath,avatarState,SILHOUETTES} from '../public/avatar.mjs';
test('agent characters are deterministic per agent, differ between agents and reference nothing external',()=>{
 const a={id:'codex_a1b2c3',name:'Codex',provider:'codex'},b={id:'claude_9f8e7d',name:'Codex',provider:'codex'};
 // The gradient id is unique per instance by design, so determinism is compared at a fixed id.
 assert.deepEqual(avatarMarkup(a,'g'),avatarMarkup(a,'g'));assert.notDeepEqual(avatarMarkup(a,'g'),avatarMarkup(b,'g'));
 assert.notEqual(JSON.stringify(avatarMarkup(a)).match(/"id":"(rt-av-\d+)"/)[1],JSON.stringify(avatarMarkup(a)).match(/"id":"(rt-av-\d+)"/)[1]);
 const serialized=JSON.stringify([avatarMarkup(a,'g'),avatarMarkup(b,'g')]);
 assert.ok(!/"tag":"image"|href|http|url\((?!#)/.test(serialized));
 assert.equal(avatarShape(a).colors.from,'#7fd9a6');assert.equal(avatarShape({id:'x'}).colors,avatarShape({id:'x',provider:'nope'}).colors);
 // Every silhouette must close and stay inside the 32px box.
 for(const shape of SILHOUETTES){const d=blobPath(shape);assert.match(d,/^M[\d.]+ [\d.]+C/);assert.ok(d.endsWith('Z'));
  const nums=d.match(/[\d.]+/g).map(Number);assert.ok(Math.min(...nums)>=1&&Math.max(...nums)<=31,shape.name);}
 const made=[];const stubDoc={createElementNS:(ns,tag)=>{const n={ns,tag,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(c){this.children.push(c);}};made.push(n);return n;},createTextNode:t=>({text:t})};
 const svg=avatarSVG(a,stubDoc,'g');assert.equal(svg.tag,'svg');assert.ok(made.every(n=>n.ns==='http://www.w3.org/2000/svg'));
 assert.equal(made.filter(n=>n.tag==='circle'&&n.attrs.class===undefined).length,2);
 assert.equal(svg.children[1].attrs.class,'rt-tilt');assert.equal(svg.children[1].children[0].attrs.class,'rt-body');
});
test('avatar lifecycle state follows the room and the agent, not the other way round',()=>{
 assert.equal(avatarState({}),'idle');
 assert.equal(avatarState({busy:true}),'thinking');
 assert.equal(avatarState({busy:true,active:true}),'working');
 assert.equal(avatarState({busy:true,active:true,status:'streaming'}),'streaming');
 assert.equal(avatarState({status:'complete'}),'done');
 for(const status of ['error','interrupted'])assert.equal(avatarState({status}),'failed');
 assert.equal(avatarState({archived:true,busy:true,active:true}),'sleeping');
 assert.equal(avatarState({enabled:false}),'sleeping');
});

import {score,matchCommands,findRanges} from '../public/palette.mjs';
test('palette ranks a prefix over a word start over a loose subsequence, and keeps ties in listed order',()=>{
 assert.ok(score('new','New room')>score('room','New room'));
 assert.ok(score('room','New room')>score('oom','New room'));
 assert.ok(score('nr','New room')>=0&&score('zz','New room')<0);
 assert.equal(score('','anything'),0);
 const commands=[{title:'Archive this room'},{title:'New room',hint:'Start fresh'},{title:'Reset this conversation'},{title:'Delete this room'}];
 assert.deepEqual(matchCommands('new',commands).map(c=>c.title),['New room']);
 assert.deepEqual(matchCommands('room',commands).map(c=>c.title),['Archive this room','New room','Delete this room']);
 // An empty query keeps the given order so the palette opens on a stable list.
 assert.deepEqual(matchCommands('',commands).map(c=>c.title),commands.map(c=>c.title));
 // A hit in the hint ranks below any hit in a title.
 assert.deepEqual(matchCommands('fresh',commands).map(c=>c.title),['New room']);
 assert.deepEqual(matchCommands('zzz',commands),[]);
});
test('find returns every non-overlapping match, case-insensitively',()=>{
 assert.deepEqual(findRanges('aXa xa AXA','xa'),[[1,3],[4,6],[8,10]]);
 assert.deepEqual(findRanges('aaaa','aa'),[[0,2],[2,4]]);
 assert.deepEqual(findRanges('abc',''),[]);assert.deepEqual(findRanges('',  'a'),[]);assert.deepEqual(findRanges(null,'a'),[]);
});
import {SeenStore,unreadCount,finishedElsewhere} from '../public/client-state.mjs';
test('unread counts ignore the open room, survive reload and never go negative',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},store=new SeenStore(storage);
 store.set('a',3);
 assert.equal(unreadCount({id:'a',count:5},{get:id=>store.get(id),selectedId:'b'}),2);
 assert.equal(unreadCount({id:'a',count:5},{get:id=>store.get(id),selectedId:'a'}),0);
 // A room never opened starts read, so an existing install does not light up every row at once.
 assert.equal(unreadCount({id:'new',count:8},{get:id=>store.get(id),selectedId:'b'}),0);
 // A reset room holds fewer messages than were seen; that is zero unread, not a negative badge.
 assert.equal(unreadCount({id:'a',count:0},{get:id=>store.get(id),selectedId:'b'}),0);
 assert.equal(new SeenStore(storage).get('a'),3);
 data.set('roundtable-seen','broken');assert.equal(new SeenStore(storage).size,0);
});
test('only background rooms that just stopped replying are announced',()=>{
 const before=[{id:'a',busy:true},{id:'b',busy:true},{id:'c',busy:false},{id:'d',busy:true}];
 const after=[{id:'a',busy:false},{id:'b',busy:true},{id:'c',busy:false},{id:'d',busy:false}];
 assert.deepEqual(finishedElsewhere(before,after,'d').map(r=>r.id),['a']);
 assert.deepEqual(finishedElsewhere([],after,'x'),[]);
 assert.deepEqual(finishedElsewhere(before,[{id:'e',busy:false}],'x'),[]);
});
