import {usageOf} from './usage.mjs';
import {createInterface} from 'node:readline';
import {requireCommand} from './commands.mjs';
import {launch} from './providers.mjs';
export function pinnedEffort(model=''){return model.match(/-(low|medium|high)$/)?.[1]||null;}
export function modelArguments(model,effort){const args=[];if(model)args.push('--model',model);if(effort&&effort!=='auto'&&!pinnedEffort(model))args.push('--effort',effort);return args;}
export async function runAntigravity({prompt,session,cwd,signal,onText,onActivity,model,effort,mode}){
 if(mode==='work')throw new Error('Antigravity is available in Lounge only.');
 const command=await requireCommand('agy');
 // Official headless mode uses the user's existing native Google login.
 const args=['--input-format','stream-json','--output-format','stream-json','--sandbox'];
 args.push(...modelArguments(model,effort));
 if(session)args.push('--conversation',session);
 return new Promise((resolve,reject)=>{
  let child;try{child=launch(command,args,cwd,signal);}catch(e){reject(e);return;}
  let text='',stderr='',result=null,conversation=session;
  child.stderr.on('data',b=>stderr=(stderr+b).slice(-4000));child.on('error',reject);
  createInterface({input:child.stdout}).on('line',line=>{
   let m;try{m=JSON.parse(line);}catch{return;}
   if(m.conversation_id)conversation=m.conversation_id;
   if(m.event==='step_update'){if(m.step_update?.text_delta){text+=m.step_update.text_delta;onText(text);}else onActivity('Antigravity is working');}
   if(m.event==='result'){result=m.result;const final=result?.response;if(final){text=final;onText(text);}}
  });
  child.on('close',code=>{
   if(signal.aborted)return reject(new Error('Interrupted'));
   if(code!==0||result?.status!=='SUCCESS')return reject(new Error(result?.error?.message||result?.error||stderr||'Antigravity did not complete. Run agy in Terminal to check your login.'));
   const usage=usageOf('antigravity',result);resolve({text,session:result.conversation_id||conversation,...(usage?{usage}:{})});
  });
  child.stdin.end(JSON.stringify({event:'user',message:{content:prompt}})+'\n');
 });
}
