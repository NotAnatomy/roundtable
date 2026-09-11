import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateAttachments} from './skill-library.mjs';
const LIMIT=6*1024*1024;
// Decoded bytes of image pages allowed in one provider request, below the smallest documented provider request ceiling.
export const MEDIA_REQUEST_BYTES=10*1024*1024,MEDIA_REQUEST_PAGES=20;
export const decodedSize=data=>Math.floor(data.length*3/4)-(data.endsWith('==')?2:data.endsWith('=')?1:0);
function decode(data,mime){
 if(typeof data!=='string'||data.length>LIMIT*1.4||!data.length||data.length%4!==0||/[^A-Za-z0-9+/=]/.test(data))throw new Error('Invalid or oversized attachment.');
 const bytes=Buffer.from(data,'base64');if(bytes.toString('base64')!==data)throw new Error('Invalid base64 attachment.');if(bytes.length>LIMIT)throw new Error('Each file must be under 6 MB.');
 const valid=mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:false;
 if(!valid)throw new Error('File contents do not match a supported PNG, JPEG or PDF.');return bytes;
}
export async function mediaStore(directory){
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const load=async id=>{if(!/^[a-f0-9]{64}$/.test(id||''))throw new Error('Invalid attachment ID.');try{return JSON.parse(await fs.readFile(path.join(directory,id+'.json'),'utf8'));}catch{throw new Error('Attachment is missing. Attach the file again.');}};
 return {load,
 async upload(input){
  const {name,mime,data}=input;if(typeof name!=='string'||!name.trim()||name.length>160||/[\x00-\x1f/\\]/.test(name))throw new Error('Use a short file name without slashes.');
  const original=decode(data,mime),pages=mime==='application/pdf'?input.pages:[{mime,data}];
  if(!Array.isArray(pages)||!pages.length||pages.length>6)throw new Error('Attach PDFs with one to six pages. Split larger documents first.');
  let bytes=original.length;for(const p of pages){if(!['image/png','image/jpeg'].includes(p?.mime))throw new Error('PDF pages must be rendered as images.');bytes+=decode(p.data,p.mime).length;}if(bytes>12*1024*1024)throw new Error('Rendered file is too large. Use a smaller document.');
  const text=typeof input.text==='string'?input.text.slice(0,24000):'';
  const value={mime,data,pages:pages.map(p=>({mime:p.mime,data:p.data})),text};const id=createHash('sha256').update(JSON.stringify(value)).digest('hex');await fs.writeFile(path.join(directory,id+'.json'),JSON.stringify(value),{mode:0o600});
  return {id,name,mime,size:original.length,pages:pages.length,...(text?{text}:{})};
 },
 async validate(files=[]){if(!Array.isArray(files)||files.length>3)throw new Error('Attach up to three files.');const out=[];let chars=0;for(const f of files){if(f.id){const saved=await load(f.id);if(typeof f.name!=='string'||f.name.length>160||/[\x00-\x1f/\\]/.test(f.name))throw new Error('Invalid file name.');out.push({id:f.id,name:f.name,mime:saved.mime,pages:saved.pages.length,size:Buffer.byteLength(saved.data,'base64'),...(saved.text?{text:saved.text}:{})});}else out.push(...validateAttachments([f]));chars+=out.at(-1).text?.length||0;}if(chars>40000)throw new Error('Text across attachments must be under 40,000 characters.');return out;},
 async images(refs){const images=[];let bytes=0;for(const ref of refs){const saved=await load(ref.id);for(const [i,p]of saved.pages.entries()){bytes+=decodedSize(p.data);images.push({...p,label:ref.name+(saved.mime==='application/pdf'?` page ${i+1}`:'')});}}if(images.length>MEDIA_REQUEST_PAGES)throw new Error(`Recent attachments exceed ${MEDIA_REQUEST_PAGES} image pages. Continue in a new room with the files you need.`);if(bytes>MEDIA_REQUEST_BYTES)throw new Error(`Recent attachments total ${(bytes/1048576).toFixed(1)} MB of image pages; one request allows ${MEDIA_REQUEST_BYTES/1048576} MB. Continue in a new room with the files you need.`);return images;}
 };
}
export function mediaRefs(room,after){const all=room.messages.filter(m=>m.status==='complete'&&m.kind!=='error');const recent=new Set(all.filter(m=>!m.agentId).slice(-3).map(m=>m.id));const start=after?all.findIndex(m=>m.id===after)+1:0;const seen=new Set();return all.slice(start).filter(m=>recent.has(m.id)).flatMap(m=>m.attachments||[]).filter(f=>{if(!f.id||seen.has(f.id))return false;seen.add(f.id);return true;}).map(f=>({id:f.id,name:f.name}));}
export function claudeContent(prompt,media=[]){return [{type:'text',text:prompt},...media.flatMap(p=>[{type:'text',text:p.label||'Attached image'},{type:'image',source:{type:'base64',media_type:p.mime,data:p.data}}])];}
export function claudeInput(prompt,media,session){return {type:'user',session_id:session||'',parent_tool_use_id:null,message:{role:'user',content:claudeContent(prompt,media)}};}
