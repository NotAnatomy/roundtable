import {mediaStore,mediaRefs} from './media.mjs';
import {frame,deltaSender} from './stream.mjs';
import {resolveWorkspace,overlap} from './workspace.mjs';
import {strippedNames} from './native-env.mjs';
import {totalUsage} from './usage.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {defaultAgents,selectSpeakers,routeSpeakers,makePrompt,budget} from './room.mjs';
import {runClaude,runCodex} from './providers.mjs';
import {resolveCommand} from './commands.mjs';
import {openStore,newRoom} from './store.mjs';
import {runApi,listApiModels,routerBase,transcribeAudio,synthesizeSpeech,speakableText,VOICE_DEFAULTS,VOICE_NAMES} from './api-providers.mjs';
import {runAntigravity} from './antigravity.mjs';
import {validateSkill,validateAttachments,messageSize} from './skill-library.mjs';
import {pinnedEffort} from './antigravity.mjs';
import {listCodexModels,listAntigravityModels} from './catalog.mjs';
import {collectGarbage,removeRoomFiles} from './retention.mjs';
import {fetchSkillSource} from './skill-fetch.mjs';
import {createTaskTracker} from './tasks.mjs';
import {validateSecret,secretEnv,redactSecrets,describeSecrets} from './secrets.mjs';
import {validateRoutine,nextRun,dueRoutines,blockedReason,advance,describeSchedule} from './routines.mjs';
import {validateAction,describeAction,checkUrl,pageReport,formatReport,validateLogin,matchLogin,describeLogins,BROWSER_LIMITS} from './browser.mjs';
import {openBrowser,findBrowser} from './cdp.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const pdfAssets=new Map();for(const dir of ['standard_fonts','cmaps','wasm'])for(const name of await fs.readdir(path.join(root,'public/vendor',dir)))pdfAssets.set('/vendor/'+dir+'/'+name,path.join(root,'public/vendor',dir,name));
const data=process.env.ROUNDTABLE_DATA_DIR||path.join(os.homedir(),'.roundtable');
await fs.mkdir(data,{recursive:true,mode:0o700});
const {state:db,save}=await openStore(data);
let room=db.rooms.find(r=>r.id===db.selectedId)||db.rooms[0];
const keyFile=path.join(data,'connections.json');let connections={};
try{connections=JSON.parse(await fs.readFile(keyFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const secretFile=path.join(data,'secrets.json');let secretValues={};
try{secretValues=JSON.parse(await fs.readFile(secretFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const saveSecrets=async()=>{await fs.writeFile(secretFile+'.tmp',JSON.stringify(secretValues),{mode:0o600});await fs.rename(secretFile+'.tmp',secretFile);};
// A room reaches only the secrets it was given, and only a native CLI is given an environment at all.
const roomSecrets=target=>(target.secretIds||[]).map(id=>db.secrets.find(s=>s.id===id)).filter(Boolean).map(s=>({...s,value:secretValues[s.id]})).filter(s=>typeof s.value==='string');
const allSecretValues=()=>Object.values(secretValues).map(value=>({value}));
const loginFile=path.join(data,'logins.json');let loginValues={};
try{loginValues=JSON.parse(await fs.readFile(loginFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const saveLogins=async()=>{await fs.writeFile(loginFile+'.tmp',JSON.stringify(loginValues),{mode:0o600});await fs.rename(loginFile+'.tmp',loginFile);};
// A saved username comes back out of any page it was typed into, so it is removed from agent-visible
// text like a password is. Four characters is the floor here, because a username can be short.
const allLoginValues=()=>Object.values(loginValues).flatMap(v=>[{value:v?.username},{value:v?.password}]);
const redactAll=text=>redactSecrets(redactSecrets(text,allSecretValues()),allLoginValues(),4);
const token=randomBytes(32).toString('hex'),launchSecret=randomBytes(32).toString('hex');
const clients=new Set(),jobs=new Map();let mutating=false;
const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const snapshot=()=>{const {sessions,...publicRoom}=room,active=jobs.get(room.id);return {...publicRoom,busy:!!active,activeAgent:active?.agent||null,activity:active?.activity||'',capacity:budget(room),usage:totalUsage(room.messages),rooms:db.rooms.map(r=>({id:r.id,title:r.title,agents:r.agents.length,count:r.messages.length,busy:jobs.has(r.id),archived:!!r.archived})),skills:db.skills,voice:voiceInfo(),secrets:db.secrets.map(({id,name,description})=>({id,name,description})),routines:db.routines.map(r=>({...r,scheduleText:describeSchedule(r.schedule)})),browser:browserInfo(),version};};
function emit(event,data){const content=frame(event,data);for(const res of clients){if(res.writableLength>1024*1024){res.end();clients.delete(res);}else res.write(content);}}
function broadcast(){emit('state',snapshot());}
const safeError=e=>redactAll(Object.values(connections).reduce((t,c)=>c.key?t.split(c.key).join('[redacted]'):t,String(e?.message||e)));
const connectionInfo=()=>Object.fromEntries(['google','agentrouter'].map(p=>[p,{configured:!!connections[p]?.key,baseURL:connections[p]?.baseURL||'',protocol:connections[p]?.protocol||'openai',...(p==='google'?{dictationModel:connections.google?.dictationModel||VOICE_DEFAULTS.dictationModel,voiceModel:connections.google?.voiceModel||VOICE_DEFAULTS.voiceModel,voiceName:connections.google?.voiceName||VOICE_DEFAULTS.voiceName,voices:VOICE_NAMES}:{})}]));
const voiceInfo=()=>({ready:!!connections.google?.key});
async function validateSettings(input){
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>80)throw new Error('Give this room a name under 80 characters.');
 if(!['lounge','work'].includes(input.mode))throw new Error('Choose Lounge or Work.');
 if(typeof input.notes!=='string'||input.notes.length>12000)throw new Error('Shared notes must be under 12,000 characters.');
 if(!Array.isArray(input.agents)||input.agents.length<1||input.agents.length>4)throw new Error('Choose one to four participants.');
 const agents=[],ids=new Set();
 for(const a of input.agents){
  if(!/^[a-z][a-z0-9_]{0,23}$/.test(a.id)||ids.has(a.id)||!['codex','claude','google','agentrouter','antigravity'].includes(a.provider)||typeof a.name!=='string'||!a.name.trim()||a.name.length>40||typeof a.role!=='string'||a.role.length>120||typeof a.instructions!=='string'||a.instructions.length>6000)throw new Error('Check participant names, IDs and instructions.');
  if(a.provider==='antigravity'&&input.mode==='work')throw new Error('Antigravity is available in Lounge only until project permissions can be enforced.');
  const model=String(a.model||'').trim();let effort=a.effort||'auto';
  if(a.provider==='antigravity'&&pinnedEffort(model))effort='auto';
  const skillIds=a.skillIds||[];if(!Array.isArray(skillIds)||skillIds.length>8||skillIds.some(id=>!db.skills.some(s=>s.id===id)))throw new Error('Select up to eight existing skills per agent.');
  if(model.length>200||model.startsWith('-')||/[^a-zA-Z0-9_./:@+ -]/.test(model))throw new Error('Enter a valid provider model ID.');
  if(!['auto','low','medium','high'].includes(effort))throw new Error('Choose a supported reasoning effort.');
  if(a.provider==='agentrouter'&&effort!=='auto')throw new Error('AgentRouter speed is selected through the model. Use Provider default for effort.');
  if(['google','agentrouter'].includes(a.provider)&&!model)throw new Error('Choose a model for each API participant.');
  ids.add(a.id);agents.push({id:a.id,name:a.name.trim(),provider:a.provider,role:a.role,instructions:a.instructions,model,effort,skillIds:[...new Set(skillIds)],enabled:a.enabled!==false});
 }
 if(!agents.some(a=>a.enabled))throw new Error('Enable at least one participant.');
 let workspace=typeof input.workspace==='string'?input.workspace.trim():'';
 if(workspace){if(!path.isAbsolute(workspace))throw new Error('Use an absolute project folder path.');workspace=await resolveWorkspace(workspace);}
 if(input.mode==='work'&&!workspace)throw new Error('Choose an existing project folder for Work mode.');
 return {title:input.title.trim(),mode:input.mode,notes:input.notes,workspace,allowEdits:!!input.allowEdits,allowBrowser:!!input.allowBrowser,agents};
}
function message(target,agent,text='',status='complete',kind='message'){const m={id:randomUUID(),agentId:agent?.id||null,speaker:agent?.name||'Anatomy',...(agent?.provider?{provider:agent.provider,model:agent.model||'provider default'}:{}),text,status,kind,time:new Date().toISOString()};target.messages.push(m);return m;}
const mediaFiles=await mediaStore(path.join(data,'uploads'));
const requestDir=path.join(data,'requests');await fs.mkdir(requestDir,{recursive:true,mode:0o700});
const uploadDir=path.join(data,'uploads');
async function cleanup(){try{const removed=await collectGarbage({rooms:db.rooms,requestDir,uploadDir});if(removed.requests||removed.uploads)console.log(`Removed ${removed.requests} finished retry files and ${removed.uploads} unreferenced uploads.`);}catch(e){console.error('Cleanup skipped: '+safeError(e));}}
await cleanup();setInterval(cleanup,24*60*60*1000).unref();
// ---- Browser --------------------------------------------------------------
// One window, in a profile of Roundtable's own, so it never reads or changes the user's everyday
// browser. It is deliberately visible: watching it is the review step an unattended click cannot have.
const browserDir=path.join(data,'browser'),profileDir=path.join(browserDir,'profile'),shotFile=path.join(browserDir,'page.jpg');
const toolDir=path.join(root,'bin');
let browserApp=await findBrowser(),browser=null,opening=null,holder=null;
const browserView={url:'',title:'',shot:0,actions:[],note:''};
async function ensureBrowser(){
 if(browser?.alive)return browser;
 browser=null;
 if(!opening){
  await fs.mkdir(browserDir,{recursive:true,mode:0o700});
  opening=openBrowser({profileDir,onEnd:reason=>{browser=null;Object.assign(browserView,{url:'',title:'',note:reason});broadcast();}})
   .then(session=>{browser=session;opening=null;browserApp={name:session.name,bin:session.binary};browserView.note=`${session.name} is open in Roundtable's own profile.`;broadcast();return session;},
         e=>{opening=null;throw e;});
 }
 return opening;
}
async function captureBrowserView(){
 if(!browser?.alive)return;
 // A site can put a value Roundtable typed straight back into its own URL, and this address is shown
 // in the window and stored with the reply, so it is cleaned like anything else an agent could echo.
 try{const where=await browser.where();browserView.url=redactAll(where.url||'');browserView.title=redactAll(where.title||'');}catch{}
 try{await fs.writeFile(shotFile,Buffer.from(await browser.shot(),'base64'),{mode:0o600});browserView.shot++;}catch{}
}
const browserInfo=()=>({available:!!browserApp,name:browserApp?.name||'',open:!!browser?.alive,allowed:!!room.allowBrowser,
 url:browserView.url,title:browserView.title,shot:browserView.shot,note:browserView.note,actions:browserView.actions.slice(-14),
 logins:db.logins.map(({id,label,origin})=>({id,label,origin}))});
// Every browser step an agent takes arrives here. Page-changing actions answer with the new page, so
// one step is one request and the agent is never acting on a page it has not been shown.
async function browserAct(job,input){
 const target=job.room;
 if(!target.allowBrowser)throw new Error('Browsing is turned off for this room.');
 // There is one window. Two rooms clicking in it at the same time would each act on the other's page.
 if(holder&&holder!==job&&jobs.has(holder.room.id))throw new Error(`${holder.room.title} is using the browser right now. Say so and let the user decide what should wait.`);
 holder=job;
 const action=validateAction(input,{selfOrigin:`http://127.0.0.1:${port}`,allowLocal:target.mode==='work'});
 if(action.action!=='logins'){
  if(job.browserActions>=BROWSER_LIMITS.actions)throw new Error(`This turn has used all ${BROWSER_LIMITS.actions} of its browser steps. Report what you found and let the user ask for more.`);
  job.browserActions++;
 }
 // Only "open" may start a window. Every other step acts on a page, so without one it is refused
 // rather than launching a browser the user did not ask for.
 if(!['logins','open'].includes(action.action)&&!browser?.alive)throw new Error('The browser window is not open. Run rtbrowse open <url> first.');
 const session=action.action==='logins'?null:await ensureBrowser();
 const report=async()=>formatReport(pageReport(await session.read(BROWSER_LIMITS.snapshot,BROWSER_LIMITS.refs),BROWSER_LIMITS.snapshot));
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 let text='';
 switch(action.action){
  case 'logins':{const list=describeLogins(db.logins);
   text=list.length?'Saved sign-ins:\n'+list.map(l=>`  ${l.label} - ${l.origin}`).join('\n')+'\nOpen that site\'s own sign-in page, then run rtbrowse login with the name.':'The user has saved no sign-ins, so you cannot sign in to anything.';break;}
  case 'open':await session.goto(action.url);text=await report();break;
  case 'read':text=await report();break;
  case 'click':action.name=await session.click(action.ref);text=`Clicked ${action.name?JSON.stringify(action.name):'ref '+action.ref}.\n\n`+await report();break;
  case 'type':{
   action.name=await session.focus(action.ref);
   if(action.replace)await session.clearField();
   await session.insert(action.text);
   if(action.submit){await session.key('Enter');await pause(1500);}
   text=`Typed into ${action.name?JSON.stringify(action.name):'ref '+action.ref}${action.submit?' and pressed Enter':''}.\n\n`+await report();break;}
  case 'press':await session.key(action.key);await pause(700);text=`Pressed ${action.key}.\n\n`+await report();break;
  case 'scroll':await session.scroll(action.direction);text=await report();break;
  case 'wait':await pause(action.seconds*1000);text=await report();break;
  case 'back':await session.history(-1);text=await report();break;
  case 'forward':await session.history(1);text=await report();break;
  case 'reload':await session.reload();text=await report();break;
  case 'shot':text='A fresh screenshot is now in the user\'s Roundtable window.';break;
  case 'login':{
   const login=db.logins.find(l=>l.label.toLowerCase()===action.label.toLowerCase());
   // The guard that makes a saved password safer here than in a prompt: the page has to be the one it belongs to.
   const problem=matchLogin(login,(await session.where()).url);
   if(problem)throw new Error(problem);
   const fields=await session.loginFields();
   if(!fields.username&&!fields.password)throw new Error('No sign-in fields are visible on this page. Open the site\'s sign-in page, or click its sign-in button, then try again.');
   const stored=loginValues[login.id]||{},filled=[];
   if(fields.username&&stored.username&&await session.fillField('user',stored.username))filled.push('username');
   if(fields.password&&stored.password&&await session.fillField('pass',stored.password))filled.push('password');
   await session.clearFieldMarks();
   if(!filled.length)throw new Error('Roundtable could not reach the sign-in fields on this page.');
   action.label=login.label;
   text=`Roundtable typed the saved ${filled.join(' and ')} for ${login.label} into ${login.origin}. ${fields.password?'':'This page asks for the username first, so run the same command again on the password step. '}Neither value was shown to you and you cannot read them back. Submit the form to continue. If the site asks for a code or a device confirmation, say so in chat: only the user can finish that, in the browser window.`;
   break;}
 }
 await captureBrowserView();
 const entry={text:describeAction(action),url:browserView.url,time:new Date().toISOString(),agent:job.agent||''};
 browserView.actions.push(entry);if(browserView.actions.length>40)browserView.actions.shift();
 if(job.message)job.message.browser=[...(job.message.browser||[]),entry].slice(-BROWSER_LIMITS.actions);
 broadcast();
 return redactAll(text);
}
const TURN_LIMIT=10*60*1000,ROOM_CAP=50,activeRooms=()=>db.rooms.filter(r=>!r.archived).length;
function startJob(target){if(jobs.has(target.id))throw new Error('This room is already replying.');
 for(const job of jobs.values())if(target.mode==='work'&&job.room.mode==='work'&&(target.allowEdits||job.room.allowEdits)&&overlap(target.workspace,job.room.workspace))throw new Error('Another room is using this project. Wait before starting overlapping project work.');
 const job={room:target,controller:new AbortController(),agent:null,activity:''};jobs.set(target.id,job);return job;}
async function runGroup(target,speakers,job,retry=null){
 const {controller}=job;let deadline;broadcast();
 try{for(const agent of speakers){if(controller.signal.aborted)break;
  // Each participant gets its own turn limit; a slow first speaker must not consume the others' time.
  clearTimeout(deadline);deadline=setTimeout(()=>controller.abort(),TURN_LIMIT);
  job.agent=agent.id;job.activity='Preparing this turn';
  const cwd=target.mode==='work'?target.workspace:path.join(data,'lounge');await fs.mkdir(cwd,{recursive:true});
  // Notes, skills, role and instructions travel in every prompt, so editing them keeps the native session. Provider, model and project permissions cannot change inside one session.
  const fingerprint=createHash('sha256').update(JSON.stringify([agent.id,agent.provider,agent.model||'',agent.effort||'auto',target.mode,target.allowEdits,cwd])).digest('hex');
  const key=agent.id+':'+fingerprint,stored=target.sessions[key],native=['claude','codex','antigravity'].includes(agent.provider);
  const session=retry?undefined:typeof stored==='string'?stored:stored?.id,after=retry?null:stored?.through;
  let prompt,fullPrompt,m=retry?.message;
  const secrets=native?roomSecrets(target):[],described=describeSecrets(secrets);
  // Only a native CLI can run the browser command, because only a native CLI has a shell to run it in.
  const browsing=['codex','claude'].includes(agent.provider)&&!!target.allowBrowser,browserPrompt=browsing?{logins:describeLogins(db.logins),local:target.mode==='work'}:null;
  try{fullPrompt=retry?.request.prompt||makePrompt(target,agent,db.skills,{},described,browserPrompt);prompt=retry?fullPrompt:makePrompt(target,agent,db.skills,native&&session&&after?{after}:{},described,browserPrompt);}catch(e){message(target,{id:'system',name:'Room'},safeError(e),'error','error');break;}
  if(!m)m=message(target,agent,'','streaming');else{m.attempts||=[];m.attempts.push({text:m.text,status:m.status,usage:m.usage,time:m.time});m.text='';m.status='streaming';m.kind='message';delete m.usage;delete m.tasks;delete m.browser;}
  const tracker=createTaskTracker();
  const request=retry?.request||{prompt:fullPrompt,agent:structuredClone(agent),mode:target.mode,allowEdits:target.allowEdits,cwd,media:mediaRefs(target)};
  await fs.writeFile(path.join(requestDir,m.id+'.json'),JSON.stringify(request),{mode:0o600});
  const updates=deltaSender(emit);const update=()=>updates.push({roomId:target.id,id:m.id,text:m.text,activity:job.activity,activeAgent:agent.id,tasks:m.tasks||null});broadcast();
  // A tool label is built from the command the agent ran, so it can carry a value too.
  const onEvent=event=>{tracker.apply(event&&event.label?{...event,label:redactSecrets(event.label,secrets)}:event);const snap=tracker.snapshot();if(snap)m.tasks=snap;update();};
  // The browser token lives exactly as long as this one agent's turn.
  if(browsing){job.browserToken=randomBytes(24).toString('hex');job.browserActions=0;job.message=m;}
  const env=browsing?{...secretEnv(secrets),ROUNDTABLE_BROWSER_URL:`http://127.0.0.1:${port}`,ROUNDTABLE_BROWSER_TOKEN:job.browserToken}:secretEnv(secrets);
  try{const runner=agent.provider==='codex'?runCodex:agent.provider==='claude'?runClaude:agent.provider==='antigravity'?runAntigravity:runApi;
   const result=await runner({provider:agent.provider,model:agent.model,effort:agent.effort,config:connections[agent.provider],prompt,session,cwd:request.cwd,signal:controller.signal,mode:request.mode,allowEdits:request.allowEdits,secrets:env,toolDir:browsing?toolDir:'',media:await mediaFiles.images(retry?request.media:mediaRefs(target,native&&session?after:null)),
    onText:text=>{m.text=redactSecrets(text,secrets);update();},onActivity:text=>{job.activity=redactSecrets(text,secrets);update();},onEvent});
   onEvent({type:'finish',ok:true});m.text=redactSecrets(result.text,secrets);m.status='complete';m.usage=result.usage;updates.flush();await fs.rm(path.join(requestDir,m.id+'.json'),{force:true});
   // Retry uses a fresh native session and cannot advance a later room checkpoint.
   if(result.session&&!retry)target.sessions[key]={id:result.session,through:m.id};await save();broadcast();
  }catch(e){onEvent({type:'finish',ok:false});updates.flush();m.status=controller.signal.aborted?'interrupted':'error';m.kind='error';if(e.usage)m.usage=e.usage;m.text=(m.text?m.text+'\n\n':'')+(controller.signal.aborted?'This reply was interrupted.':safeError(e));delete target.sessions[key];await save();broadcast();if(controller.signal.aborted)break;}
  finally{job.browserToken='';job.message=null;if(holder===job)holder=null;}
 }}catch(e){message(target,{id:'system',name:'Room'},safeError(e),'error','error');}
 finally{clearTimeout(deadline);jobs.delete(target.id);await save();broadcast();}
}
// ---- Routines -------------------------------------------------------------
// A routine puts its instruction into the room as an ordinary message and lets the room take its
// normal turn: one reply per selected participant, then it stops. Nothing here loops or continues
// on its own. Returns null when the turn started, or the reason it did not.
async function fireRoutine(routine,{test=false}={}){
 const target=db.rooms.find(r=>r.id===routine.roomId);
 const blocked=blockedReason(routine,target,jobs.has(routine.roomId));
 if(blocked)return blocked;
 const speakers=routeSpeakers(routine.instruction,target.agents,routine.target).speakers;
 if(!speakers.length)return 'No participant was available to reply.';
 const usage=budget(target,routine.instruction);
 if(usage.used>usage.limit)return 'Its room is full. Continue in a new room and point the routine there.';
 const job=startJob(target),m=message(target,null,routine.instruction);
 m.routine={id:routine.id,title:routine.title};
 try{await save();}catch(e){target.messages.pop();jobs.delete(target.id);return safeError(e);}
 log(`routine ${test?'tested':'ran'}: ${routine.title} in ${target.title}`);
 void runGroup(target,structuredClone(speakers),job);
 return null;
}
const log=text=>console.log(`[${new Date().toISOString()}] ${text}`);
// One timer, not one per routine: schedules survive a restart because the next time is stored, and a
// routine missed while the app was closed runs at its next turn rather than firing a backlog at launch.
let sweeping=false;
async function sweepRoutines(now=Date.now()){
 if(sweeping)return;sweeping=true;
 try{
  for(const routine of dueRoutines(db.routines,now)){
   const reason=await fireRoutine(routine);
   const index=db.routines.findIndex(r=>r.id===routine.id);if(index<0)continue;
   db.routines[index]=advance(db.routines[index],{ran:!reason,reason,now});
   if(reason)log(`routine skipped: ${routine.title} — ${reason}`);
   if(!db.routines[index].enabled)log(`routine paused: ${routine.title} — ${db.routines[index].lastReason}`);
   await save();broadcast();
  }
 }catch(e){console.error('Routine sweep failed: '+safeError(e));}
 finally{sweeping=false;}
}
for(const routine of db.routines)if(routine.enabled&&typeof routine.nextRun!=='number')routine.nextRun=nextRun(routine.schedule);
setInterval(()=>void sweepRoutines(),30000).unref();
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function authorized(req){return equal(req.headers['x-roundtable-token'],token);}
async function body(req,limit=250000){const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw new Error('Request is too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
const port=Number(process.env.PORT||4317);
const server=http.createServer(async(req,res)=>{
  const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  if(!hosts.has(req.headers.host))return json(res,403,{error:'Local connections only.'});
  const origin=req.headers.origin;if(origin){let valid=false;try{const parsed=new URL(origin);valid=parsed.protocol==='http:'&&hosts.has(parsed.host);}catch{}if(!valid)return json(res,403,{error:'Cross origin request blocked.'});}
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  let ownsMutation=false;
  try{
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(req.method==='GET'&&url.pathname==='/api/bootstrap'){if(!authorized(req)&&!equal(url.searchParams.get('k'),launchSecret))return json(res,403,{error:'Open Roundtable using the private link printed in Terminal.'});return json(res,200,{token,state:snapshot()});}
    if(req.method==='GET'&&url.pathname==='/api/events'){
      if(!equal(url.searchParams.get('token'),token))return json(res,403,{error:'Open the private launch link to reconnect.'});
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});clients.add(res);res.write(frame('state',snapshot()));
      const t=setInterval(()=>res.write(': heartbeat\n\n'),20000);req.on('close',()=>{clients.delete(res);clearInterval(t);});return;
    }
    // The browser command carries a turn token, not the window's token. It is the only route an agent
    // can call, it works only while that agent's own turn is running, and it reaches nothing else here.
    if(req.method==='POST'&&url.pathname==='/api/browser/act'){
      const job=[...jobs.values()].find(j=>j.browserToken&&equal(req.headers['x-roundtable-browser'],j.browserToken));
      if(!job)return json(res,403,{error:'The browser is not available in this turn. Ask the user to turn on Browser in Room settings.'});
      try{return json(res,200,{ok:true,text:await browserAct(job,await body(req,20000))});}
      catch(e){return json(res,400,{error:safeError(e)});}
    }
    if(url.pathname.startsWith('/api/')&&!authorized(req))return json(res,403,{error:'Reload the page to reconnect securely.'});
    if(req.method==='GET'&&url.pathname==='/api/browser/shot'){
      try{const image=await fs.readFile(shotFile);res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'no-store'});res.end(image);}
      catch{json(res,404,{error:'No screenshot yet.'});}
      return;
    }
    if(req.method==='GET'&&url.pathname.startsWith('/api/files/')){const saved=await mediaFiles.load(url.pathname.slice('/api/files/'.length));res.writeHead(200,{'Content-Type':saved.mime,'Cache-Control':'no-store','Content-Disposition':'attachment'});res.end(Buffer.from(saved.data,'base64'));return;}
    if(req.method==='GET'&&url.pathname==='/api/status'){const [codex,claude,antigravity]=await Promise.all([resolveCommand('codex'),resolveCommand('claude'),resolveCommand('agy')]);return json(res,200,{codex:codex.ok,claude:claude.ok,antigravity:antigravity.ok,ignoredEnvironment:strippedNames(),details:{codex,claude,antigravity},connections:connectionInfo()});}
    if(req.method==='GET'&&url.pathname==='/api/connections')return json(res,200,connectionInfo());
    if(req.method==='GET'&&url.pathname==='/api/models'){
      const provider=url.searchParams.get('provider');let models;
      if(provider==='codex')models=await listCodexModels();
      else if(provider==='claude')models=[{id:'sonnet',name:'Sonnet (CLI alias)'},{id:'opus',name:'Opus (CLI alias)'},{id:'haiku',name:'Haiku (CLI alias)'}];
      else if(['google','agentrouter'].includes(provider))models=await listApiModels(provider,connections[provider]);
      else if(provider==='antigravity')models=await listAntigravityModels();
      else throw new Error('Unknown provider.');
      return json(res,200,{models});
    }
    if(req.method==='POST'){
      const input=await body(req,url.pathname==='/api/uploads'?24*1024*1024:url.pathname==='/api/dictate'?6*1024*1024:250000);
      const target=input.roomId?db.rooms.find(r=>r.id===input.roomId):room;if(!target)throw new Error('Room not found.');
      if(url.pathname==='/api/stop'){jobs.get(target.id)?.controller.abort();return json(res,200,{ok:true});}
      if(url.pathname==='/api/uploads')return json(res,200,await mediaFiles.upload(input));
      if(url.pathname==='/api/dictate'){
        if(input.mime!=='audio/wav'||typeof input.data!=='string'||input.data.length>4*1024*1024||input.data.length%4!==0||/[^A-Za-z0-9+/=]/.test(input.data))throw new Error('Send a WAV recording under 3 MB.');
        if(Buffer.from(input.data,'base64').subarray(0,4).toString()!=='RIFF')throw new Error('The recording is not a WAV file.');
        const language=typeof input.language==='string'?input.language.slice(0,40).replace(/[^\w -]/g,''):'';
        const result=await transcribeAudio({config:connections.google,mime:'audio/wav',data:input.data,language,signal:AbortSignal.timeout(60000)});return json(res,200,{ok:true,text:result.text,usage:result.usage});
      }
      if(url.pathname==='/api/speak'){
        const m=target.messages.find(m=>m.id===input.id&&m.status==='complete'&&m.kind!=='error');if(!m)throw new Error('Only completed replies can be read aloud.');
        const text=speakableText(m.text);if(!text)throw new Error('There is no readable text in this reply.');
        const result=await synthesizeSpeech({config:connections.google,text,signal:AbortSignal.timeout(90000)});res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store','X-Roundtable-Truncated':String(m.text.length>4000)});res.end(result.wav);return;
      }
      if(url.pathname==='/api/skills/fetch'){if(typeof input.url!=='string'||input.url.length>2000)throw new Error('Paste a GitHub link.');return json(res,200,await fetchSkillSource(input.url));}
      if(url.pathname==='/api/connections/test'){if(!['google','agentrouter'].includes(input.provider)||typeof input.model!=='string'||!input.model.trim())throw new Error('Choose a model to test.');const result=await runApi({provider:input.provider,config:connections[input.provider],model:input.model.trim(),effort:'auto',prompt:'Reply with OK.',signal:AbortSignal.timeout(30000),onText:()=>{},maxOutputTokens:16});return json(res,200,{ok:true,message:'The provider returned text for this model.',sample:result.text.slice(0,200)});}
      if(url.pathname==='/api/browser/open'){
        const session=await ensureBrowser();
        if(input.url)await session.goto(checkUrl(input.url,{selfOrigin:`http://127.0.0.1:${port}`,allowLocal:true}));
        await session.activate();await captureBrowserView();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/browser/close'){
        await browser?.close();browser=null;Object.assign(browserView,{url:'',title:'',note:'The browser is closed.'});
        broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/browser/clear'){
        if([...jobs.values()].some(j=>j.browserToken))return json(res,409,{error:'An agent is using the browser. Stop that turn first.'});
        await browser?.close();browser=null;
        await fs.rm(profileDir,{recursive:true,force:true});await fs.rm(shotFile,{force:true});
        Object.assign(browserView,{url:'',title:'',actions:[],shot:browserView.shot+1,note:'History, cookies and every signed-in session in Roundtable\'s browser were deleted.'});
        broadcast();return json(res,200,{ok:true});
      }
      if(mutating)return json(res,409,{error:'Another change is being saved. Try again.'});
      mutating=true;ownsMutation=true;
      if(jobs.has(target.id)&&['/api/message','/api/settings','/api/retry','/api/new'].includes(url.pathname))return json(res,409,{error:'This room is replying. Stop it before changing its agents or sending another message.'});
      if(target.archived&&['/api/message','/api/retry'].includes(url.pathname))return json(res,409,{error:'This room is archived. Unarchive it to continue the conversation.'});
      if(url.pathname==='/api/connections'){
        if(!['google','agentrouter'].includes(input.provider))throw new Error('Unknown API provider.');
        if(input.remove){delete connections[input.provider];}
        else{
          const key=(typeof input.key==='string'&&input.key.trim())||connections[input.provider]?.key;
          if(!key||key.length>4096||/[\r\n]/.test(key))throw new Error('Enter a valid API key.');
          const config={key};
          if(input.provider==='agentrouter'){config.baseURL=routerBase(input.baseURL);config.protocol=input.protocol==='anthropic'?'anthropic':'openai';}
          if(input.provider==='google'){for(const field of ['dictationModel','voiceModel']){const value=typeof input[field]==='string'?input[field].trim():'';if(value&&(value.length>200||value.startsWith('-')||/[^a-zA-Z0-9_./:@+-]/.test(value)))throw new Error('Enter a valid Gemini model ID for voice.');if(value&&value!==VOICE_DEFAULTS[field])config[field]=value;}const voice=typeof input.voiceName==='string'?input.voiceName.trim():'';if(voice&&!VOICE_NAMES.includes(voice))throw new Error('Choose one of the listed Gemini voices.');if(voice&&voice!==VOICE_DEFAULTS.voiceName)config.voiceName=voice;}
          connections[input.provider]=config;
        }
        await fs.writeFile(keyFile+'.tmp',JSON.stringify(connections),{mode:0o600});await fs.rename(keyFile+'.tmp',keyFile);return json(res,200,connectionInfo());
      }
      if(url.pathname==='/api/secrets/save'){
        const existing=db.secrets.find(s=>s.id===input.id);
        if(!existing&&typeof input.value!=='string')throw new Error('Enter the secret value.');
        const fields=validateSecret(input,db.secrets);
        if(existing){Object.assign(existing,{name:fields.name,description:fields.description});if(fields.value!==undefined){secretValues[existing.id]=fields.value;await saveSecrets();}}
        else{const id=randomUUID();db.secrets.push({id,name:fields.name,description:fields.description});secretValues[id]=fields.value;await saveSecrets();}
        await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/secrets/delete'){
        if(!db.secrets.some(s=>s.id===input.id))throw new Error('Secret not found.');
        db.secrets=db.secrets.filter(s=>s.id!==input.id);delete secretValues[input.id];
        for(const r of db.rooms)r.secretIds=(r.secretIds||[]).filter(id=>id!==input.id);
        await saveSecrets();await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/secrets/assign'){
        if(!Array.isArray(input.secretIds)||input.secretIds.some(id=>!db.secrets.some(s=>s.id===id)))throw new Error('Choose saved secrets.');
        // A fresh native session is needed so a resumed agent cannot keep using an environment it no longer has.
        target.secretIds=[...new Set(input.secretIds)];target.sessions={};
        await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/logins/save'){
        const fields=validateLogin(input,db.logins),existing=db.logins.find(l=>l.id===input.id);
        if(existing){
          Object.assign(existing,{label:fields.label,origin:fields.origin});
          const stored=loginValues[existing.id]||{};
          loginValues[existing.id]={username:fields.username??stored.username,password:fields.password??stored.password};
        }else{
          const id=randomUUID();db.logins.push({id,label:fields.label,origin:fields.origin});
          loginValues[id]={username:fields.username,password:fields.password};
        }
        await saveLogins();await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/logins/delete'){
        if(!db.logins.some(l=>l.id===input.id))throw new Error('Login not found.');
        db.logins=db.logins.filter(l=>l.id!==input.id);delete loginValues[input.id];
        await saveLogins();await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/routines/save'){
        const fields=validateRoutine(input,db.routines,db.rooms),existing=db.routines.find(r=>r.id===input.id);
        if(existing)Object.assign(existing,fields,{nextRun:nextRun(fields.schedule),skips:0,lastReason:''});
        else db.routines.push({id:randomUUID(),...fields,enabled:true,nextRun:nextRun(fields.schedule),lastRun:null,lastResult:'',lastReason:'',skips:0});
        await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/routines/delete'){
        if(!db.routines.some(r=>r.id===input.id))throw new Error('Routine not found.');
        db.routines=db.routines.filter(r=>r.id!==input.id);await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/routines/toggle'){
        const routine=db.routines.find(r=>r.id===input.id);if(!routine)throw new Error('Routine not found.');
        routine.enabled=!routine.enabled;routine.skips=0;routine.lastReason='';
        routine.nextRun=routine.enabled?nextRun(routine.schedule):null;
        if(routine.enabled&&routine.nextRun===null)throw new Error('This routine was scheduled to run once, at a time that has passed. Edit its schedule to use it again.');
        await save();broadcast();return json(res,200,{ok:true,enabled:routine.enabled});
      }
      if(url.pathname==='/api/routines/run'){
        const routine=db.routines.find(r=>r.id===input.id);if(!routine)throw new Error('Routine not found.');
        const result=await fireRoutine(routine,{test:true});
        if(result)throw new Error(result);
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/skills/save'){
        const fields=validateSkill(input),existing=db.skills.find(s=>s.id===input.id);
        if(existing){delete existing.limitations;Object.assign(existing,fields);}else {if(db.skills.length>=50)throw new Error('You can save up to 50 skills.');db.skills.push({id:randomUUID(),...fields});}
        await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/skills/delete'){
        if(!db.skills.some(s=>s.id===input.id))throw new Error('Skill not found.');db.skills=db.skills.filter(s=>s.id!==input.id);
        for(const r of db.rooms)for(const a of r.agents)a.skillIds=(a.skillIds||[]).filter(id=>id!==input.id);await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/pins'){
        const room=target;const m=room.messages.find(m=>m.id===input.id&&m.status==='complete'&&m.kind!=='error');if(!m)throw new Error('Only completed messages can be pinned.');
        room.pinnedMessageIds||=[];if(room.pinnedMessageIds.includes(m.id))room.pinnedMessageIds=room.pinnedMessageIds.filter(id=>id!==m.id);else{if(room.pinnedMessageIds.length>=8)throw new Error('Pin up to eight messages.');room.pinnedMessageIds.push(m.id);}
        await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/settings'){Object.assign(target,await validateSettings(input));for(const key of Object.keys(target.sessions))if(!target.agents.some(a=>key.startsWith(a.id+':')))delete target.sessions[key];await save();broadcast();return json(res,200,{ok:true});}
      if(url.pathname==='/api/rooms/create'){
        if(activeRooms()>=ROOM_CAP)throw new Error(`This version supports up to ${ROOM_CAP} active rooms. Archive or delete one first.`);
        const settings=await validateSettings(input);room=newRoom(settings);db.rooms.push(room);db.selectedId=room.id;await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/rooms/archive'){
        const chosen=db.rooms.find(r=>r.id===input.id);if(!chosen)throw new Error('Room not found.');
        if(jobs.has(chosen.id))return json(res,409,{error:'This room is replying. Stop it before archiving.'});
        chosen.archived=!chosen.archived;
        // Archived rooms hold no native CLI sessions; agents start fresh after unarchiving.
        if(chosen.archived)chosen.sessions={};
        if(!db.rooms.some(r=>!r.archived))db.rooms.push(newRoom());
        if(chosen.archived&&room.id===chosen.id){room=db.rooms.findLast(r=>!r.archived);db.selectedId=room.id;}
        await save();broadcast();return json(res,200,{ok:true,archived:chosen.archived});
      }
      if(url.pathname==='/api/rooms/reset'){
        const chosen=db.rooms.find(r=>r.id===input.id);if(!chosen)throw new Error('Room not found.');
        if(jobs.has(chosen.id))return json(res,409,{error:'This room is replying. Stop it before resetting it.'});
        if(!chosen.messages.length)throw new Error('This room has no messages yet.');
        // The conversation goes, the room stays: agents, skills, notes and project access are untouched.
        // Native sessions are dropped with the history they were built on, and pins cannot outlive their messages.
        const cleared={...chosen,messages:chosen.messages};
        chosen.messages=[];chosen.pinnedMessageIds=[];chosen.sessions={};
        await save();
        try{await removeRoomFiles({room:cleared,rooms:db.rooms,requestDir,uploadDir});}catch(e){console.error('Reset left files behind: '+safeError(e));}
        broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/rooms/delete'){
        const chosen=db.rooms.find(r=>r.id===input.id);if(!chosen)throw new Error('Room not found.');
        if(jobs.has(chosen.id))return json(res,409,{error:'This room is replying. Stop it before deleting.'});
        if(input.title!==chosen.title)throw new Error('Type the room name exactly as shown to delete it.');
        db.rooms=db.rooms.filter(r=>r.id!==chosen.id);
        if(!db.rooms.some(r=>!r.archived))db.rooms.push(newRoom());
        if(room.id===chosen.id){room=db.rooms.findLast(r=>!r.archived);db.selectedId=room.id;}
        await save();
        try{await removeRoomFiles({room:chosen,rooms:db.rooms,requestDir,uploadDir});}catch(e){console.error('Room files were not fully removed: '+safeError(e));}
        broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/rooms/select'){
        const chosen=db.rooms.find(r=>r.id===input.id);if(!chosen)throw new Error('Room not found.');room=chosen;db.selectedId=room.id;await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/notes'){if(typeof input.notes!=='string'||input.notes.length>12000)throw new Error('Keep shared notes under 12,000 characters.');target.notes=input.notes;await save();broadcast();return json(res,200,{ok:true});}
      if(url.pathname==='/api/workspace/resolve')return json(res,200,{workspace:await resolveWorkspace(input.workspace)});
      if(url.pathname==='/api/rooms/continue'){
        if(typeof input.notes!=='string'||!input.notes.trim()||input.notes.length>12000)throw new Error('Write the decisions and next steps to carry into the new room.');
        if(activeRooms()>=ROOM_CAP)throw new Error(`This version supports up to ${ROOM_CAP} active rooms. Archive or delete one first.`);
        room=newRoom({...target,title:(target.title+' continued').slice(0,80),notes:input.notes});db.rooms.push(room);db.selectedId=room.id;await save();broadcast();return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/retry'){
        const m=target.messages.find(m=>m.id===input.id);if(!m||!['error','interrupted'].includes(m.status)||m.agentId==='system')throw new Error('Only a failed agent reply can be retried.');
        let request;try{request=JSON.parse(await fs.readFile(path.join(requestDir,m.id+'.json'),'utf8'));}catch{throw new Error('This older reply has no saved retry context. Send a new message to that agent.');}
        if(request.mode!==target.mode||request.cwd!==(target.mode==='work'?target.workspace:path.join(data,'lounge'))||request.allowEdits!==target.allowEdits)throw new Error('Project permissions changed since this reply. Send a new message with the current settings.');
        const job=startJob(target);void runGroup(target,[request.agent],job,{message:m,request});return json(res,200,{ok:true});
      }
      if(url.pathname==='/api/message'){
        if(typeof input.text!=='string'||!input.text.trim()||input.text.length>20000)throw new Error('Write a message under 20,000 characters.');
        const attachments=await mediaFiles.validate(input.attachments),routing=routeSpeakers(input.text,target.agents,input.target||'all'),speakers=routing.speakers;if(!speakers.length)throw new Error('Enable a participant first.');
        const usage=budget(target,input.text.trim(),attachments);if(usage.used>usage.limit)throw new Error(`This request needs ${usage.used.toLocaleString()} of ${usage.limit.toLocaleString()} context characters. Use Continue in a new room with your shared notes.`);
        const proposed={...target,messages:[...target.messages,{id:'pending',agentId:null,status:'complete',attachments}]};const refs=mediaRefs(proposed);if(refs.length&&speakers.some(a=>a.provider==='antigravity'))throw new Error('Antigravity attachments are not supported yet. Select Codex, Claude or a vision-capable API model for this request.');await mediaFiles.images(refs);
        const job=startJob(target),m=message(target,null,input.text.trim());m.attachments=attachments;m.routedBy=routing.mentioned;
        try{await save();}catch(e){target.messages.pop();jobs.delete(target.id);throw e;}
        void runGroup(target,structuredClone(speakers),job);return json(res,200,{ok:true,routedBy:routing.mentioned});
      }
      if(url.pathname==='/api/continue')return json(res,409,{error:'Agents only reply after you send a new message.'});
      if(url.pathname==='/api/new')return json(res,400,{error:'Use New room to choose your participants.'});
    }
    if(req.method==='GET'&&pdfAssets.has(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.wasm')?'application/wasm':url.pathname.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(pdfAssets.get(url.pathname)));return;}
    const assets={'/':'index.html','/app.js':'app.js','/client-state.mjs':'client-state.mjs','/avatar.mjs':'avatar.mjs','/palette.mjs':'palette.mjs','/dictation.mjs':'dictation.mjs','/backdrop.mjs':'backdrop.mjs','/tasklist.mjs':'tasklist.mjs','/attachments.mjs':'attachments.mjs','/vendor/pdf.min.mjs':'vendor/pdf.min.mjs','/vendor/pdf.worker.min.mjs':'vendor/pdf.worker.min.mjs','/style.css':'style.css','/markdown.mjs':'markdown.mjs','/vendor/marked.mjs':'vendor/marked.mjs'};const file=assets[url.pathname];
    // A local app changes under the user's feet on every upgrade, and a cached app.js against a newer
    // server is a broken window with no obvious cause.
    if(req.method==='GET'&&file){res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.setHeader('Cache-Control','no-store');res.end(await fs.readFile(path.join(root,'public',file)));return;}
    json(res,404,{error:'Not found'});
  }catch(e){json(res,400,{error:safeError(e),...(e.details?{details:e.details}:{})});}finally{if(ownsMutation)mutating=false;}
});
const launchURL=`http://127.0.0.1:${port}/?k=${launchSecret}`;
server.listen(port,'127.0.0.1',async()=>{await fs.writeFile(path.join(data,'launch-url.txt'),launchURL+'\n',{mode:0o600});await fs.chmod(path.join(data,'launch-url.txt'),0o600);console.log(`Roundtable is ready: ${launchURL}\nPress Control+C to stop. Conversations are saved in ${data}.`);if(process.platform==='darwin'&&process.env.ROUNDTABLE_OPEN==='1')spawn('open',[launchURL],{stdio:'ignore'}).on('error',()=>{});});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{for(const job of jobs.values())job.controller.abort();void browser?.close();for(const c of clients)c.end();server.close();setTimeout(()=>process.exit(0),3000).unref();});
