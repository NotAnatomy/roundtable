export const starterSkills=[
 {id:'code-review',name:'Code review',description:'Find concrete bugs and explain their impact.',instructions:'Review the provided code for correctness, security and edge cases. Prioritize reproducible defects over style. State what was actually inspected or tested. Provide a minimal correction and a verification step. Never claim a test ran without a tool result.'},
 {id:'product-design',name:'Product design',description:'Turn an idea into a clear, usable flow.',instructions:'Start from the person and task. Map the shortest useful flow, explain key tradeoffs, and cover empty, loading, error and mobile states. Use concrete interface copy. Recommend one coherent direction instead of unrelated options.'},
 {id:'source-check',name:'Source checking',description:'Separate verified facts from assumptions.',instructions:'Identify claims needing external verification. Use authoritative sources when tools permit, cite direct links and distinguish evidence from interpretation. If browsing is unavailable, say so and request the needed source. Do not invent citations.'},
 {id:'lsl-review',name:'LSL review',description:'Review Second Life scripts and event flows.',instructions:'Focus on LSL event flow, permissions, listen lifecycle, memory use and link message validation. Distinguish simulator behavior from assumptions. Check actual functions against official Second Life documentation when browsing is available. Do not fabricate API names or promise performance without measurement.'},
 {id:'concise-collaboration',name:'Concise collaboration',description:'React to peers without repeating the whole answer.',instructions:'Respond to the latest user request and only the relevant peer points. Add a new finding, clear agreement, or a specific correction. Avoid repeating introductions and generic readiness statements. Keep the reply compact unless the user requests detail. Use readable Markdown.'}
];
export function validateSkill(input){
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>64)throw new Error('Give the skill a name under 64 characters.');
 if(typeof input.description!=='string'||input.description.length>400)throw new Error('Keep the description under 400 characters.');
 if(typeof input.instructions!=='string'||!input.instructions.trim()||input.instructions.length>12000)throw new Error('Skill instructions must contain 1 to 12,000 characters.');
 const limitations=typeof input.limitations==='string'?input.limitations.trim().slice(0,600):'';
 return {name:input.name.trim(),description:input.description.trim(),instructions:input.instructions.trim(),...(limitations?{limitations}:{})};
}
export function validateAttachments(files=[]){
 if(!Array.isArray(files)||files.length>3)throw new Error('Attach up to three text or code files.');
 let total=0;return files.map(f=>{if(typeof f.name!=='string'||!f.name.trim()||f.name.length>160||/[\x00-\x1f/\\]/.test(f.name)||typeof f.text!=='string'||f.text.includes('\0')||f.text.length>24000)throw new Error('Use text or code files under 24,000 characters each.');total+=f.text.length;if(total>40000)throw new Error('Attachments must total under 40,000 characters.');return {name:f.name,text:f.text};});
}
export function messageSize(m){return (m.text||'').length+(m.attachments||[]).reduce((n,f)=>n+(f.text?.length||0),0);}
