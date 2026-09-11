// Imports Agent Skills instructions from GitHub. Roundtable installs instructions only: scripts, references and assets never arrive.
const HOSTS=new Set(['github.com','raw.githubusercontent.com']),API='https://api.github.com',RAW='https://raw.githubusercontent.com';
export const FETCH_LIMITS={file:256*1024,api:4*1024*1024,timeout:15000,results:50,depth:3,instructions:12000,limitations:600};
export const RESOURCE_DIRS=['scripts','references','assets'];
const NAME=/^[A-Za-z0-9_.-]{1,100}$/;
export function parseSkillUrl(value){
 let u;try{u=new URL(String(value||'').trim());}catch{throw new Error('Paste a full https link to a GitHub repository, folder or SKILL.md file.');}
 if(u.protocol!=='https:'||u.username||u.password)throw new Error('Use an https link without credentials.');
 if(!HOSTS.has(u.hostname))throw new Error('Import from github.com or raw.githubusercontent.com links only.');
 const seg=u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
 const [owner,repoName,...rest]=seg;const repo=(repoName||'').replace(/\.git$/,'');
 if(!NAME.test(owner||'')||!NAME.test(repo)||owner.startsWith('.')||repo.startsWith('.'))throw new Error('This link does not point at a GitHub repository.');
 if(u.hostname==='raw.githubusercontent.com'){
  const refs=rest[0]==='refs'&&rest.length>3;const ref=refs?rest.slice(0,3).join('/'):rest[0],path=(refs?rest.slice(3):rest.slice(1)).join('/');
  if(!ref||!path)throw new Error('Raw links need a branch and a file path.');return {owner,repo,ref,path,kind:'file'};
 }
 if(!rest.length)return {owner,repo,ref:null,path:'',kind:'tree'};
 if(['tree','blob'].includes(rest[0])&&rest[1]){const path=rest.slice(2).join('/');if(rest[0]==='blob'&&!path)throw new Error('This link does not point at a file.');return {owner,repo,ref:rest[1],path,kind:rest[0]==='blob'?'file':'tree'};}
 throw new Error('Link to a repository, a folder inside it, or a SKILL.md file.');
}
export function parseFrontmatter(text){
 const match=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);const meta={};
 if(match)for(const line of match[1].split(/\r?\n/)){const m=line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);if(m)meta[m[1].toLowerCase()]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
 return {meta,body:match?text.slice(match[0].length):text};
}
// Lines that point at files inside the package will not work because those files are not imported.
export function flagReferences(body){const out=[];body.split(/\r?\n/).forEach((text,i)=>{if(/(^|[\s`'"(\[])(\.\/)?(scripts|references|assets)\//i.test(text)||/(^|[\s`'"(])\.\/[\w.-]+/.test(text))out.push({line:i+1,text:text.trim().slice(0,200)});});return out.slice(0,20);}
async function get(url,{limit,fetcher,accept='application/vnd.github+json'}){
 let res;
 try{res=await fetcher(url,{headers:{Accept:accept,'User-Agent':'roundtable-local','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(FETCH_LIMITS.timeout)});}
 catch(e){if(e?.name==='TimeoutError')throw new Error('GitHub did not answer within 15 seconds. Try again.');throw new Error('Could not fetch from GitHub. Redirects are not followed; paste the final link.');}
 if(res.status>=300&&res.status<400)throw new Error('This link redirects. Paste the final GitHub link instead.');
 if(res.status===404)throw new Error('GitHub reports nothing at this link. Check the repository, branch and path.');
 if(res.status===403||res.status===429)throw new Error('GitHub refused the request, usually the unauthenticated rate limit of 60 per hour. Try again later or paste a direct SKILL.md link.');
 if(!res.ok)throw new Error(`GitHub returned HTTP ${res.status}.`);
 const length=Number(res.headers?.get?.('content-length')||0);if(length>limit)throw new Error(`The response is larger than ${Math.round(limit/1024)} KB and was not read.`);
 const chunks=[];let total=0;
 if(res.body?.getReader){const reader=res.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel().catch(()=>{});throw new Error(`The response is larger than ${Math.round(limit/1024)} KB and was not read.`);}chunks.push(value);}}
 else{const buffer=Buffer.from(await res.arrayBuffer());if(buffer.length>limit)throw new Error(`The response is larger than ${Math.round(limit/1024)} KB and was not read.`);chunks.push(buffer);}
 return Buffer.concat(chunks).toString('utf8');
}
const encode=s=>s.split('/').map(encodeURIComponent).join('/');
async function loadTree(source,fetcher){
 let ref=source.ref;
 if(!ref){const repo=JSON.parse(await get(`${API}/repos/${source.owner}/${source.repo}`,{limit:FETCH_LIMITS.api,fetcher}));ref=repo.default_branch;if(!ref)throw new Error('GitHub did not report a default branch for this repository.');}
 const data=JSON.parse(await get(`${API}/repos/${source.owner}/${source.repo}/git/trees/${encode(ref)}?recursive=1`,{limit:FETCH_LIMITS.api,fetcher}));
 if(!Array.isArray(data.tree))throw new Error('GitHub returned no file tree for this link.');
 return {ref,entries:data.tree.filter(e=>typeof e.path==='string'),truncated:!!data.truncated};
}
const isSkillFile=p=>/(^|\/)SKILL\.md$/i.test(p),dirname=p=>p.includes('/')?p.slice(0,p.lastIndexOf('/')):'';
export function listSkillFiles(entries,folder=''){
 const prefix=folder?folder.replace(/\/+$/,'')+'/':'';const found=[];
 for(const e of entries){if(e.type!=='blob'||!isSkillFile(e.path)||!e.path.startsWith(prefix))continue;const relative=e.path.slice(prefix.length);if(relative.split('/').length-1>FETCH_LIMITS.depth)continue;found.push(e.path);if(found.length>=FETCH_LIMITS.results)break;}
 return found;
}
export function packageResources(entries,folder){
 const prefix=folder?folder+'/':'';const found=new Set();
 for(const e of entries){if(!e.path.startsWith(prefix)||e.path===prefix+'SKILL.md')continue;const top=e.path.slice(prefix.length).split('/')[0].toLowerCase();if(RESOURCE_DIRS.includes(top))found.add(top);}
 return RESOURCE_DIRS.filter(d=>found.has(d));
}
export function describeLimitations(resources,flagged,checked){
 const parts=[];
 if(resources.length)parts.push(`This skill package also contains ${resources.map(r=>r+'/').join(', ')}. Roundtable imports instructions only and installs none of them.`);
 if(flagged.length)parts.push(`${flagged.length} line${flagged.length>1?'s':''} of the instructions refer to files inside the package, which agents here cannot open or run.`);
 if(!checked)parts.push('The package folder could not be checked for scripts, references or assets.');
 return parts.join(' ').slice(0,FETCH_LIMITS.limitations);
}
export async function fetchSkillSource(url,fetcher=fetch){
 const source=parseSkillUrl(url);
 if(source.kind==='tree'){
  const tree=await loadTree(source,fetcher),files=listSkillFiles(tree.entries,source.path);
  if(!files.length)throw new Error(source.path?'No SKILL.md was found within three folder levels of this folder.':'No SKILL.md was found within three folder levels of this repository.');
  return {kind:'list',repo:`${source.owner}/${source.repo}`,ref:tree.ref,truncated:tree.truncated,skills:files.map(path=>({name:dirname(path).split('/').pop()||source.repo,path,url:`https://github.com/${source.owner}/${source.repo}/blob/${encode(tree.ref)}/${encode(path)}`}))};
 }
 if(!/\.md$/i.test(source.path))throw new Error('Link to a Markdown file such as SKILL.md.');
 const text=await get(`${RAW}/${source.owner}/${source.repo}/${encode(source.ref)}/${encode(source.path)}`,{limit:FETCH_LIMITS.file,fetcher,accept:'text/plain'});
 if(text.includes('\0'))throw new Error('This file is not text.');
 const {meta,body}=parseFrontmatter(text),folder=dirname(source.path);
 let resources=[],checked=false;
 try{const tree=await loadTree(source,fetcher);resources=packageResources(tree.entries,folder);checked=true;}catch{}
 const instructions=body.trim(),flagged=flagReferences(instructions),truncated=instructions.length>FETCH_LIMITS.instructions;
 const limitations=describeLimitations(resources,flagged,checked);
 return {kind:'skill',skill:{name:(meta.name||folder.split('/').pop()||source.repo).slice(0,64),description:(meta.description||'').slice(0,400),instructions:instructions.slice(0,FETCH_LIMITS.instructions),limitations,resources,flagged,truncated,checked,source:`https://github.com/${source.owner}/${source.repo}/blob/${encode(source.ref)}/${encode(source.path)}`}};
}
