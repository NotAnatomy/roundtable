import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskTracker,describeTool,describeCodexItem,TASK_LIMITS} from '../tasks.mjs';
import {claudePlan,codexPlan} from '../providers.mjs';
import {renderTaskList,countDone} from '../public/tasklist.mjs';
test('tool calls become steps, a published plan becomes the top level and later calls nest under the step in progress',()=>{
 const t=createTaskTracker();
 t.apply({type:'start',id:'a',...describeTool('Read',{file_path:'/p/src/server.mjs'})});t.apply({type:'end',id:'a',ok:true});
 assert.deepEqual(t.snapshot(),{tasks:[{id:'a',label:'Read src/server.mjs',status:'done'}]});
 t.apply(claudePlan([{content:'Read the schema',status:'completed'},{content:'Write migration',activeForm:'Writing the migration',status:'in_progress'},{content:'Run tests',status:'pending'}]));
 t.apply({type:'start',id:'b',...describeTool('Edit',{file_path:'/p/db/schema.sql'})});t.apply({type:'end',id:'b',ok:false});
 const snap=t.snapshot();assert.equal(snap.tasks.length,3);assert.equal(snap.tasks[1].label,'Writing the migration');assert.equal(snap.tasks[1].status,'running');assert.deepEqual(snap.tasks[1].children,[{id:'b',label:'Edit db/schema.sql',status:'failed'}]);assert.equal(snap.tasks[0].status,'done');assert.equal(snap.tasks[2].status,'pending');
 // A plan update keeps children on steps whose label is unchanged.
 t.apply(claudePlan([{content:'Read the schema',status:'completed'},{content:'Write migration',status:'completed'},{content:'Run tests',status:'in_progress'}]));
 assert.equal(t.snapshot().tasks[1].children.length,1);assert.equal(t.snapshot().tasks[2].status,'running');
 t.apply({type:'start',id:'c',label:'Run npm test'});t.apply({type:'finish',ok:false});assert.equal(t.snapshot().tasks[2].children[0].status,'failed');assert.equal(t.snapshot().tasks[2].status,'running');
 assert.equal(countDone(t.snapshot().tasks).done,2);
});
test('step lists stay bounded and unknown or silent items are handled',()=>{
 const t=createTaskTracker();for(let i=0;i<TASK_LIMITS.steps+5;i++)t.apply({type:'start',id:'s'+i,label:'Step '+i});
 const snap=t.snapshot();assert.equal(snap.tasks.length,TASK_LIMITS.steps);assert.equal(snap.hidden,5);assert.equal(snap.tasks[0].id,'s5');
 t.apply({type:'end',id:'missing'});t.apply(null);assert.equal(createTaskTracker().snapshot(),null);
 assert.deepEqual(describeCodexItem({type:'commandExecution',command:['git','status']}),{label:'Run git status',note:''});
 assert.deepEqual(describeCodexItem({type:'fileChange',changes:[{path:'/a/b.js'},{path:'/a/c.js'},{path:'/a/d.js'}]}),{label:'Edit a/b.js, a/c.js +1',note:'3 files'});
 assert.equal(describeCodexItem({type:'reasoning'}),null);assert.equal(describeTool('Bash',{command:'x'.repeat(200)}).label.length<=65,true);
 assert.deepEqual(codexPlan([{step:'Inspect',status:'completed'},{step:'Fix',status:'inProgress'}]).items,[{label:'Inspect',status:'done'},{label:'Fix',status:'running'}]);
 assert.deepEqual(codexPlan([{text:'Todo',completed:true}]).items,[{label:'Todo',status:'done'}]);
});
// A small DOM implementing only what the renderer touches, so the diffing logic runs without a browser.
class N{constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.attrs={};this.dataset={};this.textContent='';this.hidden=false;this.parentNode=null;this.className='';this.classList={add:(...c)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...c])].join(' ');},remove:(...c)=>{this.className=this.className.split(' ').filter(x=>x&&!c.includes(x)).join(' ');},toggle:(c,on)=>on?this.classList.add(c):this.classList.remove(c),contains:c=>this.className.split(' ').includes(c)};}
 get firstChild(){return this.children[0]||null;}setAttribute(k,v){this.attrs[k]=v;}append(...n){for(const x of n){x.remove();x.parentNode=this;this.children.push(x);}}insertBefore(n,ref){n.remove();n.parentNode=this;const i=ref?this.children.indexOf(ref):this.children.length;this.children.splice(i<0?this.children.length:i,0,n);}prepend(n){n.remove();n.parentNode=this;this.children.unshift(n);}remove(){if(this.parentNode){const i=this.parentNode.children.indexOf(this);if(i>=0)this.parentNode.children.splice(i,1);this.parentNode=null;}}replaceChildren(){for(const c of [...this.children])c.remove();}querySelectorAll(sel){return this.children.flatMap(c=>[...(c.tag===sel?[c]:[]),...c.querySelectorAll(sel)]);}}
const doc={createElement:t=>new N(t,doc),createElementNS:(ns,t)=>new N(t,doc)};
test('the task list renderer diffs rows in place, draws marks on status change and derives counts',()=>{
 const host=new N('div',doc);const tasks=[{id:'a',label:'Read',status:'done'},{id:'b',label:'Write',status:'running',children:[{id:'c',label:'Edit x',status:'running'}]},{id:'d',label:'Test',status:'pending'}];
 assert.deepEqual(renderTaskList(host,{tasks,label:'Plan',doc}),{done:1,total:4});
 const list=host.children[1],rows=list.children;assert.equal(rows.length,4);assert.equal(rows[2].dataset.depth,'1');assert.ok(rows[0].classList.contains('is-done'));assert.equal(rows[0].querySelectorAll('path').length,1);assert.equal(rows[1].querySelectorAll('path').length,0);
 const first=rows[0];tasks[1].children[0].status='done';tasks[2].status='failed';
 renderTaskList(host,{tasks,doc,hidden:3});assert.equal(list.children[0].className,'task-more');assert.equal(list.children[1],first);assert.ok(list.children[3].classList.contains('is-done'));assert.equal(list.children[4].querySelectorAll('path')[0].attrs.d.startsWith('M 5 5'),true);
 renderTaskList(host,{tasks:[tasks[1]],doc});assert.equal(list.children.length,2);assert.equal(host.children[0].children[1].textContent,'1/2');
});
