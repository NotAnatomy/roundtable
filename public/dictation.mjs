// Records the microphone as 16 kHz mono WAV in the browser. Nothing leaves the Mac until the recording is sent for transcription.
export const RATE=16000,MAX_SECONDS=60;
export function supported(){return !!(navigator.mediaDevices?.getUserMedia&&(window.AudioContext||window.webkitAudioContext));}
export function encodeWav(chunks,rate=RATE){
 const length=chunks.reduce((n,c)=>n+c.length,0),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer),text=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,36+length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);
 let offset=44;for(const chunk of chunks)for(let i=0;i<chunk.length;i++,offset+=2){const s=Math.max(-1,Math.min(1,chunk[i]));view.setInt16(offset,s<0?s*0x8000:s*0x7fff,true);}
 return new Blob([buffer],{type:'audio/wav'});
}
export function toBase64(blob){return blob.arrayBuffer().then(b=>{const bytes=new Uint8Array(b);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);});}
export async function startRecording({onLevel,onLimit}={}){
 const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
 const Context=window.AudioContext||window.webkitAudioContext,context=new Context({sampleRate:RATE}),source=context.createMediaStreamSource(stream),processor=context.createScriptProcessor(4096,1,1),chunks=[];
 let seconds=0,stopped=false;
 processor.onaudioprocess=e=>{if(stopped)return;const data=e.inputBuffer.getChannelData(0);chunks.push(new Float32Array(data));seconds+=data.length/context.sampleRate;if(onLevel){let sum=0;for(let i=0;i<data.length;i+=16)sum+=data[i]*data[i];onLevel(Math.min(1,Math.sqrt(sum/(data.length/16))*4));}if(seconds>=MAX_SECONDS){onLimit?.();void stop();}};
 source.connect(processor);processor.connect(context.destination);
 async function stop(){if(stopped)return null;stopped=true;processor.disconnect();source.disconnect();for(const t of stream.getTracks())t.stop();await context.close();return {blob:encodeWav(chunks,context.sampleRate),seconds};}
 return {stop};
}
