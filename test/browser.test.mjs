import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {checkUrl,hostRule,normalizeUrl,validateAction,describeAction,pageReport,formatReport,validateLogin,matchLogin,describeLogins,originOf,BROWSER_LIMITS} from '../browser.mjs';
import {findBrowser,openBrowser} from '../cdp.mjs';

const self={selfOrigin:'http://127.0.0.1:4317'};

test('only web pages open, and never this app',()=>{
 assert.equal(normalizeUrl('example.com'),'https://example.com/');
 assert.equal(checkUrl('https://example.com/search?q=1',self),'https://example.com/search?q=1');
 for(const bad of ['file:///etc/passwd','chrome://settings','javascript:alert(1)','data:text/html,<b>','view-source:https://example.com'])
  assert.throws(()=>checkUrl(bad,self),/http and https/,bad);
 assert.throws(()=>checkUrl('',self),/Give a web address/);
 assert.throws(()=>checkUrl('http://127.0.0.1:4317/?k=1',self),/Roundtable itself/);
 // The window's own address is refused whatever spelling reaches it.
 assert.match(hostRule('http://127.0.0.1:4317/api/bootstrap',self),/Roundtable itself/);
 // A Lounge room has no shell and no project, so it has no business on this network.
 for(const local of ['http://localhost:3000','http://192.168.1.1/admin','http://10.0.0.5','http://printer.local','http://169.254.1.1'])
  assert.match(hostRule(normalizeUrl(local),self),/Only a Work room/,local);
 assert.equal(hostRule('http://localhost:3000/',{...self,allowLocal:true}),null);
 assert.equal(hostRule('https://example.com/',self),null);
});
test('the action list is the whole surface an agent has',()=>{
 assert.deepEqual(validateAction({action:'open',url:'example.com'},self),{action:'open',url:'https://example.com/'});
 assert.deepEqual(validateAction({action:'type',ref:'3',text:'hello'}),{action:'type',ref:3,text:'hello',submit:false,replace:true});
 assert.deepEqual(validateAction({action:'type',ref:3,text:'hi',submit:true,replace:false}),{action:'type',ref:3,text:'hi',submit:true,replace:false});
 assert.deepEqual(validateAction({action:'press',key:'enter'}),{action:'press',key:'Enter'});
 assert.deepEqual(validateAction({action:'scroll'}),{action:'scroll',direction:'down'});
 assert.deepEqual(validateAction({action:'wait',seconds:3}),{action:'wait',seconds:3});
 for(const bad of [{action:'evaluate',script:'1'},{action:'download',url:'x'},{action:''},{action:'navigate'}])
  assert.throws(()=>validateAction(bad,self),/is not a browser action/);
 assert.throws(()=>validateAction({action:'click',ref:0}),/ref number/);
 assert.throws(()=>validateAction({action:'click',ref:999}),/ref number/);
 assert.throws(()=>validateAction({action:'click',ref:'nope'}),/ref number/);
 assert.throws(()=>validateAction({action:'type',ref:1,text:''}),/text to type/);
 assert.throws(()=>validateAction({action:'type',ref:1,text:'x'.repeat(BROWSER_LIMITS.text+1)}),/under/);
 assert.throws(()=>validateAction({action:'press',key:'F12'}),/Press one of/);
 assert.throws(()=>validateAction({action:'wait',seconds:600}),/between 1 and/);
 assert.throws(()=>validateAction({action:'login'}),/Name the saved login/);
 assert.equal(describeAction({action:'click',name:'Sign in',ref:4}),'Clicked “Sign in”');
 assert.equal(describeAction({action:'open',url:'https://example.com/a/b'}),'Opened example.com');
 assert.equal(describeAction({action:'login',label:'Work email'}),'Filled the saved login for Work email');
});
test('a page is reported within a budget, with refs the agent can act on',()=>{
 const report=pageReport({url:'https://example.com/',title:'Example',text:'a'.repeat(9000),refs:[{ref:1,kind:'button',name:'Go',value:''}]},200);
 assert.equal(report.text.length,200);assert.equal(report.truncated,true);assert.equal(report.chars,9000);
 const printed=formatReport(report);
 assert.match(printed,/URL: https:\/\/example\.com\//);
 assert.match(printed,/\[1\] button "Go"/);
 assert.match(printed,/was cut at 200 of 9000/);
 const short=pageReport({url:'x',title:'',text:'  hi  ',refs:[]});
 assert.equal(short.text,'hi');assert.equal(short.truncated,false);
 assert.match(formatReport(short),/Title: \(none\)/);
 // A page with a hundred links cannot hand the agent an unbounded list.
 const many=pageReport({url:'x',title:'t',text:'',refs:Array.from({length:400},(_,i)=>({ref:i+1,kind:'a',name:'n'}))});
 assert.equal(many.refs.length,BROWSER_LIMITS.refs);
});
test('a saved login is pinned to one site and shows an agent nothing but its name',()=>{
 const fields=validateLogin({label:'Work email',origin:'https://mail.example.com/login?next=/inbox',username:'me@example.com',password:'hunter2hunter2'});
 assert.deepEqual(fields,{label:'Work email',origin:'https://mail.example.com',username:'me@example.com',password:'hunter2hunter2'});
 assert.throws(()=>originOf('http://mail.example.com'),/https pages only/);
 assert.equal(originOf('http://localhost:3000/login'),'http://localhost:3000');
 assert.throws(()=>validateLogin({label:'',origin:'https://a.com',username:'u',password:'p'}),/short name/);
 assert.throws(()=>validateLogin({label:'A',origin:'https://a.com',password:'p'}),/username or email/);
 assert.throws(()=>validateLogin({label:'A',origin:'https://a.com',username:'u'}),/password/);
 assert.throws(()=>validateLogin({label:'Work email',origin:'https://a.com',username:'u',password:'p'},[{id:'x',label:'work EMAIL'}]),/already saved/);
 assert.throws(()=>validateLogin({label:'A',origin:'https://a.com',username:'u',password:'bad\npassword'}),/line breaks/);
 assert.throws(()=>validateLogin({label:'A',origin:'https://a.com',username:'u',password:'p'},Array.from({length:BROWSER_LIMITS.logins},(_,i)=>({id:'l'+i,label:'L'+i}))),/up to 30/);
 // Editing keeps the stored values when the fields are left blank.
 assert.deepEqual(validateLogin({id:'me',label:'Work email',origin:'https://a.com'},[{id:'me',label:'Work email'}]),{label:'Work email',origin:'https://a.com'});
 const login={label:'Work email',origin:'https://mail.example.com'};
 assert.equal(matchLogin(login,'https://mail.example.com/login'),null);
 // The guard that makes this safer than a password in a prompt.
 assert.match(matchLogin(login,'https://mail-example.com/login'),/was not typed/);
 assert.match(matchLogin(login,'http://mail.example.com/login'),/was not typed/);
 assert.match(matchLogin(login,'https://login.mail.example.com/'),/was not typed/);
 assert.match(matchLogin(undefined,'https://mail.example.com'),/No login is saved/);
 for(const opaque of ['about:blank','',null])assert.match(matchLogin(login,opaque),/and its own sign-in page first/,String(opaque));
 assert.deepEqual(describeLogins([{id:'1',label:'Work email',origin:'https://mail.example.com',username:'me@example.com',password:'secret'}]),
  [{label:'Work email',origin:'https://mail.example.com'}]);
});

// ---- The real browser -----------------------------------------------------
// Runs against whichever Chromium browser is installed, headless so it stays out of the way.
// Set ROUNDTABLE_TEST_BROWSER=0 to skip it.
const installed=process.env.ROUNDTABLE_TEST_BROWSER==='0'?null:await findBrowser();
test('a real browser is driven: pages are read, fields typed, clicks followed, downloads refused',{skip:installed?false:'No Chromium browser installed'},async t=>{
 const page=`<!doctype html><title>Sign in</title><body>
  <h1>Welcome back</h1>
  <form action="/done" method="get">
   <label>Email <input type="email" name="email" placeholder="Email"></label>
   <label>Password <input type="password" name="password" placeholder="Password"></label>
   <button type="submit">Sign in</button>
  </form>
  <a href="/done?via=link">Skip sign in</a>
  <p>Nothing else to see.</p></body>`;
 const site=http.createServer((req,res)=>{
  if(req.url.startsWith('/done')){res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><title>Done</title><body><h1>You are in</h1><p>Query: ${req.url}</p></body>`);return;}
  res.writeHead(200,{'Content-Type':'text/html'});res.end(page);
 });
 site.listen(0,'127.0.0.1');await once(site,'listening');
 const origin=`http://127.0.0.1:${site.address().port}`;
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roundtable-cdp-'));
 let session;
 try{
  session=await openBrowser({profileDir:path.join(dir,'profile'),headless:true});
  t.diagnostic(`driving ${session.name}`);
  await session.goto(origin+'/');
  const first=pageReport(await session.read(4000,60));
  assert.equal(first.title,'Sign in');
  assert.match(first.text,/Welcome back/);
  const email=first.refs.find(r=>r.kind==='input[email]'),button=first.refs.find(r=>r.kind==='button');
  assert.ok(email&&button,'the form fields and the button were found');

  // Typing goes through the real input pipeline, so the page sees ordinary keystrokes.
  await session.focus(email.ref);
  await session.insert('me@example.com');
  const typed=pageReport(await session.read(4000,60));
  assert.equal(typed.refs.find(r=>r.kind==='input[email]').value,'me@example.com');
  // A password field's contents are never reported back, even once filled.
  await session.loginFields();
  assert.equal(await session.fillField('pass','hunter2hunter2'),true);
  const masked=pageReport(await session.read(4000,60));
  const passwordRef=masked.refs.find(r=>r.kind==='input[password]');
  assert.equal(passwordRef.value,'(filled)');
  assert.ok(!masked.text.includes('hunter2'),'the typed password is not in the page text');
  assert.ok(!JSON.stringify(masked.refs).includes('hunter2'),'the typed password is not in the element list');
  await session.clearFieldMarks();

  // Clicking the submit button navigates, and the next read is the page that arrived.
  await session.click(button.ref);
  const done=pageReport(await session.read(4000,60));
  assert.equal(done.title,'Done');
  assert.match(done.text,/You are in/);
  assert.match(done.url,/email=me%40example.com/);

  await session.history(-1);
  assert.equal((await session.where()).url,origin+'/');
  const back=pageReport(await session.read(4000,60));
  const link=back.refs.find(r=>r.name==='Skip sign in');
  await session.click(link.ref);
  assert.match((await session.where()).url,/via=link/);

  const shot=await session.shot();
  assert.ok(shot.length>500,'a screenshot came back');
  assert.equal(Buffer.from(shot,'base64').subarray(0,2).toString('hex'),'ffd8','it is a JPEG');

  // A ref from an older page is refused rather than clicking whatever now sits in that spot.
  await session.goto(origin+'/');
  await session.read(4000,60);
  await session.goto(origin+'/done');
  await assert.rejects(()=>session.click(59),/not on this page any more/);
  assert.equal(session.alive,true);
 }finally{
  await session?.close();
  site.close();
  await fs.rm(dir,{recursive:true,force:true});
 }
});
