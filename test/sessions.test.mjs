// A stored native conversation can stop being usable between one turn and the next: the CLI deleted
// it, or the user pointed that CLI at a different provider. The turn should recover instead of
// handing the user an error only a Retry would fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// Refuses any resume, the way a CLI whose conversation is gone does, and records each attempt.
const fixture=`#!/usr/bin/env node
const fs=require('fs');
if(process.argv.includes('--version')){console.log('test fixture');process.exit(0);}
const resumed=process.argv.includes('--resume');
let prompt='';process.stdin.on('data',b=>prompt+=b);process.stdin.on('end',()=>{
 fs.appendFileSync(process.env.PROMPT_LOG,JSON.stringify({resumed,whole:prompt.includes('First question')})+'\\n');
 if(resumed){console.log(JSON.stringify({type:'result',is_error:true,result:'No conversation found with session ID: ffb70e01-0887-4cd9-8d2c-77584c5d6c07'}));return;}
 console.log(JSON.stringify({type:'result',usage:{input_tokens:4,output_tokens:4},result:'Answered in a fresh conversation.',session_id:'claude-new'}));
});
`;

test('a refused native session is replaced and the turn still answers',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roundtable-session-'));
 const bin=path.join(dir,'bin');await fs.mkdir(bin);
 await fs.writeFile(path.join(bin,'claude'),fixture,{mode:0o755});
 const port=5700+Math.floor(Math.random()*400),base=`http://127.0.0.1:${port}`,data=path.join(dir,'data');
 const promptLog=path.join(dir,'prompts');
 const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),ROUNDTABLE_DATA_DIR:data,PROMPT_LOG:promptLog,PATH:bin+path.delimiter+process.env.PATH},stdio:['ignore','pipe','pipe']});
 let stderr='';server.stderr.on('data',b=>{stderr+=b;});
 try{
  await Promise.race([once(server.stdout,'data'),wait(6000).then(()=>{throw new Error('server did not start. '+stderr);})]);
  const launch=new URL((await fs.readFile(path.join(data,'launch-url.txt'),'utf8')).trim());
  const initial=await fetch(base+'/api/bootstrap?k='+launch.searchParams.get('k')).then(r=>r.json());
  const headers={'Content-Type':'application/json','X-Roundtable-Token':initial.token};
  const post=(route,obj)=>fetch(base+'/api/'+route,{method:'POST',headers,body:JSON.stringify(obj)});
  const read=async()=>(await fetch(base+'/api/bootstrap',{headers}).then(r=>r.json())).state;
  const settle=async()=>{let s;for(let i=0;i<200;i++){await wait(50);s=await read();if(!s.busy)break;}return s;};

  let state=await read();
  assert.equal((await post('settings',{...state,agents:[{...state.agents.find(a=>a.provider==='claude'),enabled:true}]})).status,200);

  // First turn: no stored session, so nothing to refuse.
  assert.equal((await post('message',{text:'First question',target:'all'})).status,200);
  state=await settle();
  assert.equal(state.messages.at(-1).status,'complete');
  const stored=JSON.parse(await fs.readFile(path.join(data,'rooms.json'),'utf8')).rooms[0].sessions;
  assert.equal(Object.values(stored)[0].id,'claude-new');

  // Second turn: the stored session is refused, and the turn answers anyway.
  assert.equal((await post('message',{text:'Second question',target:'all'})).status,200);
  state=await settle();
  const reply=state.messages.at(-1);
  assert.equal(reply.status,'complete');
  assert.equal(reply.kind,'message');
  assert.equal(reply.text,'Answered in a fresh conversation.');
  assert.ok(!reply.text.includes('No conversation found'),'the CLI error never reaches the transcript');

  const attempts=(await fs.readFile(promptLog,'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(attempts.map(a=>a.resumed),[false,true,false],'it resumed, was refused, then started fresh');
  // The refused attempt sent only what came after its checkpoint; the fresh one sends the conversation.
  assert.deepEqual(attempts.map(a=>a.whole),[true,false,true],'the fresh attempt carries the whole transcript');
 }finally{
  server.kill('SIGTERM');await Promise.race([once(server,'exit'),wait(4000)]);
  await fs.rm(dir,{recursive:true,force:true});
 }
});
