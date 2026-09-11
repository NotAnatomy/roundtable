import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function commandEnv(file, base=process.env){return {...base,PATH:[path.dirname(file),base.PATH||''].join(path.delimiter)};}
export async function probe(file,timeout=10000){
 return new Promise(resolve=>{
  let stdout='',stderr='',done=false;
  const child=spawn(file,['--version'],{env:commandEnv(file),stdio:['ignore','pipe','pipe']});
  const finish=result=>{if(done)return;done=true;clearTimeout(timer);resolve({path:file,...result});};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish({ok:false,reason:'Version check timed out'});},timeout);
  child.stdout.on('data',b=>stdout=(stdout+b).slice(-2000));child.stderr.on('data',b=>stderr=(stderr+b).slice(-2000));
  child.on('error',e=>finish({ok:false,reason:e.message}));
  child.on('close',code=>finish({ok:code===0,version:stdout.trim(),reason:code===0?'':stderr.trim()||`Exited with code ${code}`}));
 });
}
export async function resolveCommand(name,options={}){
 const override=process.env[`ROUNDTABLE_${name.toUpperCase()}_BIN`];
 const home=os.homedir();
 const dirs=options.directories||[...(process.env.PATH||'').split(path.delimiter),path.dirname(process.execPath),path.join(home,'.local/bin'),'/opt/homebrew/bin','/usr/local/bin',path.join(home,'.volta/bin'),path.join(home,'.npm-global/bin')];
 if(!options.directories){
  const versions=path.join(home,'.nvm/versions/node');
  try{for(const version of (await fs.readdir(versions)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})))dirs.push(path.join(versions,version,'bin'));}catch{}
 }
 const candidates=override&&!options.directories?[override]:[...new Set(dirs.filter(d=>path.isAbsolute(d)).map(d=>path.join(d,name)))];
 const failures=[];
 for(const file of candidates){
  try{await fs.access(file,fs.constants.X_OK);}catch{continue;}
  const result=await probe(file,options.timeout||10000);
  if(result.ok)return {...result,status:'ready'};
  failures.push(result);
 }
 return {ok:false,status:failures.length?'broken':'missing',reason:failures.length?`${name} was found, but could not run. ${failures[0].reason}`:`No executable ${name} was found.`,attempts:failures};
}
const commandCache=new Map();
export async function requireCommand(name){const key=JSON.stringify([name,process.env.PATH,process.env[`ROUNDTABLE_${name.toUpperCase()}_BIN`]]),cached=commandCache.get(key);if(cached&&Date.now()-cached.time<60000)return cached.path;const result=await resolveCommand(name);if(!result.ok)throw new Error(result.reason);commandCache.set(key,{path:result.path,time:Date.now()});return result.path;}
