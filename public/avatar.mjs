// Deterministic agent avatars built from inline SVG. No image loads, no external references, no dependencies.
const SVG='http://www.w3.org/2000/svg',RADIUS=13,CENTER=16;
export function hashId(id){let h=2166136261;for(const c of String(id)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h;}
// Only a few parameters vary so every avatar stays quiet and recognizably part of one set.
export function avatarShape(agent){
 const h=hashId(agent?.id||''),segments=3+(h%4),rotation=(h>>>4)%360,glyph=['none','inner','dot'][(h>>>12)%3],dot=((h>>>16)%360)*Math.PI/180;
 const circumference=2*Math.PI*RADIUS,gap=Math.min(6,circumference/segments*.3);
 return {segments,rotation,glyph,dash:`${(circumference/segments-gap).toFixed(2)} ${gap.toFixed(2)}`,dot:{x:(CENTER+9*Math.cos(dot)).toFixed(2),y:(CENTER+9*Math.sin(dot)).toFixed(2)},initial:String(agent?.name||agent?.id||'?').trim().slice(0,1).toUpperCase()||'?'};
}
export function avatarMarkup(agent){
 const shape=avatarShape(agent),node=(tag,attrs,children=[])=>({tag,attrs,children});
 const parts=[node('g',{class:'ring'},[node('circle',{cx:CENTER,cy:CENTER,r:RADIUS,fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-dasharray':shape.dash,'stroke-linecap':'round',transform:`rotate(${shape.rotation} ${CENTER} ${CENTER})`})])];
 if(shape.glyph==='inner')parts.push(node('circle',{cx:CENTER,cy:CENTER,r:9.5,fill:'none',stroke:'currentColor','stroke-width':.8,opacity:.35}));
 if(shape.glyph==='dot')parts.push(node('circle',{cx:shape.dot.x,cy:shape.dot.y,r:1.4,fill:'currentColor',opacity:.8}));
 parts.push(node('text',{x:CENTER,y:CENTER+.5,'text-anchor':'middle','dominant-baseline':'central','font-size':11.5,'font-weight':650,fill:'currentColor'},[shape.initial]));
 return node('svg',{viewBox:'0 0 32 32',width:'100%',height:'100%','aria-hidden':'true',focusable:'false'},parts);
}
export function avatarSVG(agent,doc=globalThis.document){
 const build=x=>{if(typeof x==='string')return doc.createTextNode(x);const n=doc.createElementNS(SVG,x.tag);for(const [k,v]of Object.entries(x.attrs))n.setAttribute(k,String(v));for(const c of x.children)n.append(build(c));return n;};
 return build(avatarMarkup(agent));
}
