import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownTree,safeLink} from '../public/markdown.mjs';
import {modelArguments} from '../antigravity.mjs';
import {parseAntigravityModels} from '../catalog.mjs';
import {validateSkill,validateAttachments,starterSkills,messageSize} from '../skill-library.mjs';
import {makePrompt,defaultAgents} from '../room.mjs';
import {listApiModels,runApi} from '../api-providers.mjs';
const flatten=tree=>tree.flatMap(x=>typeof x==='string'?[]:[x,...flatten(x.children)]);
test('Claude-style Markdown formats lists, emphasis, inline code, fenced code and tables',()=>{
 const tree=flatten(markdownTree('**1. Broker**: build it\n\n- **Memory**: use `llGetFreeMemory()`\n- Second point\n\n```lsl\ndefault { state_entry() {} }\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |'));
 for(const tag of ['strong','ul','li','code','pre','table','th','td'])assert.ok(tree.some(n=>n.tag===tag),tag);
 assert.ok(tree.find(n=>n.tag==='pre').children[0].children[0].includes('state_entry'));
});
test('Markdown renderer produces no active HTML, embedded images or unsafe link attributes',()=>{
 const tree=flatten(markdownTree('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert%281%29)\n\n![tracking](https://evil.example/pixel)\n\n[good](https://example.com)'));
 assert.ok(!tree.some(n=>['script','img','iframe','style'].includes(n.tag)));
 assert.equal(tree.filter(n=>n.tag==='a').length,1);assert.equal(tree.find(n=>n.tag==='a').attrs.rel,'noopener noreferrer');
 for(const href of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd','/api/stop'])assert.equal(safeLink(href),null);
});
test('Antigravity pinned model effort wins over stale room effort',()=>{
 assert.deepEqual(modelArguments('gemini-3.8-flash-high','medium'),['--model','gemini-3.8-flash-high']);
 assert.deepEqual(modelArguments('gemini-3.8-flash-medium','high'),['--model','gemini-3.8-flash-medium']);
 assert.deepEqual(modelArguments('claude-sonnet-4-6','low'),['--model','claude-sonnet-4-6','--effort','low']);
 assert.deepEqual(parseAntigravityModels('Available models\n\x1b[32mgemini-3.8-flash-high    Gemini Flash High\x1b[0m\nclaude-sonnet-4-6  Claude Sonnet\n...'),[{id:'gemini-3.8-flash-high',name:'Gemini Flash High'},{id:'claude-sonnet-4-6',name:'Claude Sonnet'}]);
});
test('selected skills and attachment text reach the agent, unrelated skills stay out',()=>{
 const a={...defaultAgents[0],skillIds:['code-review']};const room={title:'Test',agents:[a],mode:'lounge',notes:'',pinnedMessageIds:['m'],messages:[{id:'m',speaker:'Anatomy',text:'Review',status:'complete',attachments:[{name:'script.lsl',text:'default {}'}]}]};
 const prompt=makePrompt(room,a,starterSkills);assert.match(prompt,/Code review/);assert.ok(!prompt.includes('LSL review'));assert.match(prompt,/script.lsl/);assert.match(prompt,/default \{\}/);assert.match(prompt,/Pinned room context/);
 assert.equal(messageSize(room.messages[0]),16);
 assert.throws(()=>validateSkill({name:'',description:'',instructions:'x'}));assert.throws(()=>validateAttachments([{name:'../file',text:'x'}]));assert.throws(()=>validateAttachments([{name:'file',text:'\0'}]));assert.throws(()=>validateAttachments(Array(4).fill({name:'a',text:'x'})));
});
test('client authorization rejection is actionable and is not retried',async()=>{
 let calls=0;await assert.rejects(()=>listApiModels('agentrouter',{key:'secret',baseURL:'https://agentrouter.org'},async()=>{calls++;return Response.json({error:{message:'unauthorized client detected secret'}},{status:401});}),e=>e.details.code==='client_not_authorized'&&!e.message.includes('secret')&&e.message.includes('support'));
 assert.equal(calls,1);
});

test('explicit connection test output cap is sent for every API format',async()=>{
 for(const [provider,protocol]of [['google',''],['agentrouter','openai'],['agentrouter','anthropic']]){
  await runApi({provider,config:{key:'fixture',baseURL:'https://agentrouter.org',protocol},model:'fixture-model',effort:'auto',prompt:'Reply OK',maxOutputTokens:16,onText:()=>{},fetcher:async(url,options)=>{
   const body=JSON.parse(options.body);assert.equal(provider==='google'?body.generationConfig.maxOutputTokens:body.max_tokens,16);
   return Response.json(provider==='google'?{candidates:[{content:{parts:[{text:'OK'}]}}]}:protocol==='anthropic'?{content:[{type:'text',text:'OK'}]}:{choices:[{message:{content:'OK'}}]});
  }});
 }
});
