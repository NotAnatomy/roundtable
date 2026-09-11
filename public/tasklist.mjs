// A plan an agent works through. Ported from a React/framer-motion reference to plain DOM so it runs without a build step.
// Rows are diffed by id so a status change animates in place instead of re-mounting; header counts are derived from the rows.
const SVG='http://www.w3.org/2000/svg',CHECK='M 3.5 7.5 L 6 10 L 10.5 4.5',CROSS='M 5 5 L 9 9 M 9 5 L 5 9';
export const flatten=tasks=>tasks.flatMap(t=>[t,...(t.children||[])]);
export const countDone=tasks=>{const all=flatten(tasks);return {done:all.filter(t=>t.status==='done').length,total:all.length};};
function box(doc){const svg=doc.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 14 14');svg.setAttribute('aria-hidden','true');const rect=doc.createElementNS(SVG,'rect');for(const [k,v]of Object.entries({x:1,y:1,width:12,height:12,rx:3.5}))rect.setAttribute(k,String(v));svg.append(rect);return svg;}
function mark(doc,svg,d){for(const old of svg.querySelectorAll('path'))old.remove();if(!d)return;const path=doc.createElementNS(SVG,'path');path.setAttribute('d',d);path.setAttribute('pathLength','1');path.setAttribute('class','task-draw');svg.append(path);}
function row(doc,task,depth){
 const li=doc.createElement('li');li.className='task-row enter';li.dataset.depth=String(depth);const line=doc.createElement('span');line.className='task-line';
 const check=doc.createElement('span');check.className='task-box';check.append(box(doc));const label=doc.createElement('span');label.className='task-label';const note=doc.createElement('span');note.className='task-note';const glow=doc.createElement('span');glow.className='task-underline';
 line.append(check,label,note,glow);li.append(line);return {li,label,note,svg:check.firstChild};
}
export function renderTaskList(host,{tasks=[],hidden=0,label='Plan',doc=host.ownerDocument}={}){
 let ui=host.__tasks;if(!ui){host.replaceChildren();const head=doc.createElement('div');head.className='task-head';const title=doc.createElement('span');title.className='task-title';const count=doc.createElement('span');count.className='task-count';head.append(title,count);const list=doc.createElement('ul');list.className='task-rows';const more=doc.createElement('li');more.className='task-more';host.append(head,list);ui=host.__tasks={title,count,list,more,rows:new Map()};}
 ui.title.textContent=label;const {done,total}=countDone(tasks);ui.count.textContent=`${done}/${total}`;
 const seen=new Set(),order=[];
 for(const t of tasks){order.push([t,0]);for(const c of t.children||[])order.push([c,1]);}
 for(const [key,r]of ui.rows)if(!order.some(([t,d])=>d+':'+t.id===key)){r.li.remove();ui.rows.delete(key);}
 const offset=ui.more.parentNode===ui.list?1:0;
 for(const [index,[task,depth]]of order.entries()){
  const key=depth+':'+task.id;seen.add(key);let r=ui.rows.get(key);
  if(!r){r=row(doc,task,depth);ui.rows.set(key,r);r.status=null;}
  // Only move a row that is out of place: re-inserting a connected node restarts its CSS animations.
  const expected=ui.list.children[index+offset]||null;if(r.li!==expected)ui.list.insertBefore(r.li,expected);
  r.label.textContent=task.label;r.note.textContent=task.note||'';r.note.hidden=!task.note;
  if(r.status!==task.status){r.li.classList.remove('is-pending','is-running','is-done','is-failed');r.li.classList.add('is-'+task.status);mark(doc,r.svg,task.status==='done'?CHECK:task.status==='failed'?CROSS:null);r.status=task.status;}
 }
 if(hidden){ui.more.textContent=`${hidden} earlier step${hidden>1?'s':''}`;if(ui.more.parentNode!==ui.list)ui.list.prepend(ui.more);}else ui.more.remove();
 return {done,total};
}
