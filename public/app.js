import {DraftStore,switchDraft,finishSend,appendFiles,applyDelta,SeenStore,unreadCount,finishedElsewhere} from './client-state.mjs';
import {prepareFile} from './attachments.mjs';
import {renderMarkdown} from './markdown.mjs';
import {avatarSVG,avatarState} from './avatar.mjs';
import {matchCommands,findRanges} from './palette.mjs';
import * as dictation from './dictation.mjs';
import {createBackdrop,loadPrefs,savePrefs} from './backdrop.mjs';
import {renderTaskList,countDone} from './tasklist.mjs';
const $=s=>document.querySelector(s);
let state,token,stream,editingAgents=[],rendered=new Map(),lastPeople='',toastTimer,creating=false,pendingFiles=[],drafts=new DraftStore(window.localStorage),sending=false,seen=new SeenStore(window.localStorage),lastRooms=[];
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function toast(text){const host=document.querySelector('dialog[open]')||document.body;host.append($('#toast'));$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,7000);}
async function api(route,body){const res=await fetch('/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Roundtable-Token':token},...(body===undefined?{}:{body:JSON.stringify({roomId:state?.id,...body})})});const value=await res.json();if(!res.ok){const e=new Error(value.error||'Request failed');e.details=value.details;throw e;}return value;}
// The task card stays open while the agent works and folds to a count once the reply completes, unless the user toggled it.
function renderMessageTasks(v,m){const t=m.tasks;v.tasks.hidden=!t?.tasks?.length;if(v.tasks.hidden)return;const live=m.status==='streaming';const {done,total}=renderTaskList(v.tasksBody,{tasks:t.tasks,hidden:t.hidden,label:live?'Working':'Steps'});v.tasksSummary.textContent=live?`Working · ${done}/${total}`:`${total} step${total===1?'':'s'}${m.status==='complete'?'':' · '+m.status}`;v.tasks.classList.toggle('live',live);if(!v.tasksTouched&&v.tasks.open!==live){v.tasks.dataset.auto='1';v.tasks.open=live;}}
function renderWorking(s){const live=s.busy?s.messages.find(m=>m.status==='streaming'):null,m=live?.tasks?live:[...s.messages].reverse().find(m=>m.tasks?.tasks?.length&&m.agentId);const section=$('#working');section.hidden=!m;if(!m)return;$('#working-title').textContent=m.status==='streaming'?'Working now':'Last work';$('#working-agent').textContent=m.speaker;$('#working-list').classList.toggle('live',m.status==='streaming');renderTaskList($('#working-list'),{tasks:m.tasks.tasks,hidden:m.tasks.hidden,label:m.status==='streaming'?'In progress':'Completed'});}
// Agents get a generated SVG mark tinted by provider class; the user keeps a plain initial.
function agentAvatar(agent,speaker){if(!agent)return el('div','avatar user',speaker.slice(0,1));const box=el('div','avatar '+(agent.provider||''));box.append(avatarSVG(agent));return box;}
function safeText(container,text){renderMarkdown(container,text,state?.agents||[]);}
function render(s){
 if(!state||state.id!==s.id){const draft=switchDraft(drafts,state?.id,s.id,{text:$('#message').value,files:pendingFiles});$('#message').value=draft?.text||'';pendingFiles=draft?.files||[];}
 const changed=state?.id!==s.id;
 state=s;if(changed)renderPending();$('#app-version').textContent='v'+s.version;
 for(const room of finishedElsewhere(lastRooms,s.rooms,s.id))notifyFinished(room);
 lastRooms=s.rooms;seen.set(s.id,s.messages.length);
 $('#room-title').textContent=s.title;renderRooms();
 const area=$('#messages'),atBottom=area.scrollHeight-area.scrollTop-area.clientHeight<110;
 $('#empty').hidden=!!s.messages.length;
 const keys=new Set(s.messages.map(m=>m.id));for(const [id,v]of rendered)if(!keys.has(id)){v.node.remove();rendered.delete(id);}
 for(const m of s.messages){let v=rendered.get(m.id);if(!v){
   const node=el('article','message'),avatar=agentAvatar(m.agentId?s.agents.find(a=>a.id===m.agentId)||{id:m.agentId,name:m.speaker,provider:m.provider}:null,m.speaker);
   const content=el('div','message-content'),head=el('div','message-header'),name=el('strong','',m.routine?m.speaker+' · routine':m.speaker),time=el('time','',new Date(m.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})),badge=el('span','badge');head.append(name,time,badge);if(m.provider)head.append(el('span','message-model',providerNames[m.provider]+' · '+m.model));if(m.routine)head.append(el('span','routine-chip','⟳ '+m.routine.title));
   const text=el('div','message-text'),tools=el('div','message-tools'),tasks=el('details','task-card'),tasksSummary=el('summary'),tasksBody=el('div','task-panel');tasks.append(tasksSummary,tasksBody);tasks.hidden=true;tasks.ontoggle=()=>{if(tasks.dataset.auto!=='1')v.tasksTouched=true;delete tasks.dataset.auto;};
   const copy=el('button','','Copy');copy.onclick=()=>navigator.clipboard.writeText(v.last||'').then(()=>toast('Copied')).catch(()=>toast('Select the text to copy it.'));tools.append(copy);const pin=el('button','','Pin');pin.type='button';pin.onclick=()=>api('pins',{id:m.id}).catch(e=>toast(e.message));tools.append(pin);
   const retry=el('button','','Retry');retry.onclick=()=>api('retry',{id:m.id}).catch(e=>toast(e.message));tools.append(retry);const listen=el('button','','Listen');listen.type='button';listen.onclick=()=>toggleSpeech(m.id,listen);tools.append(listen);const usage=el('small','usage');const files=el('div','message-attachments');content.append(head,tasks,text,files,usage,tools);node.append(avatar,content);$('#thread').append(node);v={node,avatar,text,badge,pin,retry,listen,usage,files,tasks,tasksSummary,tasksBody,last:null};rendered.set(m.id,v);
 }
 v.node.className='message '+m.status+(!m.agentId?' user-message':'');renderMessageTasks(v,m);if(m.agentId)v.avatar.dataset.state=avatarState({busy:m.status==='streaming',active:true,status:m.status});v.pin.hidden=m.status!=='complete'||m.kind==='error';v.pin.disabled=false;v.retry.hidden=!m.agentId||!['error','interrupted'].includes(m.status);v.listen.hidden=!m.agentId||m.status!=='complete'||m.kind==='error'||!s.voice?.ready;v.retry.disabled=s.busy;v.usage.textContent=usageText(m.usage);v.pin.setAttribute('aria-pressed',String((s.pinnedMessageIds||[]).includes(m.id)));v.pin.textContent=(s.pinnedMessageIds||[]).includes(m.id)?'Pinned':'Pin';v.badge.textContent=m.status==='streaming'?'replying':m.status==='interrupted'?'interrupted':m.kind==='error'?'connection issue':'';
 if(v.last!==m.text){const selection=window.getSelection();if(selection&&!selection.isCollapsed&&v.text.contains(selection.anchorNode))v.deferred=m.text||'';else {safeText(v.text,m.text||'');delete v.deferred;}v.last=m.text;v.files.replaceChildren();for(const f of m.attachments||[]){const b=el('button','file-chip',f.name);b.title=f.mime?'Download '+f.mime+(f.pages?' · '+f.pages+' page(s)':''):'Download shared text';b.onclick=async()=>{try{if(f.id){const r=await fetch('/api/files/'+f.id,{headers:{'X-Roundtable-Token':token}});if(!r.ok)throw new Error('File is unavailable.');download(f.name,await r.blob());}else download(f.name,f.text);}catch(e){toast(e.message);}};v.files.append(b);}}
 }
 if(atBottom)area.scrollTop=area.scrollHeight;
 $('#live-status').textContent=s.busy?`${s.agents.find(a=>a.id===s.activeAgent)?.name||'Room'} · ${s.activity||'Getting ready'}`:'';
 $('#mic-btn').hidden=!dictation.supported();$('#mic-btn').title=s.voice?.ready?'Dictate. Audio is sent to Google with your saved Gemini key.':'Connect Google Gemini in Connections to dictate.';$('#mic-btn').classList.toggle('unavailable',!s.voice?.ready);
 $('#send-btn').disabled=s.busy||!!s.archived;$('#stop-btn').hidden=!s.busy;$('#archived-bar').hidden=!s.archived;$('#message').disabled=!!s.archived;
 $('#message').placeholder=s.archived?'Unarchive this room to continue.':s.busy?'Pause to interrupt and send a new direction...':'Message the room, or @mention an agent...';
 $('#lounge-btn').setAttribute('aria-pressed',String(s.mode==='lounge'));$('#work-btn').setAttribute('aria-pressed',String(s.mode==='work'));
 $('#mode-caption').textContent=s.mode==='lounge'?'A little room to think together':(s.allowEdits?'Edits enabled · ':'Inspecting · ')+s.workspace;

 $('#member-count').textContent=s.agents.filter(a=>a.enabled).length+' agents';$('#notes-dot').textContent=s.notes?'•':'';
 const lastStatus=a=>s.messages.findLast(m=>m.agentId===a.id)?.status||'';
 const peopleKey=JSON.stringify([s.agents,s.activeAgent,s.busy,s.skills,s.agents.map(lastStatus)]);if(peopleKey!==lastPeople){lastPeople=peopleKey;$('#people').replaceChildren();const target=$('#target').value;$('#target').replaceChildren(new Option('Everyone','all'));
   for(const a of s.agents.filter(a=>a.enabled)){const person=el('div','person'+(a.id===s.activeAgent?' active':'')),av=agentAvatar(a,a.name),info=el('div');av.dataset.state=avatarState({busy:s.busy,active:s.activeAgent===a.id,status:lastStatus(a),archived:s.archived});info.append(el('div','person-name',a.name),el('div','person-role',a.role+' · @'+a.id),el('div','person-role',providerNames[a.provider]+' · '+(a.model||'Default model')));for(const id of a.skillIds||[]){const skill=s.skills.find(s=>s.id===id);if(skill)info.append(el('span','skill-chip',skill.name));}person.append(av,info);$('#people').append(person);$('#target').append(new Option(a.name,a.id));}if([...$('#target').options].some(o=>o.value===target))$('#target').value=target;
 }
 renderContext();renderWorking(s);renderUpcoming(s);
}
async function send(text){if(sending)return;sending=true;$('#send-btn').disabled=true;const roomId=state.id,sentFiles=[...pendingFiles],sentText=$('#message').value;try{const result=await api('message',{roomId,text:text.trim()||'Please review the attached files.',target:$('#target').value,attachments:sentFiles});if(result.routedBy?.length)toast('Routed by @mention: '+result.routedBy.join(', '));const current=state.id===roomId?{text:$('#message').value,files:pendingFiles}:drafts.get(roomId)||{text:'',files:[]};const remaining=finishSend(current,{text:sentText,files:sentFiles});drafts.set(roomId,remaining);if(state.id===roomId){$('#message').value=remaining.text;pendingFiles=remaining.files;renderPending();}}catch(e){toast(e.message);}finally{sending=false;$('#send-btn').disabled=state.busy;}}
$('#composer').onsubmit=e=>{e.preventDefault();if(!state.busy&&!state.archived&&($('#message').value.trim()||pendingFiles.length))void send($('#message').value);};
$('#message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#composer').requestSubmit();}};
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('#message').value=b.dataset.prompt.replace('@claude',state.agents[1]?'@'+state.agents[1].id:'').replace('@codex',state.agents[0]?'@'+state.agents[0].id:'');$('#message').focus();});
$('#stop-btn').onclick=()=>api('stop',{}).catch(e=>toast(e.message));

const providerNames={codex:'Codex',claude:'Claude Code',google:'Google Gemini API',agentrouter:'AgentRouter API',antigravity:'Antigravity'};
function freshAgent(i){return {id:((i===0?'codex':i===1?'claude':'agent')+'_'+crypto.randomUUID().slice(0,6)),name:i%2?'Claude':'Codex',provider:i%2?'claude':'codex',role:i%2?'Reviewer':'Builder',instructions:'Contribute to your assigned job. Read and respond to earlier contributions when useful. Give one concise reply.',enabled:true,model:'',effort:'auto'};}
function openSettings(mode,isNew=false){if(state.busy&&!isNew)return toast('Stop this room before changing its agents.');creating=isNew;const f=$('#settings-form');f.elements.title.value=isNew?'':state.title;f.elements.mode.value=mode||state.mode;f.elements.workspace.value=state.workspace;f.elements.notes.value=isNew?'':state.notes;f.elements.allowEdits.checked=isNew?false:state.allowEdits;editingAgents=isNew?[freshAgent(0),freshAgent(1)]:structuredClone(state.agents);$('#settings-title').textContent=isNew?'Create a room':'Room settings';$('#settings-form .primary').textContent=isNew?'Create room':'Save changes';$('#room-actions').hidden=isNew;renderRoomSecrets();$('#archive-room').textContent=state.archived?'Unarchive room':'Archive room';renderEditors();$('#settings').showModal();}
function renderEditors(){const parent=$('#agent-editors');parent.replaceChildren();$('#agent-count').value=editingAgents.length;editingAgents.forEach((a,index)=>{
 const box=el('div','agent-editor'),row=el('div','row');box.append(el('h3','',`Agent ${index+1}`));const order=el('div','agent-order');for(const [label,delta]of [['Move earlier',-1],['Move later',1]]){const b=el('button','',label);b.type='button';b.disabled=index+delta<0||index+delta>=editingAgents.length;b.onclick=()=>{[editingAgents[index],editingAgents[index+delta]]=[editingAgents[index+delta],editingAgents[index]];renderEditors();};order.append(b);}box.append(order);
 function field(title,key,type='input'){const label=el('label','',title),input=el(type);input.value=a[key]||'';if(type==='textarea'){input.rows=2;input.maxLength=6000;}else input.maxLength=key==='name'?40:key==='model'?200:120;input.oninput=()=>a[key]=input.value;label.append(input);return label;}
 row.append(field('Name','name'));const label=el('label','','Provider'),select=el('select');for(const [id,name]of Object.entries(providerNames))select.append(new Option(name,id));select.value=a.provider;select.onchange=()=>{a.provider=select.value;a.model='';a.effort='auto';renderEditors();};label.append(select);row.append(label);box.append(row);
 const modelLabel=field('Model ID','model'),modelInput=modelLabel.querySelector('input');modelInput.placeholder=['google','agentrouter'].includes(a.provider)?'Choose or enter a model ID':'Provider default';modelInput.required=['google','agentrouter'].includes(a.provider);box.append(modelLabel);
 const models=el('select');models.setAttribute('aria-label',`Available models for ${a.name}`);models.append(new Option('Choose a loaded model',''));models.onchange=()=>{if(models.value){a.model=models.value;modelInput.value=models.value;syncEffort();}};
 const status=el('div','field-status');status.setAttribute('role','status');
 const load=el('button','load-models','Load available models');load.type='button';load.onclick=async()=>{load.disabled=true;status.className='field-status';status.textContent='Checking models...';try{const data=await api('models?provider='+a.provider);models.replaceChildren(new Option('Choose a model',''));for(const m of data.models)models.append(new Option(m.name||m.id,m.id));status.textContent=`${data.models.length} models available. Choose one above.`;}catch(e){status.className='field-status error';status.textContent=e.message;}finally{load.disabled=false;}};const modelRow=el('div','model-row');modelRow.append(models,load);box.append(modelRow,status);
 const effortLabel=el('label','','Speed / reasoning'),effort=el('select');for(const [value,name]of [['auto','Provider default'],['low','Quick · less reasoning'],['medium','Balanced'],['high','Thorough · more reasoning']]){if(a.provider==='google'&&value==='medium')continue;effort.append(new Option(name,value));}effort.value=a.effort||'auto';effort.disabled=a.provider==='agentrouter';effort.onchange=()=>a.effort=effort.value;effortLabel.append(effort);box.append(effortLabel,el('p','help','Reasoning effort depends on the chosen model. It does not guarantee response speed. Use Provider default for the widest compatibility.'),field('Job','role'),field('Personal instructions','instructions','textarea'));
 function syncEffort(){const pinned=a.provider==='antigravity'&&/-(low|medium|high)$/.exec(a.model||'');if(pinned){a.effort='auto';effort.value='auto';effort.disabled=true;status.textContent=`${pinned[1]} reasoning is included in this model. No separate effort flag will be sent.`;}else{effort.disabled=a.provider==='agentrouter';}}
 modelInput.oninput=()=>{a.model=modelInput.value;syncEffort();};syncEffort();
 const skillTitle=el('h4','','Skills'),picker=el('div','skill-picker');for(const skill of state.skills){const label=el('label'),check=el('input');check.type='checkbox';check.checked=(a.skillIds||[]).includes(skill.id);check.onchange=()=>{const ids=new Set(a.skillIds||[]);if(check.checked)ids.add(skill.id);else ids.delete(skill.id);a.skillIds=[...ids];};label.title=skill.limitations?'Instructions only. '+skill.limitations:skill.description;label.append(check,document.createTextNode(skill.name));if(skill.limitations)label.append(el('small','','instructions only'));picker.append(label);}box.append(skillTitle,picker,el('p','help','Reusable instructions for this agent. Create or import more in Skills.'));
 const enabled=el('label','checkbox'),check=el('input');check.type='checkbox';check.checked=a.enabled;check.onchange=()=>a.enabled=check.checked;enabled.append(check,document.createTextNode(`Enabled · @${a.id}`));box.append(enabled);parent.append(box);
 });$('#add-agent').disabled=editingAgents.length>=4;}
$('#agent-count').onchange=e=>{const n=Number(e.target.value);while(editingAgents.length<n)editingAgents.push(freshAgent(editingAgents.length));editingAgents.length=n;renderEditors();};
$('#add-agent').onclick=()=>{if(editingAgents.length<4){editingAgents.push(freshAgent(editingAgents.length));renderEditors();}};
$('#settings-form').onsubmit=async e=>{e.preventDefault();const f=e.target;try{if(f.elements.workspace.value){const resolved=await api('workspace/resolve',{workspace:f.elements.workspace.value});f.elements.workspace.value=resolved.workspace;if(f.elements.allowEdits.checked&&!confirm('Allow agents to edit files in '+resolved.workspace+'?'))return;}if(!creating)await saveRoomSecrets();await api(creating?'rooms/create':'settings',{title:f.elements.title.value,mode:f.elements.mode.value,workspace:f.elements.workspace.value,allowEdits:f.elements.allowEdits.checked,notes:f.elements.notes.value,agents:editingAgents});$('#settings').close();document.body.classList.remove('show-rooms');}catch(e){toast(e.message);}};
$('#close-settings').onclick=()=>$('#settings').close();for(const id of ['settings-btn','edit-agents'])$('#'+id).onclick=()=>openSettings();for(const id of ['notes-btn','context-notes'])$('#'+id).onclick=async()=>{const roomId=state.id,notes=prompt('Shared notes for this room',state.notes);if(notes!==null)try{await api('notes',{roomId,notes});}catch(e){toast(e.message);}};
$('#lounge-btn').onclick=()=>{if(state.mode!=='lounge')openSettings('lounge');};$('#work-btn').onclick=()=>{if(state.mode!=='work')openSettings('work');};
$('#new-btn').onclick=()=>openSettings(undefined,true);
$('#menu-btn').onclick=()=>document.body.classList.toggle('show-rooms');
function exportRoom(){const text=`# ${state.title}\n\n## Shared notes\n${state.notes||'(none)'}\n\n`+state.messages.map(m=>`## ${m.speaker} (${m.time})\n\n${m.text}\n${(m.attachments||[]).map(f=>'\n### Attachment: '+f.name+'\n\n'+(f.text||'[Media attachment: '+f.mime+']')).join('\n')}`).join('\n');const a=el('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/markdown'}));a.download=exportName(state.title);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('#export-btn').onclick=exportRoom;
async function toggleArchive(target={id:state.id,title:state.title}){try{const r=await api('rooms/archive',{id:target.id});$('#settings').close();toast(r.archived?`${target.title} was archived. Find it under Archived in the room list.`:`${target.title} is active again.`);}catch(e){toast(e.message);}}
$('#archive-room').onclick=()=>toggleArchive();$('#unarchive-btn').onclick=()=>toggleArchive();
let deleting=null;
function askDelete(target={id:state.id,title:state.title}){deleting=target;const f=$('#delete-form');f.reset();f.querySelector('[type=submit]').disabled=true;$('#delete-title').textContent=target.title;$('#delete-export').hidden=target.id!==state.id;$('#delete-dialog').showModal();f.elements.title.focus();}
$('#delete-room').onclick=()=>askDelete();
$('#delete-form').elements.title.oninput=e=>{$('#delete-form').querySelector('[type=submit]').disabled=e.target.value!==deleting?.title;};
$('#delete-export').onclick=exportRoom;for(const id of ['close-delete','cancel-delete'])$('#'+id).onclick=()=>$('#delete-dialog').close();
$('#delete-form').onsubmit=async e=>{e.preventDefault();const target=deleting;try{await api('rooms/delete',{id:target.id,title:e.target.elements.title.value});$('#delete-dialog').close();$('#settings').close();toast(`${target.title} was deleted.`);}catch(err){toast(err.message);}};
// One floating menu is reused for every room row; it closes on outside click and Escape like the plus menu.
function openRoomMenu(anchor,r){const menu=$('#room-menu');menu.replaceChildren();const add=(label,fn)=>{const b=el('button','',label);b.type='button';b.onclick=()=>{closeRoomMenu();fn();};menu.append(b);return b;};
 add(r.archived?'Unarchive':'Archive',()=>toggleArchive(r));if(r.id===state.id)add('Export conversation',exportRoom);add('Delete…',()=>askDelete(r)).className='danger';
 if(r.busy)for(const b of menu.querySelectorAll('button'))if(b.textContent!=='Export conversation'){b.disabled=true;b.title='Stop this room first';}
 const at=anchor.getBoundingClientRect();menu.style.top=Math.min(at.bottom+4,innerHeight-160)+'px';menu.style.left=Math.min(at.left,innerWidth-230)+'px';menu.hidden=false;anchor.setAttribute('aria-expanded','true');menu.dataset.anchor=r.id;}
function closeRoomMenu(){const menu=$('#room-menu');if(menu.hidden)return;menu.hidden=true;for(const b of document.querySelectorAll('.room-more[aria-expanded=true]'))b.setAttribute('aria-expanded','false');}
function renderConnections(info){const host=$('#api-connections');host.replaceChildren();for(const provider of ['google','agentrouter']){const config=info[provider],form=el('form','api-form');form.append(el('h3','',providerNames[provider]),el('p','help',config.configured?'Key saved. Send a message to verify model access.':'Add your API connection.'));
 const keyLabel=el('label','','API key'),key=el('input');key.type='password';key.autocomplete='new-password';key.placeholder=config.configured?'Leave blank to keep saved key':'Paste key here on your Mac';keyLabel.append(key);form.append(keyLabel);
 let voiceFields={};if(provider==='google'){const box=el('details','voice-settings'),summary=el('summary','','Voice: dictation and read aloud');box.append(summary,el('p','help','Dictation sends your recording to Gemini for transcription; Listen asks a Gemini TTS model to read a reply. Both use this key and may count against its quota. Nothing is stored by Roundtable.'));
  for(const [field,label,placeholder]of [['dictationModel','Dictation model','gemini-2.5-flash'],['voiceModel','Voice model','gemini-2.5-flash-preview-tts']]){const l=el('label','',label),input=el('input');input.value=config[field]||'';input.placeholder=placeholder;input.maxLength=200;voiceFields[field]=input;l.append(input);box.append(l);}
  const vl=el('label','','Voice'),voice=el('select');for(const name of config.voices||[])voice.append(new Option(name,name));voice.value=config.voiceName||'Kore';voiceFields.voiceName=voice;vl.append(voice);box.append(vl);form.append(box);}
 let base,protocol;if(provider==='agentrouter'){const label=el('label','','API base URL');base=el('input');base.type='url';base.required=true;base.value=config.baseURL||'https://agentrouter.org';label.append(base);form.append(label);const pl=el('label','','API format');protocol=el('select');protocol.append(new Option('OpenAI chat completions','openai'),new Option('Anthropic messages','anthropic'));protocol.value=config.baseURL?config.protocol:'anthropic';pl.append(protocol);form.append(pl,el('p','help','For the Claude setup, use https://agentrouter.org and Anthropic messages. Roundtable adds /v1 automatically. Live AgentRouter access is still unverified.'));}
 const feedback=el('div','diagnostic');feedback.hidden=true;feedback.setAttribute('role','status');const save=el('button','primary','Save connection');save.type='submit';form.append(save);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const result=await api('connections',{provider,...(key.value?{key:key.value}:{}),...(base?{baseURL:base.value,protocol:protocol.value}:{}),...Object.fromEntries(Object.entries(voiceFields).map(([k,f])=>[k,f.value]))});key.value='';renderConnections(result);toast('Connection saved');}catch(e){feedback.hidden=false;feedback.className='diagnostic error';feedback.textContent=e.message;}finally{save.disabled=false;}};
 if(config.configured){const remove=el('button','','Remove key');remove.type='button';remove.onclick=()=>api('connections',{provider,remove:true}).then(renderConnections).catch(e=>toast(e.message));form.append(remove);}const testBox=el('div','test-controls'),modelLabel=el('label','','Model to test'),model=el('input');model.placeholder='Exact model ID';modelLabel.append(model);const test=el('button','','Test saved connection');test.type='button';test.disabled=!config.configured;const notice=el('p','help','Sends a short test request using the saved key. Provider usage may apply.');test.onclick=async()=>{feedback.hidden=false;feedback.className='diagnostic';feedback.textContent='Testing the saved connection...';test.disabled=true;try{const r=await api('connections/test',{provider,model:model.value});feedback.textContent=r.message+' Reply: '+r.sample;}catch(e){feedback.className='diagnostic error';feedback.textContent=e.message+(e.details?'\n\n'+JSON.stringify(e.details,null,2):'');}finally{test.disabled=false;}};testBox.append(modelLabel,notice,test);form.append(testBox,feedback);if(provider==='agentrouter'){const support=el('p','help','If the response says unauthorized client detected, AgentRouter must authorize this application. Changing models does not resolve client authorization.');form.append(support);}host.append(form);}}
async function connections(){for(const id of ['codex','claude','antigravity'])$('#'+id+'-status').textContent='Checking...';try{const r=await api('status');for(const id of ['codex','claude','antigravity']){const d=r.details?.[id],node=$('#'+id+'-status');node.textContent=r[id]?'Installed: '+(d?.version||'installed'):d?.status==='broken'?'Found, but installation cannot run':'Command not found';node.title=d?.ok?d.path:d?.reason||'';const detail=$('#'+id+'-detail');if(detail)detail.textContent=d?.ok?d.path:d?.reason||'';};renderConnections(r.connections);let note=$('#ignored-env');if(!note){note=el('p','help');note.id='ignored-env';$('#api-connections').before(note);}note.textContent=r.ignoredEnvironment?.length?`${r.ignoredEnvironment.length} API and gateway environment variables were ignored so native agents use their own logins. CLI configuration files can still select other providers.`:'';}catch(e){toast(e.message);}}
$('#connection-btn').onclick=()=>{$('#connections').showModal();void connections();};$('#close-connections').onclick=()=>$('#connections').close();$('#recheck').onclick=connections;

// Dictation: record locally as WAV, then transcribe through the saved Gemini key. The transcript is inserted at the cursor and never sent as a message.
let recorder=null;
function insertAtCursor(field,text){const start=field.selectionStart??field.value.length,end=field.selectionEnd??start,before=field.value.slice(0,start),after=field.value.slice(end);const lead=before&&!/\s$/.test(before)?' ':'',tail=after&&!/^\s/.test(after)?' ':'';field.value=before+lead+text+tail+after;const at=(before+lead+text).length;field.setSelectionRange(at,at);field.dispatchEvent(new Event('input'));}
async function toggleDictation(){const btn=$('#mic-btn'),status=$('#mic-status');
 if(recorder){const rec=recorder;recorder=null;btn.setAttribute('aria-pressed','false');btn.classList.remove('listening');status.textContent='Transcribing...';btn.disabled=true;
  try{const result=await rec.stop();if(!result||result.seconds<0.4){status.textContent='';return;}const data=await dictation.toBase64(result.blob);const r=await api('dictate',{data,mime:'audio/wav',language:navigator.language});if(r.text){insertAtCursor($('#message'),r.text);$('#message').focus();status.textContent='';}else status.textContent='No speech was heard.';}
  catch(e){status.textContent='';toast(e.message);}finally{btn.disabled=false;setTimeout(()=>{if(status.textContent==='No speech was heard.')status.textContent='';},4000);}return;}
 if(!state.voice?.ready)return toast('Connect Google Gemini in Connections to dictate. Audio is transcribed with your key; nothing is stored.');
 try{recorder=await dictation.startRecording({onLevel:v=>btn.style.setProperty('--level',v.toFixed(2)),onLimit:()=>{toast('Dictation stops after 60 seconds. Transcribing what was said.');void toggleDictation();}});btn.setAttribute('aria-pressed','true');btn.classList.add('listening');status.textContent='Listening. Click the mic again to stop.';}
 catch(e){recorder=null;toast(e.name==='NotAllowedError'?'Microphone access was denied. Allow it for 127.0.0.1 in the browser and try again.':'Could not start the microphone: '+e.message);}}
$('#mic-btn').onclick=()=>void toggleDictation();
document.addEventListener('keydown',e=>{if(e.key==='m'&&(e.metaKey||e.ctrlKey)&&e.shiftKey&&!$('#mic-btn').hidden){e.preventDefault();void toggleDictation();}});
// Read aloud: one message plays at a time; audio is fetched once per message and kept for replays in this page session.
const speech={audio:null,button:null,id:null,cache:new Map()};
function stopSpeech(){if(speech.audio){speech.audio.pause();speech.audio=null;}if(speech.button){speech.button.textContent='Listen';speech.button.setAttribute('aria-pressed','false');}speech.button=null;speech.id=null;}
async function toggleSpeech(id,button){if(speech.id===id){stopSpeech();return;}stopSpeech();speech.id=id;speech.button=button;button.textContent='Loading voice...';button.disabled=true;
 try{let url=speech.cache.get(id);if(!url){const r=await fetch('/api/speak',{method:'POST',headers:{'Content-Type':'application/json','X-Roundtable-Token':token},body:JSON.stringify({roomId:state.id,id})});if(!r.ok)throw new Error((await r.json()).error||'Voice request failed');if(r.headers.get('X-Roundtable-Truncated')==='true')toast('Reading the first 4,000 characters of this reply.');url=URL.createObjectURL(await r.blob());speech.cache.set(id,url);}
  if(speech.id!==id)return;const audio=new Audio(url);speech.audio=audio;audio.onended=stopSpeech;audio.onerror=()=>{stopSpeech();toast('The browser could not play this audio.');};await audio.play();button.textContent='Stop';button.setAttribute('aria-pressed','true');}
 catch(e){stopSpeech();toast(e.message);}finally{button.disabled=false;}}
// Appearance preferences live in this browser; the backdrop is created lazily and removed entirely when switched off.
let prefs=loadPrefs(window.localStorage),backdrop=null;
function applyPrefs(){if(prefs.backdrop){backdrop||=createBackdrop();if(backdrop.supported)backdrop.start();$('#backdrop-note').hidden=backdrop.supported;}else if(backdrop){backdrop.remove();backdrop=null;}
 document.documentElement.dataset.motion=prefs.motion==='reduced'?'reduced':'';
 for(const [id,on]of [['#pref-backdrop',prefs.backdrop],['#pref-motion',prefs.motion==='reduced'],['#pref-notify',prefs.notify]])$(id).checked=on;
 $('#notify-note').textContent=!('Notification'in window)?'This browser cannot show desktop notifications.':Notification.permission==='denied'?'Your browser is blocking notifications for this page. Allow them in its site settings first.':'A desktop notification when a room you are not looking at finishes a turn. Your browser asks for permission the first time.';}
$('#prefs-btn').onclick=()=>{applyPrefs();$('#preferences').showModal();};$('#close-prefs').onclick=()=>$('#preferences').close();
$('#pref-backdrop').onchange=e=>{prefs={...prefs,backdrop:e.target.checked};savePrefs(window.localStorage,prefs);applyPrefs();};
$('#pref-motion').onchange=e=>{prefs={...prefs,motion:e.target.checked?'reduced':'system'};savePrefs(window.localStorage,prefs);applyPrefs();};
$('#pref-notify').onchange=async e=>{
 let on=e.target.checked;
 // Asking only when the box is ticked keeps the permission prompt tied to a deliberate action.
 if(on&&'Notification'in window&&Notification.permission==='default'){try{on=await Notification.requestPermission()==='granted';}catch{on=false;}}
 if(on&&(!('Notification'in window)||Notification.permission!=='granted')){on=false;toast('Your browser did not allow notifications.');}
 prefs={...prefs,notify:on};savePrefs(window.localStorage,prefs);applyPrefs();};
try{applyPrefs();}catch(e){console.warn('Backdrop disabled:',e.message);$('#backdrop-note').hidden=false;}
// A room the user is not looking at has finished its turn. Notifying is opt-in and silent on failure:
// a blocked or unsupported Notification must never interrupt the conversation.
function notifyFinished(room){
 if(!prefs.notify||!('Notification'in window)||Notification.permission!=='granted')return;
 try{
  const note=new Notification(room.title,{body:`${room.agents} agent${room.agents>1?'s':''} finished replying.`,tag:'roundtable-'+room.id,silent:true});
  note.onclick=()=>{window.focus();api('rooms/select',{id:room.id}).catch(()=>{});note.close();};
 }catch{}
}
function exportName(title){return (title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'roundtable')+'-conversation.md';}
function download(name,text){const a=el('a');a.href=URL.createObjectURL(text instanceof Blob?text:new Blob([text],{type:'text/plain;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function roomLink(r){const row=el('div','room-row'),b=el('button','room-link'+(r.id===state.id?' selected':''));const unread=unreadCount(r,{get:id=>seen.get(id),selectedId:state.id});
 const title=el('span','',r.title);if(unread)title.append(el('b','unread-dot',unread>9?'9+':String(unread)));
 b.append(title,el('small','',`${r.agents} agents · ${r.busy?'Replying…':r.count+' messages'}`));b.classList.toggle('has-unread',!!unread);b.title=r.busy?'Agents are replying in this room':unread?`${unread} new message${unread>1?'s':''}`:'';b.onclick=()=>api('rooms/select',{id:r.id}).then(()=>document.body.classList.remove('show-rooms')).catch(e=>toast(e.message));const more=el('button','room-more','⋯');more.type='button';more.setAttribute('aria-label','Options for '+r.title);more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');more.onclick=e=>{e.stopPropagation();if($('#room-menu').dataset.anchor===r.id&&!$('#room-menu').hidden)closeRoomMenu();else openRoomMenu(more,r);};row.append(b,more);return row;}
function renderRooms(){const query=$('#room-search').value.toLowerCase(),shown=state.rooms.filter(r=>r.title.toLowerCase().includes(query)),archived=shown.filter(r=>r.archived);$('#room-list').replaceChildren(...shown.filter(r=>!r.archived).map(roomLink));$('#archived-list').replaceChildren(...archived.map(roomLink));$('#archived-rooms').hidden=!archived.length;$('#archived-count').textContent=`(${archived.length})`;if(state.archived)$('#archived-rooms').open=true;}
$('#room-search').oninput=renderRooms;
function renderContext(){const s=state;let stats=$('#context-stats');if(!stats){stats=el('p','help');stats.id='context-stats';$('#notes-preview').after(stats);const next=el('button','','Continue in a new room');next.onclick=async()=>{const notes=prompt('Decisions and next steps to carry forward',state.notes);if(notes)try{await api('rooms/continue',{notes});}catch(e){toast(e.message);}};stats.after(next);}stats.textContent=[usageText(s.usage),s.capacity?.used>s.capacity?.limit*.75?`${s.capacity.used.toLocaleString()} / ${s.capacity.limit.toLocaleString()} context characters`:null].filter(Boolean).join(' · ');$('#notes-preview').textContent=s.notes||'Add goals, preferences or project context for everyone.';$('#pins').replaceChildren();for(const m of s.messages.filter(m=>(s.pinnedMessageIds||[]).includes(m.id))){const b=el('button','pin-item');b.append(el('strong','',m.speaker),document.createTextNode(m.text.slice(0,140)+(m.text.length>140?'...':'')));b.onclick=()=>{rendered.get(m.id)?.node.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});document.body.classList.remove('show-context');};$('#pins').append(b);}$('#turn-roster').replaceChildren();for(const [i,a]of s.agents.filter(a=>a.enabled).entries())$('#turn-roster').append(el('span','turn-person'+(s.activeAgent===a.id?' active':''),`${i+1}. ${a.name}`));}
$('#context-btn').onclick=()=>{if(innerWidth>1200){document.body.classList.toggle('no-context');$('#context-btn').setAttribute('aria-expanded',String(!document.body.classList.contains('no-context')));}else{document.body.classList.toggle('show-context');$('#context-btn').setAttribute('aria-expanded',String(document.body.classList.contains('show-context')));}};
function closePlus(){$('#plus-menu').hidden=true;$('#plus-btn').setAttribute('aria-expanded','false');}
$('#plus-btn').onclick=()=>{$('#plus-menu').hidden=!$('#plus-menu').hidden;$('#plus-btn').setAttribute('aria-expanded',String(!$('#plus-menu').hidden));};
document.addEventListener('click',e=>{if(!e.target.closest('.plus-wrap'))closePlus();if(!e.target.closest('#room-menu,.room-more'))closeRoomMenu();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePlus();closeRoomMenu();document.body.classList.remove('show-context','show-rooms');}});
$('#attach-btn').onclick=()=>{closePlus();$('#attachment-input').click();};$('#plus-agent').onclick=()=>{closePlus();openSettings();if(!state.busy&&editingAgents.length<4){editingAgents.push(freshAgent(editingAgents.length));renderEditors();$('#agent-editors').lastElementChild.scrollIntoView({block:'start'});}};
$('#plus-notes').onclick=()=>{closePlus();$('#notes-btn').click();};
function renderPending(){if(state)drafts.set(state.id,{text:$('#message').value,files:pendingFiles});$('#pending-files').replaceChildren();pendingFiles.forEach((f,i)=>{const chip=el('div','file-chip',f.name),remove=el('button','','×');remove.type='button';remove.setAttribute('aria-label','Remove '+f.name);remove.onclick=()=>{pendingFiles.splice(i,1);renderPending();};chip.append(remove);$('#pending-files').append(chip);});}
$('#attachment-input').onchange=async e=>{const roomId=state.id,originalFiles=[...pendingFiles];e.target.disabled=true;try{const selected=[...e.target.files];if(originalFiles.length+selected.length>3)throw new Error('Attach up to three files.');const files=[];for(const file of selected){const prepared=await prepareFile(file);files.push(prepared.mime?await api('uploads',{...prepared,roomId}):prepared);}if([...originalFiles,...files].reduce((n,f)=>n+(f.text?.length||0),0)>40000)throw new Error('Attachments must total under 40,000 characters.');const next=appendFiles(drafts,roomId,files,state.id===roomId?{text:$('#message').value,files:pendingFiles}:undefined);if(state.id===roomId){pendingFiles=next.files;renderPending();}else toast('Files added to the room where you selected them.');}catch(e){toast(e.message);}finally{e.target.value='';e.target.disabled=false;}};
function openSkills(){closePlus();renderSkills();$('#skills-dialog').showModal();}
$('#skills-btn').onclick=openSkills;$('#plus-skill').onclick=openSkills;$('#close-skills').onclick=()=>$('#skills-dialog').close();
function renderSkills(){$('#skill-list').replaceChildren();for(const skill of state.skills){const card=el('div','skill-card'),info=el('div');info.append(el('h3','',skill.name),el('p','',skill.description));if(skill.limitations)info.append(el('p','limitation','Instructions only: '+skill.limitations));const edit=el('button','','Edit');edit.onclick=()=>editSkill(skill);const remove=el('button','','Delete');remove.onclick=async()=>{if(confirm('Delete this skill and remove it from all agents?'))try{await api('skills/delete',{id:skill.id});state=(await api('bootstrap')).state;renderSkills();}catch(e){toast(e.message);}};card.append(info,edit,remove);$('#skill-list').append(card);}}
function editSkill(skill={}){const form=$('#skill-form');form.hidden=false;for(const name of ['id','name','description','instructions','limitations'])form.elements[name].value=skill[name]||'';$('#skill-editor-title').textContent=skill.id?'Edit skill':'New skill';renderImportNotice(skill);form.scrollIntoView({block:'start'});form.elements.name.focus();}
// The limitation notice stays visible in the editable preview so a package skill is never saved as if it were complete.
function renderImportNotice(skill){const box=$('#skill-import-notice');box.replaceChildren();box.hidden=!skill.limitations&&!skill.truncated;if(box.hidden)return;
 if(skill.limitations)box.append(el('p','',skill.limitations));if(skill.truncated)box.append(el('p','','The instructions were cut at 12,000 characters. Trim them before saving.'));
 if(skill.flagged?.length){const list=el('ul');for(const f of skill.flagged)list.append(el('li','',`Line ${f.line}: ${f.text}`));box.append(el('p','','Lines that will not work here:'),list);}
 box.append(el('p','help','Assigning this skill to an agent will not make those files available. Edit the instructions to keep only the parts that apply.'));}
async function importFromUrl(url){const picks=$('#skill-picks');picks.hidden=false;picks.replaceChildren(el('p','help','Fetching from GitHub...'));
 try{const r=await api('skills/fetch',{url});
  if(r.kind==='skill'){picks.hidden=true;picks.replaceChildren();editSkill({...r.skill,description:r.skill.description||'Imported from '+r.skill.source.replace(/^https:\/\/github\.com\//,'')+'. Review before saving.'});return;}
  picks.replaceChildren(el('p','help',`${r.skills.length} skill${r.skills.length>1?'s':''} in ${r.repo}${r.truncated?' (large repository, the listing may be incomplete)':''}. Choose one to preview.`));
  for(const s of r.skills){const b=el('button','skill-pick');b.type='button';b.append(el('strong','',s.name),el('small','',s.path));b.onclick=()=>importFromUrl(s.url);picks.append(b);}
 }catch(e){picks.replaceChildren(el('p','field-status error',e.message));}}
$('#skill-url-form').onsubmit=e=>{e.preventDefault();void importFromUrl(e.target.elements.url.value.trim());};
$('#create-skill').onclick=()=>editSkill();$('#cancel-skill').onclick=()=>{$('#skill-form').hidden=true;$('#skill-picks').hidden=true;};
$('#skill-form').onsubmit=async e=>{e.preventDefault();const f=e.target;try{await api('skills/save',Object.fromEntries(new FormData(f)));state=(await api('bootstrap')).state;f.hidden=true;renderSkills();toast('Skill saved. Assign it in an agent’s settings.');}catch(e){toast(e.message);}};
$('#import-skill').onclick=()=>$('#skill-import-input').click();$('#skill-import-input').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>48000)throw new Error('Import a Markdown file under 12,000 characters.');const text=await file.text();if(text.length>12000||text.includes('\0'))throw new Error('Import a text Markdown file under 12,000 characters.');const front=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);const name=front?.[1].match(/^name:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g,'')||file.name.replace(/\.(md|txt)$/i,'');editSkill({name:name.slice(0,64),description:'Imported instructions. Review before saving.',instructions:front?text.slice(front[0].length):text});}catch(e){toast(e.message);}finally{e.target.value='';}};
function usageText(u){if(!u)return '';return [u.inputTokens!==undefined?u.inputTokens.toLocaleString()+' in':null,u.outputTokens!==undefined?u.outputTokens.toLocaleString()+' out':null,u.costUsd!==undefined?'$'+u.costUsd.toFixed(4)+' provider estimate':null].filter(Boolean).join(' / ');}
// ---- Routines -------------------------------------------------------------
const scheduleFields={daily:['time','days'],every:['minutes'],once:['at']};
function syncScheduleFields(){
 const kind=$('#routine-form').elements.kind.value;
 for(const [name,ids]of Object.entries({minutes:['field-minutes'],time:['field-time'],days:['field-days'],at:['field-at']}))
  for(const id of ids)$('#'+id).hidden=!(scheduleFields[kind]||[]).includes(name);
}
function routineRooms(){return (state?.rooms||[]).filter(r=>!r.archived);}
function syncRoutineTargets(roomId,selected){
 const select=$('#routine-form').elements.target,room=state?.rooms.find(r=>r.id===roomId);
 select.replaceChildren(new Option('Everyone','all'));
 // The room list carries counts, not agents, so only the open room can offer individual participants.
 if(room&&room.id===state.id)for(const a of state.agents.filter(a=>a.enabled))select.append(new Option(a.name,a.id));
 select.value=[...select.options].some(o=>o.value===selected)?selected:'all';
}
function editRoutine(routine={}){
 const form=$('#routine-form');form.hidden=false;
 form.elements.roomId.replaceChildren(...routineRooms().map(r=>new Option(r.title,r.id)));
 form.elements.id.value=routine.id||'';form.elements.title.value=routine.title||'';
 form.elements.instruction.value=routine.instruction||'';
 form.elements.roomId.value=routine.roomId||state.id;
 const s=routine.schedule||{kind:'daily',time:'09:00',days:'all'};
 form.elements.kind.value=s.kind;form.elements.minutes.value=s.minutes||60;form.elements.time.value=s.time||'09:00';
 form.elements.days.value=s.days||'all';form.elements.at.value=s.at?new Date(s.at).toISOString().slice(0,16):'';
 syncScheduleFields();syncRoutineTargets(form.elements.roomId.value,routine.target||'all');
 $('#routine-editor-title').textContent=routine.id?'Edit routine':'New routine';
 form.scrollIntoView({block:'start'});form.elements.title.focus();
}
function renderRoutines(){
 const host=$('#routine-list');host.replaceChildren();
 const list=state?.routines||[];
 if(!list.length)host.append(el('p','help','No routines yet.'));
 for(const r of list){
  const card=el('div','skill-card'),info=el('div'),room=state.rooms.find(x=>x.id===r.roomId);
  info.append(el('h3','',r.title));
  const when=el('p','',`${r.scheduleText} · ${room?room.title:'room missing'}${r.target==='all'?'':' · @'+r.target}`);info.append(when);
  const status=[r.enabled?null:'Paused',r.lastRun?'Last ran '+new Date(r.lastRun).toLocaleString():'Never run',
   r.enabled&&r.nextRun?'Next '+new Date(r.nextRun).toLocaleString():null,r.lastReason||null].filter(Boolean).join(' · ');
  info.append(el('p',r.lastReason?'limitation':'help',status));
  const toggle=el('button','',r.enabled?'Pause':'Resume');toggle.onclick=()=>api('routines/toggle',{id:r.id}).catch(e=>toast(e.message));
  const run=el('button','','Test');run.onclick=async()=>{run.disabled=true;try{await api('routines/run',{id:r.id});toast(`"${r.title}" sent its message to ${room?room.title:'its room'}.`);}catch(e){toast(e.message);}finally{run.disabled=false;}};
  const edit=el('button','','Edit');edit.onclick=()=>editRoutine(r);
  const remove=el('button','','Delete');remove.onclick=()=>{if(confirm(`Delete the routine "${r.title}"? Messages it already sent stay in the room.`))api('routines/delete',{id:r.id}).catch(e=>toast(e.message));};
  card.append(info,toggle,run,edit,remove);host.append(card);
 }
}
function openRoutines(){closePlus();renderRoutines();$('#routine-form').hidden=true;$('#routines').showModal();}
$('#routines-btn').onclick=openRoutines;$('#upcoming-edit').onclick=openRoutines;
$('#close-routines').onclick=()=>$('#routines').close();
$('#create-routine').onclick=()=>editRoutine();
$('#cancel-routine').onclick=()=>$('#routine-form').hidden=true;
$('#routine-form').elements.kind.onchange=syncScheduleFields;
$('#routine-form').elements.roomId.onchange=e=>syncRoutineTargets(e.target.value,'all');
$('#routine-form').onsubmit=async e=>{
 e.preventDefault();const f=e.target.elements,kind=f.kind.value;
 const schedule=kind==='every'?{kind,minutes:Number(f.minutes.value)}
  :kind==='daily'?{kind,time:f.time.value,days:f.days.value}
  :{kind,at:f.at.value?new Date(f.at.value).toISOString():''};
 try{await api('routines/save',{id:f.id.value||undefined,title:f.title.value,instruction:f.instruction.value,roomId:f.roomId.value,target:f.target.value,schedule});
  $('#routine-form').hidden=true;renderRoutines();toast('Routine saved.');}catch(err){toast(err.message);}
};
function renderUpcoming(s){
 const next=(s.routines||[]).filter(r=>r.enabled&&r.nextRun).sort((a,b)=>a.nextRun-b.nextRun).slice(0,4);
 $('#upcoming').hidden=!next.length;$('#routine-count').textContent=(s.routines||[]).length||'';
 $('#upcoming-list').replaceChildren(...next.map(r=>{
  const row=el('div','upcoming-row'),room=s.rooms.find(x=>x.id===r.roomId);
  row.append(el('strong','',r.title),el('span','',`${r.scheduleText}${room&&room.id!==s.id?' · '+room.title:''}`));
  return row;}));
}

// ---- Secrets --------------------------------------------------------------
function editSecret(secret={}){
 const form=$('#secret-form');form.hidden=false;
 for(const name of ['id','name','description'])form.elements[name].value=secret[name]||'';
 form.elements.value.value='';form.elements.value.required=!secret.id;
 form.elements.value.placeholder=secret.id?'Leave blank to keep the saved value':'Paste the value';
 $('#secret-value-note').textContent=secret.id?'Leave the value blank to keep what is saved. A new value replaces it and is never shown again.':'8 to 4,096 characters. Once saved it is never shown again.';
 $('#secret-editor-title').textContent=secret.id?'Edit secret':'New secret';
 form.scrollIntoView({block:'start'});form.elements.name.focus();
}
function renderSecrets(){
 const host=$('#secret-list');host.replaceChildren();
 const list=state?.secrets||[];
 if(!list.length)host.append(el('p','help','No secrets yet.'));
 for(const secret of list){
  const card=el('div','skill-card'),info=el('div'),rooms=(state.rooms||[]).length;
  info.append(el('h3','',secret.name),el('p','',secret.description));
  info.append(el('p','help','Value saved. Assign it to a room in Room settings.'));
  const edit=el('button','','Edit');edit.onclick=()=>editSecret(secret);
  const remove=el('button','','Delete');remove.onclick=()=>{if(confirm(`Delete ${secret.name}? Any room using it loses it at once, and agents there start fresh sessions.`))api('secrets/delete',{id:secret.id}).catch(e=>toast(e.message));};
  card.append(info,edit,remove);host.append(card);
 }
}
function openSecrets(){closePlus();renderSecrets();$('#secret-form').hidden=true;$('#secrets').showModal();}
$('#secrets-btn').onclick=openSecrets;$('#close-secrets').onclick=()=>$('#secrets').close();
$('#create-secret').onclick=()=>editSecret();
$('#cancel-secret').onclick=()=>$('#secret-form').hidden=true;
$('#secret-form').onsubmit=async e=>{
 e.preventDefault();const f=e.target.elements;
 const payload={id:f.id.value||undefined,name:f.name.value,description:f.description.value};
 if(f.value.value)payload.value=f.value.value;
 try{await api('secrets/save',payload);f.value.value='';$('#secret-form').hidden=true;renderSecrets();toast('Secret saved.');}catch(err){toast(err.message);}
};
function renderRoomSecrets(){
 const host=$('#room-secrets');host.replaceChildren();
 const list=state?.secrets||[];
 if(!list.length){host.append(el('p','help','No secrets saved yet. Add one in Secrets.'));return;}
 for(const secret of list){
  const label=el('label'),check=el('input');check.type='checkbox';check.value=secret.id;
  check.checked=(state.secretIds||[]).includes(secret.id);
  label.title=secret.description;label.append(check,document.createTextNode(secret.name));host.append(label);
 }
}
async function saveRoomSecrets(){
 const ids=[...$('#room-secrets').querySelectorAll('input:checked')].map(i=>i.value);
 if(JSON.stringify(ids)===JSON.stringify(state.secretIds||[]))return;
 await api('secrets/assign',{secretIds:ids});
}

// ---- Find in conversation -------------------------------------------------
// Matches come from the message text the server sent, not from rendered nodes, so
// Markdown structure and streaming updates cannot desynchronise the match list.
const find={open:false,hits:[],at:0};
function findMatches(){
 const query=$('#find-input').value.trim();find.hits=[];
 if(query&&state)for(const m of state.messages)for(const hit of findRanges(m.text||'',query))find.hits.push({id:m.id,start:hit[0]});
 find.at=Math.min(find.at,Math.max(0,find.hits.length-1));
 $('#find-count').textContent=query?(find.hits.length?`${find.at+1} of ${find.hits.length}`:'No matches'):'';
 for(const b of ['#find-prev','#find-next'])$(b).disabled=find.hits.length<2;
 if(find.hits.length)revealMatch();
}
function revealMatch(){
 const hit=find.hits[find.at];if(!hit)return;const v=rendered.get(hit.id);if(!v)return;
 v.node.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 v.node.classList.remove('flash');void v.node.offsetWidth;v.node.classList.add('flash');
}
function stepMatch(delta){if(!find.hits.length)return;find.at=(find.at+delta+find.hits.length)%find.hits.length;$('#find-count').textContent=`${find.at+1} of ${find.hits.length}`;revealMatch();}
function openFind(){find.open=true;$('#find-bar').hidden=false;$('#find-input').select();$('#find-input').focus();findMatches();}
function closeFind(){find.open=false;$('#find-bar').hidden=true;for(const v of rendered.values())v.node.classList.remove('flash');$('#message').focus();}
$('#find-input').addEventListener('input',()=>{find.at=0;findMatches();});
$('#find-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();stepMatch(e.shiftKey?-1:1);}if(e.key==='Escape'){e.preventDefault();closeFind();}});
$('#find-next').onclick=()=>stepMatch(1);$('#find-prev').onclick=()=>stepMatch(-1);$('#find-close').onclick=closeFind;

// ---- Command palette ------------------------------------------------------
const palette={items:[],at:0};
function paletteCommands(){
 const s=state,out=[];
 const action=(title,hint,run,enabled=true)=>{if(enabled)out.push({title,hint,run});};
 action('New room','Choose participants and start fresh',()=>openSettings(undefined,true));
 action('Room settings','Agents, mode, notes and project access',()=>openSettings(),!s?.busy);
 action('Skills','Create, import or assign reusable instructions',openSkills);
 action('Routines','Scheduled messages that run a normal turn',openRoutines);
 action('Secrets','Values your agents\u2019 commands can use',openSecrets);
 action('Connections','Check CLIs and API keys',()=>{$('#connections').showModal();void connections();});
 action('Preferences','Background, motion and notifications',()=>$('#preferences').showModal());
 action('Find in conversation','Search this room’s messages',openFind);
 action('Export conversation','Download this room as Markdown',exportRoom);
 action('Edit shared notes','Context every agent sees',()=>$('#notes-btn').click());
 action('Reset this conversation','Clear the messages, keep agents and notes',resetRoom,!s?.busy&&!!s?.messages.length);
 action(s?.archived?'Unarchive this room':'Archive this room','Keeps every message',()=>toggleArchive(),!s?.busy);
 action('Delete this room…','Permanent, asks you to confirm',()=>askDelete(),!s?.busy);
 action('Toggle the room list','',toggleRooms);
 action('Keyboard shortcuts','',openShortcuts);
 for(const r of s?.rooms||[])if(r.id!==s.id)out.push({title:r.title,hint:(r.archived?'Archived room':'Room')+` · ${r.count} messages`,group:'room',run:()=>api('rooms/select',{id:r.id})});
 for(const skill of s?.skills||[])out.push({title:skill.name,hint:'Skill · '+(skill.description||'Edit instructions'),group:'skill',run:()=>{openSkills();editSkill(skill);}});
 return out;
}
function renderPalette(){
 const list=$('#palette-list');palette.items=matchCommands($('#palette-input').value,paletteCommands());
 palette.at=Math.min(palette.at,Math.max(0,palette.items.length-1));list.replaceChildren();
 if(!palette.items.length){list.append(el('p','help palette-empty','Nothing matches that.'));return;}
 palette.items.forEach((item,i)=>{
  const row=el('button','palette-row'+(i===palette.at?' active':''));row.type='button';row.setAttribute('role','option');row.setAttribute('aria-selected',String(i===palette.at));
  row.append(el('span','palette-kind',item.group==='room'?'●':item.group==='skill'?'◇':'›'),el('span','palette-title',item.title));
  if(item.hint)row.append(el('span','palette-hint',item.hint));
  row.onmousemove=()=>{if(palette.at!==i){palette.at=i;renderPalette();}};
  row.onclick=()=>runPalette(i);list.append(row);
 });
 list.children[palette.at]?.scrollIntoView({block:'nearest'});
}
function runPalette(i){const item=palette.items[i];if(!item)return;$('#palette').close();Promise.resolve().then(item.run).catch(e=>toast(e.message));}
function openPalette(){if($('#palette').open)return;palette.at=0;$('#palette-input').value='';renderPalette();$('#palette').showModal();$('#palette-input').focus();}
$('#palette-input').addEventListener('input',()=>{palette.at=0;renderPalette();});
$('#palette-input').addEventListener('keydown',e=>{
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!palette.items.length)return;palette.at=(palette.at+(e.key==='ArrowDown'?1:-1)+palette.items.length)%palette.items.length;renderPalette();}
 if(e.key==='Enter'){e.preventDefault();runPalette(palette.at);}
});

// ---- Shortcuts ------------------------------------------------------------
const MOD=navigator.platform.toLowerCase().includes('mac')?'⌘':'Ctrl';
const SHORTCUTS=[
 ['Command palette',MOD+'K'],['New room',MOD+'N'],['Room settings',MOD+','],['Skills',MOD+'⇧W'],
 ['Focus the composer',MOD+'I'],['Find in conversation',MOD+'F'],['Send / new line','Enter / ⇧Enter'],
 ['Dictate',MOD+'⇧M'],['Toggle the room list',MOD+'B'],['Toggle room details',MOD+'⌥B'],
 ['Go to room 1–9',MOD+'1 … '+MOD+'9'],['Previous / next room','⌥↑ / ⌥↓'],
 ['Keyboard shortcuts',MOD+'/'],['Close anything open','Esc']
];
function openShortcuts(){
 const host=$('#shortcut-list');host.replaceChildren();
 for(const pair of SHORTCUTS){const row=el('div','shortcut-row');row.append(el('span','',pair[0]),el('kbd','',pair[1]));host.append(row);}
 $('#shortcuts').showModal();
}
$('#close-shortcuts').onclick=()=>$('#shortcuts').close();
function toggleRooms(){document.body.classList.toggle('hide-rooms');}
async function resetRoom(){
 if(!state?.messages.length)return toast('This room has no messages yet.');
 if(!confirm(`Clear every message in "${state.title}"? Agents, skills, shared notes and pins stay as they are.`))return;
 try{await api('rooms/reset',{id:state.id});toast('Conversation cleared. Agents start fresh sessions.');}catch(e){toast(e.message);}
}
// Room order for the numeric and arrow shortcuts matches what the sidebar shows.
const activeRooms=()=>(state?.rooms||[]).filter(r=>!r.archived);
function gotoRoom(index){const r=activeRooms()[index];if(r&&r.id!==state.id)api('rooms/select',{id:r.id}).catch(e=>toast(e.message));}
function stepRoom(delta){const rooms=activeRooms(),i=rooms.findIndex(r=>r.id===state?.id);if(i<0||rooms.length<2)return;gotoRoom((i+delta+rooms.length)%rooms.length);}
document.addEventListener('keydown',e=>{
 const mod=e.metaKey||e.ctrlKey,typing=/^(INPUT|TEXTAREA)$/.test(e.target.tagName)||e.target.isContentEditable;
 if(mod&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();return openPalette();}
 if($('#palette').open)return;
 if(mod&&e.altKey&&e.key.toLowerCase()==='b'){e.preventDefault();return $('#context-btn').click();}
 if(mod&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='b'){e.preventDefault();return toggleRooms();}
 if(mod&&e.shiftKey&&e.key.toLowerCase()==='w'){e.preventDefault();return openSkills();}
 if(mod&&!e.shiftKey&&e.key.toLowerCase()==='n'){e.preventDefault();return openSettings(undefined,true);}
 if(mod&&e.key===','){e.preventDefault();return openSettings();}
 if(mod&&e.key==='/'){e.preventDefault();return openShortcuts();}
 if(mod&&!e.shiftKey&&e.key.toLowerCase()==='i'){e.preventDefault();$('#message').focus();return;}
 if(mod&&!e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();return openFind();}
 if(mod&&!e.shiftKey&&!e.altKey&&/^[1-9]$/.test(e.key)){e.preventDefault();return gotoRoom(Number(e.key)-1);}
 if(e.altKey&&!mod&&(e.key==='ArrowUp'||e.key==='ArrowDown')&&!typing){e.preventDefault();return stepRoom(e.key==='ArrowDown'?1:-1);}
 if(e.key==='Escape'&&find.open&&!document.querySelector('dialog[open]')){e.preventDefault();closeFind();}
});
function persistDraft(){if(!state)return;drafts.set(state.id,{text:$('#message').value,files:pendingFiles});try{localStorage.setItem('roundtable-drafts',JSON.stringify([...drafts]));}catch{}}
$('#message').addEventListener('input',persistDraft);window.addEventListener('pagehide',persistDraft);
function renderDelta(d){applyDelta(d,state,rendered,{write:safeText,status:text=>$('#live-status').textContent=text,selection:window.getSelection(),tasks:(v,m)=>{renderMessageTasks(v,m);renderWorking(state);}});}
document.addEventListener('selectionchange',()=>{const selection=window.getSelection();if(selection&&!selection.isCollapsed)return;for(const v of rendered.values())if(v.deferred!==undefined){safeText(v.text,v.deferred);delete v.deferred;}});
try{token=sessionStorage.getItem('roundtable-token');const k=new URL(location.href).searchParams.get('k');const response=await fetch('/api/bootstrap'+(k?'?k='+encodeURIComponent(k):''),{headers:token?{'X-Roundtable-Token':token}:{}});const init=await response.json();if(!response.ok)throw new Error(init.error);token=init.token;sessionStorage.setItem('roundtable-token',token);history.replaceState(null,'',location.pathname);render(init.state);stream=new EventSource('/api/events?token='+encodeURIComponent(token));stream.addEventListener('state',e=>render(JSON.parse(e.data)));stream.addEventListener('delta',e=>renderDelta(JSON.parse(e.data)));stream.onerror=()=>{$('#live-status').textContent='Connection interrupted, reconnecting...';};}catch(e){toast(e.message||'Start Roundtable and open its private launch link.');}
