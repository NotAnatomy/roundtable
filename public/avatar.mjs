// Agent characters: one silhouette library x provider colour x two eyes, drawn as inline SVG.
// Nothing is loaded from outside the page. Motion lives in CSS, driven by a state attribute,
// so an idle room animates nothing and reduced motion is a pure style concern.
const SVG='http://www.w3.org/2000/svg',CENTER=16,RADIUS=11;
export function hashId(id){let h=2166136261;for(const c of String(id)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h;}

// Every silhouette comes from one polar curve, r(a) = R * (1 + amp * cos(lobes * a + phase)),
// scaled vertically. Negative amplitude makes a tall body, positive a wide one.
export const SILHOUETTES=[
 {name:'disc',lobes:0,amp:0,phase:0,squash:1},
 {name:'pebble',lobes:2,amp:.08,phase:0,squash:.94},
 {name:'bead',lobes:2,amp:-.17,phase:0,squash:1},
 {name:'prism',lobes:6,amp:.05,phase:0,squash:.97},
 {name:'facet',lobes:4,amp:.085,phase:Math.PI/4,squash:1},
 {name:'bloom',lobes:5,amp:.1,phase:Math.PI/2,squash:1},
 {name:'drift',lobes:3,amp:.1,phase:.9,squash:.95},
 {name:'crest',lobes:1,amp:.15,phase:Math.PI/2,squash:.98}
];
export const PROVIDER_COLORS={
 codex:{from:'#7fd9a6',to:'#2e9e68'},
 claude:{from:'#f0b27a',to:'#c9743a'},
 google:{from:'#7fb4ff',to:'#3a72c9'},
 antigravity:{from:'#b9a6f5',to:'#6e55c4'},
 agentrouter:{from:'#f0a0d2',to:'#c1569b'},
 default:{from:'#edb4ce',to:'#b97c9c'}
};
const round=n=>Number(n.toFixed(2));
// A closed Catmull-Rom spline through the sampled points, emitted as cubic beziers.
export function blobPath({lobes,amp,phase,squash},samples=28){
 const points=[];
 for(let i=0;i<samples;i++){
  const a=i/samples*Math.PI*2,r=RADIUS*(1+amp*(lobes?Math.cos(lobes*a+phase):0));
  points.push([CENTER+r*Math.cos(a),CENTER+r*Math.sin(a)*squash]);
 }
 const at=i=>points[(i+points.length)%points.length];
 let d=`M${round(points[0][0])} ${round(points[0][1])}`;
 for(let i=0;i<points.length;i++){
  const [x0,y0]=at(i-1),[x1,y1]=at(i),[x2,y2]=at(i+1),[x3,y3]=at(i+2);
  d+=`C${round(x1+(x2-x0)/6)} ${round(y1+(y2-y0)/6)} ${round(x2-(x3-x1)/6)} ${round(y2-(y3-y1)/6)} ${round(x2)} ${round(y2)}`;
 }
 return d+'Z';
}
export function avatarShape(agent){
 const h=hashId(agent?.id||'');
 return {silhouette:SILHOUETTES[h%SILHOUETTES.length],colors:PROVIDER_COLORS[agent?.provider]||PROVIDER_COLORS.default,
  // A small resting tilt and eye offset keep same-provider agents apart without changing the face.
  // The blink offset stops a roster of agents from blinking in unison.
  tilt:((h>>>8)%5)-2,gaze:(((h>>>12)%3)-1)*.6,blink:(h>>>16)%8};
}
let serial=0;
export function avatarMarkup(agent,id=`rt-av-${++serial}`){
 const {silhouette,colors,tilt,gaze,blink}=avatarShape(agent),node=(tag,attrs,children=[])=>({tag,attrs,children});
 const eye=side=>node('g',{class:'rt-eye'},[node('circle',{cx:round(CENTER+side*2.9+gaze),cy:14.9,r:2.05,fill:'var(--rt-avatar-eye, #15161a)'})]);
 // The resting tilt sits on its own group so CSS state motion can own the inner transform.
 // The blink offset is a class, not an inline style, because the page forbids inline styles.
 return node('svg',{viewBox:'0 0 32 32',width:'100%',height:'100%','aria-hidden':'true',focusable:'false',class:`rt-avatar-svg rt-blink-${blink}`},[
  node('defs',{},[node('linearGradient',{id,x1:'0.15',y1:'0',x2:'0.85',y2:'1'},[
   node('stop',{offset:'0','stop-color':colors.from}),node('stop',{offset:'1','stop-color':colors.to})])]),
  node('g',{class:'rt-tilt',transform:`rotate(${tilt} ${CENTER} ${CENTER})`},[
   node('g',{class:'rt-body'},[
    node('path',{class:'rt-silhouette',d:blobPath(silhouette),fill:`url(#${id})`}),
    node('ellipse',{class:'rt-glint',cx:'12',cy:'10.5',rx:'3.1',ry:'2.1',fill:'#fff',opacity:'.22',transform:'rotate(-28 12 10.5)'}),
    node('g',{class:'rt-face'},[eye(-1),eye(1)])])])]);
}
export function avatarSVG(agent,doc=globalThis.document,id){
 const build=x=>{if(typeof x==='string')return doc.createTextNode(x);const n=doc.createElementNS(SVG,x.tag);for(const [k,v]of Object.entries(x.attrs))n.setAttribute(k,String(v));for(const c of x.children)n.append(build(c));return n;};
 return build(avatarMarkup(agent,id));
}
// The lifecycle vocabulary the roster and message cards animate against.
export const AVATAR_STATES=['idle','thinking','working','streaming','done','failed','sleeping'];
export function avatarState({busy=false,active=false,status='',enabled=true,archived=false}={}){
 if(archived||!enabled)return 'sleeping';
 if(active&&busy)return status==='streaming'?'streaming':'working';
 if(busy)return 'thinking';
 if(status==='error')return 'failed';
 if(status==='interrupted')return 'failed';
 if(status==='complete')return 'done';
 return 'idle';
}
