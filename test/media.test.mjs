import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {mediaStore,mediaRefs,claudeInput,decodedSize,MEDIA_REQUEST_BYTES} from '../media.mjs';
import {turnParams} from '../codex-protocol.mjs';
import {runApi} from '../api-providers.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=';
test('media files are deduplicated, validated and loaded without putting bytes in room state',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rt-media-'));try{const store=await mediaStore(dir),a=await store.upload({name:'a.png',mime:'image/png',data:png}),b=await store.upload({name:'b.png',mime:'image/png',data:png});assert.equal(a.id,b.id);assert.equal('data' in a,false);assert.equal((await store.images([a]))[0].data,png);assert.equal((await store.validate([{...a,mime:'wrong',text:'forged'}]))[0].text,undefined);await assert.rejects(store.load('../secret'));await assert.rejects(store.upload({name:'bad.png',mime:'image/png',data:Buffer.from('<script>bad</script>').toString('base64')}));await assert.rejects(store.upload({name:'bad.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.7').toString('base64'),pages:[]}));const pdf=await store.upload({name:'doc.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.7 fixture').toString('base64'),pages:[{mime:'image/png',data:png}],text:'Extracted words'});assert.equal(pdf.pages,1);assert.equal((await store.images([pdf]))[0].label,'doc.pdf page 1');const room={messages:[{id:'1',status:'complete',attachments:[a,b,pdf]}]};assert.equal(mediaRefs(room).length,2);assert.equal(mediaRefs(room,'1').length,0);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Codex and Claude receive actual image blocks with labels',()=>{const media=[{mime:'image/png',data:png,label:'diagram'}];const input=claudeInput('inspect',media,'session');assert.equal(input.message.content[2].source.data,png);assert.equal(input.message.content[2].source.media_type,'image/png');assert.equal(input.session_id,'session');const turn=turnParams({threadId:'t',prompt:'inspect',cwd:'/project',write:false,media});assert.equal(turn.input[2].type,'image');assert.equal(turn.input[2].url,'data:image/png;base64,'+png);});
test('Google and both AgentRouter formats receive image data and preserve usage',async()=>{
 for(const [provider,protocol]of [['google',''],['agentrouter','anthropic'],['agentrouter','openai']]){const result=await runApi({provider,config:{key:'fixture',baseURL:'https://agentrouter.org',protocol},model:'vision-fixture',prompt:'inspect',onText:()=>{},media:[{mime:'image/png',data:png,label:'diagram'}],fetcher:async(url,options)=>{const b=JSON.parse(options.body);const sent=provider==='google'?b.contents[0].parts[2].inlineData.data:protocol==='anthropic'?b.messages[0].content[2].source.data:b.messages[0].content[2].image_url.url;assert.ok(sent.endsWith(png));return Response.json(provider==='google'?{candidates:[{content:{parts:[{text:'Seen'}]}}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:2}}:protocol==='anthropic'?{content:[{type:'text',text:'Seen'}],usage:{input_tokens:10,output_tokens:2}}:{choices:[{message:{content:'Seen'}}],usage:{prompt_tokens:10,completion_tokens:2}});}});assert.deepEqual(result.usage,{inputTokens:10,outputTokens:2});}
});

test('Claude CLI stream input carries images and returns reported usage',async()=>{
 const {runClaude}=await import('../providers.mjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'rt-claude-media-')),command=path.join(dir,'claude'),previous=process.env.ROUNDTABLE_CLAUDE_BIN;
 try{await fs.writeFile(command,`#!/usr/bin/env node
if(process.argv.includes('--version')){console.log('fixture');process.exit(0);}const assert=require('assert');const a=process.argv;assert.equal(a[a.indexOf('--input-format')+1],'stream-json');assert.equal(a[a.indexOf('--tools')+1],'');let body='';process.stdin.on('data',d=>body+=d);process.stdin.on('end',()=>{const input=JSON.parse(body);assert.equal(input.message.content[2].source.media_type,'image/png');assert(input.message.content[2].source.data.length>20);console.log(JSON.stringify({type:'result',result:'Image received',session_id:'media-session',usage:{input_tokens:12,output_tokens:3}}));});`,{mode:0o755});process.env.ROUNDTABLE_CLAUDE_BIN=command;
 const result=await runClaude({prompt:'inspect',media:[{mime:'image/png',data:png,label:'diagram'}],mode:'lounge',cwd:dir,signal:new AbortController().signal,onText:()=>{},onActivity:()=>{}});assert.equal(result.text,'Image received');assert.equal(result.usage.inputTokens,12);
 }finally{if(previous===undefined)delete process.env.ROUNDTABLE_CLAUDE_BIN;else process.env.ROUNDTABLE_CLAUDE_BIN=previous;await fs.rm(dir,{recursive:true,force:true});}
});
test('one request is bounded by decoded media bytes, not only page count',async()=>{
 assert.equal(decodedSize(Buffer.alloc(1000).toString('base64')),1000);assert.equal(decodedSize(Buffer.alloc(1001).toString('base64')),1001);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rt-media-bytes-'));try{const store=await mediaStore(dir);
  // Write a stored page directly so the test does not need a real multi-megabyte JPEG.
  const big=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(3*1024*1024)]).toString('base64');const id='f'.repeat(64);await fs.writeFile(path.join(dir,id+'.json'),JSON.stringify({mime:'image/jpeg',data:big,pages:Array(4).fill({mime:'image/jpeg',data:big}),text:''}));
  await assert.rejects(store.images([{id,name:'huge.jpg'}]),new RegExp(MEDIA_REQUEST_BYTES/1048576+' MB'));
  const small=await store.upload({name:'a.png',mime:'image/png',data:png});assert.equal((await store.images([small])).length,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
