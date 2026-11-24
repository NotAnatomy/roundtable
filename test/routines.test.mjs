import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRoutine,validateSchedule,nextRun,dueRoutines,blockedReason,advance,describeSchedule,ROUTINE_LIMITS} from '../routines.mjs';
import {validateSecret,secretEnv,redactSecrets,describeSecrets,RESERVED,SECRET_LIMITS} from '../secrets.mjs';
import {STRIPPED_ENV} from '../native-env.mjs';

const lounge={id:'r1',title:'Lounge',mode:'lounge',allowEdits:false,archived:false,agents:[{id:'codex',enabled:true},{id:'claude',enabled:false}]};
const rooms=[lounge,{...lounge,id:'r2',mode:'work',allowEdits:true},{...lounge,id:'r3',archived:true}];
const base={title:'Standup',instruction:'Summarise what changed',roomId:'r1',target:'all',schedule:{kind:'daily',time:'09:00',days:'weekday'}};

test('a routine is refused when nobody could approve what it would do',()=>{
 assert.equal(validateRoutine(base,[],rooms).roomId,'r1');
 // The one rule that exists to keep an unattended turn safe.
 assert.throws(()=>validateRoutine({...base,roomId:'r2'},[],rooms),/allows project edits/);
 assert.throws(()=>validateRoutine({...base,roomId:'r3'},[],rooms),/archived/);
 assert.throws(()=>validateRoutine({...base,roomId:'nope'},[],rooms),/Choose a room/);
 assert.throws(()=>validateRoutine({...base,target:'claude'},[],rooms),/enabled participant/);
 assert.equal(validateRoutine({...base,target:'codex'},[],rooms).target,'codex');
 assert.throws(()=>validateRoutine({...base,title:''},[],rooms),/name/);
 assert.throws(()=>validateRoutine({...base,instruction:' '},[],rooms),/message to send/);
 assert.throws(()=>validateRoutine(base,Array.from({length:ROUTINE_LIMITS.count},(_,i)=>({id:'x'+i})),rooms),/up to 20/);
 // Editing one of a full set is still allowed.
 assert.ok(validateRoutine({...base,id:'x0'},Array.from({length:ROUTINE_LIMITS.count},(_,i)=>({id:'x'+i})),rooms));
});
test('schedules are validated and the quota floor holds',()=>{
 assert.deepEqual(validateSchedule({kind:'every',minutes:30}),{kind:'every',minutes:30});
 assert.throws(()=>validateSchedule({kind:'every',minutes:5}),/at least every 15 minutes/);
 assert.throws(()=>validateSchedule({kind:'every',minutes:1.5}),/at least/);
 assert.deepEqual(validateSchedule({kind:'daily',time:'07:30',days:'weekend'}),{kind:'daily',time:'07:30',days:'weekend'});
 assert.equal(validateSchedule({kind:'daily',time:'07:30',days:'nonsense'}).days,'all');
 for(const time of ['7:30','24:00','09:60','noon'])assert.throws(()=>validateSchedule({kind:'daily',time}),/HH:MM/);
 assert.equal(validateSchedule({kind:'once',at:'2027-01-02T03:04:00Z'}).at,'2027-01-02T03:04:00.000Z');
 assert.throws(()=>validateSchedule({kind:'once',at:'never'}),/date and time/);
 assert.throws(()=>validateSchedule({kind:'cron',expr:'* * * * *'}),/how often/);
});
test('the next run is a local wall-clock time and respects the day filter',()=>{
 const monday9=new Date(2026,10,23,9,0,0).getTime();
 assert.equal(nextRun({kind:'every',minutes:45},monday9),monday9+45*60000);
 // Later the same day rolls to tomorrow.
 const d=new Date(nextRun({kind:'daily',time:'08:00',days:'all'},monday9));
 assert.equal(d.getHours(),8);assert.equal(d.getDate(),24);
 // Earlier in the day stays today.
 assert.equal(new Date(nextRun({kind:'daily',time:'17:00',days:'all'},monday9)).getDate(),23);
 // Friday evening with a weekday filter lands on Monday, not Saturday.
 const friday=new Date(2026,10,27,20,0,0).getTime();
 const next=new Date(nextRun({kind:'daily',time:'09:00',days:'weekday'},friday));
 assert.equal(next.getDay(),1);assert.equal(next.getDate(),30);
 const weekend=new Date(nextRun({kind:'daily',time:'09:00',days:'weekend'},friday));
 assert.equal(weekend.getDay(),6);
 // A one-off in the past never runs again.
 assert.equal(nextRun({kind:'once',at:new Date(monday9-1000).toISOString()},monday9),null);
 assert.equal(nextRun({kind:'once',at:new Date(monday9+1000).toISOString()},monday9),monday9+1000);
 assert.equal(nextRun({kind:'nope'},monday9),null);
});
test('only enabled routines whose time has come are due',()=>{
 const list=[{id:'a',enabled:true,nextRun:100},{id:'b',enabled:false,nextRun:100},{id:'c',enabled:true,nextRun:300},{id:'d',enabled:true,nextRun:null}];
 assert.deepEqual(dueRoutines(list,200).map(r=>r.id),['a']);
 assert.deepEqual(dueRoutines(list,400).map(r=>r.id),['a','c']);
});
test('a run is blocked for every reason the user would need explained',()=>{
 const routine={target:'all'};
 assert.equal(blockedReason(routine,lounge,false),null);
 assert.match(blockedReason(routine,undefined,false),/deleted/);
 assert.match(blockedReason(routine,{...lounge,archived:true},false),/archived/);
 assert.match(blockedReason(routine,lounge,true),/still replying/);
 assert.match(blockedReason(routine,{...lounge,mode:'work',allowEdits:true},false),/project edits/);
 assert.match(blockedReason({target:'claude'},lounge,false),/no longer enabled/);
 assert.match(blockedReason(routine,{...lounge,agents:[{id:'codex',enabled:false}]},false),/no enabled participants/);
});
test('a routine that keeps failing to start pauses itself instead of retrying forever',()=>{
 const now=new Date(2026,10,23,9,0,0).getTime();
 let r={id:'a',enabled:true,schedule:{kind:'every',minutes:60},skips:0};
 r=advance(r,{ran:true,now});
 assert.equal(r.lastResult,'ok');assert.equal(r.skips,0);assert.equal(r.lastRun,now);assert.equal(r.nextRun,now+3600000);
 for(let i=1;i<=ROUTINE_LIMITS.skips;i++)r=advance(r,{ran:false,reason:'Its room is archived.',now});
 assert.equal(r.enabled,false);assert.equal(r.nextRun,null);assert.match(r.lastReason,/Paused after 3 runs/);
 assert.match(r.lastReason,/archived/);
 // A successful run clears the count.
 let s={id:'b',enabled:true,schedule:{kind:'every',minutes:60},skips:2};
 assert.equal(advance(s,{ran:true,now}).skips,0);
 // A one-off disables itself once its time has passed.
 const once=advance({id:'c',enabled:true,schedule:{kind:'once',at:new Date(now-1).toISOString()},skips:0},{ran:true,now});
 assert.equal(once.enabled,false);assert.equal(once.nextRun,null);
});
test('schedules read as plain English',()=>{
 assert.equal(describeSchedule({kind:'every',minutes:30}),'Every 30 minutes');
 assert.equal(describeSchedule({kind:'every',minutes:60}),'Every 1 hour');
 assert.equal(describeSchedule({kind:'every',minutes:240}),'Every 4 hours');
 assert.equal(describeSchedule({kind:'daily',time:'09:00',days:'weekday'}),'Weekdays at 09:00');
 assert.equal(describeSchedule(null),'Not scheduled');
});

test('a secret name cannot take back a variable Roundtable strips, and the value has a floor',()=>{
 assert.deepEqual(validateSecret({name:'deploy_key',description:'Deploys the site',value:'abcdefgh'}),{name:'DEPLOY_KEY',description:'Deploys the site',value:'abcdefgh'});
 // Every variable stripped to keep an agent on its own login is reserved.
 for(const name of STRIPPED_ENV)assert.ok(RESERVED.has(name),name);
 for(const name of ['ANTHROPIC_API_KEY','OPENAI_BASE_URL','PATH','NODE_OPTIONS','DYLD_INSERT_LIBRARIES'])
  assert.throws(()=>validateSecret({name,description:'x',value:'abcdefgh'}),/reserved/);
 for(const name of ['1TOKEN','my-token','TOKEN NAME',''])assert.throws(()=>validateSecret({name,description:'x',value:'abcdefgh'}),/environment variable name/);
 assert.throws(()=>validateSecret({name:'TOKEN',description:'',value:'abcdefgh'}),/what this secret is for/);
 assert.throws(()=>validateSecret({name:'TOKEN',description:'x',value:'short'}),/8 to 4096/);
 assert.throws(()=>validateSecret({name:'TOKEN',description:'x',value:'abcdefgh\nmore'}),/line breaks/);
 assert.throws(()=>validateSecret({name:'TOKEN',description:'x',value:'abcdefgh'},[{id:'other',name:'TOKEN'}]),/already saved/);
 // Editing keeps the name, and omitting the value leaves the stored one alone.
 assert.equal(validateSecret({id:'me',name:'TOKEN',description:'x'},[{id:'me',name:'TOKEN'}]).value,undefined);
});
test('a secret reaches the process but never the transcript',()=>{
 const secrets=[{name:'DEPLOY_KEY',description:'Deploys the site',value:'s3cret-value-123'},{name:'SHORT',description:'d',value:'tiny'},{name:'NOVALUE',description:'d'}];
 assert.deepEqual(secretEnv(secrets),{DEPLOY_KEY:'s3cret-value-123',SHORT:'tiny'});
 assert.deepEqual(describeSecrets(secrets),[{name:'DEPLOY_KEY',purpose:'Deploys the site'},{name:'SHORT',purpose:'d'},{name:'NOVALUE',purpose:'d'}]);
 assert.equal(redactSecrets('ran with s3cret-value-123 twice: s3cret-value-123',secrets),'ran with [secret redacted] twice: [secret redacted]');
 // A value under the minimum length is not redacted, which is why the minimum exists.
 assert.equal(redactSecrets('a tiny word',secrets),'a tiny word');
 // Overlapping values collapse once, longest first.
 const nested=[{value:'abcdefghij'},{value:'abcdefghijklmno'}];
 assert.equal(redactSecrets('x abcdefghijklmno y',nested),'x [secret redacted] y');
 assert.equal(redactSecrets(null,secrets),'');
 assert.equal(redactSecrets('nothing here',[]),'nothing here');
});
