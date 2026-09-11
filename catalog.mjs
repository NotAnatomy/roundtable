import {sanitizedEnv} from './native-env.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {requireCommand,commandEnv} from './commands.mjs';
export async function listCodexModels(){
 const command=await requireCommand('codex');
 return new Promise((resolve,reject)=>{
  const child=spawn(command,['app-server'],{env:sanitizedEnv(commandEnv(command)),stdio:['pipe','pipe','pipe']});
  let done=false,models=[],cursor=null;
  const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);child.kill('SIGTERM');err?reject(err):resolve(models);};
  const timer=setTimeout(()=>finish(new Error('Codex model list timed out. Use CLI default or enter a model ID.')),20000);
  const send=m=>child.stdin.write(JSON.stringify(m)+'\n');
  child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});child.on('error',finish);child.on('exit',()=>{if(!done)finish(new Error('Codex closed before returning models.'));});
  createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
   if(m.error)return finish(new Error(m.error.message));
   if(m.id===1){send({method:'initialized',params:{}});send({id:2,method:'model/list',params:{limit:100}});}
   if(m.id===2){models.push(...(m.result?.data||[]).map(a=>({id:a.model||a.id,name:a.displayName||a.model||a.id,efforts:a.supportedReasoningEfforts?.map(e=>e.reasoningEffort)})));cursor=m.result?.nextCursor;if(cursor&&models.length<1000)send({id:2,method:'model/list',params:{limit:100,cursor}});else finish();}
  });
  send({id:1,method:'initialize',params:{clientInfo:{name:'roundtable_models',version:'0.2.0'}}});
 });
}

export function parseAntigravityModels(text){
 const clean=text.replace(/\x1b\[[0-9;]*m/g,'');const models=[];
 for(const line of clean.split('\n')){const m=line.trim().match(/^([a-z][a-z0-9._-]+)\s{2,}(.+)$/);if(m&&/^(gemini|claude|gpt|o[1-9])-/.test(m[1]))models.push({id:m[1],name:m[2].trim()});}
 return [...new Map(models.map(m=>[m.id,m])).values()];
}
export async function listAntigravityModels(){
 const command=await requireCommand('agy');return new Promise((resolve,reject)=>{
 const child=spawn(command,['models'],{env:sanitizedEnv(commandEnv(command)),stdio:['ignore','pipe','pipe']});let stdout='',stderr='',done=false;
 const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);if(error){child.kill('SIGTERM');reject(error);}else{const models=parseAntigravityModels(stdout);models.length?resolve(models):reject(new Error('Antigravity returned no recognizable models. Use Provider default or copy a model ID from agy models.'));}};
 const timer=setTimeout(()=>finish(new Error('Antigravity model discovery timed out. Check your native login.')),15000);
 child.stdout.on('data',b=>{stdout+=b;if(stdout.length>200000)finish(new Error('Antigravity model output exceeded the limit.'));});child.stderr.on('data',b=>stderr=(stderr+b).slice(-2000));child.on('error',finish);child.on('close',code=>finish(code?new Error(stderr||'Antigravity model discovery failed.'):null));
 });
}
