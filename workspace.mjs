import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
export async function resolveWorkspace(value){
 if(!path.isAbsolute(value))throw new Error('Use an absolute project folder path.');
 const resolved=await fs.realpath(value),home=await fs.realpath(os.homedir());
 if(resolved===home)throw new Error('Choose a specific project folder inside your home folder, not the home folder itself.');
 if(resolved===path.parse(resolved).root||resolved.split(path.sep).filter(Boolean).length<2)throw new Error('Choose a specific project folder, not a root directory.');
 const protectedPaths=['/System','/Library','/private',path.join(home,'Library'),path.join(home,'.ssh'),path.join(home,'.aws'),path.join(home,'.config')];
 if(protectedPaths.some(p=>resolved===p||resolved.startsWith(p+path.sep)))throw new Error('Choose a project outside system and credential folders.');
 if(!(await fs.stat(resolved)).isDirectory())throw new Error('Project folder does not exist.');return resolved;
}
export const overlap=(a,b)=>a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep);
