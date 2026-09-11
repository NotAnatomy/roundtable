import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openStore} from '../store.mjs';
import {routerBase,runApi,listApiModels} from '../api-providers.mjs';
test('migration keeps old conversation and native sessions intact',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'rt-migrate-'));
 try{const old={id:'old',title:'History',agents:[{id:'codex'}],messages:[{text:'Keep this',status:'complete'}],sessions:{codex:'native-session'},rounds:3};await fs.writeFile(path.join(dir,'room.json'),JSON.stringify(old));const {state}=await openStore(dir);assert.deepEqual(state.rooms[0].messages,old.messages);assert.deepEqual(state.rooms[0].sessions,old.sessions);assert.equal(state.rooms[0].rounds,undefined);assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'room.json'))),old);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Google model discovery and generation use correct headers and body',async()=>{
 const config={key:'private-key'};const models=await listApiModels('google',config,async(url,opts)=>{assert.equal(opts.headers['x-goog-api-key'],config.key);return Response.json({models:[{name:'models/gemini-test',supportedGenerationMethods:['generateContent']}]});});assert.equal(models[0].id,'gemini-test');
 let displayed;const result=await runApi({provider:'google',config,model:models[0].id,effort:'auto',prompt:'shared transcript',onText:t=>displayed=t,fetcher:async(url,opts)=>{assert.match(url,/gemini-test:generateContent$/);assert.equal(JSON.parse(opts.body).contents[0].parts[0].text,'shared transcript');assert.equal(opts.redirect,'error');return Response.json({candidates:[{content:{parts:[{thought:true,text:'private thought'},{text:'Public reply'}]}}]});}});assert.equal(result.text,'Public reply');assert.equal(displayed,result.text);
});
test('AgentRouter compatibility formats and error redaction',async()=>{
 for(const protocol of ['openai','anthropic'])await runApi({provider:'agentrouter',config:{key:'private-key',baseURL:'https://agentrouter.org/v1',protocol},model:'test-model',prompt:'context',onText:()=>{},fetcher:async(url,opts)=>{assert.ok(url.endsWith(protocol==='openai'?'/chat/completions':'/messages'));assert.equal(JSON.parse(opts.body).model,'test-model');return Response.json(protocol==='openai'?{choices:[{message:{content:'reply'}}]}:{content:[{type:'text',text:'reply'}]});}});
 for(const url of ['http://agentrouter.org','https://evil.example','https://agentrouter.org.evil.example','https://key@agentrouter.org'])assert.throws(()=>routerBase(url));
 await assert.rejects(()=>listApiModels('google',{key:'private-key'},async()=>Response.json({error:{message:'invalid private-key'}},{status:401})),e=>!e.message.includes('private-key')&&e.message.includes('[redacted]'));
});

// Root URL plus auth token follows the supplied Claude gateway configuration.
test('AgentRouter bare host sends versioned Messages request with Bearer auth',async()=>{
 assert.equal(routerBase('https://agentrouter.org/'),'https://agentrouter.org/v1');
 assert.equal(routerBase('https://agentrouter.org/v1/'),'https://agentrouter.org/v1');
 await runApi({provider:'agentrouter',config:{key:'fixture-token',baseURL:'https://agentrouter.org',protocol:'anthropic'},model:'fixture-model',prompt:'hello',onText:()=>{},fetcher:async(url,options)=>{
 assert.equal(url,'https://agentrouter.org/v1/messages');assert.equal(options.headers.Authorization,'Bearer fixture-token');assert.equal(options.headers['x-api-key'],undefined);assert.equal(options.headers['anthropic-version'],'2023-06-01');return Response.json({content:[{type:'text',text:'reply'}]});
 }});
});
