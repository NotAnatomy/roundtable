import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultAgents,selectSpeakers,makePrompt} from '../room.mjs';
test('mentions route only to named enabled participants',()=>{
 assert.deepEqual(selectSpeakers('@claude can you react?',defaultAgents).map(a=>a.id),['claude']);
 assert.equal(selectSpeakers('hello',defaultAgents).length,2);
 assert.equal(selectSpeakers('@codextra',defaultAgents).length,2);
});
test('shared context includes peer replies and excludes failed partial output',()=>{
 const room={agents:defaultAgents,mode:'lounge',notes:'Keep it concise',messages:[{speaker:'Anatomy',text:'hello',status:'complete'},{speaker:'Claude',agentId:'claude',text:'Use a shared room',status:'complete'},{speaker:'Codex',text:'unreliable partial',status:'error',kind:'error'}]};
 const p=makePrompt(room,defaultAgents[0]);assert.match(p,/Use a shared room/);assert.match(p,/Keep it concise/);assert.doesNotMatch(p,/unreliable partial/);
});
