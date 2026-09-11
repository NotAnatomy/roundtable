export function usageOf(provider,data){const u=provider==='google'?data.usageMetadata:data.usage||data;const out={};
 const input=provider==='google'?u?.promptTokenCount:u?.input_tokens??u?.prompt_tokens??u?.inputTokens;
 const output=provider==='google'?u?.candidatesTokenCount:u?.output_tokens??u?.completion_tokens??u?.outputTokens;
 const cached=u?.cache_read_input_tokens??u?.cachedInputTokens;for(const [k,v]of Object.entries({inputTokens:input,outputTokens:output,cachedInputTokens:cached,costUsd:data.total_cost_usd}))if(typeof v==='number'&&Number.isFinite(v)&&v>=0)out[k]=v;
 return Object.keys(out).length?out:undefined;
}
export function totalUsage(messages){const total={};for(const m of messages){for(const [k,v]of Object.entries(m.usage||{}))if(typeof v==='number')total[k]=(total[k]||0)+v;for(const attempt of m.attempts||[])for(const [k,v]of Object.entries(attempt.usage||{}))if(typeof v==='number')total[k]=(total[k]||0)+v;}return total;}
