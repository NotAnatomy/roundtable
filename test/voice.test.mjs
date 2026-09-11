import test from 'node:test';
import assert from 'node:assert/strict';
import {transcribeAudio,synthesizeSpeech,pcmToWav,speakableText,VOICE_DEFAULTS} from '../api-providers.mjs';
import {encodeWav} from '../public/dictation.mjs';
test('dictation sends WAV audio inline to the configured Gemini model and returns only the transcript',async()=>{
 let url;const result=await transcribeAudio({config:{key:'private-key'},mime:'audio/wav',data:'UklGRg==',language:'fr-FR',fetcher:async(u,opts)=>{url=u;const body=JSON.parse(opts.body);assert.equal(opts.headers['x-goog-api-key'],'private-key');assert.equal(body.contents[0].parts[1].inlineData.mimeType,'audio/wav');assert.equal(body.contents[0].parts[1].inlineData.data,'UklGRg==');assert.match(body.contents[0].parts[0].text,/fr-FR/);assert.equal(body.generationConfig.temperature,0);return Response.json({candidates:[{content:{parts:[{thought:true,text:'hmm'},{text:' Bonjour le monde. '}]}}],usageMetadata:{promptTokenCount:50,candidatesTokenCount:5}});}});
 assert.match(url,new RegExp(VOICE_DEFAULTS.dictationModel+':generateContent$'));assert.equal(result.text,'Bonjour le monde.');assert.deepEqual(result.usage,{inputTokens:50,outputTokens:5});
 await transcribeAudio({config:{key:'k',dictationModel:'gemini-custom'},mime:'audio/wav',data:'UklGRg==',fetcher:async u=>{assert.match(u,/gemini-custom:generateContent$/);return Response.json({candidates:[{content:{parts:[{text:''}]}}]});}});
 await assert.rejects(transcribeAudio({config:{},mime:'audio/wav',data:'x'}),/Connect Google Gemini/);
 await assert.rejects(transcribeAudio({config:{key:'private-key'},mime:'audio/wav',data:'UklGRg==',fetcher:async()=>Response.json({error:{message:'bad private-key'}},{status:401})}),e=>!e.message.includes('private-key'));
});
test('read aloud wraps Gemini PCM into a playable WAV and strips Markdown that should not be spoken',async()=>{
 const pcm=Buffer.alloc(48,1);const wav=pcmToWav(pcm,{rate:24000});assert.equal(wav.length,44+48);assert.equal(wav.subarray(0,4).toString(),'RIFF');assert.equal(wav.readUInt32LE(24),24000);assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(40),48);assert.equal(wav.subarray(36,40).toString(),'data');
 const out=await synthesizeSpeech({config:{key:'k',voiceName:'Puck'},text:'Hello there',fetcher:async(u,opts)=>{const body=JSON.parse(opts.body);assert.match(u,new RegExp(VOICE_DEFAULTS.voiceModel+':generateContent$'));assert.deepEqual(body.generationConfig.responseModalities,['AUDIO']);assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Puck');return Response.json({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:pcm.toString('base64')}}]}}]});}});
 assert.equal(out.wav.length,92);assert.equal(out.wav.subarray(0,4).toString(),'RIFF');
 await assert.rejects(synthesizeSpeech({config:{key:'k'},text:'x',fetcher:async()=>Response.json({candidates:[{content:{parts:[{text:'no audio'}]},finishReason:'STOP'}]})}),/no audio/);
 assert.equal(speakableText('## Title\n\nUse `npm test`, then:\n\n```js\nconst x=1;\n```\n\n**Done** | a | b'),'Title Use npm test, then: Code block omitted. Done a b');
 assert.equal(speakableText('x'.repeat(5000)).length,4000);
});
test('the browser WAV encoder writes a valid 16-bit mono header for the recorded samples',async()=>{
 const blob=encodeWav([new Float32Array([0,0.5,-0.5,1,-1])],16000);assert.equal(blob.type,'audio/wav');const b=Buffer.from(await blob.arrayBuffer());
 assert.equal(b.length,44+10);assert.equal(b.subarray(0,4).toString(),'RIFF');assert.equal(b.readUInt32LE(24),16000);assert.equal(b.readUInt16LE(34),16);assert.equal(b.readInt16LE(44),0);assert.equal(b.readInt16LE(46),16383);assert.equal(b.readInt16LE(48),-16384);assert.equal(b.readInt16LE(50),32767);assert.equal(b.readInt16LE(52),-32768);
});
