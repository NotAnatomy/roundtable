// Scheduled prompts. A routine sends a message you wrote into a room at a time you chose and lets the
// room take its normal turn. It is the one thing in Roundtable that starts a turn without you present,
// so the rules that bound it live here rather than in the request handler.
export const ROUTINE_LIMITS={instruction:4000,title:80,count:20,minMinutes:15,skips:3};
const pad=n=>String(n).padStart(2,'0');
export function validateRoutine(input,existing=[],rooms=[]){
 const title=String(input?.title||'').trim();
 if(!title||title.length>ROUTINE_LIMITS.title)throw new Error(`Give the routine a name under ${ROUTINE_LIMITS.title} characters.`);
 const instruction=String(input?.instruction||'').trim();
 if(!instruction||instruction.length>ROUTINE_LIMITS.instruction)throw new Error(`Write the message to send, under ${ROUTINE_LIMITS.instruction} characters.`);
 const room=rooms.find(r=>r.id===input?.roomId);
 if(!room)throw new Error('Choose a room for this routine.');
 if(room.archived)throw new Error('That room is archived. Unarchive it before giving it a routine.');
 // An unattended turn has nobody to approve a file change, and Roundtable grants its tools per room
 // rather than per action, so a room that can write to a project cannot carry one.
 if(room.mode==='work'&&room.allowEdits)throw new Error('This room allows project edits. Routines run while you are away, with nobody to approve a change, so turn edits off in Room settings first.');
 const target=String(input?.target||'all');
 if(target!=='all'&&!room.agents.some(a=>a.id===target&&a.enabled))throw new Error('Choose everyone or an enabled participant.');
 if(!existing.some(r=>r.id===input?.id)&&existing.length>=ROUTINE_LIMITS.count)throw new Error(`You can save up to ${ROUTINE_LIMITS.count} routines.`);
 return {title,instruction,roomId:room.id,target,schedule:validateSchedule(input?.schedule)};
}
export function validateSchedule(schedule){
 const kind=schedule?.kind;
 if(kind==='every'){
  const minutes=Number(schedule.minutes);
  if(!Number.isInteger(minutes)||minutes<ROUTINE_LIMITS.minMinutes||minutes>60*24*30)throw new Error(`Repeat at least every ${ROUTINE_LIMITS.minMinutes} minutes. Each run spends the same provider quota as a message you send.`);
  return {kind,minutes};
 }
 if(kind==='daily'){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(schedule.time||'')))throw new Error('Enter a time as HH:MM on a 24 hour clock.');
  const days=['all','weekday','weekend'].includes(schedule.days)?schedule.days:'all';
  return {kind,time:schedule.time,days};
 }
 if(kind==='once'){
  const at=Date.parse(schedule.at);
  if(!Number.isFinite(at))throw new Error('Choose a date and time for this routine to run.');
  return {kind,at:new Date(at).toISOString()};
 }
 throw new Error('Choose how often this routine runs.');
}
// The next moment a schedule is due, or null when it never will be again. Local time throughout:
// "09:00 on weekdays" means the user's own morning, not UTC.
export function nextRun(schedule,from=Date.now()){
 if(schedule?.kind==='every')return from+schedule.minutes*60000;
 if(schedule?.kind==='once'){const at=Date.parse(schedule.at);return Number.isFinite(at)&&at>from?at:null;}
 if(schedule?.kind!=='daily')return null;
 const [hours,minutes]=schedule.time.split(':').map(Number),at=new Date(from);
 at.setHours(hours,minutes,0,0);
 if(at.getTime()<=from)at.setDate(at.getDate()+1);
 for(let i=0;i<8;i++){
  const day=at.getDay(),weekday=day>=1&&day<=5;
  if(schedule.days==='all'||(schedule.days==='weekday')===weekday)return at.getTime();
  at.setDate(at.getDate()+1);
 }
 return null;
}
export const describeSchedule=s=>s?.kind==='every'?(s.minutes%60===0&&s.minutes>=60?`Every ${s.minutes/60} hour${s.minutes===60?'':'s'}`:`Every ${s.minutes} minutes`)
 :s?.kind==='daily'?`${{all:'Every day',weekday:'Weekdays',weekend:'Weekends'}[s.days]} at ${s.time}`
 :s?.kind==='once'?`Once on ${new Date(s.at).toLocaleString()}`:'Not scheduled';
export const dueRoutines=(routines=[],now=Date.now())=>routines.filter(r=>r.enabled&&typeof r.nextRun==='number'&&r.nextRun<=now);
// Why a due routine cannot run right now. Null means it can.
export function blockedReason(routine,room,busy){
 if(!room)return 'Its room was deleted.';
 if(room.archived)return 'Its room is archived.';
 if(busy)return 'Its room was still replying.';
 if(room.mode==='work'&&room.allowEdits)return 'Its room now allows project edits.';
 if(routine.target!=='all'&&!room.agents.some(a=>a.id===routine.target&&a.enabled))return 'Its participant is no longer enabled.';
 if(!room.agents.some(a=>a.enabled))return 'Its room has no enabled participants.';
 return null;
}
// A schedule that cannot fire again is finished, not paused: "once" has run, or a clock change orphaned it.
// `skips` counts consecutive turns that did not start. A routine whose room was archived, emptied of
// participants or switched to allowing edits would otherwise go on failing on a timer nobody is watching,
// so it pauses itself and says why.
export function advance(routine,{ran,reason,now=Date.now()}){
 const next={...routine,lastRun:ran?now:routine.lastRun,lastResult:ran?'ok':'skipped',lastReason:ran?'':reason||'',
  skips:ran?0:(routine.skips||0)+1};
 next.nextRun=nextRun(routine.schedule,now);
 if(next.skips>=ROUTINE_LIMITS.skips){next.enabled=false;next.lastReason=`Paused after ${next.skips} runs that could not start. Last reason: ${reason||'unknown'}`;next.nextRun=null;}
 else if(next.nextRun===null)next.enabled=false;
 return next;
}
