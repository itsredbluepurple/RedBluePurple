/* ---------- WebGL aurora background (blue/purple with a faint red pole) ---------- */
const cv=document.getElementById('gl');const gl=cv.getContext('webgl',{antialias:false});
const vert=`attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}`;
const frag=`precision highp float;uniform vec2 uRes;uniform float uTime;uniform vec2 uMouse;
float hash(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);
 float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));
 return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.02+vec2(1.7,9.2);a*=0.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/uRes.xy;vec2 p=uv*vec2(uRes.x/uRes.y,1.0)*2.2;float t=uTime*0.045;
 vec2 q=vec2(fbm(p+vec2(0.0,t)),fbm(p+vec2(5.2,1.3)-t*0.8));
 vec2 r=vec2(fbm(p+3.0*q+vec2(1.7,9.2)+0.12*t),fbm(p+3.0*q+vec2(8.3,2.8)-0.10*t));
 float f=fbm(p+3.5*r);
 vec3 cBase=vec3(0.012,0.015,0.035),cBlue=vec3(0.10,0.22,0.70),cVio=vec3(0.34,0.15,0.74),cTeal=vec3(0.06,0.50,0.62);
 vec3 cRed=vec3(0.46,0.06,0.18);
 float fc=smoothstep(0.30,0.74,f);vec3 col=cBase;
 col=mix(col,cBlue,fc);col=mix(col,cVio,smoothstep(0.46,0.98,length(q))*0.7);col=mix(col,cTeal,smoothstep(0.55,1.05,r.x+r.y)*0.5);
 float redm=smoothstep(0.85,0.0,distance(uv,vec2(0.86,0.2)))*smoothstep(0.34,0.74,f);
 col=mix(col,cRed,redm*0.34);
 col+=cTeal*pow(fc,3.0)*0.12;
 float d=distance(uv,uMouse);col+=cTeal*smoothstep(0.34,0.0,d)*0.20;col+=vec3(0.12,0.18,0.34)*smoothstep(0.15,0.0,d)*0.45;
 col*=1.0-0.74*pow(distance(uv,vec2(0.5,0.46)),1.7);
 float g=hash(gl_FragCoord.xy+fract(uTime)*vec2(91.7,73.3));col+=(g-0.5)*0.05;
 gl_FragColor=vec4(col,1.0);}`;
function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o;}
const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vert));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,frag));gl.linkProgram(pr);gl.useProgram(pr);
const bf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,bf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const la=gl.getAttribLocation(pr,'a');gl.enableVertexAttribArray(la);gl.vertexAttribPointer(la,2,gl.FLOAT,false,0,0);
const uRes=gl.getUniformLocation(pr,'uRes'),uTime=gl.getUniformLocation(pr,'uTime'),uMouse=gl.getUniformLocation(pr,'uMouse');
let gm=[0.5,0.54],gmt=[0.5,0.54];
function rs(){const d=Math.min(devicePixelRatio||1,2);cv.width=innerWidth*d;cv.height=innerHeight*d;gl.viewport(0,0,cv.width,cv.height);}
addEventListener('resize',rs);rs();const t0=performance.now();
function gloop(){gm[0]+=(gmt[0]-gm[0])*0.05;gm[1]+=(gmt[1]-gm[1])*0.05;
 gl.uniform2f(uRes,cv.width,cv.height);gl.uniform1f(uTime,(performance.now()-t0)/1000);gl.uniform2f(uMouse,gm[0],gm[1]);
 gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(gloop);}gloop();

/* ---------- quiet staggered reveal (time-based) ---------- */
/* Held until web fonts are in (so the headline never animates mid font-swap)
   and until the aurora has painted a frame, so the first reveal stays smooth. */
const targets=[...document.querySelectorAll('[data-r]')];
const STAGGER=120;
function runReveal(){
  const startR=performance.now()+80;
  function reveal(now){let done=true;
    for(let i=0;i<targets.length;i++){const el=targets[i];
      if(el.classList.contains('in'))continue;
      if(now>=startR+i*STAGGER){el.classList.add('in');
        el.addEventListener('transitionend',()=>el.classList.add('done'),{once:true});}
      else done=false;}
    if(!done)requestAnimationFrame(reveal);}
  requestAnimationFrame(reveal);
}
let revealStarted=false;
const kickReveal=()=>{if(revealStarted)return;revealStarted=true;
  requestAnimationFrame(()=>requestAnimationFrame(runReveal));};
if(document.fonts&&document.fonts.ready){
  document.fonts.ready.then(kickReveal);
  setTimeout(kickReveal,1200);            // safety net if fonts.ready stalls
}else{setTimeout(kickReveal,260);}

/* ---------- magnetic cursor (buttons only) + parallax ---------- */
const dot=document.getElementById('cdot'),ring=document.getElementById('cring'),hero=document.getElementById('hero');
let cx=innerWidth/2,cy=innerHeight/2,rxp=cx,ryp=cy;
addEventListener('mousemove',e=>{cx=e.clientX;cy=e.clientY;gmt=[e.clientX/innerWidth,1-e.clientY/innerHeight];
  hero.style.transform=`translate(${(e.clientX/innerWidth-.5)*-12}px,${(e.clientY/innerHeight-.5)*-8}px)`;});
const mags=[...document.querySelectorAll('[data-magnetic]')];
function cloop(){rxp+=(cx-rxp)*0.16;ryp+=(cy-ryp)*0.16;
  dot.style.left=cx+'px';dot.style.top=cy+'px';ring.style.left=rxp+'px';ring.style.top=ryp+'px';
  let over=false;const CAP=15;
  for(const m of mags){const r=m.getBoundingClientRect(),mxc=r.left+r.width/2,myc=r.top+r.height/2;
    const dx=cx-mxc,dy=cy-myc,dist=Math.hypot(dx,dy),pull=Math.max(r.width,r.height)*0.55+20;
    if(dist<pull){over=true;
      const tx=Math.max(-CAP,Math.min(CAP,dx*0.2)),ty=Math.max(-CAP,Math.min(CAP,dy*0.2));
      m.style.transform=`translate(${tx}px,${ty}px)`;}
    else m.style.transform='';}
  ring.classList.toggle('big',over);
  requestAnimationFrame(cloop);}cloop();

/* ---------- reveal sections on scroll (staggered per band) ---------- */
const io=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},
  {threshold:.18,rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.band').forEach(band=>{
  [...band.querySelectorAll('.sr')].forEach((el,i)=>{el.style.transitionDelay=(i*70)+'ms';io.observe(el);});
});
