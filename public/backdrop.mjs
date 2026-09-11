// A quiet animated backdrop: three slow tinted lobes over the charcoal base plus faint grain.
// Rendered at low resolution, throttled to 30 fps, paused when hidden, frozen under reduced motion.
const VERTEX='attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAGMENT=`precision mediump float;uniform vec2 u_res;uniform float u_t;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float lobe(vec2 p,vec2 c,float s){vec2 d=p-c;return exp(-dot(d,d)*s);}
void main(){
 vec2 uv=gl_FragCoord.xy/u_res;float aspect=u_res.x/u_res.y;vec2 p=vec2(uv.x*aspect,uv.y);float t=u_t*0.045;
 vec2 c1=vec2((0.22+0.12*sin(t*0.7))*aspect,0.68+0.10*cos(t*0.5));
 vec2 c2=vec2((0.82+0.10*cos(t*0.6+1.))*aspect,0.30+0.12*sin(t*0.8));
 vec2 c3=vec2((0.55+0.18*sin(t*0.4+2.))*aspect,0.92+0.08*cos(t*0.9));
 vec3 base=vec3(0.094,0.098,0.110);
 vec3 col=base+vec3(0.93,0.71,0.81)*lobe(p,c1,2.6)*0.075+vec3(0.57,0.72,0.65)*lobe(p,c2,3.2)*0.055+vec3(0.72,0.64,0.88)*lobe(p,c3,3.0)*0.05;
 col+=(hash(gl_FragCoord.xy+fract(u_t))-0.5)*0.014;
 gl_FragColor=vec4(col,1.);}`;
export const PREFS_KEY='roundtable-prefs';
export function loadPrefs(storage){try{const p=JSON.parse(storage?.getItem(PREFS_KEY)||'{}');return {backdrop:p.backdrop!==false};}catch{return {backdrop:true};}}
export function savePrefs(storage,prefs){try{storage?.setItem(PREFS_KEY,JSON.stringify(prefs));}catch{}}
export function createBackdrop(doc=document){
 const canvas=doc.createElement('canvas');canvas.id='backdrop';canvas.setAttribute('aria-hidden','true');
 const gl=canvas.getContext('webgl',{antialias:false,depth:false,stencil:false,alpha:false,powerPreference:'low-power'});
 if(!gl)return {supported:false,start(){},stop(){},remove(){}};
 const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader failed');return s;};
 const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
 const a=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
 const uRes=gl.getUniformLocation(program,'u_res'),uT=gl.getUniformLocation(program,'u_t');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let frame=0,last=0,running=false;const started=performance.now();
 function resize(){const w=Math.min(640,innerWidth),h=Math.max(1,Math.round(w*innerHeight/Math.max(1,innerWidth)));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);gl.uniform2f(uRes,w,h);}}
 function draw(t){resize();gl.uniform1f(uT,t);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
 function loop(now){if(!running)return;frame=requestAnimationFrame(loop);if(now-last<33||doc.hidden)return;last=now;draw((now-started)/1000);}
 function start(){if(!canvas.isConnected)doc.body.prepend(canvas);if(reduced.matches){running=false;cancelAnimationFrame(frame);draw(0);return;}if(running)return;running=true;frame=requestAnimationFrame(loop);}
 function stop(){running=false;cancelAnimationFrame(frame);}
 reduced.addEventListener('change',()=>{if(canvas.isConnected)start();});addEventListener('resize',()=>{if(canvas.isConnected&&!running)draw(0);});
 doc.addEventListener('visibilitychange',()=>{if(canvas.isConnected&&!doc.hidden&&!reduced.matches&&!running)start();});
 return {supported:true,start,stop,remove(){stop();canvas.remove();}};
}
