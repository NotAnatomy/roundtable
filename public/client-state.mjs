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
