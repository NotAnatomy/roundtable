import fs from 'node:fs/promises';
import path from 'node:path';
// Retry context is only readable for failed, interrupted or in-flight replies; uploads may sit in a browser draft, so they get a grace period.
export const UPLOAD_GRACE=7*24*60*60*1000;
export function referencedIds(rooms){
 const retryIds=new Set(),uploadIds=new Set();
 for(const r of rooms)for(const m of r.messages){if(m.agentId&&m.agentId!=='system'&&['error','interrupted','streaming'].includes(m.status))retryIds.add(m.id);for(const f of m.attachments||[])if(f.id)uploadIds.add(f.id);}
 return {retryIds,uploadIds};
}
async function sweep(directory,keep,shouldRemove){
 let removed=0,names=[];try{names=await fs.readdir(directory);}catch(e){if(e.code==='ENOENT')return 0;throw e;}
 for(const name of names){if(!name.endsWith('.json'))continue;const id=name.slice(0,-5);if(keep.has(id))continue;const file=path.join(directory,name);if(!(await shouldRemove(file)))continue;await fs.rm(file,{force:true});removed++;}
 return removed;
}
export async function collectGarbage({rooms,requestDir,uploadDir,now=Date.now(),grace=UPLOAD_GRACE}){
 const {retryIds,uploadIds}=referencedIds(rooms);
 const requests=await sweep(requestDir,retryIds,async()=>true);
 const uploads=await sweep(uploadDir,uploadIds,async file=>now-(await fs.stat(file)).mtimeMs>=grace);
 return {requests,uploads};
}
// Deleting a room removes its retry files and any upload that no remaining room references, immediately and regardless of age.
export async function removeRoomFiles({room,rooms,requestDir,uploadDir}){
 const kept=referencedIds(rooms.filter(r=>r.id!==room.id)).uploadIds;const removed={requests:0,uploads:0};
 for(const m of room.messages){
  if(m.agentId){try{await fs.rm(path.join(requestDir,m.id+'.json'));removed.requests++;}catch(e){if(e.code!=='ENOENT')throw e;}}
  for(const f of m.attachments||[]){if(!f.id||kept.has(f.id)||!/^[a-f0-9]{64}$/.test(f.id))continue;kept.add(f.id);try{await fs.rm(path.join(uploadDir,f.id+'.json'));removed.uploads++;}catch(e){if(e.code!=='ENOENT')throw e;}}
 }
 return removed;
}
