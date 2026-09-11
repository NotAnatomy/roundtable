import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture=`#!/usr/bin/env node
const fs=require('fs');
if(process.argv.includes('--version')){console.log('test fixture');process.exit(0);}
if(process.argv.includes('app-server')){
 require('readline').createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);const out=x=>console.log(JSON.stringify(x));
 if(m.method==='initialize')out({id:m.id,result:{}});
 if(m.method==='thread/start'||m.method==='thread/resume'){if(!['read-only','workspace-write'].includes(m.params.sandbox)){out({id:m.id,error:{code:-32600,message:'Invalid sandbox enum'}});return;}out({id:m.id,result:{thread:{id:'test-thread'}}});}
 if(m.method==='turn/start'){if(!['readOnly','workspaceWrite'].includes(m.params.sandboxPolicy?.type)||m.params.sandboxPolicy.networkAccess!==false){out({id:m.id,error:{code:-32600,message:'Invalid turn policy'}});return;}fs.appendFileSync(process.env.PROMPT_LOG,JSON.stringify({provider:'codex',prompt:m.params.input[0].text})+'\\n');out({id:m.id,result:{turn:{id:'turn'}}});out({method:'item/agentMessage/delta',params:{itemId:'a',delta:'Codex suggests'}});out({method:'thread/tokenUsage/updated',params:{tokenUsage:{last:{inputTokens:30,outputTokens:7}}}});out({method:'turn/completed',params:{turn:{status:'completed'}}});out({method:'item/completed',params:{item:{type:'agentMessage',id:'a',text:'Codex suggests a shared notebook.'}}});}
 });
}else{let prompt='';process.stdin.on('data',b=>prompt+=b);process.stdin.on('end',()=>{fs.appendFileSync(process.env.PROMPT_LOG,JSON.stringify({provider:'claude',prompt})+'\\n');const reply={type:'result',usage:{input_tokens:20,output_tokens:6},total_cost_usd:0.001,result:'Claude builds on the shared notebook.',session_id:'claude-test'};if(prompt.includes('FAIL_ONCE')&&!fs.existsSync(process.env.PROMPT_LOG+'.failed')){fs.writeFileSync(process.env.PROMPT_LOG+'.failed','1');reply.is_error=true;reply.result='Fixture failure';}const history=prompt.split('\\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).findLast(Array.isArray)||[];if(history.findLast(m=>!m.agentId)?.text.includes('WAIT_FOR_STOP'))setTimeout(()=>console.log(JSON.stringify(reply)),30000);else console.log(JSON.stringify(reply));});}
`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('real server with protocol fixtures: handoffs, one reply per user message, persistence, pause, CSRF',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roundtable-test-'));const bin=path.join(dir,'bin');await fs.mkdir(bin);
 for(const name of ['codex','claude']){await fs.writeFile(path.join(bin,name),fixture,{mode:0o755});}
 const port=4320+Math.floor(Math.random()*500),base=`http://127.0.0.1:${port}`,data=path.join(dir,'data');
 const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ROUNDTABLE_DATA_DIR:data,PROMPT_LOG:path.join(dir,'prompts'),PATH:bin+path.delimiter+process.env.PATH},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(server.stdout,'data'),wait(5000).then(()=>{throw new Error('server timeout');})]);
  assert.equal((await fetch(base+'/api/bootstrap')).status,403);assert.equal((await fetch(base+'/api/events')).status,403);const launch=new URL((await fs.readFile(path.join(data,'launch-url.txt'),'utf8')).trim());const initial=await fetch(base+'/api/bootstrap?k='+launch.searchParams.get('k')).then(r=>r.json());const headers={'Content-Type':'application/json','X-Roundtable-Token':initial.token};
  const post=(route,obj)=>fetch(base+'/api/'+route,{method:'POST',headers,body:JSON.stringify(obj)});
  assert.equal((await fetch(base+'/api/message',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/message',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
  const settings={...initial.state,rounds:2};assert.equal((await post('settings',settings)).status,200);
  assert.equal((await post('skills/save',{name:'Test skill',description:'For tests',instructions:'Include the exact phrase REVIEW_TARGET in your approach.'})).status,200);
  const before=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;
  const skill=before.skills.find(x=>x.name==='Test skill');settings.agents[0].skillIds=[skill.id];assert.equal((await post('settings',settings)).status,200);
  assert.equal((await post('message',{text:'Plan our room',target:'all',attachments:[{name:'example.lsl',text:'default { state_entry() {} }'}]})).status,200);
  let s;for(let i=0;i<100;i++){await wait(50);s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;if(!s.busy)break;}
  assert.equal(s.busy,false);assert.equal(s.messages.length,3);assert.equal(s.messages[2].status,'complete');assert.equal(s.messages[2].usage.inputTokens,20);assert.equal(s.messages[1].usage.inputTokens,30);assert.equal(s.messages[1].text,'Codex suggests a shared notebook.');assert.equal((await post('retry',{id:s.messages[2].id})).status,400);
  const logs=(await fs.readFile(path.join(dir,'prompts'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(logs.length,2);assert.match(logs[1].prompt,/Codex suggests a shared notebook/);assert.match(logs[0].prompt,/REVIEW_TARGET/);assert.match(logs[1].prompt,/example.lsl/);
  assert.equal((await post('pins',{id:s.messages[1].id})).status,200);
  assert.equal((await post('skills/delete',{id:skill.id})).status,200);
  const after=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;assert.deepEqual(after.agents[0].skillIds,[]);assert.ok(after.pinnedMessageIds.includes(s.messages[1].id));settings.agents[0].skillIds=[];
  assert.equal(JSON.parse(await fs.readFile(path.join(data,'rooms.json'),'utf8')).rooms[0].messages.length,3);
  await post('message',{text:'@claude WAIT_FOR_STOP',target:'all'});await wait(100);assert.equal((await post('new',{})).status,409);const original=initial.state.id;assert.equal((await post('rooms/create',{...settings,title:'During generation'})).status,200);let other=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;assert.equal(other.busy,false);assert.equal(other.messages.length,0);assert.equal(other.rooms.find(r=>r.id===original).busy,true);assert.equal((await post('notes',{notes:'Editable during generation'})).status,200);await post('stop',{roomId:original});await post('rooms/select',{id:original});
  for(let i=0;i<60;i++){await wait(50);s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;if(!s.busy)break;}
  assert.equal(s.busy,false);assert.equal(s.messages.at(-1).status,'interrupted');const interrupted=s.messages.at(-1).id;
  assert.equal((await post('continue',{})).status,409);
  const previous=s.id,previousCount=s.messages.length;
  assert.equal((await post('connections',{provider:'google',key:'secret-fixture-key'})).status,200);
  const exposed=await fetch(base+'/api/bootstrap',{headers}).then(r=>r.text());assert.ok(!exposed.includes('secret-fixture-key'));
  assert.equal((await post('rooms/create',{...settings,title:'Second room',agents:[settings.agents[0]]})).status,200);
  s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;assert.equal(s.messages.length,0);assert.equal(s.agents.length,1);assert.equal(s.rooms.length,3);
  assert.equal((await post('rooms/select',{id:previous})).status,200);
  s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;assert.equal(s.messages.length,previousCount);
  assert.equal((await post('message',{text:'Continue with my next request',target:'codex'})).status,200);
  for(let i=0;i<100;i++){await wait(50);s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;if(!s.busy)break;}
  assert.equal(s.messages.length,previousCount+2);
  const originalText=s.messages[0].text;
  await post('message',{text:'Fresh follow-up without rereading',target:'codex'});
  for(let i=0;i<100;i++){await wait(50);s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;if(!s.busy)break;}
  const incremental=(await fs.readFile(path.join(dir,'prompts'),'utf8')).trim().split('\n').map(JSON.parse).at(-1).prompt;assert.match(incremental,/Only new shared messages/);assert.ok(!incremental.includes(originalText));
  assert.equal((await post('notes',{notes:'Edited between turns'})).status,200);await post('message',{text:'After a notes edit',target:'codex'});
  for(let i=0;i<100;i++){await wait(50);s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;if(!s.busy)break;}
  const afterNotes=(await fs.readFile(path.join(dir,'prompts'),'utf8')).trim().split('\n').map(JSON.parse).at(-1).prompt;assert.match(afterNotes,/Only new shared messages/);assert.match(afterNotes,/Edited between turns/);assert.ok(!afterNotes.includes(originalText));
  assert.deepEqual(await fs.readdir(path.join(data,'requests')),[interrupted+'.json']);
  await post('message',{text:'@claude FAIL_ONCE',target:'claude'});
  for(let i=0;i<100;i++){await wait(50);s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;if(!s.busy)break;}
  const failed=s.messages.at(-1);assert.equal(failed.status,'error');const count=s.messages.length;
  assert.deepEqual((await fs.readdir(path.join(data,'requests'))).sort(),[failed.id+'.json',interrupted+'.json'].sort());
  assert.equal((await post('retry',{id:failed.id})).status,200);
  for(let i=0;i<100;i++){await wait(50);s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;if(!s.busy)break;}
  assert.equal(s.messages.length,count);assert.equal(s.messages.at(-1).id,failed.id);assert.equal(s.messages.at(-1).status,'complete');assert.equal(s.messages.at(-1).attempts.length,1);
  assert.deepEqual(await fs.readdir(path.join(data,'requests')),[interrupted+'.json']);
  const finalLogs=(await fs.readFile(path.join(dir,'prompts'),'utf8')).trim().split('\n').map(JSON.parse);assert.match(finalLogs.at(-1).prompt,/Claude builds on the shared notebook/);
  // Archive and delete. The selected room here is the original room, which still holds the interrupted reply's retry file.
  const settle=async()=>{for(let i=0;i<100;i++){await wait(50);s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;if(!s.busy)break;}return s;};
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=',jpg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1]).toString('base64');
  const shared=await post('uploads',{name:'pixel.png',mime:'image/png',data:png}).then(r=>r.json()),unique=await post('uploads',{name:'photo.jpg',mime:'image/jpeg',data:jpg}).then(r=>r.json());
  const original2=s.id,second=s.rooms.find(r=>r.title==='Second room').id,third=s.rooms.find(r=>r.title==='During generation').id;
  assert.equal((await post('message',{text:'Two files',target:'codex',attachments:[{id:shared.id,name:'pixel.png'},{id:unique.id,name:'photo.jpg'}]})).status,200);await settle();
  assert.equal((await post('message',{roomId:second,text:'Shared file',target:'codex',attachments:[{id:shared.id,name:'pixel.png'}]})).status,200);await settle();
  const disk=async()=>JSON.parse(await fs.readFile(path.join(data,'rooms.json'),'utf8'));
  let saved=(await disk()).rooms.find(r=>r.id===original2);assert.ok(Object.keys(saved.sessions).length>0);const kept=saved.messages.length;
  assert.equal((await post('rooms/archive',{id:original2})).status,200);
  saved=(await disk()).rooms.find(r=>r.id===original2);assert.equal(saved.archived,true);assert.deepEqual(saved.sessions,{});assert.equal(saved.messages.length,kept);
  s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;assert.notEqual(s.id,original2);assert.equal(s.rooms.find(r=>r.id===original2).archived,true);
  assert.equal((await post('message',{roomId:original2,text:'Still here?',target:'codex'})).status,409);
  await post('rooms/select',{id:third});await post('message',{text:'@claude WAIT_FOR_STOP',target:'all'});await wait(100);
  assert.equal((await post('rooms/delete',{id:third,title:'During generation'})).status,409);assert.equal((await post('rooms/archive',{id:third})).status,409);
  await post('stop',{roomId:third});await settle();
  assert.equal((await post('rooms/delete',{id:original2,title:'Wrong name'})).status,400);
  assert.equal((await post('rooms/delete',{id:original2,title:saved.title})).status,200);
  s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;assert.ok(!s.rooms.some(r=>r.id===original2));
  const uploads=await fs.readdir(path.join(data,'uploads'));assert.ok(uploads.includes(shared.id+'.json'));assert.ok(!uploads.includes(unique.id+'.json'));
  assert.deepEqual((await fs.readdir(path.join(data,'requests'))).filter(n=>n===interrupted+'.json'),[]);
  for(const r of s.rooms)assert.equal((await post('rooms/delete',{id:r.id,title:r.title})).status,200);
  s=(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;assert.equal(s.rooms.length,1);assert.equal(s.messages.length,0);assert.equal(s.archived,false);
  assert.deepEqual(await fs.readdir(path.join(data,'uploads')),[]);
  assert.equal((await post('message',{text:'Fresh start',target:'all'})).status,200);await settle();assert.equal(s.messages.length,3);
 }finally{server.kill('SIGTERM');await once(server,'exit');await fs.rm(dir,{recursive:true,force:true});}
});
