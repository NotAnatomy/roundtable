import test from 'node:test';
import assert from 'node:assert/strict';
import {threadParams,turnParams} from '../codex-protocol.mjs';
// Wire enums independently checked against Codex's generated 0.154 schema.
test('thread sandbox enum uses hyphens for both start and resume',()=>{
 for(const write of [false,true])for(const session of [undefined,'existing-thread']){
  const p=threadParams({cwd:'/tmp/project',write,session});
  assert.ok(['read-only','workspace-write'].includes(p.sandbox));
  assert.equal(p.sandbox,write?'workspace-write':'read-only');
  assert.equal(p.approvalPolicy,'never');assert.equal(p.threadId,session);
 }
});
test('turn policy keeps camelCase and explicit policy fields in both modes',()=>{
 for(const write of [false,true]){
  const p=turnParams({threadId:'existing-thread',cwd:'/tmp/project',write,prompt:'hello'});
  assert.equal(p.sandboxPolicy.type,write?'workspaceWrite':'readOnly');
  assert.equal(p.sandboxPolicy.networkAccess,false);assert.deepEqual(p.input,[{type:'text',text:'hello',text_elements:[]}]);
  if(write){assert.deepEqual(p.sandboxPolicy.writableRoots,['/tmp/project']);assert.equal(p.sandboxPolicy.excludeTmpdirEnvVar,false);assert.equal(p.sandboxPolicy.excludeSlashTmp,false);}
 }
});
