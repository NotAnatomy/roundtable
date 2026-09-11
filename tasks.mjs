// Builds the task list shown while an agent works: an explicit plan when the agent publishes one,
// with each tool call attached under the step in progress, otherwise the tool calls themselves.
// Counts in the UI are derived from this array, so the summary can never disagree with the rows.
export const TASK_LIMITS={steps:40,children:6,label:96,note:40};
const clip=(s,n)=>{s=String(s??'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s;};
const base=p=>String(p||'').split('/').filter(Boolean).slice(-2).join('/');
// Human labels for native tool calls. Unknown tools keep their name so nothing is hidden.
export function describeTool(name,input={}){
 switch(name){
  case 'Read':return {label:'Read '+base(input.file_path),note:''};
  case 'Glob':return {label:'Find files '+clip(input.pattern,40),note:''};
  case 'Grep':return {label:'Search for '+clip(input.pattern,40),note:base(input.path)};
  case 'Edit':return {label:'Edit '+base(input.file_path),note:''};
  case 'Write':return {label:'Write '+base(input.file_path),note:''};
  case 'Bash':return {label:'Run '+clip(input.command,60),note:''};
  case 'WebSearch':return {label:'Search the web for '+clip(input.query,40),note:''};
  case 'WebFetch':return {label:'Fetch '+clip(input.url,50),note:''};
  default:return {label:clip(name,40)+(input.file_path?' '+base(input.file_path):''),note:''};
 }
}
export function describeCodexItem(item={}){
 const command=Array.isArray(item.command)?item.command.join(' '):item.command;
 switch(item.type){
  case 'commandExecution':return {label:'Run '+clip(command||'command',60),note:''};
  case 'fileChange':{const files=(item.changes||[]).map(c=>base(c.path)).filter(Boolean);return {label:files.length?'Edit '+files.slice(0,2).join(', ')+(files.length>2?` +${files.length-2}`:''):'Edit files',note:files.length>1?files.length+' files':''};}
  case 'mcpToolCall':return {label:'Use '+clip(item.tool||item.server||'tool',40),note:''};
  case 'webSearch':return {label:'Search the web for '+clip(item.query,40),note:''};
  case 'reasoning':case 'agentMessage':case 'todoList':case 'plan':return null;
  default:return {label:clip(item.type||'Working',40),note:''};
 }
}
export function createTaskTracker(){
 const plan=[],steps=[];let hidden=0,serial=0;
 const current=()=>plan.find(t=>t.status==='running')||null;
 const task=(id,label,note,status)=>({id,label:clip(label,TASK_LIMITS.label),status,...(note?{note:clip(note,TASK_LIMITS.note)}:{})});
 function push(step){const parent=current();const list=parent?(parent.children||=[]):steps;list.push(step);if(list.length>(parent?TASK_LIMITS.children:TASK_LIMITS.steps)){list.shift();if(parent)parent.hidden=(parent.hidden||0)+1;else hidden++;}}
 function find(id){for(const t of plan)for(const c of t.children||[])if(c.id===id)return c;return steps.find(s=>s.id===id)||null;}
 return {
  apply(event){
   if(!event)return;
   if(event.type==='plan'){
    // The agent's own plan replaces the previous version; children stay with steps that keep their label.
    // Steps are matched by a stable key (Claude's todo content, else the label) so children survive a label change such as activeForm.
    const previous=new Map(plan.map(t=>[t.key,t]));plan.length=0;
    for(const [i,item]of (event.items||[]).slice(0,TASK_LIMITS.steps).entries()){const label=clip(item.label,TASK_LIMITS.label);if(!label)continue;const key=clip(item.key||item.label,TASK_LIMITS.label),kept=previous.get(key);const t={...task('plan-'+i,label,item.note,['done','running','failed','pending'].includes(item.status)?item.status:'pending'),key};if(kept?.children)t.children=kept.children;if(kept?.hidden)t.hidden=kept.hidden;plan.push(t);}
   }else if(event.type==='start'){
    const id=event.id||'step-'+(++serial);if(find(id))return;push(task(id,event.label||'Working',event.note,'running'));
   }else if(event.type==='end'){
    const step=find(event.id);if(step&&step.status==='running'){step.status=event.ok===false?'failed':'done';if(event.note)step.note=clip(event.note,TASK_LIMITS.note);}
   }else if(event.type==='finish'){
    // Tool steps settle with the turn; plan steps keep the status the agent last reported.
    for(const s of [...steps,...plan.flatMap(t=>t.children||[])])if(s.status==='running')s.status=event.ok===false?'failed':'done';
   }
  },
  flat(){return [...plan.flatMap(t=>[t,...(t.children||[])]),...steps];},
  get tasks(){return plan.length?plan:steps;},
  snapshot(){const tasks=structuredClone(this.tasks).map(({key,...t})=>t);return tasks.length?{tasks,...(hidden?{hidden}:{})}:null;}
 };
}
