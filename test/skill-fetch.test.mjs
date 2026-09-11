import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchSkillSource,parseSkillUrl,flagReferences,listSkillFiles,FETCH_LIMITS} from '../skill-fetch.mjs';
import {validateSkill} from '../skill-library.mjs';
import {makePrompt,defaultAgents} from '../room.mjs';
const skillMd='---\nname: Analyze data\ndescription: "Run the bundled analyzer"\n---\n\nRead the CSV, then run `scripts/analyze.py` and compare with ./references/baseline.md.\n\nReport findings.';
const tree=[{path:'README.md',type:'blob'},{path:'skills/analyze/SKILL.md',type:'blob'},{path:'skills/analyze/scripts/analyze.py',type:'blob'},{path:'skills/analyze/references/baseline.md',type:'blob'},{path:'skills/plain/SKILL.md',type:'blob'},{path:'a/b/c/d/deep/SKILL.md',type:'blob'},{path:'skills/analyze/notes.txt',type:'blob'}];
function github(overrides={}){const calls=[];const fetcher=async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');assert.ok(options.signal);const u=new URL(url);assert.ok(['api.github.com','raw.githubusercontent.com'].includes(u.hostname));
 if(overrides[url])return overrides[url]();
 if(u.hostname==='api.github.com'&&u.pathname==='/repos/acme/skills')return Response.json({default_branch:'main'});
 if(u.hostname==='api.github.com'&&u.pathname.startsWith('/repos/acme/skills/git/trees/'))return Response.json({tree,truncated:false});
 if(u.hostname==='raw.githubusercontent.com'&&u.pathname==='/acme/skills/main/skills/analyze/SKILL.md')return new Response(skillMd);
 if(u.hostname==='raw.githubusercontent.com'&&u.pathname==='/acme/skills/main/skills/plain/SKILL.md')return new Response('---\nname: Plain\n---\nJust instructions.');
 return new Response('missing',{status:404});};return {fetcher,calls};}
test('a raw SKILL.md link imports instructions and names the package files it cannot install',async()=>{
 const {fetcher}=github();const r=await fetchSkillSource('https://raw.githubusercontent.com/acme/skills/main/skills/analyze/SKILL.md',fetcher);
 assert.equal(r.kind,'skill');assert.equal(r.skill.name,'Analyze data');assert.equal(r.skill.description,'Run the bundled analyzer');assert.match(r.skill.instructions,/^Read the CSV/);assert.ok(!r.skill.instructions.includes('name: Analyze'));
 assert.deepEqual(r.skill.resources,['scripts','references']);assert.equal(r.skill.checked,true);assert.match(r.skill.limitations,/scripts\/, references\//);assert.match(r.skill.limitations,/installs none of them/);
 assert.deepEqual(r.skill.flagged.map(f=>f.line),[1]);assert.match(r.skill.flagged[0].text,/analyze\.py/);
 const saved=validateSkill(r.skill);assert.equal(saved.limitations,r.skill.limitations);
 const prompt=makePrompt({title:'T',agents:[{...defaultAgents[0],skillIds:['s']}],mode:'lounge',notes:'',messages:[]},{...defaultAgents[0],skillIds:['s']},[{id:'s',...saved}]);assert.match(prompt,/not installed here/);
});
test('a repository link lists SKILL.md files up to three levels deep without fetching their bodies; a blob link resolves one',async()=>{
 const {fetcher,calls}=github();const r=await fetchSkillSource('https://github.com/acme/skills',fetcher);
 assert.equal(r.kind,'list');assert.equal(r.ref,'main');assert.deepEqual(r.skills.map(s=>s.path),['skills/analyze/SKILL.md','skills/plain/SKILL.md']);assert.equal(r.skills[0].name,'analyze');assert.match(r.skills[0].url,/^https:\/\/github\.com\/acme\/skills\/blob\/main\/skills\/analyze\/SKILL\.md$/);
 assert.ok(calls.every(u=>new URL(u).hostname==='api.github.com'));
 const one=await fetchSkillSource(r.skills[1].url,fetcher);assert.equal(one.kind,'skill');assert.equal(one.skill.name,'Plain');assert.equal(one.skill.limitations,'');assert.deepEqual(one.skill.flagged,[]);
 assert.deepEqual(listSkillFiles(tree,'skills'),['skills/analyze/SKILL.md','skills/plain/SKILL.md']);assert.equal(listSkillFiles(Array.from({length:80},(_,i)=>({path:`s${i}/SKILL.md`,type:'blob'}))).length,FETCH_LIMITS.results);
 const folder=await fetchSkillSource('https://github.com/acme/skills/tree/main/skills/plain',fetcher);assert.deepEqual(folder.skills.map(s=>s.path),['skills/plain/SKILL.md']);
});
test('non-allowlisted hosts, credentials, redirects and oversized responses are rejected before anything is saved',async()=>{
 for(const url of ['https://gitlab.com/acme/skills','http://github.com/acme/skills','https://user:pw@github.com/acme/skills','https://github.com.evil.example/acme/skills','https://api.github.com/repos/acme/skills','https://github.com/acme','file:///etc/passwd','not a url'])await assert.rejects(fetchSkillSource(url,async()=>{throw new Error('must not fetch');}));
 assert.deepEqual(parseSkillUrl('https://github.com/acme/skills.git'),{owner:'acme',repo:'skills',ref:null,path:'',kind:'tree'});
 assert.deepEqual(parseSkillUrl('https://raw.githubusercontent.com/acme/skills/refs/heads/main/x/SKILL.md'),{owner:'acme',repo:'skills',ref:'refs/heads/main',path:'x/SKILL.md',kind:'file'});
 await assert.rejects(fetchSkillSource('https://github.com/acme/skills/blob/main/skills/plain/SKILL.md',async()=>new Response(null,{status:302,headers:{location:'https://evil.example'}})),/redirects/);
 await assert.rejects(fetchSkillSource('https://github.com/acme/skills/blob/main/skills/plain/SKILL.md',async()=>{throw new TypeError('redirect');}),/Redirects are not followed/);
 await assert.rejects(fetchSkillSource('https://github.com/acme/skills/blob/main/skills/plain/SKILL.md',async()=>new Response('x'.repeat(FETCH_LIMITS.file+1))),/larger than 256 KB/);
 await assert.rejects(fetchSkillSource('https://github.com/acme/skills/blob/main/skills/plain/SKILL.md',async()=>new Response('x',{headers:{'content-length':String(FETCH_LIMITS.file+1)}})),/larger than 256 KB/);
 await assert.rejects(fetchSkillSource('https://github.com/acme/skills',async()=>new Response('{}',{status:403})),/rate limit/);
 await assert.rejects(fetchSkillSource('https://github.com/acme/skills/blob/main/notes.txt',async()=>new Response('x')),/Markdown/);
});
test('a package whose instructions depend on scripts is marked before assignment, and a raw import still works when the tree is unavailable',async()=>{
 const {fetcher}=github({'https://api.github.com/repos/acme/skills/git/trees/main?recursive=1':()=>new Response('{}',{status:403})});
 const r=await fetchSkillSource('https://raw.githubusercontent.com/acme/skills/main/skills/analyze/SKILL.md',fetcher);
 assert.equal(r.skill.checked,false);assert.deepEqual(r.skill.resources,[]);assert.match(r.skill.limitations,/could not be checked/);assert.match(r.skill.limitations,/1 line of the instructions refer/);
 assert.deepEqual(flagReferences('Use assets/logo.png\nplain line\nsee ./tools/run.sh').map(f=>f.line),[1,3]);
});
