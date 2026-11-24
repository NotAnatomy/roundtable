// A browser Roundtable drives, over the DevTools protocol, with nothing installed.
// Node 22 ships a WebSocket client, and every Chromium browser already on a Mac speaks this protocol,
// so the whole transport is this file. The window is visible on purpose: the user can watch each step
// and take the mouse at any moment, which is the only review step an unattended click would otherwise get.
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const BROWSER_APPS=[
 {name:'Brave',bin:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'},
 {name:'Google Chrome',bin:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'},
 {name:'Microsoft Edge',bin:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'},
 {name:'Chromium',bin:'/Applications/Chromium.app/Contents/MacOS/Chromium'},
 {name:'Google Chrome',bin:path.join(os.homedir(),'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')},
 {name:'Brave',bin:path.join(os.homedir(),'Applications/Brave Browser.app/Contents/MacOS/Brave Browser')},
];
export async function findBrowser(override=process.env.ROUNDTABLE_BROWSER_BIN){
 const candidates=override?[{name:path.basename(override),bin:override}]:BROWSER_APPS;
 for(const candidate of candidates){try{await fs.access(candidate.bin,fs.constants.X_OK);return candidate;}catch{}}
 return null;
}
const KEYS={Enter:[13,'\r'],Tab:[9,'\t'],Escape:[27,''],Backspace:[8,''],ArrowUp:[38,''],ArrowDown:[40,''],ArrowLeft:[37,''],ArrowRight:[39,''],PageUp:[33,''],PageDown:[34,''],Home:[36,''],End:[35,'']};

// Runs inside the page. Tags every element an agent could act on with a stable ref number, then hands
// back the visible text. innerText is used because it already respects what is actually displayed.
const extractor=(limit,maxRefs)=>`(()=>{
 for(const el of document.querySelectorAll('[data-rt-ref]'))el.removeAttribute('data-rt-ref');
 const sel='a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[contenteditable=""],[contenteditable=true]';
 const cut=(s,n)=>{s=String(s==null?'':s).replace(/\\s+/g,' ').trim();return s.length>n?s.slice(0,n)+'…':s;};
 const refs=[];
 for(const el of document.querySelectorAll(sel)){
  if(refs.length>=${maxRefs})break;
  if(el.disabled)continue;
  const rect=el.getBoundingClientRect();
  if(rect.width<1||rect.height<1)continue;
  const style=getComputedStyle(el);
  if(style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0)continue;
  const tag=el.tagName.toLowerCase();
  const kind=tag==='input'?'input['+(el.getAttribute('type')||'text')+']':tag;
  const name=cut(el.getAttribute('aria-label')||el.innerText||el.getAttribute('placeholder')||el.getAttribute('title')||el.getAttribute('name')||el.getAttribute('alt')||(tag==='input'&&el.type!=='password'?el.value:'')||'',80);
  let value='';
  if(tag==='input'&&['checkbox','radio'].includes(el.type))value=el.checked?'checked':'unchecked';
  else if(tag==='select')value=cut(el.selectedOptions&&el.selectedOptions[0]?el.selectedOptions[0].text:'',40);
  else if((tag==='input'&&el.type!=='password')||tag==='textarea')value=cut(el.value,40);
  else if(tag==='input')value=el.value?'(filled)':'';
  const ref=refs.length+1;
  el.setAttribute('data-rt-ref',String(ref));
  refs.push({ref,kind,name,value});
 }
 const body=document.body?document.body.innerText:'';
 return {url:location.href,title:document.title,text:String(body).slice(0,${limit*3}),refs};
})()`;

class Cdp {
 constructor(ws){this.ws=ws;this.next=0;this.waiting=new Map();this.listeners=new Set();this.closed=null;
  ws.addEventListener('message',e=>{
   let m;try{m=JSON.parse(typeof e.data==='string'?e.data:Buffer.from(e.data).toString('utf8'));}catch{return;}
   if(m.id!==undefined){const w=this.waiting.get(m.id);if(!w)return;this.waiting.delete(m.id);clearTimeout(w.timer);
    m.error?w.reject(new Error(m.error.message||'The browser refused that command.')):w.resolve(m.result);return;}
   for(const fn of [...this.listeners])fn(m);
  });
  const stop=reason=>{this.closed=reason;for(const w of this.waiting.values()){clearTimeout(w.timer);w.reject(new Error(reason));}this.waiting.clear();};
  ws.addEventListener('close',()=>stop('The browser was closed.'));
  ws.addEventListener('error',()=>stop('The connection to the browser was lost.'));
 }
 send(method,params={},sessionId,timeout=20000){
  if(this.closed)return Promise.reject(new Error(this.closed));
  const id=++this.next;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.waiting.delete(id);reject(new Error(`${method} did not finish in ${Math.round(timeout/1000)}s.`));},timeout);
   this.waiting.set(id,{resolve,reject,timer});
   try{this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}
   catch(e){clearTimeout(timer);this.waiting.delete(id);reject(e);}
  });
 }
 on(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 once(method,timeout){return new Promise(resolve=>{
  const timer=setTimeout(()=>{off();resolve(null);},timeout);
  const off=this.on(m=>{if(m.method===method){clearTimeout(timer);off();resolve(m);}});
 });}
}

const wait=ms=>new Promise(r=>setTimeout(r,ms));

async function readEndpoint(profileDir,deadline){
 const file=path.join(profileDir,'DevToolsActivePort');
 while(Date.now()<deadline){
  try{
   const [port,route]=(await fs.readFile(file,'utf8')).split('\n');
   if(port&&route)return `ws://127.0.0.1:${port.trim()}${route.trim()}`;
  }catch{}
  await wait(120);
 }
 throw new Error('The browser started but never reported a debugging port. Quit any window using Roundtable\'s browser profile and try again.');
}
const connect=(endpoint,deadline)=>new Promise((resolve,reject)=>{
 const ws=new WebSocket(endpoint);
 const timer=setTimeout(()=>{try{ws.close();}catch{}reject(new Error('Could not connect to the browser.'));},Math.max(1000,deadline-Date.now()));
 ws.addEventListener('open',()=>{clearTimeout(timer);resolve(ws);},{once:true});
 ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Could not connect to the browser.'));},{once:true});
});

// One browser, one visible window, owned by Roundtable and kept in its own profile folder so it never
// touches the user's everyday browser, its cookies or its history.
// headless exists for the test suite, which must not throw a window in front of whatever the user is
// doing. Roundtable itself always opens a window the user can see.
export async function openBrowser({profileDir,binary,onEnd=()=>{},timeout=25000,headless=false}={}){
 const found=binary?{name:path.basename(binary),bin:binary}:await findBrowser();
 if(!found)throw new Error('No Chromium browser was found. Install Brave, Chrome or Edge, or set ROUNDTABLE_BROWSER_BIN.');
 await fs.mkdir(profileDir,{recursive:true,mode:0o700});
 await fs.rm(path.join(profileDir,'DevToolsActivePort'),{force:true});
 const child=spawn(found.bin,[
  '--remote-debugging-port=0',`--user-data-dir=${profileDir}`,
  '--no-first-run','--no-default-browser-check','--disable-component-update','--disable-sync','--no-service-autorun',
  // Keeps the browser out of the login keychain: no password prompt, and no cookie key stored beside the user's own.
  '--password-store=basic','--use-mock-keychain',
  '--disable-features=Translate,MediaRouter,OptimizationHints','--window-size=1240,900',
  ...(headless?['--headless=new']:[]),'about:blank',
 ],{stdio:['ignore','ignore','pipe'],detached:false});
 let stderr='';child.stderr?.on('data',b=>{stderr=(stderr+b).slice(-2000);});
 const deadline=Date.now()+timeout;
 let exited=false;child.once('exit',()=>{exited=true;});
 let cdp,page=null;
 try{
  const endpoint=await readEndpoint(profileDir,deadline);
  cdp=new Cdp(await connect(endpoint,deadline));
 }catch(e){
  try{child.kill('SIGTERM');}catch{}
  throw new Error(exited&&stderr?`${e.message} The browser said: ${stderr.split('\n')[0]}`:e.message);
 }
 let ended=false;
 const end=reason=>{if(ended)return;ended=true;onEnd(reason);};
 child.once('exit',()=>end('The browser window was closed.'));
 cdp.ws.addEventListener('close',()=>end('The browser was closed.'),{once:true});

 // Nothing in a browsing turn is allowed to put a file on disk, and a modal dialog would otherwise
 // freeze every later action with no one there to click it.
 await cdp.send('Browser.setDownloadBehavior',{behavior:'deny'}).catch(()=>{});
 await cdp.send('Target.setDiscoverTargets',{discover:true}).catch(()=>{});
 const pages=new Set();
 cdp.on(m=>{
  if(m.method==='Target.targetCreated'&&m.params?.targetInfo?.type==='page')pages.add(m.params.targetInfo.targetId);
  if(m.method==='Target.targetDestroyed')pages.delete(m.params?.targetId);
  if(m.method==='Page.javascriptDialogOpening'&&page)void cdp.send('Page.handleJavaScriptDialog',{accept:false},page.sessionId).catch(()=>{});
 });

 const attach=async targetId=>{
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  page={targetId,sessionId};
  await cdp.send('Page.enable',{},sessionId).catch(()=>{});
  await cdp.send('Target.activateTarget',{targetId}).catch(()=>{});
  return page;
 };
 const current=async()=>{
  if(page&&pages.has(page.targetId))return page;
  const {targetInfos=[]}=await cdp.send('Target.getTargets',{});
  const existing=targetInfos.filter(t=>t.type==='page');
  for(const t of existing)pages.add(t.targetId);
  if(existing.length)return attach(existing.at(-1).targetId);
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
  pages.add(targetId);return attach(targetId);
 };
 // A link that opens a tab should not leave the agent staring at the old page. The newest page wins,
 // and spare tabs are closed so the window stays something a person can follow.
 const adopt=async()=>{
  const {targetInfos=[]}=await cdp.send('Target.getTargets',{});
  const list=targetInfos.filter(t=>t.type==='page');
  if(list.length>1){
   const keep=list.at(-1);
   for(const t of list)if(t.targetId!==keep.targetId)await cdp.send('Target.closeTarget',{targetId:t.targetId}).catch(()=>{});
   pages.clear();pages.add(keep.targetId);
   if(page?.targetId!==keep.targetId)await attach(keep.targetId);
  }
 };
 const evaluate=async(expression,timeout=15000)=>{
  const {sessionId}=await current();
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},sessionId,timeout);
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0]||'The page refused that step.');
  return r.result?.value;
 };
 const settle=async(ms=4000)=>{await Promise.race([cdp.once('Page.loadEventFired',ms),wait(ms)]);await adopt();};
 const box=async ref=>{
  const found=await evaluate(`(()=>{const el=document.querySelector('[data-rt-ref=${JSON.stringify(String(ref))}]');if(!el)return null;el.scrollIntoView({block:'center',inline:'center'});const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,name:(el.getAttribute('aria-label')||el.innerText||el.getAttribute('placeholder')||el.getAttribute('name')||'').replace(/\\s+/g,' ').trim().slice(0,60)};})()`);
  if(!found)throw new Error(`Ref ${ref} is not on this page any more. Read the page again.`);
  return found;
 };
 const key=async name=>{
  const [code,text]=KEYS[name]||[0,''];
  const {sessionId}=await current();
  const base={key:name,code:name,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,...(text?{text}:{})};
  await cdp.send('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',...base},sessionId);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',...base},sessionId);
 };
 return {
  name:found.name,binary:found.bin,
  get alive(){return !ended&&!cdp.closed;},
  async goto(url){const {sessionId}=await current();const nav=await cdp.send('Page.navigate',{url},sessionId,45000);if(nav.errorText)throw new Error(`${url} did not load: ${nav.errorText}`);await settle(8000);},
  async read(limit=7000,maxRefs=120){return evaluate(extractor(limit,maxRefs));},
  async click(ref){
   const point=await box(ref);const {sessionId}=await current();
   const common={x:Math.round(point.x),y:Math.round(point.y),button:'left',clickCount:1,buttons:1};
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...common,buttons:0},sessionId);
   await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...common},sessionId);
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...common},sessionId);
   await settle(2500);return point.name;
  },
  async focus(ref){
   const name=await evaluate(`(()=>{const el=document.querySelector('[data-rt-ref=${JSON.stringify(String(ref))}]');if(!el)return null;el.focus();if(el.select)el.select();else if(el.isContentEditable)document.execCommand('selectAll');return (el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.getAttribute('name')||'').slice(0,60);})()`);
   if(name===null)throw new Error(`Ref ${ref} is not on this page any more. Read the page again.`);
   return name;
  },
  async insert(text){const {sessionId}=await current();await cdp.send('Input.insertText',{text},sessionId);},
  async clearField(){await evaluate(`(()=>{const el=document.activeElement;if(!el)return;if(el.select)el.select();else if(el.isContentEditable)document.execCommand('selectAll');})()`);},
  // Finds the sign-in fields without reporting their contents anywhere.
  async loginFields(){return evaluate(`(()=>{
   const visible=el=>{const r=el.getBoundingClientRect();return r.width>1&&r.height>1&&getComputedStyle(el).visibility!=='hidden';};
   const pass=[...document.querySelectorAll('input[type=password]')].filter(visible)[0]||null;
   const texts=[...document.querySelectorAll('input[type=text],input[type=email],input:not([type]),input[type=tel]')].filter(visible);
   let user=null;
   if(pass){const before=texts.filter(t=>t.compareDocumentPosition(pass)&Node.DOCUMENT_POSITION_FOLLOWING);user=before.at(-1)||texts[0]||null;}
   else user=texts[0]||null;
   if(pass)pass.setAttribute('data-rt-pass','1');
   if(user)user.setAttribute('data-rt-user','1');
   return {password:!!pass,username:!!user};
  })()`);},
  async fillField(which,value){
   const ok=await evaluate(`(()=>{const el=document.querySelector('[data-rt-${which}="1"]');if(!el)return false;el.scrollIntoView({block:'center'});el.focus();if(el.select)el.select();return true;})()`);
   if(!ok)return false;
   await this.insert(value);
   return true;
  },
  async clearFieldMarks(){await evaluate(`(()=>{for(const el of document.querySelectorAll('[data-rt-pass],[data-rt-user]')){el.removeAttribute('data-rt-pass');el.removeAttribute('data-rt-user');}})()`).catch(()=>{});},
  key,
  async scroll(direction){const {sessionId}=await current();await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:400,y:400,deltaX:0,deltaY:direction==='up'?-620:620},sessionId);await wait(300);},
  async history(delta){
   const {sessionId}=await current();
   const h=await cdp.send('Page.getNavigationHistory',{},sessionId);
   const index=h.currentIndex+delta,entry=h.entries?.[index];
   if(!entry)throw new Error(delta<0?'There is nothing to go back to.':'There is nothing to go forward to.');
   await cdp.send('Page.navigateToHistoryEntry',{entryId:entry.id},sessionId);await settle(6000);
  },
  async reload(){const {sessionId}=await current();await cdp.send('Page.reload',{},sessionId);await settle(8000);},
  async shot(){const {sessionId}=await current();const r=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:60,captureBeyondViewport:false},sessionId,20000);return r.data;},
  async where(){try{return await evaluate('({url:location.href,title:document.title})');}catch{return {url:'',title:''};}},
  async activate(){const p=await current();await cdp.send('Target.activateTarget',{targetId:p.targetId}).catch(()=>{});await cdp.send('Browser.setWindowBounds',{windowId:(await cdp.send('Browser.getWindowForTarget',{targetId:p.targetId})).windowId,bounds:{windowState:'normal'}}).catch(()=>{});},
  async close(){end('Roundtable closed the browser.');try{await cdp.send('Browser.close',{},undefined,4000);}catch{}try{child.kill('SIGTERM');}catch{}
   await Promise.race([new Promise(r=>child.once('exit',r)),wait(3000)]);try{child.kill('SIGKILL');}catch{}},
 };
}
