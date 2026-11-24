import {usageOf} from './usage.mjs';
import {claudeInput} from './media.mjs';
import {sanitizedEnv} from './native-env.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {requireCommand,commandEnv} from './commands.mjs';
import {threadParams,turnParams} from './codex-protocol.mjs';
import {describeTool,describeCodexItem} from './tasks.mjs';
const planStatus=v=>({in_progress:'running',inProgress:'running',completed:'done',done:'done',failed:'failed'})[v]||'pending';
export const claudePlan=todos=>({type:'plan',items:(Array.isArray(todos)?todos:[]).map(t=>({key:t.content,label:t.status==='in_progress'&&t.activeForm?t.activeForm:t.content,status:planStatus(t.status)}))});
export const codexPlan=items=>({type:'plan',items:(Array.isArray(items)?items:[]).map(i=>({label:i.step||i.text||i.label||'',status:i.completed===true?'done':planStatus(i.status)}))});

export function launch(command,args,cwd,signal,secrets={}) {
  signal.throwIfAborted();
  // Subscription login stays inside each official binary. No token extraction.
  // The user's own secrets are added after the strip, so they can never reinstate a provider or gateway variable.
  const env={...sanitizedEnv(commandEnv(command)),...secrets};
  const child=spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe']});
  const stop=()=>{ child.kill('SIGTERM'); const t=setTimeout(()=>child.kill('SIGKILL'),2500); t.unref(); child.once('exit',()=>clearTimeout(t)); };
  signal.addEventListener('abort',stop,{once:true});
  child.once('exit',()=>signal.removeEventListener('abort',stop));
  child.stdin.on('error',()=>{});
  return child;
}
export async function runClaude({prompt,session,cwd,signal,onText,onActivity,onEvent=()=>{},mode,allowEdits,model,effort,media=[],secrets={}}) {
  const command=await requireCommand('claude');
  return new Promise((resolve,reject)=>{
    // TodoWrite touches no files; it lets the agent publish the plan the task list displays.
    const allowed=mode==='lounge'?'':allowEdits?'Read,Glob,Grep,Edit,Write,TodoWrite':'Read,Glob,Grep,TodoWrite';
    const args=['-p','--output-format','stream-json','--verbose','--include-partial-messages','--tools',allowed,'--permission-mode',allowEdits&&mode==='work'?'acceptEdits':'default'];
    if(media.length)args.push('--input-format','stream-json');
    if(allowed) args.push('--allowedTools',allowed);
    if(session) args.push('--resume',session);
    if(model) args.push('--model',model);
    if(effort&&effort!=='auto') args.push('--effort',effort);
    let child; try{child=launch(command,args,cwd,signal,secrets);}catch(e){reject(e);return;}
    let stderr='',result=null,text='';
    child.stderr.on('data',b=>{stderr=(stderr+b).slice(-5000);});
    child.on('error',e=>reject(new Error(`Claude Code could not start: ${e.message}. Install Claude Code and run claude once to sign in.`)));
    createInterface({input:child.stdout}).on('line',line=>{
      let m;try{m=JSON.parse(line);}catch{return;}
      if(m.type==='stream_event' && !m.parent_tool_use_id && m.event?.delta?.type==='text_delta'){text+=m.event.delta.text;onText(text);}
      if(m.type==='assistant' && !m.parent_tool_use_id) {
        for(const c of m.message?.content||[]) if(c.type==='tool_use'){onActivity(`Using ${c.name}`);if(c.name==='TodoWrite')onEvent(claudePlan(c.input?.todos));else onEvent({type:'start',id:c.id,...describeTool(c.name,c.input||{})});}
      }
      if(m.type==='user'&&!m.parent_tool_use_id)for(const c of m.message?.content||[])if(c.type==='tool_result')onEvent({type:'end',id:c.tool_use_id,ok:!c.is_error});
      if(m.type==='result') result=m;
    });
    child.on('close',code=>{
      if(signal.aborted)return reject(new Error('Interrupted'));
      if(code!==0||!result||result.is_error)return reject(Object.assign(new Error(result?.result||result?.errors?.join('\n')||stderr||`Claude exited with code ${code}`),{usage:result?usageOf('claude',result):undefined}));
      const final=result.result||text;
      onText(final);
      resolve({text:final,session:result.session_id||session,usage:usageOf('claude',result)});
    });
    child.stdin.end(media.length?JSON.stringify(claudeInput(prompt,media,session))+'\n':prompt);
  });
}

export async function runCodex({prompt,session,cwd,signal,onText,onActivity,onEvent=()=>{},mode,allowEdits,model,effort,media=[],secrets={}}) {
  const command=await requireCommand('codex');
  const child=launch(command,['app-server'],cwd,signal,secrets);
  const waiting=new Map();let id=0,stderr='',settled=false,finalResolve,finalReject;
  const final=new Promise((resolve,reject)=>{finalResolve=resolve;finalReject=reject;});
  // The completion listener exists before a turn starts, including very fast turns.
  final.catch(()=>{});
  const items=new Map(),pendingItems=new Set();let usage,completedTurn=false,finishTimer;const finish=()=>{if(settled)return;settled=true;clearTimeout(finishTimer);finalResolve([...items.values()].join('\n\n'));};
  const send=m=>child.stdin.write(JSON.stringify(m)+'\n');
  const fail=e=>{for(const w of waiting.values())w.reject(e);waiting.clear();if(!settled){settled=true;finalReject(e);}};
  const rpc=(method,params)=>new Promise((resolve,reject)=>{const key=++id;waiting.set(key,{resolve,reject});send({id:key,method,params});});
  child.on('error',e=>fail(new Error(`Codex could not start: ${e.message}. Install Codex and run codex login.`)));
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-4000);});
  child.on('close',()=>fail(new Error(signal.aborted?'Interrupted':stderr||'Codex disconnected before completing the turn.')));
  createInterface({input:child.stdout}).on('line',line=>{
    let m;try{m=JSON.parse(line);}catch{return;}
    if(m.id!==undefined && !m.method){const w=waiting.get(m.id);if(w){waiting.delete(m.id);m.error?w.reject(new Error(m.error.message)):w.resolve(m.result);}return;}
    if(m.id!==undefined && m.method){
      // Never silently accept an agent's request for additional permissions.
      if(m.method.endsWith('/requestApproval')) send({id:m.id,result:{decision:'decline'}});
      else send({id:m.id,error:{code:-32601,message:'Interactive request is unsupported in this room. Ask the user in chat.'}});
      onActivity('Additional permission was declined; agent can explain in chat');return;
    }
    const p=m.params||{};
    if(m.method==='thread/tokenUsage/updated')usage=usageOf('codex',p.tokenUsage?.last||{});
    if(m.method==='item/agentMessage/delta') {pendingItems.add(p.itemId);items.set(p.itemId,(items.get(p.itemId)||'')+p.delta);onText([...items.values()].join('\n\n'));}
    if(m.method==='item/completed'&&p.item?.type==='agentMessage'){pendingItems.delete(p.item.id);items.set(p.item.id,p.item.text||items.get(p.item.id)||'');onText([...items.values()].join('\n\n'));if(completedTurn&&!pendingItems.size)finish();}
    if(m.method==='item/started'&&p.item?.type!=='agentMessage'){onActivity(`Working: ${p.item?.type||'task'}`);const step=describeCodexItem(p.item);if(step)onEvent({type:'start',id:p.item.id,...step});}
    if(['item/started','item/completed','item/updated'].includes(m.method)&&['todoList','plan'].includes(p.item?.type))onEvent(codexPlan(p.item.items||p.item.plan));
    if(m.method==='item/completed'&&p.item&&describeCodexItem(p.item))onEvent({type:'end',id:p.item.id,ok:!['failed','declined'].includes(p.item.status)&&!(typeof p.item.exitCode==='number'&&p.item.exitCode!==0),note:typeof p.item.exitCode==='number'&&p.item.exitCode!==0?'exit '+p.item.exitCode:''});
    if(m.method==='turn/plan/updated'&&Array.isArray(p.plan))onEvent(codexPlan(p.plan));
    if(m.method==='turn/completed'&&!settled){if(p.turn?.status==='completed'){completedTurn=true;if(pendingItems.size)finishTimer=setTimeout(finish,100);else setImmediate(finish);}else fail(new Error(p.turn?.error?.message||`Codex turn ${p.turn?.status||'failed'}`));}
  });
  try{
    await rpc('initialize',{clientInfo:{name:'roundtable_local',title:'Roundtable',version:'0.1.0'}});send({method:'initialized',params:{}});
    const write=mode==='work'&&allowEdits;
    const started=await rpc(session?'thread/resume':'thread/start',threadParams({cwd,write,session,model}));
    const threadId=started.thread.id;
    await rpc('turn/start',turnParams({threadId,prompt,cwd,write,model,effort,media}));
    return {text:await final,session:threadId,usage};
  }catch(e){if(usage)e.usage=usage;throw e;}finally{clearTimeout(finishTimer);child.kill('SIGTERM');}
}
