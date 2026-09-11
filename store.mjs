import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {starterSkills} from './skill-library.mjs';
import {defaultAgents} from './room.mjs';
export function newRoom(input={}){return {id:randomUUID(),title:input.title||'New room',mode:input.mode||'lounge',notes:input.notes||'',workspace:input.workspace||'',allowEdits:!!input.allowEdits,agents:input.agents||structuredClone(defaultAgents),messages:[],pinnedMessageIds:[],sessions:{},archived:false,createdAt:new Date().toISOString()};}
export async function openStore(directory){
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const file=path.join(directory,'rooms.json');let state;
 try{state=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!state){let old;try{old=JSON.parse(await fs.readFile(path.join(directory,'room.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const room=old?{...old,id:old.id||randomUUID()}:newRoom({title:'The common room'});state={version:2,selectedId:room.id,rooms:[room]};}
 state.skills||=structuredClone(starterSkills);state.version=3;
 for(const r of state.rooms){r.title||="The common room";r.sessions||={};r.pinnedMessageIds||=[];r.archived=!!r.archived;delete r.rounds;for(const a of r.agents){a.skillIds||=[];a.model||='';a.effort||='auto';}for(const m of r.messages)if(m.status==='streaming')m.status='interrupted';}
 if(!state.rooms.some(r=>!r.archived)){state.rooms.push(newRoom());state.selectedId=state.rooms.at(-1).id;}
 if(!state.rooms.some(r=>r.id===state.selectedId))state.selectedId=state.rooms.findLast(r=>!r.archived).id;
 let queue=Promise.resolve();
 const save=()=>{const payload=JSON.stringify(state,null,2);queue=queue.catch(()=>{}).then(async()=>{await fs.writeFile(file+'.tmp',payload,{mode:0o600});await fs.rename(file+'.tmp',file);});return queue;};
 await save();return {state,save};
}
