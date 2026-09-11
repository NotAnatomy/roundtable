import {usageOf} from './usage.mjs';
import {claudeContent} from './media.mjs';
const GOOGLE='https://generativelanguage.googleapis.com/v1beta';
export function routerBase(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!(u.hostname==='agentrouter.org'||u.hostname.endsWith('.agentrouter.org')))throw new Error('Use the HTTPS API base URL from your AgentRouter dashboard, on agentrouter.org.');
 if(u.pathname==='/'||u.pathname==='')u.pathname='/v1';
 return u.href.replace(/\/$/,'');
}
function hide(text,key){return key?String(text).split(key).join('[redacted]'):String(text);}
export class ProviderError extends Error{constructor(message,details){super(message);this.details=details;}}
async function request(url,options,key,fetcher=fetch){
 let res;try{res=await fetcher(url,{...options,redirect:'error',signal:options.signal||AbortSignal.timeout(20000)});}catch(e){if(options.signal?.aborted)throw e;throw new ProviderError('Could not reach the provider. Check your connection and API address.',{code:'network_error',endpoint:url});}
 if(!res.ok){let detail='';try{const e=await res.json();detail=String(e.error?.message||e.message||'');}catch{}
 const clientBlocked=res.status===401&&/unauthorized client/i.test(detail);
 const prefix=clientBlocked?'AgentRouter rejected this application. Its response says "unauthorized client detected". Ask AgentRouter support to authorize a custom API client.':res.status===401?'The provider rejected authentication. Check the saved key and its permissions.':`Provider returned HTTP ${res.status}.`;
 throw new ProviderError(hide(prefix+(detail?' Provider detail: '+detail.slice(0,1000):''),key),{code:clientBlocked?'client_not_authorized':res.status===401?'authentication_failed':'provider_error',status:res.status,endpoint:url});}
 const type=res.headers?.get('content-type')||'';if(type&&!type.includes('json'))throw new ProviderError('The provider returned a web page instead of API JSON. Check the API address or ask the provider about its security check.',{code:'unexpected_response',status:res.status,endpoint:url});
 return res;
}
export async function listApiModels(provider,config,fetcher=fetch){
 if(!config?.key)throw new Error('Save an API key in Connections first.');
 const models=[];let page='';
 for(let i=0;i<10;i++){
  const url=provider==='google'?`${GOOGLE}/models?pageSize=1000${page?'&pageToken='+encodeURIComponent(page):''}`:`${routerBase(config.baseURL)}/models`;
  const headers=provider==='google'?{'x-goog-api-key':config.key}:{Authorization:`Bearer ${config.key}`};
  const res=await request(url,{headers},config.key,fetcher),d=await res.json();
  if(provider==='google'){for(const m of d.models||[])if(m.supportedGenerationMethods?.includes('generateContent'))models.push({id:m.name.replace(/^models\//,''),name:m.displayName||m.name});page=d.nextPageToken||'';if(!page)break;}
  else {for(const m of d.data||[])if(m.id)models.push({id:m.id,name:m.id});break;}
 }
 if(!models.length)throw new Error('No chat models were returned. Check the endpoint or enter a model ID from your provider dashboard.');
 return models;
}
export function googleBody(prompt,model,effort){
 const body={contents:[{role:'user',parts:[{text:prompt}]}]};
 if(effort&&effort!=='auto'){
  if(/^gemini-3/.test(model))body.generationConfig={thinkingConfig:{thinkingLevel:effort.toUpperCase()}};
  else if(/^gemini-2\.5/.test(model))body.generationConfig={thinkingConfig:{thinkingBudget:effort==='low'?1024:effort==='medium'?4096:8192}};
  else throw new Error('This model has no configured effort control. Choose Provider default for speed.');
 }
 return body;
}
export async function runApi({provider,prompt,model,effort,signal,onText,config,fetcher=fetch,maxOutputTokens=8192,media=[]}){
 if(!config?.key)throw new Error('Connect '+(provider==='google'?'Google Gemini':'AgentRouter')+' in Connections first.');
 if(!model)throw new Error('Choose a model for this participant in Room settings.');
 let url,headers,body;
 if(provider==='google'){
  url=`${GOOGLE}/models/${encodeURIComponent(model.replace(/^models\//,''))}:generateContent`;
  headers={'Content-Type':'application/json','x-goog-api-key':config.key};body=googleBody(prompt,model,effort);body.contents[0].parts.push(...media.flatMap(p=>[{text:p.label||'Attached image'},{inlineData:{mimeType:p.mime,data:p.data}}]));body.generationConfig={...body.generationConfig,maxOutputTokens};
 }else{
  const base=routerBase(config.baseURL),anthropic=config.protocol==='anthropic';
  url=base+(anthropic?'/messages':'/chat/completions');
  headers={'Content-Type':'application/json',...(anthropic?{Authorization:`Bearer ${config.key}`,'anthropic-version':'2023-06-01'}:{Authorization:`Bearer ${config.key}`})};
  body={model,messages:[{role:'user',content:media.length?(anthropic?claudeContent(prompt,media):[{type:'text',text:prompt},...media.flatMap(p=>[{type:'text',text:p.label||'Attached image'},{type:'image_url',image_url:{url:`data:${p.mime};base64,${p.data}`}}])]):prompt}],...(anthropic?{max_tokens:maxOutputTokens}:{stream:false,max_tokens:maxOutputTokens})};
 }
 const res=await request(url,{method:'POST',headers,body:JSON.stringify(body),signal},config.key,fetcher),d=await res.json();
 let text;
 if(provider==='google'){
  text=d.candidates?.[0]?.content?.parts?.filter(p=>p.text&&!p.thought).map(p=>p.text).join('');
  if(!text)throw new Error('Google returned no text: '+(d.promptFeedback?.blockReason||d.candidates?.[0]?.finishReason||'empty response'));
 }else if(config.protocol==='anthropic')text=d.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n');
 else {const c=d.choices?.[0]?.message?.content;text=typeof c==='string'?c:Array.isArray(c)?c.map(p=>p.text||'').join(''):null;}
 if(!text)throw new Error('The provider returned no chat text. Check the selected model and API format.');
 onText(text);return {text,usage:usageOf(provider,d)};
}

// Voice uses the saved Gemini key: speech in through audio understanding, speech out through a Gemini TTS model.
export const VOICE_DEFAULTS={dictationModel:'gemini-2.5-flash',voiceModel:'gemini-2.5-flash-preview-tts',voiceName:'Kore'};
export const VOICE_NAMES=['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat'];
const googleUrl=(model,config)=>`${GOOGLE}/models/${encodeURIComponent(model.replace(/^models\//,''))}:generateContent`;
export async function transcribeAudio({config,mime,data,language='',fetcher=fetch,signal}){
 if(!config?.key)throw new Error('Connect Google Gemini in Connections to dictate.');
 const model=config.dictationModel||VOICE_DEFAULTS.dictationModel;
 const body={contents:[{role:'user',parts:[{text:'Transcribe the speech in this audio verbatim'+(language?` (spoken language: ${language})`:'')+'. Keep the original language, add sentence punctuation, and return only the transcript with no commentary. If there is no speech, return an empty response.'},{inlineData:{mimeType:mime,data}}]}],generationConfig:{temperature:0,maxOutputTokens:2048}};
 const res=await request(googleUrl(model,config),{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':config.key},body:JSON.stringify(body),signal},config.key,fetcher),d=await res.json();
 const text=d.candidates?.[0]?.content?.parts?.filter(p=>p.text&&!p.thought).map(p=>p.text).join('')||'';
 if(!text&&d.promptFeedback?.blockReason)throw new Error('Google declined to transcribe this audio: '+d.promptFeedback.blockReason);
 return {text:text.trim(),usage:usageOf('google',d)};
}
export function pcmToWav(pcm,{rate=24000,channels=1,bits=16}={}){
 const header=Buffer.alloc(44),byteRate=rate*channels*bits/8;
 header.write('RIFF',0);header.writeUInt32LE(36+pcm.length,4);header.write('WAVE',8);header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(byteRate,28);header.writeUInt16LE(channels*bits/8,32);header.writeUInt16LE(bits,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
 return Buffer.concat([header,pcm]);
}
export function speakableText(text){return text.replace(/```[\s\S]*?```/g,' Code block omitted. ').replace(/`([^`]+)`/g,'$1').replace(/^#{1,6}\s+/gm,'').replace(/\*\*|__/g,'').replace(/\|/g,' ').replace(/\s+/g,' ').trim().slice(0,4000);}
export async function synthesizeSpeech({config,text,fetcher=fetch,signal}){
 if(!config?.key)throw new Error('Connect Google Gemini in Connections to use voice.');
 const model=config.voiceModel||VOICE_DEFAULTS.voiceModel,voiceName=config.voiceName||VOICE_DEFAULTS.voiceName;
 const body={contents:[{role:'user',parts:[{text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}}};
 const res=await request(googleUrl(model,config),{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':config.key},body:JSON.stringify(body),signal},config.key,fetcher),d=await res.json();
 const part=d.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data);
 if(!part)throw new Error('Google returned no audio: '+(d.promptFeedback?.blockReason||d.candidates?.[0]?.finishReason||'empty response')+'. Check that the voice model supports audio output.');
 const rate=Number(/rate=(\d+)/.exec(part.inlineData.mimeType||'')?.[1]||24000);
 const wav=/wav/i.test(part.inlineData.mimeType||'')?Buffer.from(part.inlineData.data,'base64'):pcmToWav(Buffer.from(part.inlineData.data,'base64'),{rate});
 return {wav,usage:usageOf('google',d)};
}
