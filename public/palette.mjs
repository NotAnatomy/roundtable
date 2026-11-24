// Ranking for the command palette. Pure, so the ordering can be tested without a DOM.
// A prefix beats a word start, which beats any substring, which beats a scattered subsequence.
export function score(query,text){
 if(!query)return 0;
 const t=String(text||'').toLowerCase(),q=query.toLowerCase().trim();
 if(!q)return 0;
 const i=t.indexOf(q);
 if(i===0)return 100;
 if(i>0)return /[\s/·-]/.test(t[i-1])?80:55;
 let pos=-1;
 for(const c of q){pos=t.indexOf(c,pos+1);if(pos<0)return -1;}
 return 20;
}
// Commands are {id,title,hint,group,run}. A hit on the hint ranks below a hit on the title.
export function matchCommands(query,commands){
 const q=String(query||'').trim();
 return commands.map((command,index)=>{
   const title=score(q,command.title),hint=title<0?score(q,command.hint)-25:-1;
   return {command,index,rank:Math.max(title,hint)};
  })
  .filter(r=>r.rank>=0)
  .sort((a,b)=>b.rank-a.rank||a.index-b.index)
  .map(r=>r.command);
}
// Case-insensitive, non-overlapping match offsets, used by find in chat.
export function findRanges(haystack,needle){
 const out=[];const t=String(haystack||'').toLowerCase(),q=String(needle||'').toLowerCase();
 if(!q)return out;
 for(let i=t.indexOf(q);i>=0;i=t.indexOf(q,i+q.length))out.push([i,i+q.length]);
 return out;
}
