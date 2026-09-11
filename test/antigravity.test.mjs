import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runAntigravity} from '../antigravity.mjs';
test('Antigravity documented stream completes once and preserves native conversation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rt-agy-')),file=path.join(dir,'agy'),previous=process.env.ROUNDTABLE_AGY_BIN;
 try{await fs.writeFile(file,`#!/usr/bin/env node
if(process.argv.includes('--version')){console.log('fixture');process.exit(0);}
const assert=require('assert');const args=process.argv.slice(2);assert(args.includes('--sandbox'));assert.equal(args[args.indexOf('--model')+1],'test-model');assert.equal(args[args.indexOf('--effort')+1],'low');assert(!args.includes('--dangerously-skip-permissions'));
let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{assert.equal(JSON.parse(input).message.content,'shared context');console.log(JSON.stringify({event:'init',conversation_id:'native-123'}));console.log(JSON.stringify({event:'step_update',step_update:{text_delta:'hello'}}));console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'hello'}}));});
`,{mode:0o755});process.env.ROUNDTABLE_AGY_BIN=file;
 const result=await runAntigravity({prompt:'shared context',cwd:dir,model:'test-model',effort:'low',signal:new AbortController().signal,onText:()=>{},onActivity:()=>{}});assert.deepEqual(result,{text:'hello',session:'native-123'});
 }finally{if(previous===undefined)delete process.env.ROUNDTABLE_AGY_BIN;else process.env.ROUNDTABLE_AGY_BIN=previous;await fs.rm(dir,{recursive:true,force:true});}
});
