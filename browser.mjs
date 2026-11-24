// Browser rules, kept away from the transport so they can be read and tested on their own.
// Roundtable drives a real browser window the user can watch and grab the mouse from. Everything an
// agent is allowed to ask for passes through validateAction first, and every credential typed into a
// page passes through matchLogin, which is the only reason a saved password is safer here than in a
// prompt: the value goes from this computer into the page, and the agent never receives it.
export const BROWSER_LIMITS={actions:40,url:2000,text:4000,snapshot:7000,refs:120,label:60,username:200,password:512,logins:30,waitSeconds:10};

const SCHEMES=['http:','https:'];
// Hosts that are this Mac's own services rather than the web. An agent in a Work room already has a
// shell, so this is not a security boundary: it keeps a browsing instruction from quietly turning
// into "poke at whatever else is listening on this machine" without the user asking for it.
const LOCAL=/^(localhost|127(\.\d+){3}|\[?::1\]?|0\.0\.0\.0|.*\.local)$/i;
const PRIVATE=/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function normalizeUrl(input){
 const raw=String(input??'').trim();
 if(!raw)throw new Error('Give a web address.');
 if(raw.length>BROWSER_LIMITS.url)throw new Error('That web address is too long.');
 let url;
 try{url=new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)?raw:'https://'+raw);}catch{throw new Error(`${raw} is not a web address.`);}
 if(!SCHEMES.includes(url.protocol))throw new Error(`Only http and https pages can be opened. ${url.protocol} was requested.`);
 return url.href;
}
// selfOrigin is Roundtable's own address. The browser profile is signed in to whatever the user has
// signed it in to, so pointing it at Roundtable would mean reading this app's own window through it.
export function hostRule(href,{selfOrigin='',allowLocal=false}={}){
 const url=new URL(href);
 if(selfOrigin&&url.origin===selfOrigin)return 'That address is Roundtable itself. Browse the web, not this app.';
 const local=LOCAL.test(url.hostname)||PRIVATE.test(url.hostname);
 // A Work room already has a project folder and a shell, so reaching its own dev server changes nothing
 // about what it can do. A Lounge room has neither, and has no reason to visit this network.
 if(local&&!allowLocal)return `${url.hostname} is on this computer or this network, not the web. Only a Work room can open a local address.`;
 return null;
}
export function checkUrl(input,options={}){
 const href=normalizeUrl(input);
 const blocked=hostRule(href,options);
 if(blocked)throw new Error(blocked);
 return href;
}

const KEYS=['Enter','Tab','Escape','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageDown','PageUp','Home','End'];
const ref=value=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>BROWSER_LIMITS.refs)throw new Error('Use a ref number from the last read.');return n;};
const text=(value,field)=>{const s=String(value??'');if(!s)throw new Error(`Give the ${field} to type.`);if(s.length>BROWSER_LIMITS.text)throw new Error(`Keep ${field} under ${BROWSER_LIMITS.text} characters.`);if(/[\0]/.test(s))throw new Error('That text cannot be typed.');return s;};

// The whole surface an agent can ask for. Anything else is refused by name, so a new action is a
// deliberate addition here rather than something a clever argument can reach.
export function validateAction(input={},options={}){
 const action=String(input.action||'').trim().toLowerCase();
 switch(action){
  case 'open':return {action,url:checkUrl(input.url,options)};
  case 'read':return {action};
  case 'shot':return {action};
  case 'back':case 'forward':case 'reload':return {action};
  case 'click':return {action,ref:ref(input.ref)};
  case 'type':return {action,ref:ref(input.ref),text:text(input.text,'text'),submit:!!input.submit,replace:input.replace!==false};
  case 'press':{const key=String(input.key||'').trim();const match=KEYS.find(k=>k.toLowerCase()===key.toLowerCase());if(!match)throw new Error(`Press one of: ${KEYS.join(', ')}.`);return {action,key:match};}
  case 'scroll':{const dir=String(input.direction||'down').toLowerCase();if(!['up','down'].includes(dir))throw new Error('Scroll up or down.');return {action,direction:dir};}
  case 'wait':{const seconds=Number(input.seconds??2);if(!Number.isFinite(seconds)||seconds<=0||seconds>BROWSER_LIMITS.waitSeconds)throw new Error(`Wait between 1 and ${BROWSER_LIMITS.waitSeconds} seconds.`);return {action,seconds};}
  case 'login':{const label=String(input.label||'').trim();if(!label)throw new Error('Name the saved login to use.');return {action,label};}
  case 'logins':return {action};
  default:throw new Error(`${action||'That'} is not a browser action. Use: open, read, click, type, press, scroll, wait, shot, back, forward, reload, logins, login.`);
 }
}
export function describeAction(a={}){
 switch(a.action){
  case 'open':return `Opened ${hostOf(a.url)}`;
  case 'read':return 'Read the page';
  case 'shot':return 'Took a screenshot';
  case 'click':return `Clicked ${a.name?`“${a.name}”`:`ref ${a.ref}`}`;
  // The typed text is in the transcript already, because the agent wrote it. A password never comes through here.
  case 'type':return `Typed into ${a.name?`“${a.name}”`:`ref ${a.ref}`}${a.submit?' and pressed Enter':''}`;
  case 'press':return `Pressed ${a.key}`;
  case 'scroll':return `Scrolled ${a.direction}`;
  case 'wait':return `Waited ${a.seconds}s`;
  case 'back':return 'Went back';
  case 'forward':return 'Went forward';
  case 'reload':return 'Reloaded the page';
  case 'login':return `Filled the saved login for ${a.label}`;
  case 'logins':return 'Listed the saved logins';
  default:return 'Browser action';
 }
}
export const hostOf=href=>{try{return new URL(href).host;}catch{return String(href||'').slice(0,80);}};

// A page can be a megabyte of text. The agent gets a readable budget of it and is told so, rather
// than having the room's context silently eaten by one news site.
export function pageReport({url,title,text='',refs=[]},limit=BROWSER_LIMITS.snapshot){
 const body=String(text).replace(/\n{3,}/g,'\n\n').trim();
 const kept=body.slice(0,limit);
 const list=refs.slice(0,BROWSER_LIMITS.refs);
 return {url,title:String(title||'').slice(0,200),text:kept,truncated:body.length>kept.length,chars:body.length,refs:list};
}
export function formatReport(report){
 const lines=[`URL: ${report.url}`,`Title: ${report.title||'(none)'}`,''];
 if(report.refs.length){
  lines.push('Clickable and typeable elements, by ref:');
  for(const r of report.refs)lines.push(`  [${r.ref}] ${r.kind}${r.name?` ${JSON.stringify(r.name)}`:''}${r.value?` = ${JSON.stringify(r.value)}`:''}`);
  lines.push('');
 }
 lines.push('Page text:',report.text||'(no visible text)');
 if(report.truncated)lines.push('',`[Page text was cut at ${report.text.length} of ${report.chars} characters. Scroll or read a more specific page for the rest.]`);
 return lines.join('\n');
}

// ---- Saved logins ---------------------------------------------------------
// A login is pinned to one origin. Roundtable types it only when the page in front of it is that
// origin, which is what makes this different from keeping a password in a notes file: a look-alike
// page cannot receive it, and neither can the agent that asked.
export function originOf(input){
 const href=normalizeUrl(input);
 const url=new URL(href);
 if(url.protocol!=='https:'&&!LOCAL.test(url.hostname))throw new Error('Save logins for https pages only. An http page sends a password in the clear.');
 return url.origin;
}
export function validateLogin(input={},existing=[]){
 const label=String(input.label||'').trim();
 if(!label||label.length>BROWSER_LIMITS.label)throw new Error(`Give this login a short name, under ${BROWSER_LIMITS.label} characters.`);
 if(existing.some(l=>l.label.toLowerCase()===label.toLowerCase()&&l.id!==input.id))throw new Error(`${label} is already saved. Edit that login to replace it.`);
 if(existing.length>=BROWSER_LIMITS.logins&&!existing.some(l=>l.id===input.id))throw new Error(`Roundtable keeps up to ${BROWSER_LIMITS.logins} logins.`);
 const origin=originOf(input.origin??input.url);
 const editing=existing.some(l=>l.id===input.id);
 const username=input.username===undefined||input.username===null?undefined:String(input.username).trim();
 const password=input.password===undefined||input.password===null||input.password===''?undefined:String(input.password);
 if(username!==undefined){
  if(!username||username.length>BROWSER_LIMITS.username)throw new Error('Enter the username or email for this login.');
  if(/[\0\r\n]/.test(username))throw new Error('A username cannot contain line breaks.');
 }else if(!editing)throw new Error('Enter the username or email for this login.');
 if(password!==undefined){
  if(password.length>BROWSER_LIMITS.password)throw new Error('That password is too long to store.');
  if(/[\0\r\n]/.test(password))throw new Error('A password cannot contain line breaks.');
 }else if(!editing)throw new Error('Enter the password for this login.');
 return {label,origin,...(username===undefined?{}:{username}),...(password===undefined?{}:{password})};
}
export function matchLogin(login,pageUrl){
 if(!login)return 'No login is saved under that name.';
 // about:blank and friends have an opaque origin, which no saved login can match.
 let origin;try{origin=new URL(pageUrl).origin;}catch{origin='null';}
 if(origin==='null')return `Open ${login.origin} and its own sign-in page first, then use this login.`;
 if(origin!==login.origin)return `The page in front of the browser is ${origin}. The saved login for ${login.label} is for ${login.origin}, so it was not typed.`;
 return null;
}
// What an agent may know about a login: where to use it and what to call it. Never the username, so
// nothing identifying reaches a model, and never the password.
export const describeLogins=(logins=[])=>logins.map(l=>({label:l.label,origin:l.origin}));
