import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resolveCommand} from '../commands.mjs';
test('skips a broken first installation and reports broken separately from missing',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'roundtable-path-'));
 try{
  const bad=path.join(dir,'bad'),good=path.join(dir,'good');await fs.mkdir(bad);await fs.mkdir(good);
  await fs.writeFile(path.join(bad,'codex'),'#!/bin/sh\necho "spawn native-codex ENOENT" >&2\nexit 1\n',{mode:0o755});
  await fs.writeFile(path.join(good,'codex'),'#!/bin/sh\necho "codex test"\n',{mode:0o755});
  const found=await resolveCommand('codex',{directories:[bad,good]});assert.equal(found.path,path.join(good,'codex'));assert.equal(found.ok,true);
  const broken=await resolveCommand('codex',{directories:[bad]});assert.equal(broken.status,'broken');assert.match(broken.reason,/ENOENT/);
  assert.equal((await resolveCommand('claude',{directories:[bad]})).status,'missing');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
