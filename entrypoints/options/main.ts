import { getRules, setRules, DEFAULT_RULES } from '../../lib/storage';
import type { Rules } from '../../lib/types';

// ─── Pure persistence helpers (exported for unit tests) ────────────────────

export function readRulesFromDom(root: Document | HTMLElement): Rules {
  const q = <T extends Element>(s: string) => root.querySelector(s) as T | null;
  return {
    prompt: (q<HTMLTextAreaElement>('#prompt')?.value) ?? '',
    apiKey: (q<HTMLInputElement>('#apikey')?.value) ?? '',
  };
}

export function applyRulesToDom(root: Document | HTMLElement, rules: Rules): void {
  const p = root.querySelector('#prompt') as HTMLTextAreaElement | null;
  if (p) p.value = rules.prompt;
  const key = root.querySelector('#apikey') as HTMLInputElement | null;
  if (key) key.value = rules.apiKey;
}

// ─── Page-level boot (skipped when imported in happy-dom test environment) ──

export async function initPage(): Promise<void> {
  // ── Load and apply saved rules ──────────────────────────────────────────
  const saved = await getRules();
  applyRulesToDom(document, saved);

  // ── WebGL aurora ─────────────────────────────────────────────────────────
  const cv = document.getElementById('gl') as HTMLCanvasElement | null;
  if (cv) {
    const gl = cv.getContext('webgl', { antialias: false });
    if (gl) {
      const vert = `attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}`;
      const frag = `precision highp float;uniform vec2 uRes;uniform float uTime;uniform vec2 uMouse;
float hash(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);
 float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));
 return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.02+vec2(1.7,9.2);a*=0.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/uRes.xy;vec2 p=uv*vec2(uRes.x/uRes.y,1.0)*2.2;float t=uTime*0.04;
 vec2 q=vec2(fbm(p+vec2(0.0,t)),fbm(p+vec2(5.2,1.3)-t*0.8));
 vec2 r=vec2(fbm(p+3.0*q+vec2(1.7,9.2)+0.12*t),fbm(p+3.0*q+vec2(8.3,2.8)-0.10*t));
 float f=fbm(p+3.5*r);
 vec3 cBase=vec3(0.010,0.013,0.030),cBlue=vec3(0.08,0.18,0.58),cVio=vec3(0.30,0.13,0.66),cTeal=vec3(0.05,0.42,0.54);
 vec3 cRed=vec3(0.42,0.06,0.18);
 float fc=smoothstep(0.30,0.74,f);vec3 col=cBase;
 col=mix(col,cBlue,fc);col=mix(col,cVio,smoothstep(0.46,0.98,length(q))*0.65);col=mix(col,cTeal,smoothstep(0.55,1.05,r.x+r.y)*0.42);
 float redm=smoothstep(0.9,0.0,distance(uv,vec2(0.9,0.16)))*smoothstep(0.34,0.74,f);
 col=mix(col,cRed,redm*0.3);
 col+=cTeal*pow(fc,3.0)*0.10;
 float d=distance(uv,uMouse);col+=vec3(0.10,0.16,0.30)*smoothstep(0.22,0.0,d)*0.35;
 col*=1.0-0.5*pow(distance(uv,vec2(0.5,0.32)),1.7);
 float g=hash(gl_FragCoord.xy+fract(uTime)*vec2(91.7,73.3));col+=(g-0.5)*0.045;
 gl_FragColor=vec4(col,1.0);}`;
      const sh = (type: number, src: string) => {
        const o = gl.createShader(type)!;
        gl.shaderSource(o, src);
        gl.compileShader(o);
        return o;
      };
      const pr = gl.createProgram()!;
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vert));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag));
      gl.linkProgram(pr);
      gl.useProgram(pr);
      const bf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const la = gl.getAttribLocation(pr, 'a');
      gl.enableVertexAttribArray(la);
      gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
      const uRes = gl.getUniformLocation(pr, 'uRes');
      const uTime = gl.getUniformLocation(pr, 'uTime');
      const uMouse = gl.getUniformLocation(pr, 'uMouse');
      let gm = [0.5, 0.7];
      const gmt = [0.5, 0.7];
      const rs = () => {
        const d = Math.min(devicePixelRatio || 1, 2);
        cv.width = innerWidth * d;
        cv.height = innerHeight * d;
        gl.viewport(0, 0, cv.width, cv.height);
      };
      addEventListener('resize', rs);
      rs();
      const t0 = performance.now();
      const gloop = () => {
        gm[0] += (gmt[0] - gm[0]) * 0.05;
        gm[1] += (gmt[1] - gm[1]) * 0.05;
        gl.uniform2f(uRes, cv.width, cv.height);
        gl.uniform1f(uTime, (performance.now() - t0) / 1000);
        gl.uniform2f(uMouse, gm[0], gm[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(gloop);
      };
      gloop();
      addEventListener('mousemove', (e) => {
        gmt[0] = e.clientX / innerWidth;
        gmt[1] = 1 - e.clientY / innerHeight;
      });
    }
  }

  // ── Staggered reveal ──────────────────────────────────────────────────────
  const revTargets = [...document.querySelectorAll('.r-anim')];
  const startR = performance.now() + 200;
  const reveal = (now: number) => {
    let done = true;
    for (let i = 0; i < revTargets.length; i++) {
      const el = revTargets[i];
      if (el.classList.contains('in')) continue;
      if (now >= startR + i * 130) el.classList.add('in');
      else done = false;
    }
    if (!done) requestAnimationFrame(reveal);
  };
  requestAnimationFrame(reveal);

  // ── Custom cursor ──────────────────────────────────────────────────────────
  const dot = document.getElementById('cdot');
  const ring = document.getElementById('cring');
  if (dot && ring) {
    let cx = innerWidth / 2;
    let cy = innerHeight / 2;
    let rxp = cx;
    let ryp = cy;
    addEventListener('mousemove', (e) => {
      cx = e.clientX;
      cy = e.clientY;
    });
    const hot = [...document.querySelectorAll('.add,.addrow input,.reset,.nav a,#prompt')];
    const cloop = () => {
      rxp += (cx - rxp) * 0.18;
      ryp += (cy - ryp) * 0.18;
      dot.style.left = cx + 'px';
      dot.style.top = cy + 'px';
      ring.style.left = rxp + 'px';
      ring.style.top = ryp + 'px';
      let over = false;
      for (const h of hot) {
        const r = h.getBoundingClientRect();
        if (cx >= r.left - 6 && cx <= r.right + 6 && cy >= r.top - 6 && cy <= r.bottom + 6) {
          over = true;
          break;
        }
      }
      ring.classList.toggle('big', over);
      requestAnimationFrame(cloop);
    };
    cloop();
  }

  // ── Auto-save wiring ──────────────────────────────────────────────────────
  const save = () => void setRules(readRulesFromDom(document));
  document.addEventListener('input', save);

  // ── API key: show/hide, explicit Save with feedback, set/not-set status ────
  const keyInput = document.getElementById('apikey') as HTMLInputElement | null;
  const keyStatus = document.getElementById('keystatus');
  const updateKeyStatus = () => {
    if (!keyStatus) return;
    const set = !!keyInput?.value.trim();
    keyStatus.textContent = set ? '✓ set' : 'not set';
    keyStatus.classList.toggle('set', set);
  };
  document.getElementById('keyshow')?.addEventListener('click', () => {
    if (!keyInput) return;
    const showing = keyInput.type === 'text';
    keyInput.type = showing ? 'password' : 'text';
    (document.getElementById('keyshow') as HTMLElement).textContent = showing ? 'Show' : 'Hide';
  });
  document.getElementById('keysave')?.addEventListener('click', () => {
    save();
    updateKeyStatus();
    const btn = document.getElementById('keysave');
    if (btn) {
      const prev = btn.textContent;
      btn.textContent = '✓ Saved';
      setTimeout(() => (btn.textContent = prev), 1400);
    }
  });
  keyInput?.addEventListener('input', updateKeyStatus);
  updateKeyStatus();

  // ── Reset to defaults ─────────────────────────────────────────────────────
  document.querySelector('.reset')?.addEventListener('click', async () => {
    await setRules(DEFAULT_RULES);
    applyRulesToDom(document, DEFAULT_RULES);
    updateKeyStatus();
  });
}

// ── Boot: only run in a real browser page (sentinel element must exist) ──────
// Module scripts are deferred so DOM is ready; in happy-dom test the DOM is
// empty at import time → #apikey won't be found → we skip init safely.
if (typeof document !== 'undefined' && document.getElementById('apikey')) {
  void initPage();
}
