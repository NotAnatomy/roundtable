// SandboxMode (thread) and SandboxPolicy (turn) are different wire types.
// Verified against schemas from Codex CLI 0.154.0-alpha.3 and upstream v2 types.
export function threadParams({cwd,write,session,model}) {
 return {cwd,approvalPolicy:'never',sandbox:write?'workspace-write':'read-only',...(session?{threadId:session}:{}),...(model?{model}:{})};
}
export function turnParams({threadId,prompt,cwd,write,model,effort,media=[]}) {
 return {threadId,...(model?{model}:{}),...(effort&&effort!=='auto'?{effort}:{}),input:[{type:'text',text:prompt,text_elements:[]},...media.flatMap(p=>[{type:'text',text:p.label||'Attached image',text_elements:[]},{type:'image',url:`data:${p.mime};base64,${p.data}`}])],cwd,approvalPolicy:'never',sandboxPolicy:write?
  {type:'workspaceWrite',writableRoots:[cwd],networkAccess:false,excludeTmpdirEnvVar:false,excludeSlashTmp:false}:
  {type:'readOnly',networkAccess:false}};
}
