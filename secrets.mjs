import {STRIPPED_ENV} from './native-env.mjs';
// Secrets reach an agent's command line through its process environment and never through its prompt.
// The agent is told a secret's name and purpose; the value stays on this computer.
export const SECRET_LIMITS={name:128,value:4096,description:500,count:40,minValue:8};
// Reserved names. The stripped list is reserved so a secret cannot put back the provider and gateway
// variables Roundtable removes to keep each CLI on its own login; the rest control how a process loads code.
export const RESERVED=new Set([...STRIPPED_ENV,'PATH','HOME','SHELL','USER','LOGNAME','PWD','TMPDIR',
 'NODE_OPTIONS','LD_PRELOAD','LD_LIBRARY_PATH','DYLD_INSERT_LIBRARIES','DYLD_LIBRARY_PATH','PYTHONPATH','PYTHONSTARTUP','GIT_SSH_COMMAND']);
export function validateSecret(input,existing=[]){
 const name=String(input?.name||'').trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9_]*$/.test(name)||name.length>SECRET_LIMITS.name)throw new Error('Use an environment variable name: a letter first, then letters, numbers or underscores.');
 if(RESERVED.has(name))throw new Error(`${name} is reserved. Roundtable controls it so agents keep their own logins and load their own code.`);
 if(existing.some(s=>s.name===name&&s.id!==input.id))throw new Error(`${name} is already saved. Edit that secret to replace its value.`);
 const description=String(input?.description??'').trim();
 if(description.length>SECRET_LIMITS.description)throw new Error(`Keep the description under ${SECRET_LIMITS.description} characters.`);
 if(!description)throw new Error('Say what this secret is for. Agents see this description, never the value.');
 const value=input?.value===undefined||input?.value===null?undefined:String(input.value);
 if(value!==undefined){
  if(value.length<SECRET_LIMITS.minValue||value.length>SECRET_LIMITS.value)throw new Error(`A secret value is ${SECRET_LIMITS.minValue} to ${SECRET_LIMITS.value} characters.`);
  if(/[\0\r\n]/.test(value))throw new Error('A secret value cannot contain line breaks.');
 }
 return {name,description,...(value===undefined?{}:{value})};
}
export const secretEnv=(secrets=[])=>Object.fromEntries(secrets.filter(s=>s?.name&&typeof s.value==='string').map(s=>[s.name,s.value]));
// Agent output is echoed into the transcript and sent on to every other participant, so a value that
// leaks through a command's output is removed before it is stored. Longest first, so overlaps collapse once.
export function redactSecrets(text,secrets=[]){
 let out=String(text??'');
 for(const value of secrets.map(s=>s?.value).filter(v=>typeof v==='string'&&v.length>=SECRET_LIMITS.minValue).sort((a,b)=>b.length-a.length))out=out.split(value).join('[secret redacted]');
 return out;
}
// What the agent is allowed to know: the name to use and why it exists.
export const describeSecrets=(secrets=[])=>secrets.map(s=>({name:s.name,purpose:s.description}));
