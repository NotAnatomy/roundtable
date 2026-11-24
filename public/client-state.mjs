export class DraftStore extends Map {
 constructor(storage){super();this.storage=storage;try{const values=JSON.parse(storage?.getItem('roundtable-drafts')||'[]');if(Array.isArray(values))for(const [id,d]of values)if(typeof id==='string'&&typeof d?.text==='string'&&Array.isArray(d.files))super.set(id,d);}catch{}}
 set(id,draft){super.set(id,draft);try{this.storage?.setItem('roundtable-drafts',JSON.stringify([...this]));}catch{}return this;}
}
export function switchDraft(drafts,from,to,current){if(from)drafts.set(from,current);return drafts.get(to)||{text:'',files:[]};}
export function finishSend(current,sent){const key=f=>f.id||f.name+'\0'+f.text;const files=new Set(sent.files.map(key));return {text:current.text===sent.text?'':current.text,files:current.files.filter(f=>!files.has(key(f)))};}
export function appendFiles(drafts,roomId,files,current){const draft=current||drafts.get(roomId)||{text:'',files:[]};const next={...draft,files:[...draft.files,...files]};if(next.files.length>3)throw new Error('Attach up to three files.');if(next.files.reduce((n,f)=>n+(f.text?.length||0),0)>40000)throw new Error('Attachments must total under 40,000 text characters.');drafts.set(roomId,next);return next;}
export function applyDelta(d,state,rendered,{write,status,selection,tasks}){
 if(d.roomId!==state.id)return false;const v=rendered.get(d.id);if(!v)return false;const m=state.messages.find(m=>m.id===d.id);if(m){m.text=d.text;if(d.tasks!==undefined&&d.tasks!==null)m.tasks=d.tasks;}v.last=d.text;if(d.tasks&&tasks)tasks(v,m,d.tasks);
 if(selection&&!selection.isCollapsed&&v.text.contains(selection.anchorNode))v.deferred=d.text;else{write(v.text,d.text);delete v.deferred;}
 status((state.agents.find(a=>a.id===d.activeAgent)?.name||'Room')+' · '+(d.activity||'Replying'));return true;
}
// Per-room read markers, kept in this browser. A room is unread when it holds
// more messages than were on screen the last time it was the open room.
export class SeenStore extends Map {
 constructor(storage,key='roundtable-seen'){super();this.storage=storage;this.key=key;
  try{const values=JSON.parse(storage?.getItem(key)||'[]');if(Array.isArray(values))for(const [id,n]of values)if(typeof id==='string'&&Number.isInteger(n)&&n>=0)super.set(id,n);}catch{}}
 set(id,count){super.set(id,count);try{this.storage?.setItem(this.key,JSON.stringify([...this]));}catch{}return this;}
}
export function unreadCount(room,seen){
 if(!room||room.id===seen?.selectedId)return 0;
 return Math.max(0,(room.count||0)-(seen?.get(room.id)??room.count??0));
}
// Rooms that just stopped replying while the user was looking at a different room.
export function finishedElsewhere(before=[],after=[],selectedId){
 const was=new Map(before.map(r=>[r.id,r.busy]));
 return after.filter(r=>r.id!==selectedId&&was.get(r.id)===true&&r.busy===false);
}
