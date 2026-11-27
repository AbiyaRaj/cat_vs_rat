// Purr Patrol game engine (three.js). The game loop stays imperative;
// React owns the DOM and receives UI state through onUI().
import * as THREE from 'three';
// physically correct colour handling: authored (sRGB) colours are converted to linear for lighting, then tone mapped back
THREE.ColorManagement.legacyMode=false;
// colour grade inside the tone-mapping shader (no extra pass): ACES filmic, then a touch more saturation,
// a gentle S-curve for depth, warm highlights and slightly cool shadows
THREE.ShaderChunk.tonemapping_pars_fragment=THREE.ShaderChunk.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }',
`vec3 CustomToneMapping( vec3 color ) {
  color = ACESFilmicToneMapping( color );
  float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( l ), color, 1.02 );
  color = mix( color, color * color * ( 3.0 - 2.0 * color ), 0.16 );
  color *= mix( vec3( 0.97, 0.99, 1.04 ), vec3( 1.03, 1.0, 0.95 ), smoothstep( 0.15, 0.85, l ) );
  return saturate( color );
}`);
import { FUR_DETAIL } from './furDetail.js';
import { BREEDS, LION_B, COLORS, EYES, COLLARS, HATS, OUTFITS, GLASSES, LEVELS, VIEWS, TREATS, SHIRTS, LEAF_COLORS, THEMES, SCENE_PLAN, ACC_COLOURS } from './data.js';

// ================= soft 3D cartoon look =================
// Every lit material in the game is created through CartoonMat: smooth physically based shading with soft,
// rounded highlights (no metal, no bump noise) and warm, punchy colours, like a feature-animation render.
const _hsl={h:0,s:0,l:0};
function vividColor(c,k=1.32){ c.getHSL(_hsl); if(_hsl.s>.06) c.setHSL(_hsl.h,Math.min(1,_hsl.s*k),_hsl.l); return c; }
const UNUSED=new Set(['metalness','metalnessMap','sheen','sheenRoughness','sheenColor','clearcoat','clearcoatRoughness','bumpMap','bumpScale','envMap','envMapIntensity','ior','reflectivity','transmission','thickness','specularIntensity','flatShading','gradientMap']);
class CartoonMat extends THREE.MeshStandardMaterial{
  constructor(p={}){ const q={roughness:.72,metalness:0}; for(const k in p) if(!UNUSED.has(k)) q[k]=p[k]; q.roughness=Math.max(.28,q.roughness); super(q);
    this.envMapIntensity=p.envMapIntensity??.5;   // scenery: gentle sky fill (characters get more in rimify)
    vividColor(this.color); if(p.metalness>.5){ this.color.offsetHSL(0,.05,.08); this.roughness=.3; } }
}
// ---- ink outlines (inverted hull, constant on-screen width) ----
const INK_RES={value:new THREE.Vector2(1280,800)}, INK_COLOR=new THREE.Color('#2a1a10'), inkMats={};
const INK_VS=`uniform vec2 uRes; uniform float uThick;
void main(){ vec4 p=vec4(position,1.0); vec3 n=normal;
#ifdef USE_INSTANCING
  p=instanceMatrix*p; n=mat3(instanceMatrix)*n;
#endif
  vec4 mv=modelViewMatrix*p; vec3 vn=normalize(normalMatrix*n); vec4 clip=projectionMatrix*mv;
  float l=length(vn.xy); vec2 dir=l>1e-4?vn.xy/l:vec2(0.0);
  clip.xy+=dir*uThick/uRes*2.0*clip.w; gl_Position=clip; }`;
function inkMat(px){ if(inkMats[px]) return inkMats[px];
  const m=new THREE.ShaderMaterial({uniforms:{uRes:INK_RES,uThick:{value:px},uColor:{value:INK_COLOR}},vertexShader:INK_VS,
    fragmentShader:'uniform vec3 uColor; void main(){ gl_FragColor=vec4(uColor,1.0); }',side:THREE.BackSide});
  m.userData.shared=true; return inkMats[px]=m; }
function setInk(on){ for(const k in inkMats) inkMats[k].visible=on; }
function inkable(o){ const g=o.geometry; if(!g||!g.attributes.normal||o.userData.noInk) return false; const t=g.type,p=g.parameters||{};
  if(t==='PlaneGeometry'||t==='CircleGeometry'||t==='RingGeometry'||t==='ShapeGeometry'||p.openEnded) return false;
  if(t==='SphereGeometry'&&(p.thetaLength<Math.PI-1e-3||p.phiLength<Math.PI*2-1e-3)) return false;
  const m=o.material; if(Array.isArray(m)) return true; return !!m&&!m.isMeshBasicMaterial&&!m.isShaderMaterial&&!(m.transparent&&!m.alphaTest); }
// details=false skips the small non-shadow-casting parts (eyes, pads, teeth) so faces stay clean
const INK_ON=false;
function inkify(root,px=1.7,details=false){ if(!INK_ON) return root; const add=[];
  root.traverse(o=>{ if(!o.isMesh||o.userData.inkOf||o.userData.inked) return; if(!details&&!o.castShadow&&!o.userData.ink) return; if(inkable(o)) add.push(o); });
  for(const o of add){ const mat=inkMat(px); let ol;
    if(o.isInstancedMesh){ ol=new THREE.InstancedMesh(o.geometry,mat,o.count); ol.instanceMatrix=o.instanceMatrix; ol.onBeforeRender=()=>{ ol.count=o.count; }; }
    else ol=new THREE.Mesh(o.geometry,mat);
    ol.userData.inkOf=o; ol.castShadow=ol.receiveShadow=false; ol.frustumCulled=o.frustumCulled; ol.raycast=()=>{}; o.userData.inked=true; o.add(ol); }
  return root; }
const backOut=x=>{ const c=1.70158,t=x-1; return 1+(c+1)*t*t*t+c*t*t; };

export function createGame({ gl: glc, overlay: ov, preview: pv, onUI }) {
// ---- bridge to React ----
const ui={maxWave:1,unlockAll:false,paused:false,canPause:false,menu:true,hud:false,controls:false,over:false,powers:false,pawUsed:false,clawUsed:false,pawUrgent:false,clawUrgent:false,
  score:0,wave:1,best:0,cheeseText:'',comboOn:false,comboText:'',muted:false,finalScore:0,overMsg:'',finalInfo:'',toast:null};
let syncQueued=false, alive=true, rafId=0;
function sync(){ if(syncQueued||!alive) return; syncQueued=true; queueMicrotask(()=>{ syncQueued=false; if(alive) onUI({...ui,settings:{...settings}}); }); }
const unlisteners=[], timers=[], intervals=[];
function listen(target,type,fn,opts){ target.addEventListener(type,fn,opts); unlisteners.push(()=>target.removeEventListener(type,fn,opts)); }

const T3=THREE, TAU=Math.PI*2, rand=Math.random;
const rr=(a,b)=>a+rand()*(b-a), pick=a=>a[rand()*a.length|0], clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(e0,e1,x)=>{ const t=clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t); };
const angDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function hex2rgb(h){ h=h.replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); }
function mix(a,b,t){ const A=hex2rgb(a),B=hex2rgb(b); return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join(''); }
let seed=7; const srand=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };


// ================= storage =================
const DEFAULTS={breed:'street',colour:'ginger',eyes:'blue',collar:'red',hat:'none',outfit:'none',glasses:'none',hatCol:'',outfitCol:'',glassesCol:'',name:'Whiskers',theme:'garden',level:'normal',view:'angle'};
function loadSettings(){
  let s={}; try{ s=JSON.parse(localStorage.getItem('gardenCatSettings')||'{}')||{}; }catch(e){}
  const o={...DEFAULTS,...s}, chk=(k,set)=>{ if(!set[o[k]]) o[k]=DEFAULTS[k]; };
  chk('breed',BREEDS); chk('colour',COLORS); chk('eyes',EYES); chk('collar',COLLARS); chk('hat',HATS); chk('outfit',OUTFITS); chk('glasses',GLASSES); o.theme='garden'; chk('level',LEVELS); for(const k of ['hatCol','outfitCol','glassesCol']) if(typeof o[k]!=='string'||(o[k]&&!/^#[0-9a-f]{6}$/i.test(o[k]))) o[k]=''; chk('view',VIEWS);
  if(typeof o.name!=='string'||!o.name.trim()) o.name=DEFAULTS.name; return o;
}
const settings=loadSettings();
// accessory unlocks: 'wave' items open once that wave has been reached (best progress is saved); premium items carry a price
const ACC={hat:HATS,outfit:OUTFITS,glasses:GLASSES}, UNLOCK_ALL=location.hash==='#unlockall';
let maxWave=(()=>{ try{ return Math.max(1,+localStorage.getItem('gardenCatMaxWave')||1); }catch(e){ return 1; } })();
function accLocked(key,id){ const d=ACC[key]&&ACC[key][id]; if(!d||UNLOCK_ALL) return null;
  if(d.tier==='wave'&&maxWave<d.wave) return `🔒 ${d.label.replace(/^\S+ /,'')} unlocks when you reach wave ${d.wave}`;
  if(d.tier==='premium') return `💎 ${d.label.replace(/^\S+ /,'')} is premium · ₹${d.price} · coming soon to the shop`; return null; }
for(const k in ACC) if(accLocked(k,settings[k])){ settings[k]='none'; settings[k+'Col']=''; }
ui.maxWave=maxWave; ui.unlockAll=UNLOCK_ALL;
function saveSettings(){ try{ localStorage.setItem('gardenCatSettings',JSON.stringify(settings)); }catch(e){} }
function loadBest(){ try{ return +localStorage.getItem('gardenCatBest_'+settings.level)||0; }catch(e){ return 0; } }
function saveBest(v){ try{ localStorage.setItem('gardenCatBest_'+settings.level,v); }catch(e){} }
let curScene='garden';
const theme=()=>THEMES[curScene]||THEMES.garden, breed=()=>BREEDS[settings.breed], level=()=>LEVELS[settings.level];

// ================= field & quality =================
let W,H;
{ const a=innerWidth/innerHeight; if(a>=1){ H=800; W=Math.round(clamp(800*a,900,1500)); } else { W=800; H=Math.round(clamp(800/a,900,1500)); } }
const isMobile=Math.min(innerWidth,innerHeight)<700||matchMedia('(pointer:coarse)').matches;
const LOW=isMobile||(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4;
const CS=1, CHEESE_MAX=100, TEX=LOW?Math.min(1.1,1400/Math.max(W,H)):Math.min(1.5,2048/Math.max(W,H)), STX=TEX*.5, HEADK=1.5;
const holes=[{x:W*.18,y:0,side:'top'},{x:W*.82,y:0,side:'top'},{x:W*.25,y:H,side:'bottom'},{x:W*.75,y:H,side:'bottom'},{x:0,y:H*.5,side:'left'},{x:W,y:H*.5,side:'right'}];

// ================= audio =================
let ac=null, master=null, muted=false;
function audio(){ if(!ac){ try{ ac=new (window.AudioContext||window.webkitAudioContext)(); master=ac.createGain(); master.gain.value=.8; master.connect(ac.destination);}catch(e){} } if(ac&&ac.state==='suspended') ac.resume(); return muted?null:ac; }
function noiseBuf(a,dur){ const n=Math.max(1,a.sampleRate*dur|0),b=a.createBuffer(1,n,a.sampleRate),d=b.getChannelData(0); for(let i=0;i<n;i++) d[i]=rand()*2-1; return b; }
function noise(dur,vol,type='lowpass',freq=1000,q=1,attack=.003,delay=0){ const a=audio(); if(!a) return; const t=a.currentTime+delay,s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();
  s.buffer=noiseBuf(a,dur); f.type=type; f.frequency.value=freq; f.Q.value=q; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+attack); g.gain.exponentialRampToValueAtTime(.001,t+dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t+dur+.02); return f; }
function tone(freq,dur,type='sine',vol=.2,endFreq=0,delay=0){ const a=audio(); if(!a) return; const t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t); if(endFreq) o.frequency.exponentialRampToValueAtTime(endFreq,t+dur);
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.008); g.gain.exponentialRampToValueAtTime(.001,t+dur); o.connect(g).connect(master); o.start(t); o.stop(t+dur+.02); }
const sfx={
  thunder(){ const a=audio(); if(!a) return; noise(2.4,.32,'lowpass',180,1,.02); noise(1.2,.16,'lowpass',420,1,.005,.05); tone(48,1.8,'sawtooth',.06,30); },
  // victory fanfare: rising arpeggio, a bright held chord, then a happy trill and a purr-like meow
  victory(){ if(!audio()) return; [523,659,784,1047].forEach((f,i)=>{ tone(f,.22,'square',.07,0,i*.13); tone(f,.3,'triangle',.1,0,i*.13); });
    [523,659,784,1047].forEach(f=>{ tone(f,1.3,'triangle',.08,0,.62); tone(f*1.005,1.3,'sawtooth',.025,0,.62); });
    [1319,1175,1319,1568].forEach((f,i)=>tone(f,.14,'square',.05,0,2.0+i*.1)); setTimeout(()=>sfx.meow(),2600); },
  creak(){ if(!audio()) return; tone(210,.5,'sawtooth',.035,140); tone(330,.35,'triangle',.02,250,.08); },
  // 'wah wah wah waaah' on a muted trombone, then the bandicoots squeak and giggle
  lose(){ const a=audio(); if(!a) return; const t0=a.currentTime+.5, notes=[[311,.42],[294,.42],[277,.42],[262,1.4]];
    let t=t0; notes.forEach(([f,d],i)=>{ const o=a.createOscillator(),fl=a.createBiquadFilter(),g=a.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(f,t);
      if(i===3){ const l=a.createOscillator(),lg=a.createGain(); l.frequency.value=6; lg.gain.value=9; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t+d); o.frequency.linearRampToValueAtTime(f*.94,t+d); }
      fl.type='lowpass'; fl.frequency.setValueAtTime(500,t); fl.frequency.linearRampToValueAtTime(1500,t+.12); fl.frequency.linearRampToValueAtTime(600,t+d); fl.Q.value=6;
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.16,t+.04); g.gain.setValueAtTime(.16,t+d-.1); g.gain.linearRampToValueAtTime(0,t+d);
      o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t+d+.05); t+=d+.06; });
    for(let i=0;i<5;i++) setTimeout(()=>sfx.squeal(.09),(t-a.currentTime+.2+i*.18)*1000); },
  squeal(vol=.12){ const a=audio(); if(!a) return; const t=a.currentTime,o=a.createOscillator(),f=a.createBiquadFilter(),g=a.createGain(),lfo=a.createOscillator(),lg=a.createGain(),f0=rr(1700,2600);
    o.type='sawtooth'; o.frequency.setValueAtTime(f0,t); o.frequency.linearRampToValueAtTime(f0*1.3,t+.06); o.frequency.exponentialRampToValueAtTime(f0*.55,t+.32);
    lfo.frequency.value=rr(30,45); lg.gain.value=f0*.08; lfo.connect(lg).connect(o.frequency); f.type='bandpass'; f.frequency.value=2600; f.Q.value=1.5;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+.015); g.gain.exponentialRampToValueAtTime(.001,t+.34); o.connect(f).connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t+.36); lfo.stop(t+.36); },
  chew(){ for(let i=0;i<3;i++) noise(.04,rr(.12,.2),'bandpass',rr(1200,2600),1.2,.002,i*.09); },
  meow(p=1){ const a=audio(); if(!a) return; const t=a.currentTime,o=a.createOscillator(),f=a.createBiquadFilter(),f2=a.createBiquadFilter(),g=a.createGain(),b=rr(420,520)*p;
    o.type='sawtooth'; o.frequency.setValueAtTime(b,t); o.frequency.linearRampToValueAtTime(b*1.8,t+.14); o.frequency.linearRampToValueAtTime(b*1.55,t+.38); o.frequency.exponentialRampToValueAtTime(b*1.1,t+.62);
    f.type='bandpass'; f.Q.value=3; f.frequency.setValueAtTime(900*p,t); f.frequency.linearRampToValueAtTime(1900*p,t+.18); f.frequency.linearRampToValueAtTime(1000*p,t+.6);
    f2.type='lowpass'; f2.frequency.value=3500; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.22,t+.06); g.gain.linearRampToValueAtTime(.18,t+.4); g.gain.exponentialRampToValueAtTime(.001,t+.65);
    o.connect(f).connect(f2).connect(g).connect(master); o.start(t); o.stop(t+.7); },
  mrrp(){ tone(650,.1,'triangle',.08,1000); tone(900,.16,'triangle',.07,1350,.1); },
  pounce(){ const f=noise(.18,.14,'bandpass',700,1.5,.04); if(f&&ac) f.frequency.exponentialRampToValueAtTime(2400,ac.currentTime+.18); },
  hiss(){ noise(.35,.12,'highpass',3800,1,.04); },
  miss(){ noise(.1,.18,'lowpass',380,1); },
  nibble(){ for(let i=0;i<4;i++) noise(.035,.2,'highpass',2500,1,.002,i*.07); sfx.squeal(.05); },
  jingle(){ tone(2900,.18,'triangle',.05); tone(3800,.14,'triangle',.04,0,.035); tone(3300,.12,'triangle',.03,0,.08); },
  purr(dur=1.6){ const a=audio(); if(!a) return; const t=a.currentTime,s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain(),lfo=a.createOscillator(),lg=a.createGain();
    s.buffer=noiseBuf(a,dur); f.type='lowpass'; f.frequency.value=220; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.5,t+.2); g.gain.linearRampToValueAtTime(0,t+dur);
    lfo.frequency.value=26; lg.gain.value=.45; lfo.connect(lg).connect(g.gain); s.connect(f).connect(g).connect(master); s.start(t); lfo.start(t); s.stop(t+dur); lfo.stop(t+dur); },
  roar(){ const a=audio(); if(!a) return; const t=a.currentTime;
    for(const det of [1,1.012,.5]){ const o=a.createOscillator(),f=a.createBiquadFilter(),g=a.createGain(),lfo=a.createOscillator(),lg=a.createGain();
      o.type='sawtooth'; o.frequency.setValueAtTime(105*det,t); o.frequency.linearRampToValueAtTime(150*det,t+.35); o.frequency.exponentialRampToValueAtTime(55*det,t+1.9);
      f.type='lowpass'; f.Q.value=5; f.frequency.setValueAtTime(450,t); f.frequency.linearRampToValueAtTime(1400,t+.35); f.frequency.linearRampToValueAtTime(350,t+1.9);
      lfo.frequency.value=26; lg.gain.value=22*det; lfo.connect(lg).connect(o.frequency); const v=det===.5?.35:.28;
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(v,t+.18); g.gain.linearRampToValueAtTime(v*.8,t+1.1); g.gain.exponentialRampToValueAtTime(.001,t+2);
      o.connect(f).connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t+2.05); lfo.stop(t+2.05); }
    noise(1.7,.28,'bandpass',650,1.1,.15); },
  pop(){ tone(380,.16,'sine',.34,1250); tone(900,.09,'triangle',.12,1900,.04); noise(.05,.16,'highpass',3200,1); },
  boing(){ const a=audio(); if(!a) return; const t=a.currentTime,o=a.createOscillator(),g=a.createGain(),lfo=a.createOscillator(),lg=a.createGain();
    o.type='triangle'; o.frequency.setValueAtTime(220,t); o.frequency.exponentialRampToValueAtTime(520,t+.25); lfo.frequency.value=18; lg.gain.value=40; lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.14,t+.01); g.gain.exponentialRampToValueAtTime(.001,t+.32); o.connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t+.34); lfo.stop(t+.34); },
  slam(){ tone(60,.9,'sine',.8,24); noise(1,.6,'lowpass',260,1,.005); noise(.35,.35,'bandpass',1200,1,.002); },
  screech(){ const a=audio(); if(!a) return; const t=a.currentTime,o=a.createOscillator(),f=a.createBiquadFilter(),g=a.createGain(),lfo=a.createOscillator(),lg=a.createGain();
    o.type='sawtooth'; o.frequency.setValueAtTime(2600,t); o.frequency.linearRampToValueAtTime(3100,t+.15); o.frequency.exponentialRampToValueAtTime(1500,t+.9);
    lfo.frequency.value=34; lg.gain.value=160; lfo.connect(lg).connect(o.frequency); f.type='bandpass'; f.frequency.value=2800; f.Q.value=2;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.16,t+.05); g.gain.linearRampToValueAtTime(.12,t+.5); g.gain.exponentialRampToValueAtTime(.001,t+.95);
    o.connect(f).connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t+1); lfo.stop(t+1); },
  flap(){ noise(.12,.12,'lowpass',500,1,.01); },
  woof(){ for(const d of [0,.32]){ noise(.16,.35,'bandpass',420,1.4,.005,d); tone(190,.16,'sawtooth',.12,110,d); } },
  bonus(){ [880,1175,1568].forEach((f,i)=>tone(f,.18,'triangle',.1,0,i*.07)); },
  wave(){ [523,659,784].forEach((f,i)=>tone(f,.2,'triangle',.1,0,i*.11)); },
  bird(){ const n=2+rand()*3|0,b=rr(2600,3600); for(let i=0;i<n;i++) tone(b,.08,'sine',.035,b*rr(1.3,1.6),i*.11); },
  cricket(){ const f=rr(4200,4700); for(let k=0;k<2;k++) for(let i=0;i<3;i++) tone(f,.025,'sine',.022,0,k*.28+i*.045); },
  nope(){ tone(330,.12,'triangle',.08,250); tone(250,.16,'triangle',.08,190,.12); },
};
let growl=null, growlOn=false, lastHiss=-9;
function setGrowl(on){ on=on&&!muted; if(on===growlOn) return; growlOn=on; if(!ac) return;
  if(!growl){ try{ const src=ac.createBufferSource(); src.buffer=noiseBuf(ac,2); src.loop=true; const lp=ac.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=420;
    const osc=ac.createOscillator(); osc.type='sawtooth'; osc.frequency.value=64; const og=ac.createGain(); og.gain.value=.35; const olp=ac.createBiquadFilter(); olp.type='lowpass'; olp.frequency.value=300;
    const am=ac.createGain(); am.gain.value=.5; const lfo=ac.createOscillator(); lfo.frequency.value=23; const lg=ac.createGain(); lg.gain.value=.5; lfo.connect(lg).connect(am.gain);
    const wob=ac.createOscillator(); wob.frequency.value=.8; const wg=ac.createGain(); wg.gain.value=12; wob.connect(wg).connect(osc.frequency);
    const out=ac.createGain(); out.gain.value=0; src.connect(lp).connect(am); osc.connect(og).connect(olp).connect(am); am.connect(out).connect(master); src.start(); osc.start(); lfo.start(); wob.start(); growl={out}; }catch(e){ return; } }
  growl.out.gain.setTargetAtTime(on?.7:0,ac.currentTime,on?.05:.12); }
function say(text){ if(muted||!('speechSynthesis' in window)) return; try{ const u=new SpeechSynthesisUtterance(text); u.rate=1.02; u.pitch=.9; speechSynthesis.cancel(); speechSynthesis.speak(u); }catch(e){} }
let ambT=3;
let toastT=0;
function toast(msg){ ui.toast={msg,id:++toastT}; sync(); }

// ================= 2D ground textures =================
let floor=null, stains=null, sctx=null;
function mkCanvas(w,h){ const c=document.createElement('canvas'); c.width=Math.max(1,Math.ceil(w)); c.height=Math.max(1,Math.ceil(h)); return c; }
// ---- flat cartoon painting: solid fills, crisp shapes, dark ink edges ----
const INK='rgba(70,45,20,.35)';   // soft edge on painted ground details
function vivid(hex,k=1.3){ const c=new THREE.Color(hex); vividColor(c,k); return '#'+c.getHexString(); }
function drawLeaf(g,x,y,size,rot,color,ink=true){ g.save(); g.translate(x,y); g.rotate(rot); g.fillStyle=color; g.beginPath(); g.moveTo(size,0); g.quadraticCurveTo(0,-size*.65,-size,0); g.quadraticCurveTo(0,size*.65,size,0); g.fill();
  if(ink){ g.strokeStyle=INK; g.lineWidth=1.1; g.stroke(); } g.strokeStyle='rgba(42,26,16,.55)'; g.lineWidth=.9; g.beginPath(); g.moveTo(-size*.8,0); g.lineTo(size*.75,0); g.stroke(); g.restore(); }
function drawFlower(f,x,y,kind){
  f.save(); f.translate(x,y); f.scale(rr(1,1.35),rr(1,1.35)); f.lineWidth=1.2; f.strokeStyle=INK; f.lineJoin='round';
  f.fillStyle='#43b02a'; for(let k=0;k<2;k++){ f.save(); f.rotate(rand()*TAU); f.beginPath(); f.ellipse(9,0,7.5,3.2,0,0,TAU); f.fill(); f.stroke(); f.restore(); }
  const petals=(n,len,wid,col)=>{ f.fillStyle=col; for(let k=0;k<n;k++){ f.save(); f.rotate(k*TAU/n); f.beginPath(); f.ellipse(len*.55,0,len*.55,wid,0,0,TAU); f.fill(); f.stroke(); f.restore(); } };
  const center=(r,c)=>{ f.fillStyle=c; f.beginPath(); f.arc(0,0,r,0,TAU); f.fill(); f.stroke(); f.fillStyle='rgba(255,255,255,.7)'; f.beginPath(); f.arc(-r*.35,-r*.35,r*.3,0,TAU); f.fill(); };
  if(kind==='daisy'){ petals(9,9,2.8,'#ffffff'); center(3.4,'#ffcf1f'); } else if(kind==='poppy'){ petals(5,10,6,'#ff3b30'); center(2.8,INK); }
  else if(kind==='violet'){ petals(5,7.5,4.2,'#a66bff'); center(2.2,'#ffe14a'); } else if(kind==='buttercup'){ petals(5,7,4.4,'#ffdd1f'); center(2.2,'#ff9f1c'); }
  else { petals(12,6,1.8,'#ffd60a'); center(3.6,'#ffb703'); }
  f.restore();
}
function tuft(f,x,y,col,s){ f.strokeStyle=col; f.lineWidth=2.2*s; f.lineCap='round'; f.beginPath();
  f.moveTo(x-3*s,y); f.quadraticCurveTo(x-4*s,y-5*s,x-7*s,y-8*s); f.moveTo(x,y); f.quadraticCurveTo(x,y-7*s,x+1*s,y-12*s); f.moveTo(x+3*s,y); f.quadraticCurveTo(x+4*s,y-5*s,x+7*s,y-8*s); f.stroke(); }
function paintFloor(f,T,detail=1){
  f.lineJoin='round';
  if(T.kind==='tiles'){ const ts=80, A=vivid('#f6dca6',1.2), B=vivid('#e2b36f',1.2);
    for(let y=0;y<H;y+=ts) for(let x=0;x<W;x+=ts){ const dark=((x/ts|0)+(y/ts|0))%2; f.fillStyle=dark?B:A; f.fillRect(x,y,ts,ts); f.fillStyle='rgba(255,255,255,.22)'; f.fillRect(x+10,y+9,ts*.3,4); }
    f.strokeStyle='rgba(95,58,26,.6)'; f.lineWidth=3; for(let x=0;x<=W;x+=ts){ f.beginPath(); f.moveTo(x,0); f.lineTo(x,H); f.stroke(); } for(let y=0;y<=H;y+=ts){ f.beginPath(); f.moveTo(0,y); f.lineTo(W,y); f.stroke(); } return; }
  const g0=vivid(T.ground[0]); f.fillStyle=g0; f.fillRect(0,0,W,H);
  // big flat colour blobs instead of soft gradients
  for(let i=0;i<Math.max(14,W*H/60000);i++){ const x=rand()*W,y=rand()*H,rx=rr(70,200),c=rand()<.5?T.patches[0]:T.patches[1]; f.fillStyle=`rgba(${c},.22)`; f.beginPath(); f.ellipse(x,y,rx,rx*rr(.45,.75),rand()*TAU,0,TAU); f.fill(); }
  if(T.kind==='snow'){ for(let i=0;i<W*H/30000;i++){ const x=rand()*W,y=rand()*H,rx=rr(60,160),ry=rx*rr(.3,.5); f.fillStyle='rgba(120,160,215,.28)'; f.beginPath(); f.ellipse(x+5,y+7,rx,ry,0,0,TAU); f.fill(); f.fillStyle='#ffffff'; f.beginPath(); f.ellipse(x,y,rx,ry,0,0,TAU); f.fill(); }
    f.fillStyle='#ffffff'; for(let i=0;i<W*H/9000*detail;i++){ const x=rand()*W,y=rand()*H,s=rr(1.5,3); f.fillRect(x-s,y-.6,s*2,1.2); f.fillRect(x-.6,y-s,1.2,s*2); } }
  for(let i=0;i<W*H/70000*T.pebbles;i++){ const x=rand()*W,y=rand()*H,rx=rr(4,9); f.fillStyle='#bfb6a6'; f.strokeStyle=INK; f.lineWidth=1.2; f.beginPath(); f.ellipse(x,y,rx,rx*rr(.6,.85),rand(),0,TAU); f.fill(); f.stroke(); f.fillStyle='rgba(255,255,255,.6)'; f.beginPath(); f.arc(x-rx*.3,y-rx*.25,rx*.25,0,TAU); f.fill(); }
  const [h0,h1,s0,s1,l0,l1]=T.blade;
  for(let i=0;i<W*H/(T.bladeDiv*22)*detail;i++) tuft(f,rand()*W,rand()*H,`hsl(${rr(h0,h1)|0},${Math.min(100,rr(s0,s1)*1.3)|0}%,${rr(l0,l1)|0}%)`,rr(.8,1.3));
  if(T.clover) for(let i=0;i<W*H/28000*detail;i++){ const x=rand()*W,y=rand()*H,s=rr(2.6,3.8),rot=rand()*TAU; f.fillStyle=`hsl(${rr(100,125)|0},62%,${rr(36,46)|0}%)`; f.strokeStyle='rgba(42,26,16,.6)'; f.lineWidth=1;
    for(let k=0;k<3;k++){ const a=rot+k*TAU/3; f.beginPath(); f.arc(x+Math.cos(a)*s,y+Math.sin(a)*s,s,0,TAU); f.fill(); f.stroke(); } }
  if(T.fallen) for(let i=0;i<W*H/4000*detail;i++) drawLeaf(f,rand()*W,rand()*H,rr(6,11),rand()*TAU,pick(LEAF_COLORS));
  if(T.flowers.length) for(let i=0;i<Math.max(20,W*H/T.flowerDiv);i++) drawFlower(f,rand()*W,rand()*H,pick(T.flowers));
  for(const h of holes){ f.fillStyle=T.kind==='snow'?'#6d7f92':'#5a3a1e'; f.beginPath(); f.arc(h.x,h.y,33,0,TAU); f.fill(); f.fillStyle='#120a05'; f.beginPath(); f.arc(h.x,h.y,27,0,TAU); f.fill(); f.strokeStyle=INK; f.lineWidth=3; f.stroke(); }
}
function buildFloor(){ floor=mkCanvas(W*TEX,H*TEX); const f=floor.getContext('2d'); f.scale(TEX,TEX); paintFloor(f,theme(),LOW?.6:1); }
function themeThumb(T){
  const c=mkCanvas(240,135), g=c.getContext('2d'), sky=g.createLinearGradient(0,0,0,50); sky.addColorStop(0,vivid(T.sky[0])); sky.addColorStop(1,vivid(T.sky[1])); g.fillStyle=sky; g.fillRect(0,0,240,135);
  const fc=mkCanvas(W*.2,H*.2), fg=fc.getContext('2d'); fg.scale(.2,.2); paintFloor(fg,T,.4);
  g.save(); g.beginPath(); g.moveTo(40,40); g.lineTo(200,40); g.lineTo(240,135); g.lineTo(0,135); g.closePath(); g.clip(); g.drawImage(fc,0,40,240,95); g.restore();
  if(T.fence){ g.strokeStyle=T.fence==='snow'?'#f4f8ff':'#c9a77a'; g.lineWidth=2; g.beginPath(); g.moveTo(40,36); g.lineTo(200,36); g.moveTo(40,42); g.lineTo(200,42); g.stroke(); for(let x=40;x<=200;x+=16){ g.beginPath(); g.moveTo(x,32); g.lineTo(x,44); g.stroke(); } }
  if(T.walls){ g.fillStyle='#eee3d0'; g.fillRect(0,0,240,40); g.fillStyle='#5a3b24'; g.fillRect(0,34,240,8); }
  if(T.night){ g.fillStyle='#fff'; for(let i=0;i<30;i++) g.fillRect(rand()*240,rand()*30,1.2,1.2); g.fillStyle='#f4f1d8'; g.beginPath(); g.arc(200,14,8,0,TAU); g.fill(); g.fillStyle='rgba(4,10,32,.35)'; g.fillRect(0,40,240,95); }
  if(T.ambient==='snow'){ g.fillStyle='#fff'; for(let i=0;i<60;i++){ g.beginPath(); g.arc(rand()*240,rand()*135,rr(.6,1.8),0,TAU); g.fill(); } }
  g.fillStyle='#f2c53d'; g.beginPath(); g.ellipse(120,92,16,9,0,0,TAU); g.fill(); g.fillStyle='#d99a22'; g.fillRect(104,92,32,4);
  return c.toDataURL();
}
let ants=[], ladybugs=[], beetles=[];
function buildCrawlers(){
  const B=theme().bugs||{}, area=W*H; ants=[];
  if(B.ants) for(let i=0;i<3;i++){ const a={x:rand()<.5?-10:W+10,y:rr(H*.15,H*.85)},b={x:a.x<0?W+10:-10,y:rr(H*.15,H*.85)}; if(i===2){ a.x=rr(W*.2,W*.8); a.y=-10; b.x=rr(W*.2,W*.8); b.y=H+10; }
    const tr={a,b,ph:rand()*TAU,amp:rr(15,40),freq:rr(6,12),len:Math.hypot(b.x-a.x,b.y-a.y)},n=Math.round(tr.len/(LOW?70:45)); for(let k=0;k<n;k++) ants.push({tr,s:k/n*tr.len+rr(-8,8),spd:rr(24,34),off:rr(-3,3)}); }
  const cnt=(k,base,min)=>Math.round((B[k]||0)*Math.max(min,area/base));
  ladybugs=[]; for(let i=0;i<cnt('ladybugs',220000,3);i++) ladybugs.push({x:rand()*W,y:rand()*H,a:rand()*TAU,spd:rr(10,18)});
  beetles=[]; for(let i=0;i<cnt('beetles',400000,2);i++) beetles.push({x:rand()*W,y:rand()*H,a:rand()*TAU,spd:rr(14,22)});
}
function trailPos(tr,s){ const u=s/tr.len,dx=tr.b.x-tr.a.x,dy=tr.b.y-tr.a.y,L=tr.len,off=Math.sin(u*tr.freq+tr.ph)*tr.amp; return {x:tr.a.x+dx*u-dy/L*off,y:tr.a.y+dy*u+dx/L*off}; }

// ================= three.js setup =================
const octx=ov.getContext('2d');
let renderer;
try{ renderer=new T3.WebGLRenderer({canvas:glc,antialias:!LOW,powerPreference:'high-performance'}); }
catch(e){ throw new Error('Your browser could not start WebGL (3D graphics). Try another browser or enable hardware acceleration.'); }
// cartoon pipeline: colours are shown exactly as authored (linear output, no tone mapping), crisp shadows
// filmic tone mapping + sRGB output: soft highlight roll-off and rich, clean shadows (realistic light on stylised characters)
renderer.outputEncoding=T3.sRGBEncoding; renderer.toneMapping=T3.CustomToneMapping; renderer.toneMappingExposure=.9;
const pmrem=new T3.PMREMGenerator(renderer);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=LOW?T3.PCFShadowMap:T3.PCFSoftShadowMap;
const scene=new T3.Scene(), camera=new T3.PerspectiveCamera(42,1,5,14000);
const hemi=new T3.HemisphereLight(0xffffff,0x444444,.8); scene.add(hemi);
const sun=new T3.DirectionalLight(0xffffff,1.2); sun.castShadow=true; scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(LOW?1024:1536,LOW?1024:1536);
{ const e=Math.max(W,H)*.72, sc=sun.shadow.camera; sc.left=-e; sc.right=e; sc.top=e; sc.bottom=-e; sc.near=50; sc.far=4000; sun.shadow.bias=-.0006; sun.shadow.normalBias=1.2; }
const rim=new T3.DirectionalLight(0xffe8c8,.55); scene.add(rim); scene.add(rim.target);
const lantern=new T3.PointLight(0xffb860,0,900,1.6); lantern.position.set(0,90,0); scene.add(lantern);
const catLight=new T3.PointLight(0xfff0d0,0,650,1.6); scene.add(catLight);
let world=new T3.Group(); scene.add(world);
const UP=new T3.Vector3(0,1,0), XAX=new T3.Vector3(1,0,0), ZAX=new T3.Vector3(0,0,1);
const _v1=new T3.Vector3(),_v2=new T3.Vector3(),_v3=new T3.Vector3(),_m=new T3.Matrix4(),_q=new T3.Quaternion(),_s=new T3.Vector3(),_c=new T3.Color(),_e=new T3.Euler();
const G={ sph:new T3.SphereGeometry(1,LOW?26:40,LOW?18:28), sphX:new T3.SphereGeometry(1,LOW?30:44,LOW?20:30).rotateZ(-Math.PI/2), sphLow:new T3.SphereGeometry(1,16,12),
  cyl:new T3.CylinderGeometry(.8,1,1,LOW?16:24,1), cylU:new T3.CylinderGeometry(1,1,1,LOW?18:26,1), earGeo:new T3.ConeGeometry(1,1,24,1,true,Math.PI,Math.PI), cone:new T3.ConeGeometry(1,1,20), box:new T3.BoxGeometry(1,1,1),
  disc:new T3.CircleGeometry(1,28).rotateY(Math.PI/2), hemi:new T3.SphereGeometry(1,24,12,0,TAU,0,Math.PI/2), torus:new T3.TorusGeometry(1,.12,8,28) };
const LOCK_GEO=(()=>{ const g=new T3.SphereGeometry(1,LOW?14:20,LOW?10:14).rotateZ(-Math.PI/2), q=g.attributes.position;
  for(let i=0;i<q.count;i++){ const x=q.getX(i), t=(x+1)/2, taper=1-Math.pow(t,2)*.58; q.setY(i,q.getY(i)*taper+t*t*.38); q.setZ(i,q.getZ(i)*taper); }
  g.computeVertexNormals(); return g; })();
const SHARED_GEO=new Set([...Object.values(G),LOCK_GEO]);
// rounded limb (capsule) hanging from its joint: rounded ends overlap the next joint so arms/legs bend smoothly
const limbCache={};
function limbGeo(r,len){ const k=r+'|'+len; if(limbCache[k]) return limbCache[k]; const g=new T3.CapsuleGeometry(r,len,8,LOW?14:20).translate(0,-len/2,0); SHARED_GEO.add(g); return limbCache[k]=g; }
const g2w=(x,y)=>[x-W/2,y-H/2];
function canvasTex(c){ const t=new T3.CanvasTexture(c); t.encoding=T3.sRGBEncoding; t.anisotropy=Math.min(LOW?2:8,renderer.capabilities.getMaxAnisotropy()); return t; }
function mesh(geo,mat,cast=true){ const m=new T3.Mesh(geo,mat); m.castShadow=cast; return m; }
function placeSeg(m,a,b,r){ _v1.subVectors(b,a); const len=_v1.length()||.001; m.position.copy(a).addScaledVector(_v1,.5); _v1.multiplyScalar(1/len); m.quaternion.setFromUnitVectors(UP,_v1); m.scale.set(r,len,r); }
function placeEll(m,a,b,extra,ry,rz){ _v1.subVectors(b,a); const len=_v1.length()||.001; m.position.copy(a).addScaledVector(_v1,.5); _v1.multiplyScalar(1/len); m.quaternion.setFromUnitVectors(XAX,_v1); m.scale.set(len/2+extra,ry,rz); }
function disposeTree(o){ o.traverse(n=>{ if(n.geometry&&!SHARED_GEO.has(n.geometry)) n.geometry.dispose(); if(n.material){ (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{ if(m&&!(m.userData&&m.userData.shared)) m.dispose(); }); } }); }
// ================= layered 3D fur (shell texturing) =================
// Each furry part gets one extra instanced draw: N thin shells pushed out along the surface normal. Every shell keeps
// only the strands tall enough to reach it, so stacked together they form soft, tapered 3D strands with a fuzzy
// silhouette, darker at the roots (self-shadowing) and lighter at the tips, drooping slightly under gravity.
// Strands are generated procedurally in the part's own (scaled) space, so they stick to the body as it moves.
// per-view fur scale: the gameplay camera is far away, so strands there are thicker/longer than in the menu close-up
const FUR_CELLK={value:1}, FUR_LENK={value:1};
let furGame=LOW?5:9;   // fur layers in gameplay (the menu close-up uses the full count)
const FUR_MAX=12, FUR_SHELLS={value:LOW?6:12}, FUR_ON=renderer.capabilities.isWebGL2;
const SHELL_LAYERS=new T3.InstancedBufferAttribute(new Float32Array(FUR_MAX).map((_,i)=>i+1),1), shellGeoCache=new WeakMap();
function shellGeo(g){ let sg=shellGeoCache.get(g); if(sg) return sg; sg=new T3.InstancedBufferGeometry(); sg.index=g.index; for(const k in g.attributes) sg.setAttribute(k,g.attributes[k]);
  sg.setAttribute('aLayer',SHELL_LAYERS); sg.instanceCount=FUR_SHELLS.value; shellGeoCache.set(g,sg); return sg; }
const FUR_STYLE={grav:.85,ao:.7,tint:.28,rad:.62,sheen:.12};   // default: soft but visibly strandy
function shellMat(base,len,cell,st=FUR_STYLE){ const key='shell|'+len+'|'+cell+'|'+st.grav+'|'+st.ao+'|'+st.tint+'|'+st.rad+'|'+st.sheen; if(base.userData[key]) return base.userData[key];
  const m=new CartoonMat({map:base.map||null,vertexColors:!!base.vertexColors}); m.color.copy(base.color); m.roughness=clamp(base.roughness+st.sheen,.3,1);
  m.userData.shared=!!base.userData.shared;
  // with MSAA, strand edges are anti-aliased through alpha-to-coverage; without it (low-end) they fall back to a hard cut
  if(LOW) m.defines={FUR_HARD:''}; else m.alphaToCoverage=true;
  m.onBeforeCompile=sh=>{ sh.uniforms.uShells=FUR_SHELLS; sh.uniforms.uFurLen={value:len}; sh.uniforms.uCell={value:1/cell}; sh.uniforms.uLenK=FUR_LENK; sh.uniforms.uGrav={value:st.grav}; sh.uniforms.uAO={value:st.ao}; sh.uniforms.uTint={value:st.tint}; sh.uniforms.uRad={value:st.rad}; sh.uniforms.uCellK=FUR_CELLK;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float aLayer; uniform float uShells; uniform float uFurLen; uniform float uLenK; uniform float uGrav; varying float vLayer; varying vec3 vFurP;')
      .replace('#include <project_vertex>',`vLayer=aLayer/uShells;
  vFurP=position*vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
  vec4 mvPosition=modelViewMatrix*vec4(transformed,1.0);
  vec3 grav=(viewMatrix*vec4(0.0,-1.0,0.0,0.0)).xyz;
  float fl=uFurLen*uLenK; mvPosition.xyz+=normalize(transformedNormal)*fl*vLayer+grav*fl*vLayer*vLayer*uGrav;
  gl_Position=projectionMatrix*mvPosition;`);
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
uniform float uCell; uniform float uCellK; uniform float uAO; uniform float uTint; uniform float uRad; varying float vLayer; varying vec3 vFurP; float furA, furV;
float furHash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }`)
      .replace('#include <clipping_planes_fragment>',`{ vec3 fp=vFurP*uCell/uCellK, fc=floor(fp), ff=fract(fp); float fh=.35+.65*furHash(fc);
    vec3 fo=vec3(furHash(fc+1.7),furHash(fc+3.1),furHash(fc+5.3))*.5+.25;
    float rad=uRad*(1.0-vLayer/fh), d=length(ff-fo), w=max(length(fwidth(fp)),1e-4);
    float strand=(1.0-smoothstep(rad-w,rad+w,d))*(1.0-smoothstep(fh-.08,fh,vLayer));   // soft round, tapered strand
    float soft=pow(clamp(1.0-vLayer,0.0,1.0),1.4);                                     // far away: a soft fuzzy falloff instead of noisy dots
    furA=mix(strand,soft,smoothstep(.9,1.8,w)); furV=1.0-uTint*.5+uTint*furHash(fc+9.1);   // per-strand tint variation
#ifdef FUR_HARD
    if(furA<.5) discard;
#else
    if(furA<.02) discard;
#endif
  }
#include <clipping_planes_fragment>`)
      .replace('#include <output_fragment>',RIM_GLSL(.3)).replace('#include <color_fragment>','#include <color_fragment>\n  diffuseColor.rgb*=mix(uAO,1.18,vLayer)*mix(furV,1.0,smoothstep(.9,1.8,length(fwidth(vFurP*uCell/uCellK))));\n#ifndef FUR_HARD\n  diffuseColor.a=furA;\n#endif'); };
  m.customProgramCacheKey=()=>'shellfur';
  return base.userData[key]=m; }
// grow fur on every mesh whose material is marked furry (material.userData.fur, optional furK length multiplier)
const RIM_GLSL=s=>`float rimF=pow(1.0-clamp(dot(normalize(normal),normalize(vViewPosition)),0.0,1.0),2.6);
  outgoingLight+=mix(diffuseColor.rgb,vec3(1.0),0.3)*rimF*${s.toFixed(3)};
#include <output_fragment>`;
function rimify(root,str=.32){ root.traverse(o=>{ if(!o.isMesh) return; for(const m of Array.isArray(o.material)?o.material:[o.material]){
  if(!m||!m.isMeshStandardMaterial||m.onBeforeCompile!==T3.Material.prototype.onBeforeCompile||m.userData.rim) continue; m.userData.rim=str; m.envMapIntensity=.85;
  m.onBeforeCompile=sh=>{ sh.fragmentShader=sh.fragmentShader.replace('#include <output_fragment>',RIM_GLSL(str)); }; m.customProgramCacheKey=()=>'rim'+str; } }); return root; }
// characters: rim light + fur
function polish(root,...furArgs){ rimify(root); return furify(root,...furArgs); }
function furify(root,len,cell=len*.6,style=FUR_STYLE){ if(!FUR_ON||BAKING) return root; const add=[];
  root.traverse(o=>{ if(o.isMesh&&!o.isInstancedMesh&&!o.userData.furred&&o.material&&!Array.isArray(o.material)&&o.material.userData.fur) add.push(o); });
  for(const o of add){ const k=o.material.userData.furK||1, mat=shellMat(o.material,len*k,cell*k,style), sg=shellGeo(o.geometry);
    let sm; if(o.isSkinnedMesh){ sm=new T3.SkinnedMesh(sg,mat); sm.bind(o.skeleton,o.bindMatrix); } else sm=new T3.Mesh(sg,mat);
    sm.onBeforeRender=()=>{ sg.instanceCount=FUR_SHELLS.value; };
    sm.frustumCulled=o.frustumCulled; sm.castShadow=false; sm.receiveShadow=o.receiveShadow; sm.raycast=()=>{}; sm.userData.furOf=o; o.userData.furred=true; o.add(sm); }
  return root; }
const furry=(m,k=1)=>{ m.userData.fur=true; if(k!==1) m.userData.furK=k; return m; };
function stdMat(color,o={}){ return new CartoonMat(Object.assign({color,roughness:.6},o)); }

// ---- stylised fur textures ----
const texCache={};
function noiseCanvas(size,fn){ const c=mkCanvas(size,size),g=c.getContext('2d'); fn(g,size); return c; }
// no bump maps in the cartoon look: surfaces are flat colour
const FURBUMP=null, SKINBUMP=null;
// real hair-strand detail extracted from a photo-real cat image (tools/make-fur-detail.mjs): grey, 128 = neutral, tileable
const FUR_DET=(()=>{ const b=atob(FUR_DETAIL.data), a=new Uint8Array(b.length); for(let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return {n:FUR_DETAIL.size,a}; })();
function applyFurDetail(g,W,H,k=.5){ const id=g.getImageData(0,0,W,H), d=id.data, {n,a}=FUR_DET;
  for(let y=0;y<H;y++){ const row=(y%n)*n; for(let x=0;x<W;x++){ const m=1+(a[row+x%n]-128)/128*k, o=(y*W+x)*4; d[o]=Math.min(255,d[o]*m); d[o+1]=Math.min(255,d[o+1]*m); d[o+2]=Math.min(255,d[o+2]*m); } }
  g.putImageData(id,0,0); }
// natural coat: soft-edged, irregular markings over the base colour, then the photographed hair texture on top
function furTexture(base,light,dark,pattern,stripe,spot){
  const key=[base,light,dark,pattern,stripe,spot].join('|'); if(texCache[key]) return texCache[key];
  const c=mkCanvas(512,256), g=c.getContext('2d'); g.fillStyle=base; g.fillRect(0,0,512,256);
  // gentle light/dark variation in the coat (agouti shading)
  for(let i=0;i<70;i++){ g.fillStyle=(i%2?light:dark)+'22'; g.beginPath(); g.ellipse(rand()*512,rand()*256,rr(20,60),rr(8,24),rand()*TAU,0,TAU); g.fill(); }
  g.lineCap='round'; g.lineJoin='round'; g.filter='blur(3px)';
  if(pattern==='tabby'){ g.strokeStyle=stripe; for(let k=0;k<9;k++){ const y=(k+.5)/9*256; g.beginPath(); g.moveTo(-10,y);
      for(let x=0;x<=528;x+=16){ g.lineWidth=rr(7,14); g.lineTo(x,y+Math.sin(x*.025+k*1.3)*8+rr(-2,2)); } g.stroke(); } }
  if(pattern==='spotted'){ g.fillStyle=spot; for(let i=0;i<46;i++){ const x=rand()*512,y=rand()*256,r=rr(6,11); g.beginPath(); g.ellipse(x,y,r*1.3,r,rand(),0,TAU); g.fill(); } }
  if(pattern==='piebald') for(let i=0;i<8;i++){ const x=rand()*512,y=rand()*256,r=rr(30,60); g.fillStyle='#1c1918'; g.beginPath(); g.ellipse(x,y,r,r*rr(.6,1),rand(),0,TAU); g.fill(); }
  if(pattern==='calico') for(let i=0;i<9;i++){ const x=rand()*512,y=rand()*256,r=rr(38,70); g.fillStyle=i%2?'#2a2420':'#d98a3e'; g.beginPath(); g.ellipse(x,y,r,r*rr(.7,1),rand(),0,TAU); g.fill(); }
  g.filter='none'; applyFurDetail(g,512,256,pattern==='skin'?.12:.5);
  const t=canvasTex(c); t.wrapS=t.wrapT=T3.RepeatWrapping; t.anisotropy=8; texCache[key]=t; return t;
}
function tailTexture(L){
  const key='tail|'+L.tail.join('|')+L.rings+L.tipBlack; if(texCache[key]) return texCache[key];
  const c=mkCanvas(512,64),g=c.getContext('2d'); g.fillStyle=L.tail[0]; g.fillRect(0,0,512,64); g.filter='blur(3px)';
  if(L.rings){ g.fillStyle=L.tail[1]; for(let u=.12;u<.84;u+=.13) g.fillRect(u*512,-8,24,80); }
  const tip=L.tipBlack?.78:.86; g.fillStyle=L.tail[2]; g.fillRect(tip*512,-8,512,80); g.filter='none'; applyFurDetail(g,512,64,L.pattern==='skin'?.12:.45);
  const t=canvasTex(c); texCache[key]=t; return t;
}
function irisTexture(c0,c1){
  const key='iris|'+c0+c1; if(texCache[key]) return texCache[key];
  const c=mkCanvas(128,128),g=c.getContext('2d'); g.fillStyle=mix(c1,'#000000',.5); g.fillRect(0,0,128,128);
  g.fillStyle=vivid(c1); g.beginPath(); g.arc(64,64,56,0,TAU); g.fill(); g.fillStyle=vivid(c0); g.beginPath(); g.arc(64,64,34,0,TAU); g.fill();
  const t=canvasTex(c); texCache[key]=t; return t;
}
// realistic iris on a spherical cap: canvas y = angle from the pupil centre (top) to the rim (bottom), x = angle around it, so vertical strokes are radial fibres
const IRIS_TH=1.15;
function realIrisTex(c0,c1){ const key='riris|'+c0+c1; if(texCache[key]) return texCache[key];
  const W=256,H=256,c=mkCanvas(W,H),g=c.getContext('2d'), Y=r=>r*H, e=H;   // SphereGeometry spreads v over the cap only, so the full canvas height is pupil -> rim
  const gr=g.createLinearGradient(0,0,0,e);
  gr.addColorStop(0,mix(c0,'#000000',.45)); gr.addColorStop(.16,mix(c0,'#000000',.2)); gr.addColorStop(.3,c0); gr.addColorStop(.6,mix(c0,c1,.65));
  gr.addColorStop(.8,c1); gr.addColorStop(.9,mix(c1,'#000000',.5)); gr.addColorStop(1,mix(c1,'#000000',.85));
  g.fillStyle=gr; g.fillRect(0,0,W,H);
  for(let i=0;i<700;i++){ const x=rr(0,W), y0=Y(rr(.1,.45)), y1=Y(rr(.5,.92)), lt=rand()<.5;
    g.strokeStyle=lt?`rgba(255,250,225,${rr(.04,.14).toFixed(3)})`:`rgba(0,0,0,${rr(.06,.2).toFixed(3)})`; g.lineWidth=rr(.5,1.6);
    g.beginPath(); g.moveTo(x,y0); g.quadraticCurveTo(x+rr(-4,4),(y0+y1)/2,x+rr(-3,3),y1); g.stroke(); }
  for(let i=0;i<60;i++){ g.fillStyle=`rgba(${rand()<.5?'60,35,10':'255,240,200'},${rr(.08,.2).toFixed(3)})`; g.beginPath(); g.arc(rr(0,W),Y(rr(.25,.8)),rr(.8,2.2),0,TAU); g.fill(); }
  g.fillStyle='rgba(255,245,210,.10)'; g.fillRect(0,Y(.2),W,Y(.08));   // collarette ring around the pupil
  const t=canvasTex(c); t.wrapS=T3.RepeatWrapping; t.anisotropy=4; texCache[key]=t; return t; }
function glintTex(){ if(texCache.glint) return texCache.glint; const c=mkCanvas(64,64),g=c.getContext('2d'), gr=g.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.45,'rgba(255,255,255,.7)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64);
  return texCache.glint=canvasTex(c); }
function noseTex(){ if(texCache.nose) return texCache.nose; const c=mkCanvas(64,64),g=c.getContext('2d'); g.fillStyle='#ffffff'; g.fillRect(0,0,64,64);
  for(let i=0;i<260;i++){ g.fillStyle=`rgba(40,10,10,${rr(.05,.16).toFixed(3)})`; g.beginPath(); g.arc(rr(0,64),rr(0,64),rr(.8,2),0,TAU); g.fill(); }   // pebbled nose leather
  const t=canvasTex(c); t.wrapS=t.wrapT=T3.RepeatWrapping; return texCache.nose=t; }
function furMat(base,light,dark,pattern='solid',stripe,spot){ return furry(new CartoonMat({map:furTexture(base,light,dark,pattern,stripe||'rgba(0,0,0,.3)',spot||'#1e150d')})); }
function skinMat(base){ return new CartoonMat({color:base}); }
function knitTex(a,b,stripes){ const key='knit|'+a+b+stripes; if(texCache[key]) return texCache[key]; const c=mkCanvas(128,128),g=c.getContext('2d'); g.fillStyle=a; g.fillRect(0,0,128,128);
  if(stripes){ g.fillStyle=b; for(let y=0;y<128;y+=32) g.fillRect(0,y,128,14); }
  const t=canvasTex(c); t.wrapS=t.wrapT=T3.RepeatWrapping; texCache[key]=t; return t; }
function starTex(bg){ const key='star|'+bg; if(texCache[key]) return texCache[key]; const c=mkCanvas(256,128),g=c.getContext('2d'); g.fillStyle=bg; g.fillRect(0,0,256,128);
  g.fillStyle='#ffe14a'; g.translate(128,64); g.beginPath(); for(let i=0;i<10;i++){ const r=i%2?14:32,a=i/10*TAU-Math.PI/2; g.lineTo(Math.cos(a)*r,Math.sin(a)*r); } g.fill();
  const t=canvasTex(c); texCache[key]=t; return t; }

// ================= cat look =================
function makeLook(bId,cId){
  const B=BREEDS[bId],C=COLORS[cId],p=B.pattern;
  const L={pattern:p,base:C.base,light:C.light,dark:C.dark,stripe:C.stripe||'rgba(0,0,0,.25)',leg:C.base,paw:C.light,earOut:C.base,earIn:'#f2b0b2',nose:'#f08a98',muzzle:C.light,tail:[C.base,C.dark,C.dark],rings:false,calico:!!C.calico,spot:'#1e150d',patch:null,point:null,tipBlack:false,bib:null};
  if(cId==='black'){ L.nose='#3a2c2c'; L.earIn='#6a4a4a'; }
  if(p==='tabby') L.rings=true;
  if(p==='spotted'){ L.rings=true; L.tipBlack=true; L.spot=cId==='black'?'#000000':mix(C.dark,'#000000',.55); L.tail=[C.base,L.spot,'#111111']; }
  if(p==='point'||p==='mitted'){ const pc=(cId==='white'||cId==='calico')?'#b8b0a4':(cId==='cream'?'#c9976a':C.dark);
    L.point=pc; L.base=mix('#f1e7d3',C.base,.1); L.light='#fbf5e9'; L.dark=mix('#d4c3a3',pc,.15); L.leg=pc; L.paw=p==='mitted'?'#fffaf2':pc; L.tail=[pc,pc,mix(pc,'#000000',.2)]; L.muzzle=pc; L.earOut=pc;
    L.earIn=mix(pc,'#f2b0b2',.45); L.nose=mix(pc,'#000000',.3); L.calico=false; if(p==='mitted') L.bib='#fffaf2'; }
  if(p==='van'){ const pc=C.calico?'#e88a3a':(cId==='white'?'#d9b48a':C.base); L.patch=pc; L.base='#f6f3ec'; L.light='#ffffff'; L.dark='#d6d0c4'; L.leg='#f6f3ec'; L.paw='#fffbf4';
    L.tail=[pc,mix(pc,'#000000',.25),mix(pc,'#000000',.25)]; L.rings=true; L.muzzle='#ffffff'; L.earOut=pc; L.earIn='#f4b8b8'; L.nose='#f0a0a8'; L.calico=false; }
  if(p==='skin'){ const sk=mix('#ecb9a9',C.base,(cId==='white'||cId==='calico')?0:.35); L.base=sk; L.light=mix(sk,'#ffffff',.3); L.dark=mix(sk,'#5a2a20',.3); L.leg=sk; L.paw=L.light; L.tail=[sk,sk,L.dark];
    L.muzzle=L.light; L.earOut=sk; L.earIn=mix(sk,'#ff9a9a',.35); L.nose=mix(sk,'#c05060',.35); L.rings=false; }
  if(B.bicolor && p!=='skin' && !L.calico){ L.bib='#fffaf3'; L.muzzle='#fffaf3'; L.paw='#fff7ee'; }
  if(L.calico&&p!=='skin'){ L.tail=['#e88a3a','#2a2420','#2a2420']; L.rings=true; L.leg=L.base; L.bib='#ffffff'; L.muzzle='#ffffff'; }
  return L;
}
const LION_L={pattern:'solid',base:'#c8913f',light:'#e3bd7e',dark:'#93622c',stripe:'rgba(0,0,0,0)',leg:'#c8913f',paw:'#e8cc98',earOut:'#7a5228',earIn:'#d9b483',nose:'#a8604c',muzzle:'#e3c08c',
  tail:['#c8913f','#c8913f','#4a2a14'],rings:false,calico:false,spot:'#000',patch:null,point:null,tipBlack:true,bib:'#e0bf8c',mane:['#a8662c','#7d4620','#5a3018'],brow:'#5c2c12'};
function bellyColor(L){ if(L.bib) return L.bib; if(L.pattern==='skin') return L.light; const [r,g,b]=hex2rgb(L.base); if(r+g+b<240) return mix(L.base,'#ffffff',.2); return mix(L.light,'#ffffff',.45); }
function makeCatMaterials(B,L,eyeId,collar){
  const skin=L.pattern==='skin', mk=(base,light,dark,pat)=>skin?skinMat(base):furMat(base,light,dark,pat,L.stripe,L.spot);
  const bodyPat=L.calico?'calico':(L.pattern==='tabby'||L.pattern==='spotted')?L.pattern:'solid', M={};
  M.body=mk(L.base,L.light,L.dark,bodyPat); M.head=BAKING?mk(L.base,L.light,L.dark,bodyPat):M.body;
  M.belly=mk(bellyColor(L),'#ffffff',L.light,'solid');
  M.leg=(L.leg===L.base&&!BAKING)?M.body:mk(L.leg,mix(L.leg,'#ffffff',.25),mix(L.leg,'#000000',.3),'solid');
  M.paw=mk(L.paw,mix(L.paw,'#ffffff',.25),mix(L.paw,'#000000',.2),'solid');
  M.muzzle=mk(L.muzzle,mix(L.muzzle,'#ffffff',.3),mix(L.muzzle,'#000000',.12),'solid');
  M.ear=mk(L.earOut,mix(L.earOut,'#ffffff',.2),mix(L.earOut,'#000000',.3),'solid'); M.ear.side=T3.DoubleSide;
  M.earIn=furry(stdMat(mix(L.earIn,skin?L.earIn:L.light,.45),{roughness:.7,side:T3.DoubleSide}),skin?.2:.8);   // pink skin with pale ear furnishings
  M.nose=new CartoonMat({color:mix(L.nose,'#7a4a44',.3),map:noseTex(),roughness:.42,envMapIntensity:.7});
  M.lipLine=stdMat(skin?mix(L.nose,'#3a1a18',.5):mix(L.dark,'#140c0a',.7),{roughness:.7});
  M.pad=stdMat((L.paw===COLORS.black.base||L.leg===COLORS.black.base)?'#3a2a2a':'#f59aac',{roughness:.45});
  if(L.point) M.point=mk(L.point,mix(L.point,'#ffffff',.2),mix(L.point,'#000000',.3),'solid');
  if(L.patch) M.patch=mk(L.patch,mix(L.patch,'#ffffff',.2),mix(L.patch,'#000000',.3),'solid');
  if(L.calico){ M.orange=furMat('#e88a3a','#f5a85c','#a85e1c'); M.blackP=furMat('#2a2420','#4a403a','#100c0a'); }
  M.white=mk(L.bib||'#fffaf2','#ffffff','#e6dfd2','solid');
  M.tail=skin?skinMat(L.base):furry(new CartoonMat({map:tailTexture(L),roughness:.82}),1.15); M.tail.side=T3.DoubleSide;
  const E=EYES[eyeId]||EYES.blue, iris=c=>new CartoonMat({map:realIrisTex(c[0],c[1]),roughness:.07,envMapIntensity:1.2});
  M.iris=iris(E.c); M.iris2=E.c2?iris(E.c2):M.iris;
  M.sclera=stdMat('#fbfbf7',{roughness:.2}); M.pupil=stdMat('#030303',{roughness:.05,envMapIntensity:1.2});
  M.eyeBall=stdMat(mix(E.c[1],'#000000',.6),{roughness:.2}); M.lid=furry(L.pattern==='skin'?skinMat(L.base):stdMat(L.point?mix(L.base,L.point,.45):mix(L.base,L.light,.55),{roughness:.85}),.45); M.lidRim=stdMat(skin?mix(L.base,'#3a1a18',.5):'#1a110d',{roughness:.55});
  M.glint=new T3.MeshBasicMaterial({map:glintTex(),transparent:true,depthWrite:false,opacity:.8});
  M.whiskerV=new T3.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false});
  M.hl=new T3.MeshBasicMaterial({color:0xffffff}); M.lash=stdMat('#2a1a14',{roughness:.6});
  M.mouth=stdMat('#4a1218',{roughness:.5}); M.tongue=stdMat('#f07a8c',{roughness:.35}); M.fang=stdMat('#fffbf2',{roughness:.25});
  M.blush=new T3.MeshBasicMaterial({color:0xff8fa8,transparent:true,opacity:0,depthWrite:false});
  M.whisker=new T3.LineBasicMaterial({color:skin?0xffe9e2:0xffffff,transparent:true,opacity:skin?.4:.85});
  if(collar){ M.collar=stdMat(collar,{roughness:.35}); M.gold=stdMat('#f2c230',{metalness:.9,roughness:.25}); M.silver=stdMat('#d8dde3',{metalness:.9,roughness:.25}); }
  M.brow=stdMat(L.brow||mix(L.dark,'#1a0f08',.55),{roughness:.8});
  if(L.mane){ M.maneA=furry(stdMat(L.mane[0],{roughness:.8}),1.3); M.maneB=furry(stdMat(L.mane[1],{roughness:.8}),1.3); M.maneC=furry(stdMat(L.mane[2],{roughness:.85}),1.3); M.maneTuft=furMat(L.mane[1],L.mane[0],L.mane[2]); M.tuft=furMat(L.tail[2],'#8a6a48','#3e2a18'); }
  for(const k in M) if(M[k]&&M[k].isMaterial&&!M[k].name) M[k].name=k;   // role names = glTF material slots
  return M;
}

// ---- tapered tube ----
class Tube{
  constructor(n,radial,mat,swapUV=false,capK=.9){ this.capK=capK; this.n=n; this.R=radial; const vc=n*radial+1; this.pos=new Float32Array(vc*3); this.nrm=new Float32Array(vc*3); const uv=new Float32Array(vc*2),idx=[];
    for(let i=0;i<n;i++) for(let j=0;j<radial;j++){ const k=(i*radial+j)*2; if(swapUV){ uv[k]=j/radial; uv[k+1]=i/(n-1); } else { uv[k]=i/(n-1); uv[k+1]=j/radial; } } uv[(vc-1)*2]=1; uv[(vc-1)*2+1]=.5;
    for(let i=0;i<n-1;i++) for(let j=0;j<radial;j++){ const a=i*radial+j,b=i*radial+(j+1)%radial,c=(i+1)*radial+j,d=(i+1)*radial+(j+1)%radial; idx.push(a,b,c,b,d,c); }   // counter-clockwise from outside: front faces point outward
    for(let j=0;j<radial;j++) idx.push((n-1)*radial+(j+1)%radial,(n-1)*radial+j,vc-1);
    const geo=new T3.BufferGeometry(); geo.setAttribute('position',new T3.BufferAttribute(this.pos,3)); geo.setAttribute('normal',new T3.BufferAttribute(this.nrm,3)); geo.setAttribute('uv',new T3.BufferAttribute(uv,2)); geo.setIndex(idx);
    this.geo=geo; this.mesh=new T3.Mesh(geo,mat); this.mesh.frustumCulled=false; this.mesh.castShadow=true; this.t=new T3.Vector3(); this.b=new T3.Vector3(); this.nn=new T3.Vector3(); this.ref=new T3.Vector3(); }
  update(pts,radii,radiiZ=null){ const n=this.n,R=this.R,P=this.pos,N=this.nrm,t=this.t,b=this.b,nn=this.nn,ref=this.ref;
    for(let i=0;i<n;i++){ const p0=pts[Math.max(0,i-1)],p1=pts[Math.min(n-1,i+1)],p=pts[i]; t.set(p1.x-p0.x,p1.y-p0.y,p1.z-p0.z).normalize();
      if(Math.abs(t.y)>.9) ref.set(1,0,0); else ref.set(0,1,0); b.crossVectors(t,ref).normalize(); nn.crossVectors(b,t); const r=radii[i], rz=radiiZ?radiiZ[i]:r;
      for(let j=0;j<R;j++){ const a=j/R*TAU,cs=Math.cos(a),sn=Math.sin(a),k=(i*R+j)*3; P[k]=p.x+nn.x*cs*r+b.x*sn*rz; P[k+1]=p.y+nn.y*cs*r+b.y*sn*rz; P[k+2]=p.z+nn.z*cs*r+b.z*sn*rz;
        let nx=nn.x*cs/r+b.x*sn/rz, ny=nn.y*cs/r+b.y*sn/rz, nz=nn.z*cs/r+b.z*sn/rz; const nl=Math.hypot(nx,ny,nz)||1; N[k]=nx/nl; N[k+1]=ny/nl; N[k+2]=nz/nl; } }
    const k=(n*R)*3,p=pts[n-1],r=radii[n-1]; const ck=this.capK; P[k]=p.x+t.x*r*ck; P[k+1]=p.y+t.y*r*ck; P[k+2]=p.z+t.z*r*ck; N[k]=t.x; N[k+1]=t.y; N[k+2]=t.z;
    this.geo.attributes.position.needsUpdate=true; this.geo.attributes.normal.needsUpdate=true; }
}
function heartShape(g,x,y,s){ g.beginPath(); g.moveTo(x,y+s*.3); g.bezierCurveTo(x,y,x-s*.5,y,x-s*.5,y+s*.3); g.bezierCurveTo(x-s*.5,y+s*.6,x,y+s*.8,x,y+s); g.bezierCurveTo(x,y+s*.8,x+s*.5,y+s*.6,x+s*.5,y+s*.3); g.bezierCurveTo(x+s*.5,y,x,y,x,y+s*.3); g.closePath(); }
const HEART_GEO=(()=>{ const s=new T3.Shape(); s.moveTo(0,.3); s.bezierCurveTo(0,.6,-.5,.6,-.5,.3); s.bezierCurveTo(-.5,0,0,-.2,0,-.5); s.bezierCurveTo(0,-.2,.5,0,.5,.3); s.bezierCurveTo(.5,.6,0,.6,0,.3);
  const g=new T3.ExtrudeGeometry(s,{depth:.12,bevelEnabled:true,bevelThickness:.05,bevelSize:.05,bevelSegments:2}); g.rotateY(Math.PI/2); return g; })();
SHARED_GEO.add(HEART_GEO);

// ================= accessory shapes & fabrics =================
const STAR_GEO=(()=>{ const sh=new T3.Shape(); for(let i=0;i<10;i++){ const r=i%2?.42:1, an=i/10*TAU-Math.PI/2; sh[i?'lineTo':'moveTo'](Math.cos(an)*r,-Math.sin(an)*r); } const g=new T3.ExtrudeGeometry(sh,{depth:.15,bevelEnabled:false}); g.center(); SHARED_GEO.add(g); return g; })();
const BAT_GEO=(()=>{ const sh=new T3.Shape(); sh.moveTo(0,.3); sh.quadraticCurveTo(.3,.55,.4,.25); sh.quadraticCurveTo(.7,.5,1,.45); sh.quadraticCurveTo(.8,.15,.85,-.1); sh.quadraticCurveTo(.55,0,.45,-.2); sh.quadraticCurveTo(.2,-.05,0,-.35);
  sh.quadraticCurveTo(-.2,-.05,-.45,-.2); sh.quadraticCurveTo(-.55,0,-.85,-.1); sh.quadraticCurveTo(-.8,.15,-1,.45); sh.quadraticCurveTo(-.7,.5,-.4,.25); sh.quadraticCurveTo(-.3,.55,0,.3);
  const g=new T3.ExtrudeGeometry(sh,{depth:.1,bevelEnabled:false}); g.center(); SHARED_GEO.add(g); return g; })();
const CAPE_GEO=new T3.SphereGeometry(1,24,12,0,TAU,0,Math.PI*.42), COLLAR_GEO=new T3.CylinderGeometry(1.3,.95,.32,22,1,true).rotateX(Math.PI/2);
const DECAL_GEO=new T3.PlaneGeometry(1,1).rotateX(-Math.PI/2), WING_GEO=(()=>{ const g=new T3.ShapeGeometry((()=>{ const sh=new T3.Shape(); sh.moveTo(0,0); sh.lineTo(.2,1); sh.quadraticCurveTo(.3,.75,.45,.8); sh.quadraticCurveTo(.55,.55,.7,.62); sh.quadraticCurveTo(.8,.35,1,.35); sh.quadraticCurveTo(.6,.15,0,0); return sh; })());
  g.rotateX(-Math.PI/2); g.rotateY(Math.PI/2); return g; })();
[CAPE_GEO,COLLAR_GEO,DECAL_GEO,WING_GEO].forEach(g=>SHARED_GEO.add(g));
// what each outfit is made of (tex = fabric painter, plus optional parts)
const OUTFIT_SPEC={
  tshirt:{tex:'stars',sleeves:1}, hoodie:{tex:'knitplain',hips:1,hood:1,sleeves:1}, sweater:{tex:'knit',hips:1,sleeves:1}, raincoat:{tex:'plain',gloss:1,hips:1,hood:1},
  cape:{cape:true,capeLining:'#f4c430'}, tux:{bow:'black'}, riders:{tex:'leather',gloss:1,sleeves:1,belt:'#9aa3ad'}, snowjacket:{tex:'quilt',hips:1,sleeves:1,hood:'fur'},
  blazer:{tex:'tweed',sleeves:1,bow:'tie'}, hawaiian:{tex:'floral',sleeves:1}, jersey:{tex:'jersey',sleeves:1,emblem:'number'}, ninja:{tex:'plain',hips:1,sleeves:1,belt:'#c0201a'},
  dragon:{tex:'scales',hips:1,sleeves:1,wings:'dragon',spikes:1}, dracula:{tex:'plain',hips:1,sleeves:1,cape:'#141414',capeLining:'#a0101a',hood:'collar',collarCol:'#a0101a',bow:'red'},
  iron:{tex:'armor',metal:1,hips:1,sleeves:1,emblem:'arc'}, starshield:{tex:'plain',hips:'alt',hipsTex:'flagstripes',sleeves:1,emblem:'star'}, webhero:{tex:'web',hips:1,sleeves:1,emblem:'spider'},
  darkknight:{tex:'plain',hips:1,sleeves:1,cape:'#141414',emblem:'bat',belt:'#f2c230'}, steelhero:{tex:'plain',hips:1,sleeves:1,cape:'#d81e1e',emblem:'diamond',belt:'#f2c230'},
  thunder:{tex:'discs',metal:1,hips:1,sleeves:1,cape:'#c0201a'}, wonder:{tex:'plain',hips:'alt',hipsTex:'bluestars',emblem:'wings',belt:'#f2c230'}, speedster:{tex:'plain',hips:1,sleeves:1,emblem:'bolt',belt:'#f2c230'},
  royal:{tex:'velvet',cape:true,capeLining:'#f4f1ea',hood:'ermine'}, astronaut:{tex:'puffy',hips:1,sleeves:1,pack:1,emblem:'patch'}, knight:{tex:'armor',metal:1,hips:1,sleeves:1,emblem:'cross'},
  pirate:{tex:'coat',hips:1,sleeves:1,belt:'#2a1a10',emblem:'skull'}, wizard:{tex:'robestars',hips:1,sleeves:1,hood:1}, kimono:{tex:'sakura',hips:1,sleeves:1,belt:'#f2c230'},
  firefighter:{tex:'reflect',hips:1,sleeves:1}, police:{tex:'plain',sleeves:1,belt:'#151515',emblem:'badge'}, chef:{tex:'chef',sleeves:1,bow:'scarf'}, doctor:{tex:'plain',hips:1,sleeves:1,emblem:'cross'},
  tracksuit:{tex:'track',hips:1,sleeves:1} };
function outfitTex(kind,c){ const key='fab|'+kind+'|'+c; if(texCache[key]) return texCache[key]; const W2=256,H2=128,cv=mkCanvas(W2,H2),g=cv.getContext('2d'), dk=(k)=>mix(c,'#000000',k), lt=(k)=>mix(c,'#ffffff',k);
  g.fillStyle=c; g.fillRect(0,0,W2,H2); const dots=(n,col,r0,r1)=>{ g.fillStyle=col; for(let i=0;i<n;i++){ g.beginPath(); g.arc(rand()*W2,rand()*H2,rr(r0,r1),0,TAU); g.fill(); } };
  switch(kind){
    case 'stars': for(let i=0;i<6;i++){ g.fillStyle='#ffe14a'; g.save(); g.translate(20+i*42,64); g.beginPath(); for(let k=0;k<10;k++){ const r=k%2?7:16,a=k/10*TAU-Math.PI/2; g.lineTo(Math.cos(a)*r,Math.sin(a)*r); } g.fill(); g.restore(); } break;
    case 'knit': g.fillStyle='#ffffff'; for(let y=0;y<H2;y+=32) g.fillRect(0,y,W2,12); break;
    case 'knitplain': g.strokeStyle=dk(.12); for(let x=0;x<W2;x+=6){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,H2); g.stroke(); } break;
    case 'leather': { const gr=g.createLinearGradient(0,0,0,H2); gr.addColorStop(0,lt(.12)); gr.addColorStop(.5,c); gr.addColorStop(1,dk(.3)); g.fillStyle=gr; g.fillRect(0,0,W2,H2);
      g.strokeStyle='#c8ccd2'; g.lineWidth=3; g.beginPath(); g.moveTo(W2*.25,0); g.lineTo(W2*.35,H2); g.stroke(); dots(14,'#d9dde2',2,3); break; }
    case 'quilt': for(let y=0;y<H2;y+=16){ const gr=g.createLinearGradient(0,y,0,y+16); gr.addColorStop(0,lt(.25)); gr.addColorStop(.5,c); gr.addColorStop(1,dk(.3)); g.fillStyle=gr; g.fillRect(0,y,W2,16); } break;
    case 'tweed': for(let i=0;i<2500;i++){ g.fillStyle=Math.random()<.5?dk(.25):lt(.2); g.fillRect(rand()*W2,rand()*H2,2,1); } break;
    case 'floral': for(let i=0;i<22;i++){ const x=rand()*W2,y=rand()*H2, fc=pick(['#ffffff','#ffd23f','#ff6fa8','#3fbf6a']); g.fillStyle=fc; for(let k=0;k<5;k++){ g.beginPath(); g.ellipse(x+Math.cos(k*1.26)*6,y+Math.sin(k*1.26)*6,6,3.5,k*1.26,0,TAU); g.fill(); } g.fillStyle='#ffb300'; g.beginPath(); g.arc(x,y,3,0,TAU); g.fill(); } break;
    case 'jersey': g.fillStyle='#ffffff'; g.fillRect(0,16,W2,10); g.fillRect(0,H2-26,W2,10); break;
    case 'scales': for(let y=0;y<H2+10;y+=10) for(let x=(y/10%2)*8;x<W2+16;x+=16){ g.fillStyle=y%20?dk(.2):lt(.1); g.beginPath(); g.arc(x,y,9,0,Math.PI); g.fill(); g.strokeStyle=dk(.45); g.stroke(); } break;
    case 'armor': { const gr=g.createLinearGradient(0,0,0,H2); gr.addColorStop(0,lt(.2)); gr.addColorStop(1,dk(.25)); g.fillStyle=gr; g.fillRect(0,0,W2,H2);
      g.strokeStyle=dk(.5); g.lineWidth=2; for(let x=0;x<W2;x+=32){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,H2); g.stroke(); } for(let y=20;y<H2;y+=40){ g.beginPath(); g.moveTo(0,y); g.lineTo(W2,y); g.stroke(); } g.fillStyle='#f2c230'; g.fillRect(0,H2*.45,W2,8); break; }
    case 'discs': g.fillStyle='#1b1b1f'; g.fillRect(0,0,W2,H2); for(let x=16;x<W2;x+=40){ g.fillStyle=c; g.beginPath(); g.arc(x,40,13,0,TAU); g.fill(); g.strokeStyle='#ffffff'; g.lineWidth=2; g.stroke(); } break;
    case 'web': g.strokeStyle='#111111'; g.lineWidth=1.5; for(let x=0;x<W2;x+=24){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,H2); g.stroke(); } for(let y=0;y<H2;y+=16){ g.beginPath(); for(let x=0;x<=W2;x+=24) g.quadraticCurveTo(x-12,y+5,x,y); g.stroke(); } break;
    case 'flagstripes': for(let x=0;x<W2;x+=32){ g.fillStyle='#d81e1e'; g.fillRect(x,0,16,H2); g.fillStyle='#ffffff'; g.fillRect(x+16,0,16,H2); } break;
    case 'bluestars': g.fillStyle='#1f3a9a'; g.fillRect(0,0,W2,H2); dots(30,'#ffffff',1.5,3); break;
    case 'velvet': { const gr=g.createLinearGradient(0,0,0,H2); gr.addColorStop(0,lt(.12)); gr.addColorStop(1,dk(.35)); g.fillStyle=gr; g.fillRect(0,0,W2,H2); g.fillStyle='#f2c230'; g.fillRect(0,H2*.5,W2,6); break; }
    case 'ermine': g.fillStyle='#ffffff'; g.fillRect(0,0,W2,H2); for(let i=0;i<40;i++){ g.fillStyle='#111111'; g.beginPath(); g.ellipse(rand()*W2,rand()*H2,2,5,0,0,TAU); g.fill(); } break;
    case 'puffy': for(let y=0;y<H2;y+=20){ const gr=g.createLinearGradient(0,y,0,y+20); gr.addColorStop(0,'#ffffff'); gr.addColorStop(1,dk(.15)); g.fillStyle=gr; g.fillRect(0,y,W2,20); } g.fillStyle='#2f8cff'; g.fillRect(0,H2*.42,W2,6); break;
    case 'coat': g.fillStyle='#f2c230'; for(let y=12;y<H2;y+=22){ g.beginPath(); g.arc(W2*.24,y,4,0,TAU); g.fill(); g.beginPath(); g.arc(W2*.76,y,4,0,TAU); g.fill(); } g.fillStyle=dk(.3); g.fillRect(0,0,W2,10); break;
    case 'robestars': dots(28,'#ffe14a',1.5,3.5); g.fillStyle='rgba(255,255,255,.7)'; for(let i=0;i<8;i++){ g.beginPath(); g.arc(rand()*W2,rand()*H2,8,0,TAU); g.arc(rand()*W2,rand()*H2,6,0,TAU); g.fill(); } break;
    case 'sakura': for(let i=0;i<26;i++){ const x=rand()*W2,y=rand()*H2; g.fillStyle='#ffe0ec'; for(let k=0;k<5;k++){ g.beginPath(); g.ellipse(x+Math.cos(k*1.26)*5,y+Math.sin(k*1.26)*5,5,3,k*1.26,0,TAU); g.fill(); } g.fillStyle='#f2c230'; g.beginPath(); g.arc(x,y,2,0,TAU); g.fill(); } break;
    case 'reflect': g.fillStyle='#e8f04a'; g.fillRect(0,30,W2,10); g.fillRect(0,H2-40,W2,10); g.fillStyle='#d0d4d8'; g.fillRect(0,33,W2,4); g.fillRect(0,H2-37,W2,4); break;
    case 'chef': g.fillStyle='#1b1b1f'; for(let y=12;y<H2;y+=20){ g.beginPath(); g.arc(W2*.45,y,3.5,0,TAU); g.fill(); g.beginPath(); g.arc(W2*.55,y,3.5,0,TAU); g.fill(); } break;
    case 'track': g.fillStyle='#ffffff'; for(const x of [W2*.22,W2*.28,W2*.72,W2*.78]) g.fillRect(x,0,6,H2); break;
  }
  const t=canvasTex(cv); t.wrapS=T3.RepeatWrapping; return texCache[key]=t; }
// back emblems: transparent decals
function emblemTex(kind,c){ const key='emb|'+kind+'|'+c; if(texCache[key]) return texCache[key]; const cv=mkCanvas(128,128),g=cv.getContext('2d'); g.translate(64,64);
  const star=(r,col)=>{ g.fillStyle=col; g.beginPath(); for(let k=0;k<10;k++){ const rr2=k%2?r*.42:r,an=k/10*TAU-Math.PI/2; g.lineTo(Math.cos(an)*rr2,Math.sin(an)*rr2); } g.fill(); };
  const ring=(r,col)=>{ g.fillStyle=col; g.beginPath(); g.arc(0,0,r,0,TAU); g.fill(); };
  switch(kind){
    case 'star': ring(60,'#d81e1e'); ring(48,'#ffffff'); ring(36,'#d81e1e'); ring(26,'#1f4fb8'); star(24,'#ffffff'); break;
    case 'arc': ring(36,'#3a3f48'); ring(28,'#bff4ff'); ring(18,'#ffffff'); g.strokeStyle='#5ad8ff'; g.lineWidth=4; g.beginPath(); g.arc(0,0,32,0,TAU); g.stroke(); break;
    case 'spider': g.fillStyle='#111111'; g.beginPath(); g.ellipse(0,-10,9,12,0,0,TAU); g.ellipse(0,16,12,18,0,0,TAU); g.fill(); g.lineWidth=4; g.strokeStyle='#111111';
      for(const sd of [-1,1]) for(let k=0;k<4;k++){ g.beginPath(); g.moveTo(sd*6,-4+k*6); g.lineTo(sd*30,-26+k*16); g.lineTo(sd*42,-10+k*20); g.stroke(); } break;
    case 'bat': g.fillStyle='#f2c230'; g.beginPath(); g.ellipse(0,0,60,36,0,0,TAU); g.fill(); g.fillStyle='#111111'; g.beginPath(); g.moveTo(0,-8); g.quadraticCurveTo(14,-22,22,-8); g.quadraticCurveTo(38,-20,52,-14); g.quadraticCurveTo(40,0,44,16);
      g.quadraticCurveTo(26,8,18,18); g.quadraticCurveTo(8,10,0,22); g.quadraticCurveTo(-8,10,-18,18); g.quadraticCurveTo(-26,8,-44,16); g.quadraticCurveTo(-40,0,-52,-14); g.quadraticCurveTo(-38,-20,-22,-8); g.quadraticCurveTo(-14,-22,0,-8); g.fill(); break;
    case 'diamond': g.fillStyle='#d81e1e'; g.beginPath(); g.moveTo(-50,-30); g.lineTo(50,-30); g.lineTo(62,-10); g.lineTo(0,56); g.lineTo(-62,-10); g.closePath(); g.fill(); g.fillStyle='#ffd23f'; g.beginPath(); g.moveTo(-40,-22); g.lineTo(40,-22); g.lineTo(50,-8); g.lineTo(0,44); g.lineTo(-50,-8); g.closePath(); g.fill();
      g.fillStyle='#d81e1e'; g.beginPath(); g.moveTo(10,-16); g.lineTo(-14,6); g.lineTo(2,6); g.lineTo(-8,30); g.lineTo(18,0); g.lineTo(2,0); g.closePath(); g.fill(); break;
    case 'bolt': ring(44,'#ffffff'); g.fillStyle='#ffd23f'; g.beginPath(); g.moveTo(10,-40); g.lineTo(-18,6); g.lineTo(2,6); g.lineTo(-10,40); g.lineTo(22,-8); g.lineTo(2,-8); g.closePath(); g.fill(); break;
    case 'wings': g.fillStyle='#f2c230'; for(const sd of [-1,1]) for(let k=0;k<4;k++){ g.beginPath(); g.ellipse(sd*(14+k*11),-6+k*7,16-k*2,5,sd*(.35+k*.15),0,TAU); g.fill(); } star(12,'#f2c230'); break;
    case 'number': g.fillStyle='#ffffff'; g.font='bold 78px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('10',0,4); break;
    case 'patch': ring(46,'#1f3a9a'); ring(40,'#2f6fd8'); star(14,'#ffffff'); g.strokeStyle='#d81e1e'; g.lineWidth=5; g.beginPath(); g.ellipse(0,0,40,14,-.4,0,TAU); g.stroke(); break;
    case 'cross': g.fillStyle='#d81e1e'; g.fillRect(-12,-40,24,80); g.fillRect(-40,-12,80,24); break;
    case 'badge': star(46,'#d9ab3a'); ring(18,'#f2d27a'); break;
    case 'skull': ring(30,'#f4f1ea'); g.fillRect(-14,20,28,16); g.fillStyle='#111111'; g.beginPath(); g.arc(-11,-2,8,0,TAU); g.arc(11,-2,8,0,TAU); g.fill(); g.lineWidth=7; g.strokeStyle='#f4f1ea'; g.beginPath(); g.moveTo(-46,46); g.lineTo(46,-46); g.moveTo(46,46); g.lineTo(-46,-46); g.stroke(); break;
  }
  const t=canvasTex(cv); return texCache[key]=t; }
function rainbowTex(){ if(texCache.rbw) return texCache.rbw; const c=mkCanvas(64,64),g=c.getContext('2d'); ['#ff2a2a','#ff8a1a','#ffe14a','#3fbf6a','#2f8cff','#7a46c0'].forEach((col,i)=>{ g.fillStyle=col; g.fillRect(0,i*64/6,64,64/6+1); }); return texCache.rbw=canvasTex(c); }
// ================= 3D CAT MODEL (stylised) =================
// ===== stylised chibi cat model (big head, huge glossy eyes, plush body) =====
// realistic proportions, drawn on top of the unchanged movement simulation: smaller head, slimmer body and legs, neat paws
const REAL_HEAD=.64, REAL_BODY=.84, REAL_LEG=.78, REAL_PAW=.64;
function tubeAlong(tube,key,prof,k=1){ const n=tube.n, cv=new T3.CatmullRomCurve3(key,false,'centripetal'), pts=[], ry=[], rz=[];
  for(let i=0;i<n;i++){ const t=i/(n-1), f=t*(key.length-1), a=Math.min(key.length-2,Math.floor(f)), u=f-a, sm=u*u*(3-2*u); pts.push(cv.getPoint(t));
    ry.push(lerp(prof[a][0],prof[a+1][0],sm)*k); rz.push(lerp(prof[a][1],prof[a+1][1],sm)*k); }
  tube.update(pts,ry,rz); }
function headPt(hr,ck,az,el,out=1){ return new T3.Vector3(Math.cos(el)*Math.cos(az)*hr*.95*out, Math.sin(el)*hr*.84*out, Math.cos(el)*Math.sin(az)*hr*1.05*ck*out); }
function headNrm(hr,ck,az,el){ const p=headPt(hr,ck,az,el); return new T3.Vector3(p.x/(hr*.95*hr*.95),p.y/(hr*.84*hr*.84),p.z/(hr*1.05*ck*hr*1.05*ck)).normalize(); }
const CAP_IRIS=new T3.SphereGeometry(1,28,10,0,TAU,0,.78).rotateZ(-Math.PI/2);
const CAP_PUP=new T3.SphereGeometry(1,24,8,0,TAU,0,.36).rotateZ(-Math.PI/2);
const CAP_PUPW=new T3.SphereGeometry(1,24,8,0,TAU,0,.5).rotateZ(-Math.PI/2);
const CAP_EYE=new T3.SphereGeometry(1,32,12,0,TAU,0,IRIS_TH).rotateZ(-Math.PI/2);
const LID_TH=1.42, LID_CAP=new T3.SphereGeometry(1,30,10,0,TAU,0,LID_TH), RIM_CAP=new T3.SphereGeometry(1,30,10,0,TAU,0,LID_TH+.045);
const GLINT_GEO=new T3.CircleGeometry(1,16).rotateY(Math.PI/2);
// nose leather: rounded inverted triangle, front face along +X
const NOSE_GEO=(()=>{ const sh=new T3.Shape(); sh.moveTo(0,-.5); sh.bezierCurveTo(.14,-.4,.5,.04,.52,.26); sh.bezierCurveTo(.54,.48,.3,.52,0,.5); sh.bezierCurveTo(-.3,.52,-.54,.48,-.52,.26); sh.bezierCurveTo(-.5,.04,-.14,-.4,0,-.5);
  const g=new T3.ExtrudeGeometry(sh,{depth:.3,bevelEnabled:true,bevelThickness:.2,bevelSize:.12,bevelSegments:5,curveSegments:12}); g.rotateY(Math.PI/2); g.computeVertexNormals(); return g; })();
[CAP_IRIS,CAP_PUP,CAP_PUPW,CAP_EYE,LID_CAP,RIM_CAP,GLINT_GEO,NOSE_GEO].forEach(g=>SHARED_GEO.add(g));
function irisCapTexture(c0,c1){ const key='iriscap|'+c0+c1; if(texCache[key]) return texCache[key];
  const c=mkCanvas(64,128),g=c.getContext('2d');   // flat cartoon iris: light core, bold colour, dark rim
  g.fillStyle=vivid(c0); g.fillRect(0,0,64,128); g.fillStyle=vivid(c1); g.fillRect(0,52,64,76); g.fillStyle=mix(c1,'#000000',.6); g.fillRect(0,112,64,16);
  const t=canvasTex(c); texCache[key]=t; return t; }
class CatModel{
  constructor(B,L,o={}){
    this.B=B; this.L=L; this.o=o; const col=COLLARS[o.collar]?COLLARS[o.collar].c:null;
    const M=this.M=makeCatMaterials(B,L,o.eyes,col);
    this.rig=new T3.Group(); this.roller=new T3.Group(); this.rig.add(this.roller); const R=this.roller;
    this.chest=mesh(G.sphX,M.body); this.hips=mesh(G.sphX,M.body); this.belly=mesh(G.sphX,M.belly); this.neck=mesh(G.sphX,M.body); R.add(this.chest,this.hips,this.belly,this.neck);
    this.torso=new Tube(18,LOW?12:20,M.body,true,.3); R.add(this.torso.mesh); this.chest.visible=this.hips.visible=this.belly.visible=false;
    if(L.bib){ this.bib=mesh(G.sph,M.white); this.bib.userData.bakeRole='bib'; R.add(this.bib); }
    if(L.point){ this.rump=mesh(G.sphX,M.point); this.rump.userData.bakeRole='rump'; this.rump.visible=BAKING; R.add(this.rump); }
    if(L.mane){ this.chestMane=mesh(G.sph,M.maneTuft); R.add(this.chestMane); }
    this.legs=[0,1,2,3].map(()=>{ const up=mesh(G.cyl,M.leg),kn=mesh(G.sph,M.leg),lo=mesh(G.cyl,M.leg),paw=new T3.Group();
      const pm=mesh(G.sph,M.paw); pm.position.set(1.2,.2,0); pm.scale.set(6.4,3.6,5.4); paw.add(pm);
      const mp=mesh(G.sphLow,M.pad,false); mp.position.set(-.4,-3.9,0); mp.scale.set(2.8,.7,3.2); paw.add(mp);
      for(const [x,z] of [[3.9,-3.1],[5.2,-1.05],[5.2,1.05],[3.9,3.1]]){ const t=mesh(G.sphLow,M.pad,false); t.position.set(x,-3.3,z); t.scale.set(1.3,.55,1.3); paw.add(t); }
      const tube=new Tube(9,LOW?8:12,M.leg,true); up.visible=kn.visible=lo.visible=false; R.add(up,kn,lo,paw,tube.mesh); return {up,kn,lo,paw,tube}; });
    this.tail=new Tube(13,LOW?8:12,M.tail); R.add(this.tail.mesh);
    if(B.tuft){ this.tuft=mesh(G.sph,M.tuft); R.add(this.tuft); }
    this.head=new T3.Group(); R.add(this.head); this.buildHead();
    if(col){ this.collar=mesh(G.torus,M.collar); this.bell=mesh(G.sph,M.gold); this.tag=mesh(G.sph,M.silver); R.add(this.collar,this.bell,this.tag); }
    this.blinkT=rr(1.5,4); this.blink=0; this.twitch=0; this.twitchT=rr(2,5);
    this._accStart=this.head.children.length; this.buildOutfit();
    this.tail.mesh.userData.ink=true; inkify(this.rig,B.mane?2:1.7);
    const fs=B.furStyle||{}; polish(this.rig,fs.len||(B.mane?2:1.05+(B.fluff||0)*1.5),fs.cell||(B.mane?.62:.6),fs.grav!==undefined?{...FUR_STYLE,...fs}:FUR_STYLE);
  }
  buildHead(){
    const B=this.B,M=this.M,L=this.L,hr=B.head,H=this.head,ck=B.cheek||1,ml=B.muzzle/B.head;
    const add=(m,p,sx,sy,sz,par=H)=>{ m.position.copy(p); m.scale.set(sx,sy,sz); par.add(m); return m; };
    add(mesh(G.sph,M.head),new T3.Vector3(),hr*.95,hr*.84,hr*1.05*ck);
    for(const sd of [-1,1]) add(mesh(G.sph,M.head),headPt(hr,ck,sd*1.05,-.38,.7),hr*.5,hr*.42,hr*.52);
    const faceMat=L.point?M.point:(L.bib?M.muzzle:null);
    if(faceMat) add(mesh(G.sph,faceMat),headPt(hr,ck,0,-.34,.5),hr*.56,hr*.5,hr*.8).userData.bakeRole='face';
    if(L.patch) for(const sd of [-1,1]) add(mesh(G.sph,M.patch),headPt(hr,ck,sd*.75,.55,.45),hr*.6,hr*.5,hr*.55);
    if(L.calico){ add(mesh(G.sph,M.orange),headPt(hr,ck,-.8,.5,.45),hr*.6,hr*.5,hr*.55); add(mesh(G.sph,M.blackP),headPt(hr,ck,.9,.45,.45),hr*.55,hr*.5,hr*.5); }
    const padOut=B.mane?1.2:.95+ml*.18;
    if(B.mane){ add(mesh(G.sphX,M.head),headPt(hr,ck,0,-.1,.55),hr*.66,hr*.4,hr*.46);            // broad snout from brow to nose
      add(mesh(G.sphX,M.head),headPt(hr,ck,0,.1,.7),hr*.48,hr*.2,hr*.22);                           // flat nose bridge
      add(mesh(G.sph,M.muzzle),headPt(hr,ck,0,-.5,.88),hr*.32,hr*.18,hr*.28);                        // cream chin
      for(const sd of [-1,1]){ add(mesh(G.sph,M.head),headPt(hr,ck,sd*.38,.46,.96),hr*.2,hr*.07,hr*.17).rotation.x=sd*.25;   // heavy brow ridge
        add(mesh(G.sph,M.muzzle),headPt(hr,ck,sd*.38,-.1,.97),hr*.1,hr*.045,hr*.12); } }           // pale fur under the eyes
    this.pads=[-1,1].map(sd=>add(mesh(G.sph,M.muzzle),headPt(hr,ck,sd*(B.mane?.15:.17),-.34,padOut),hr*(B.mane?.13:.21),hr*(B.mane?.11:.18),hr*(B.mane?.14:.21)));
    // surface points on the muzzle, found by casting rays at the face from the front
    H.updateMatrixWorld(true); const rc=new T3.Raycaster(), tg=H.children.filter(o=>o.isMesh&&o.material!==M.fang), inv=new T3.Matrix4().copy(H.matrixWorld).invert();
    const surf=(y,z,lift=.02)=>{ rc.set(new T3.Vector3(hr*3,y,z).applyMatrix4(H.matrixWorld),new T3.Vector3(-1,0,0).transformDirection(H.matrixWorld)); const h=rc.intersectObjects(tg,false)[0];
      if(!h) return null; const q=h.point.clone().applyMatrix4(inv), nn=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(inv):new T3.Vector3(1,0,0); return q.addScaledVector(nn,hr*lift); };
    // nose leather: shaped pad tilted up along the bridge, with nostrils (placed on the face surface, so flat-faced breeds get it too)
    { const nk=B.mane?1.6:1, ng=new T3.Group(); ng.position.copy(surf(headPt(hr,ck,0,-.14,padOut).y,0,-.03)||headPt(hr,ck,0,-.14,padOut+.01)); ng.rotation.z=.42; H.add(ng);
      add(mesh(NOSE_GEO,M.nose,false),new T3.Vector3(),hr*.13*nk,hr*.12*nk,hr*.17*nk,ng);
      for(const sd of [-1,1]){ const n=add(mesh(G.sphLow,M.lidRim,false),new T3.Vector3(hr*.085*nk,-hr*.012*nk,sd*hr*.04*nk),hr*.012*nk,hr*.018*nk,hr*.026*nk,ng); n.rotation.x=sd*.5; }
      this.noseG=ng; }
    this.fangs=[-1,1].map(sd=>{ const f=add(mesh(G.cone,M.fang,false),headPt(hr,ck,sd*.09,-.5,padOut-.04),hr*.025,hr*.08,hr*.025); f.rotation.z=Math.PI; return f; });
    const jp=headPt(hr,ck,0,-.5,.72); this.jaw=new T3.Group(); this.jaw.position.copy(jp); H.add(this.jaw);
    add(mesh(G.sph,M.muzzle),new T3.Vector3(hr*.16,-hr*.04,0),hr*.2,hr*.12,hr*.19,this.jaw);
    add(mesh(G.sph,M.mouth,false),new T3.Vector3(hr*.13,hr*.05,0),hr*.19,hr*.07,hr*.14,this.jaw);
    this.tongue=add(mesh(G.sph,M.tongue,false),new T3.Vector3(hr*.2,hr*.08,0),hr*.13,hr*.03,hr*.09,this.jaw);
    // eyes: realistic cat eyes set INTO the head. A glossy eyeball whose iris fills the opening (fibrous texture, vertical slit
    // pupil, soft catchlight), framed by furred upper and lower lids with a dark lid margin; the lids give the almond shape,
    // and blinking, squinting and widening are done by moving the upper lid
    const er=hr*.215*Math.sqrt(B.eye||1), az=B.mane?.36:.4, el=B.mane?.15:.1, lidMat=M.lid;
    const hUp=B.mane?.74:B.eyeRound?.8:.7, hLo=B.mane?.56:B.eyeRound?.7:.6, bUp=LID_TH-Math.acos(hUp), bLo=LID_TH-Math.acos(hLo), span=Math.PI-Math.acos(hLo)-Math.acos(hUp);
    this.eyes=[-1,1].map(sd=>{
      const n=headNrm(hr,ck,sd*az,el), g=new T3.Group(); g.position.copy(headPt(hr,ck,sd*az,el)).addScaledVector(n,-er*.62); g.quaternion.setFromUnitVectors(XAX,n); g.rotateX(sd*.18); H.add(g);
      const inner=new T3.Group(); g.add(inner);
      const ball=mesh(G.sph,M.eyeBall,false); ball.scale.setScalar(er*.99); inner.add(ball);
      const ir=mesh(CAP_EYE,sd>0?M.iris2:M.iris,false); ir.scale.setScalar(er); inner.add(ir);
      const slit=B.mane?.62:.3, pu=mesh(CAP_PUP,M.pupil,false); pu.scale.set(er*1.06,er*(B.mane?.62:1),er*slit); inner.add(pu);
      const pw=mesh(CAP_PUPW,M.pupil,false); pw.scale.set(er*1.06,er*.98,er*.9); pw.visible=false; inner.add(pw);
      const gl=mesh(GLINT_GEO,M.glint,false); _v1.set(.92,.34,-sd*.18).normalize(); gl.position.copy(_v1).multiplyScalar(er*1.075); gl.quaternion.setFromUnitVectors(XAX,_v1); gl.scale.set(1,er*.2,er*.15); inner.add(gl);
      const lid=(flip,b)=>{ const pv=new T3.Group(); pv.rotation.z=flip?-b:b; g.add(pv);
        for(const [geo,mat,r] of [[RIM_CAP,M.lidRim,1.035],[LID_CAP,lidMat,1.06]]){ const m=mesh(geo,mat,false); m.scale.setScalar(er*r); if(flip) m.rotation.z=Math.PI; if(mat!==lidMat) m.userData.furred=true; pv.add(m); }
        return pv; };
      const up=lid(false,bUp); lid(true,bLo);
      const closed=new T3.Group(); g.add(closed);
      return {g,inner,open:[ball,ir,pu,gl],pu,pw,closed,er,up,b0:bUp,span,slit};
    });
    this.eyeFront=headPt(hr,ck,az,el).addScaledVector(headNrm(hr,ck,az,el),er*.55);
    this.brows=[];   // real cats have no brows: expression comes from lids, ears and whiskers
    if(B.ruff){ const rm=L.bib?M.white:M.body;
      for(let i=0;i<24;i++){ const a=Math.PI*.4+i/23*Math.PI*1.2, d=new T3.Vector3(-.3,Math.cos(a),Math.sin(a)*ck).normalize(), m=mesh(LOCK_GEO,rm), down=Math.max(0,-Math.cos(a));
        m.position.set(-hr*.22,-hr*.12,0).addScaledVector(d,hr*.66); m.quaternion.setFromUnitVectors(XAX,d); m.rotateX(Math.sin(a)>0?.25:-.25);
        m.scale.set(hr*(.34+down*.16),hr*.38,hr*.3); m.userData.bakeRole='ruff'; H.add(m); } }
    this.ears=[-1,1].map(sd=>{
      const g=new T3.Group(); g.position.copy(B.mane?headPt(hr,ck,sd*.95,.48,.86):headPt(hr,ck,sd*.58,.62,.86)); if(B.mane) g.rotation.x=sd*.35; H.add(g);
      const es=B.earSize*(B.mane?.6:1), w=hr*.6*Math.sqrt(es)*(B.ear==='round'?1.15:1), h=hr*.9*es*({small:.55,round:.5,fold:.42}[B.ear]||1);
      const outer=mesh(G.earGeo,M.ear); outer.scale.set(w,h,w*.55); outer.position.y=h*.45; g.add(outer);
      const inner=mesh(G.earGeo,M.earIn,false); inner.scale.set(w*.78,h*.82,w*.38); inner.position.set(w*.08,h*.42,0); g.add(inner);
      
      if(B.ear==='curl'){ const c=mesh(new T3.TorusGeometry(w*.32,w*.11,8,16,Math.PI*1.2),M.ear); c.position.set(-w*.22,h*.9,0); c.rotation.z=.5; g.add(c); }
      if(B.ear==='round'){ const c=mesh(G.sph,M.ear); c.position.y=h*.85; c.scale.set(w*.55,w*.35,w*.32); g.add(c); }
      return {g,sd}; });
    // mouth: philtrum down from the nose, then the lip line curving out under each whisker pad
    { const ny=headPt(hr,ck,0,-.14,padOut).y-hr*.07, my=ny-hr*.12, pts=[];
      for(const sd of [-1,1]){ const side=[]; for(let i=0;i<=8;i++){ const t=i/8; const q=surf(my-Math.sin(t*Math.PI*.8)*hr*.05+t*t*hr*.03,sd*t*hr*.24); if(q) side.push(q); } pts.push(side); }
      const ph=[0,.33,.66,1].map(t=>surf(lerp(ny,my,t),0)).filter(Boolean);
      for(const line of [ph,[...pts[0]].reverse().concat(pts[1].slice(1))]) if(line.length>2) H.add(mesh(new T3.TubeGeometry(new T3.CatmullRomCurve3(line),line.length*3,hr*.011,5),M.lipLine,false)); }
    // whiskers: four rows of long, fine, tapering hairs from each whisker pad, plus brow and cheek whiskers
    { const wp=[], wc=[], skinW=L.pattern==='skin', wl=skinW?.45:1, a0=skinW?.45:.95, col=hex2rgb(skinW?'#efe2da':'#fbf8f0').map(v=>v/255);
      const hair=(root,dir,len,bend,segs=5)=>{ const d=dir.clone().normalize(), b=bend.clone(), q=root.clone();
        for(let i=0;i<segs;i++){ const q2=q.clone().addScaledVector(d,len/segs); const t0=i/segs, t1=(i+1)/segs;
          wp.push(q.x,q.y,q.z,q2.x,q2.y,q2.z); wc.push(...col,a0*(1-t0*.85),...col,a0*(1-t1*.85)); q.copy(q2); d.add(b).normalize(); } };
      for(const sd of [-1,1]){
        for(let r=0;r<4;r++) for(let k=0;k<3;k++){ const root=surf(headPt(hr,ck,sd*.2,-.3,padOut).y+hr*(.07-r*.055),sd*hr*(.1+k*.07),.005); if(!root) continue;
          hair(root,new T3.Vector3(.35-k*.12,.12-r*.12+rr(-.03,.03),sd*1),hr*(1.25-r*.1-k*.06)*wl*rr(.92,1.08),new T3.Vector3(.04,-.035,0)); }
        for(let k=0;k<3;k++){ const root=headPt(hr,ck,sd*(az*.75+k*.08),el+er/hr*1.55,1.0); hair(root,new T3.Vector3(.35,.8,sd*.55),hr*(.55-k*.06)*wl,new T3.Vector3(.02,-.06,0),3); }
        for(let k=0;k<2;k++){ const root=headPt(hr,ck,sd*(.95+k*.1),-.1-k*.08,1.0); hair(root,new T3.Vector3(-.1,.15,sd),hr*.4*wl,new T3.Vector3(0,-.05,0),3); } }
      const wg=new T3.BufferGeometry(); wg.setAttribute('position',new T3.Float32BufferAttribute(wp,3)); wg.setAttribute('color',new T3.Float32BufferAttribute(wc,4));
      const ws=new T3.LineSegments(wg,M.whiskerV); ws.raycast=()=>{}; H.add(ws); }
    this.blush=[];
    if(B.mane){
      // dark volume behind the face, then three rings of tapered locks whose tips flare out past the head (front ring lightest),
      // longer under the chin, plus a curling swoop of hair over the forehead
      add(mesh(G.sph,M.maneC),new T3.Vector3(-hr*.6,-hr*.1,0),hr*.85,hr*1.12,hr*1.15*ck);
      const ringMats=[M.maneA,M.maneB,M.maneC];
      [[20,.5,.44,.98],[18,.6,.5,1.1],[15,.66,.55,1.2]].forEach(([n,len,wid,rad],ring)=>{ for(let i=0;i<n;i++){
        const a=(i+ring*.5)/n*TAU+rr(-.06,.06), down=Math.max(0,-Math.cos(a)), d=new T3.Vector3(-.22-ring*.3,Math.cos(a),Math.sin(a)*ck).normalize(), m=mesh(LOCK_GEO,ringMats[ring]);
        const up=Math.max(0,Math.cos(a)), L=hr*len*(1+down*.5+up*.25)*rr(.85,1.12);
        m.position.set(-hr*(.1+ring*.16),-hr*.04,0).addScaledVector(d,hr*rad*.72+L*.45); m.quaternion.setFromUnitVectors(XAX,d); m.rotateX(Math.sin(a)>0?.5:-.5);
        m.scale.set(L,hr*wid*(1+down*.15),hr*wid*.72); H.add(m); } });
      // (no forelock: the mane frames the face)
    }
  }
  buildOutfit(){
    const o=this.o, H=this.head, hr=this.B.head, R=this.roller, ef=this.eyeFront, B=this.B;
    const add=(m,x,y,z,sx,sy,sz,par=H)=>{ m.position.set(x,y,z); m.scale.set(sx,sy,sz); par.add(m); return m; };
    const S=(c,x={})=>stdMat(c,{roughness:.55,...x}), MET=(c,r=.25)=>stdMat(c,{metalness:.85,roughness:r}), GLOW=c=>new T3.MeshBasicMaterial({color:c});
    const dk=(c,k=.35)=>mix(c,'#000000',k), lt=(c,k=.35)=>mix(c,'#ffffff',k), top=hr*.84;
    const hc=o.hatCol||(HATS[o.hat]&&HATS[o.hat].col)||'#e5484d', gc=o.glassesCol||(GLASSES[o.glasses]&&GLASSES[o.glasses].col)||'#151515', oc=o.outfitCol||(OUTFITS[o.outfit]&&OUTFITS[o.outfit].col)||'#2f8cff';
    // ---------------- hats ----------------
    const hat=new T3.Group(); hat.position.x=-hr*.05; H.add(hat); const A=(m,x,y,z,sx,sy,sz)=>add(m,x,y,z,sx,sy,sz,hat);
    switch(o.hat){
      case 'party':{ const c=mkCanvas(128,128),g=c.getContext('2d'); for(let i=0;i<8;i++){ g.fillStyle=i%2?hc:'#ffd23f'; g.fillRect(0,i*16,128,16); }
        A(mesh(G.cone,S('#ffffff',{map:canvasTex(c)})),0,top+hr*.5,0,hr*.42,hr*1.05,hr*.42).rotation.z=.18; A(mesh(G.sph,S(lt(hc,.4),{roughness:.95})),-hr*.15,top+hr*1.04,0,hr*.16,hr*.16,hr*.16); break; }
      case 'beanie':{ const k=S('#ffffff',{map:knitTex(hc,'#ffffff',true),roughness:.95}); A(mesh(G.hemi,k),-hr*.03,hr*.38,0,hr*.95,hr*.78,hr*1.05); A(mesh(G.torus,k),-hr*.03,hr*.42,0,hr*.95,hr*.95,hr*1.6).rotation.x=Math.PI/2; A(mesh(G.sph,S('#ffffff',{roughness:1})),-hr*.05,hr*1.2,0,hr*.22,hr*.22,hr*.22); break; }
      case 'cap':{ const m=S(hc,{roughness:.7}); A(mesh(G.hemi,m),0,hr*.42,0,hr*.92,hr*.62,hr*.98).rotation.z=-.12; A(mesh(G.sph,S(dk(hc,.2))),hr*.78,hr*.5,0,hr*.6,hr*.05,hr*.62);
        A(mesh(G.sphLow,m),-hr*.02,hr*1.02,0,hr*.08,hr*.05,hr*.08); A(mesh(G.disc,S('#ffffff'),false),hr*.82,hr*.72,0,1,hr*.18,hr*.24).rotation.z=-.5; break; }
      case 'flowers':{ const cols=[hc,'#ffd23f','#ffffff','#b07cff','#ff8a3d']; for(let i=0;i<9;i++){ const an=i/8*Math.PI-Math.PI/2, f=new T3.Group(); f.position.set(-hr*.2+Math.cos(an)*hr*.1,top-hr*.02,Math.sin(an)*hr*.62); hat.add(f);
        for(let q=0;q<5;q++){ const pa=q/5*TAU; add(mesh(G.sphLow,S(cols[i%5],{roughness:.6})),Math.cos(pa)*hr*.09,0,Math.sin(pa)*hr*.09,hr*.08,hr*.04,hr*.08,f); } add(mesh(G.sphLow,S('#ffb300')),0,hr*.02,0,hr*.05,hr*.05,hr*.05,f); } break; }
      case 'cowboy':{ const l=S(hc,{roughness:.7}); A(mesh(G.sph,l),0,top+hr*.02,0,hr*1.05,hr*.07,hr*.95); A(mesh(G.sph,l),0,top+hr*.22,0,hr*.52,hr*.38,hr*.48); A(mesh(G.cylU,S(dk(hc,.5))),0,top+hr*.08,0,hr*.5,hr*.08,hr*.5); break; }
      case 'beret': case 'milberet':{ const m=S(hc,{roughness:.9}); A(mesh(G.sph,m),-hr*.08,top+hr*.04,0,hr*.95,hr*.2,hr*.98).rotation.z=.22; A(mesh(G.cylU,m),-hr*.1,top+hr*.24,0,hr*.04,hr*.08,hr*.04);
        if(o.hat==='milberet'){ A(mesh(G.sph,MET('#d9ab3a')),hr*.42,top+hr*.08,hr*.28,hr*.12,hr*.14,hr*.05); A(mesh(G.torus,S('#3a2a1a')),-hr*.05,top-hr*.06,0,hr*.86,hr*.86,hr*1.4).rotation.x=Math.PI/2; } break; }
      case 'newsboy':{ const m=S('#ffffff',{map:plaidTex(hc),roughness:.95}); A(mesh(G.sph,m),-hr*.05,top+hr*.08,0,hr*.88,hr*.3,hr*.92); A(mesh(G.sph,S(dk(hc,.25),{roughness:.9})),hr*.62,top-hr*.02,0,hr*.48,hr*.05,hr*.58); A(mesh(G.sphLow,m),-hr*.05,top+hr*.36,0,hr*.08,hr*.06,hr*.08); break; }
      case 'boater':{ const st=S(hc,{roughness:.85}); A(mesh(G.cylU,st),0,top+hr*.02,0,hr*1.02,hr*.04,hr*1.02); A(mesh(G.cylU,st),0,top+hr*.18,0,hr*.55,hr*.32,hr*.55); A(mesh(G.cylU,S('#c0392b')),0,top+hr*.1,0,hr*.56,hr*.1,hr*.56); break; }
      case 'sailor':{ const w=S(hc,{roughness:.6}); A(mesh(G.cylU,w),0,top+hr*.12,0,hr*.52,hr*.3,hr*.52); A(mesh(G.torus,w),0,top+hr*.02,0,hr*.6,hr*.6,hr*1.6).rotation.x=Math.PI/2; A(mesh(G.cylU,S('#1f3a8a')),0,top+hr*.06,0,hr*.53,hr*.06,hr*.53); break; }
      case 'fedora':{ const f=S(hc,{roughness:.75}); A(mesh(new T3.CylinderGeometry(.82,1,1,24),f),0,top+hr*.24,0,hr*.52,hr*.42,hr*.5); A(mesh(G.sph,f),0,top+hr*.03,0,hr*1.0,hr*.05,hr*.92).rotation.z=-.08;
        A(mesh(G.cylU,S(dk(hc,.6))),0,top+hr*.1,0,hr*.53,hr*.1,hr*.51); A(mesh(G.box,S(dk(hc,.15))),hr*.12,top+hr*.46,0,hr*.3,hr*.04,hr*.12); break; }
      case 'toque':{ const w=S(hc,{roughness:.9}); A(mesh(G.cylU,w),0,top+hr*.26,0,hr*.5,hr*.55,hr*.5); for(let i=0;i<5;i++){ const an=i/5*TAU; A(mesh(G.sph,w),Math.cos(an)*hr*.28,top+hr*.66,Math.sin(an)*hr*.28,hr*.34,hr*.3,hr*.34); } A(mesh(G.sph,w),0,top+hr*.78,0,hr*.36,hr*.3,hr*.36); break; }
      case 'mortar':{ const k=S(hc,{roughness:.6}); A(mesh(G.cylU,k),0,top+hr*.08,0,hr*.52,hr*.26,hr*.52); A(mesh(G.box,k),0,top+hr*.25,0,hr*1.3,hr*.06,hr*1.3).rotation.y=Math.PI/4; const gold=MET('#f2c230');
        A(mesh(G.sphLow,gold),0,top+hr*.3,0,hr*.06,hr*.04,hr*.06); A(mesh(G.cylU,gold),hr*.6,top+hr*.02,hr*.3,hr*.025,hr*.45,hr*.025); A(mesh(G.cone,gold),hr*.6,top-hr*.22,hr*.3,hr*.06,hr*.18,hr*.06).rotation.z=Math.PI; break; }
      case 'crown':{ const gold=MET(hc); const ring=A(mesh(new T3.CylinderGeometry(1,1,1,24,1,true),gold),0,top+hr*.12,0,hr*.48,hr*.3,hr*.48); ring.material.side=T3.DoubleSide;
        for(let i=0;i<6;i++){ const an=i/6*TAU; A(mesh(G.cone,gold),Math.cos(an)*hr*.46,top+hr*.38,Math.sin(an)*hr*.46,hr*.08,hr*.24,hr*.08); A(mesh(G.sphLow,S(i%2?'#e0245e':'#2fa7ff',{roughness:.1,metalness:.3})),Math.cos(an)*hr*.49,top+hr*.12,Math.sin(an)*hr*.49,hr*.06,hr*.06,hr*.06); } break; }
      case 'halo':{ A(mesh(G.torus,GLOW(hc),false),-hr*.05,top+hr*.62,0,hr*.62,hr*.62,hr*1.6).rotation.x=Math.PI/2; A(mesh(G.torus,new T3.MeshBasicMaterial({color:hc,transparent:true,opacity:.25,depthWrite:false}),false),-hr*.05,top+hr*.62,0,hr*.66,hr*.66,hr*4).rotation.x=Math.PI/2; break; }
      case 'tophat':{ const blk=S(hc,{roughness:.35}); A(mesh(G.cylU,blk),0,top+hr*.02,0,hr*.72,hr*.06,hr*.72); A(mesh(G.cylU,blk),0,top+hr*.42,0,hr*.44,hr*.78,hr*.44); A(mesh(G.cylU,S('#c0392b')),0,top+hr*.14,0,hr*.45,hr*.13,hr*.45); break; }
      case 'turban':{ const t=S(hc,{roughness:.8}), t2=S(lt(hc,.25),{roughness:.8}); for(let i=0;i<3;i++){ const r=A(mesh(G.torus,i%2?t2:t),-hr*.05,top-hr*.05+i*hr*.17,0,hr*(.82-i*.12),hr*(.82-i*.12),hr*3.2); r.rotation.set(Math.PI/2,0,(i-1)*.2); }
        A(mesh(G.sph,t),-hr*.05,top+hr*.3,0,hr*.55,hr*.35,hr*.55); A(mesh(G.sph,S('#e0245e',{roughness:.1,metalness:.3})),hr*.66,top+hr*.15,0,hr*.1,hr*.12,hr*.1); A(mesh(G.cone,S('#ffffff')),hr*.6,top+hr*.42,0,hr*.05,hr*.4,hr*.12).rotation.z=-.3; break; }
      case 'peaked':{ const c=S(hc,{roughness:.6}); A(mesh(new T3.CylinderGeometry(1.18,.92,1,24),c),0,top+hr*.16,0,hr*.56,hr*.3,hr*.56); A(mesh(G.sph,S('#111111',{roughness:.15})),hr*.62,top+hr*.02,0,hr*.42,hr*.05,hr*.55);
        A(mesh(G.torus,MET('#d9ab3a')),hr*.05,top+hr*.08,0,hr*.55,hr*.55,hr*1.6).rotation.x=Math.PI/2; A(mesh(G.sph,MET('#d9ab3a')),hr*.62,top+hr*.2,0,hr*.05,hr*.12,hr*.12); break; }
      case 'witch':{ const w=S(hc,{roughness:.7}); A(mesh(G.sph,w),0,top+hr*.02,0,hr*1.15,hr*.04,hr*1.15); A(mesh(G.cone,w),-hr*.05,top+hr*.6,0,hr*.48,hr*1.1,hr*.48); const tip=A(mesh(G.cone,w),-hr*.32,top+hr*1.28,0,hr*.2,hr*.55,hr*.2); tip.rotation.z=.9;
        A(mesh(G.cylU,S('#3fbf6a')),-hr*.02,top+hr*.14,0,hr*.47,hr*.1,hr*.47); A(mesh(G.box,MET('#f2c230')),hr*.45,top+hr*.14,0,hr*.04,hr*.12,hr*.16); break; }
      case 'jester':{ const c1=S(hc,{roughness:.7}), c2=S('#ffd23f',{roughness:.7}); A(mesh(G.cylU,c1),0,top+hr*.04,0,hr*.6,hr*.14,hr*.62);
        [[-1,c1],[0,c2],[1,c1]].forEach(([k,m])=>{ const c=A(mesh(G.cone,m),-hr*.05,top+hr*.45,k*hr*.38,hr*.2,hr*.75,hr*.2); c.rotation.x=k*.9; c.rotation.z=k?0:.6; const tip=new T3.Vector3(0,.5,0).applyEuler(c.rotation).multiply(c.scale).add(c.position); A(mesh(G.sph,MET('#f2c230')),tip.x,tip.y,tip.z,hr*.09,hr*.09,hr*.09); }); break; }
      case 'starhelm':{ const h=S(hc,{roughness:.35,metalness:.3}); A(mesh(G.hemi,h),-hr*.02,hr*.18,0,hr*1.0,hr*.9,hr*1.08); A(mesh(STAR_GEO,S('#ffffff',{roughness:.4}),false),hr*.68,hr*.72,0,hr*.32,hr*.32,hr*.32).rotation.y=Math.PI/2;
        for(const sd of [-1,1]){ const wg=A(mesh(G.cone,S('#ffffff')),-hr*.1,hr*.7,sd*hr*.98,hr*.08,hr*.36,hr*.16); wg.rotation.set(sd*.4,0,-1.2); } break; }
      case 'dracula':{ const b=S(hc,{roughness:.4}); A(mesh(G.sph,b),0,top+hr*.02,0,hr*1.1,hr*.05,hr*1.0); A(mesh(new T3.CylinderGeometry(.92,1,1,24),b),0,top+hr*.3,0,hr*.46,hr*.6,hr*.46); A(mesh(G.cylU,S('#8a0c18',{roughness:.3})),0,top+hr*.12,0,hr*.47,hr*.12,hr*.47);
        A(mesh(BAT_GEO,S('#c8102e'),false),hr*.47,top+hr*.3,0,hr*.22,hr*.22,hr*.22).rotation.y=Math.PI/2; break; }
    }
    // ---------------- glasses ----------------
    if(o.glasses&&o.glasses!=='none'){
      const er=hr*.3*Math.sqrt(B.eye||1), gx=ef.x+hr*.06, gy=ef.y, gz=ef.z, g=o.glasses;
      const frame=(g==='round'||g==='aviator'||g==='monocle'||g==='steampunk')?MET(gc,.3):g==='bling'?MET(gc,.08):S(gc,{roughness:.3});
      const dark=new CartoonMat({color:0x111111,roughness:.05,metalness:.3}), clear=new CartoonMat({color:0xddeeff,transparent:true,opacity:.18,roughness:0});
      const tint=c=>new CartoonMat({color:c,transparent:true,opacity:.55,roughness:.05});
      const wrap=(mat,h,len=2.5)=>{ const m=add(mesh(new T3.CylinderGeometry(1,1,1,28,1,true,Math.PI/2-len/2,len),mat,false),0,gy,0,hr*1.02,h,hr*1.1*(B.cheek||1)); m.material.side=T3.DoubleSide; return m; };
      let arms=true, bridge=true;
      for(const sd of [-1,1]){ const z=sd*gz;
        switch(g){
          case 'sun': add(mesh(G.disc,dark,false),gx,gy,z,1,er*1.05,er*1.15); add(mesh(G.torus,frame,false),gx-.1,gy,z,er*1.12,er*1.05,er*.6).rotation.y=Math.PI/2; break;
          case 'round': add(mesh(G.torus,frame,false),gx,gy,z,er*1.05,er*1.05,er*.8).rotation.y=Math.PI/2; add(mesh(G.disc,clear,false),gx,gy,z,1,er,er); break;
          case 'heart': add(mesh(HEART_GEO,frame,false),gx,gy,z,1,er*2.1,er*2.1); break;
          case 'aviator': add(mesh(G.disc,tint('#5a4a2a'),false),gx,gy-er*.12,z,1,er*1.15,er*1.2); add(mesh(G.torus,frame,false),gx-.1,gy-er*.12,z,er*1.2,er*1.18,er*.5).rotation.y=Math.PI/2; break;
          case 'nerd': for(const [dy,dz,sy,sz] of [[er*.95,0,er*.32,er*2.3],[-er*.95,0,er*.2,er*2.3],[0,er*1.1,er*2,er*.25],[0,-er*1.1,er*2,er*.25]]) add(mesh(G.box,frame,false),gx,gy+dy,z+dz,er*.25,sy,sz); add(mesh(G.disc,clear,false),gx,gy,z,1,er,er*1.1); break;
          case 'cateye': add(mesh(G.disc,tint('#2a1a2a'),false),gx,gy,z,1,er*.9,er*1.2); add(mesh(G.torus,frame,false),gx-.1,gy,z,er*1.25,er*.95,er*.7).rotation.y=Math.PI/2; { const w=add(mesh(G.cone,frame,false),gx-er*.2,gy+er*.8,z+sd*er*1.1,er*.25,er*.9,er*.25); w.rotation.x=-sd*.9; } break;
          case 'star': add(mesh(STAR_GEO,frame,false),gx,gy,z,er*1.3,er*1.3,er*1.3).rotation.y=Math.PI/2; add(mesh(STAR_GEO,dark,false),gx+.6,gy,z,er*1.0,er*1.0,er*1.0).rotation.y=Math.PI/2; break;
          case 'threed': add(mesh(G.box,S('#f4f1ea'),false),gx-.3,gy,z,er*.2,er*1.7,er*2.3); add(mesh(G.disc,tint(sd<0?'#ff2a2a':'#00d4ff'),false),gx,gy,z,1,er*.75,er*.95); break;
          case 'steampunk': add(mesh(G.cylU,frame,false),gx-er*.5,gy,z,er*1.05,er*1.3,er*1.05).rotation.z=Math.PI/2; add(mesh(G.disc,tint('#c8902a'),false),gx+er*.15,gy,z,1,er*.9,er*.9); add(mesh(G.torus,MET('#3a2a1a'),false),gx+er*.1,gy,z,er*1.1,er*1.1,er*.9).rotation.y=Math.PI/2; break;
          case 'monocle': if(sd>0){ add(mesh(G.torus,frame,false),gx,gy,z,er*1.1,er*1.1,er*.8).rotation.y=Math.PI/2; add(mesh(G.disc,clear,false),gx,gy,z,1,er,er); add(mesh(G.cylU,frame,false),gx,gy-er*2.1,z+er*.6,hr*.015,er*2.3,hr*.015).rotation.x=.4; } arms=false; bridge=false; break;
          case 'thug': for(let r=0;r<3;r++) for(let c2=0;c2<4-r;c2++) add(mesh(G.box,S('#0a0a0a',{roughness:.3}),false),gx,gy+er*(.6-r*.5),z+sd*er*(-.9+c2*.55),er*.2,er*.5,er*.55); add(mesh(G.box,S('#ffffff'),false),gx+er*.15,gy+er*.6,z+sd*er*-.35,er*.05,er*.22,er*.22); break;
          case 'bling': add(mesh(G.disc,dark,false),gx,gy,z,1,er*1.05,er*1.15); for(let i=0;i<12;i++){ const an=i/12*TAU; add(mesh(G.sphLow,MET('#ffffff',.02),false),gx,gy+Math.sin(an)*er*1.12,z+Math.cos(an)*er*1.22,er*.14,er*.14,er*.14); } break;
          case 'flame': add(mesh(G.disc,dark,false),gx,gy,z,1,er*1.0,er*1.15); for(let i=0;i<4;i++){ const f=add(mesh(G.cone,S(i%2?'#ffd23f':gc,{roughness:.3}),false),gx-.2,gy+er*(1+i%2*.25),z+(i-1.5)*er*.5,er*.25,er*(.9+i%2*.4),er*.2); f.rotation.x=(i-1.5)*.25; } break;
          case 'rainbow': add(mesh(G.disc,new CartoonMat({map:rainbowTex(),transparent:true,opacity:.75,roughness:.1}),false),gx,gy,z,1,er,er*1.05); add(mesh(G.torus,frame,false),gx-.1,gy,z,er*1.05,er*1.05,er*.7).rotation.y=Math.PI/2; break;
          case 'butterfly': for(const [dy,k] of [[er*.45,1.15],[-er*.6,.8]]) add(mesh(G.disc,new CartoonMat({color:gc,transparent:true,opacity:.75,roughness:.2}),false),gx,gy+dy,z+sd*er*.2,1,er*.75*k,er*.95*k); add(mesh(G.torus,MET('#f2c230'),false),gx-.1,gy,z,er*1.2,er*1.3,er*.5).rotation.y=Math.PI/2; break;
          case 'sport': case 'ski': case 'cyber': case 'vr': case 'scuba': break;
        } }
      if(g==='sport'){ wrap(new CartoonMat({color:gc,metalness:.6,roughness:.15}),er*1.5,2.2); bridge=false; }
      if(g==='ski'){ wrap(new CartoonMat({color:gc,metalness:.5,roughness:.1}),er*2.2,2.4); add(mesh(G.torus,S('#1b1b1f'),false),-hr*.05,gy,0,hr*1.02,hr*1.12,hr*4).rotation.x=Math.PI/2; arms=false; bridge=false; }
      if(g==='cyber'){ wrap(GLOW(gc),er*.9,2.4); wrap(S('#1b1b1f',{metalness:.6,roughness:.3}),er*1.5,2.6).scale.multiplyScalar(.995); bridge=false; }
      if(g==='vr'){ add(mesh(G.box,S(gc,{roughness:.4})),gx+er*.6,gy,0,er*1.6,er*2.2,gz*2.6); add(mesh(G.box,S('#1b1b1f',{roughness:.1})),gx+er*1.42,gy,0,er*.1,er*1.7,gz*2.2); add(mesh(G.torus,S('#1b1b1f'),false),-hr*.05,gy,0,hr*1.02,hr*1.12,hr*4).rotation.x=Math.PI/2; arms=false; bridge=false; }
      if(g==='scuba'){ add(mesh(G.disc,clear,false),gx+er*.3,gy,0,1,er*1.4,gz*1.9); add(mesh(G.torus,S(gc,{roughness:.4}),false),gx+er*.25,gy,0,er*1.5,er*1.5,er).scale.set(er*.8,er*1.45,gz*1.95); add(mesh(G.torus,S('#1b1b1f'),false),-hr*.05,gy,0,hr*1.02,hr*1.12,hr*4).rotation.x=Math.PI/2;
        add(mesh(G.cylU,S(gc,{roughness:.4})),-hr*.1,gy+hr*.6,gz*1.35,hr*.07,hr*1.2,hr*.07); arms=false; bridge=false; }
      if(arms) for(const sd of [-1,1]) add(mesh(G.cylU,frame,false),gx-hr*.4,gy+hr*.04,sd*hr*.8,hr*.035,hr*.75,hr*.035).rotation.x=Math.PI/2;
      if(bridge) add(mesh(G.cylU,frame,false),gx+.3,gy+hr*.06,0,hr*.03,gz*1.1,hr*.03).rotation.x=Math.PI/2;
    }
    // ---------------- outfits ----------------
    this.shells=[]; this.oTube=null; this.oTube2=null; this.cape=null; this.capeIn=null; this.bow=null; this.hood=null; this.sleeves=null; this.mount=null; this.belt=null; this.oWings=null;
    const sp=OUTFIT_SPEC[o.outfit]; if(!sp) return;
    const metal=!!sp.metal, mat=metal?stdMat(oc,{map:outfitTex(sp.tex,oc),metalness:.75,roughness:.3}):stdMat('#ffffff',{map:outfitTex(sp.tex,oc),roughness:sp.gloss?.25:.85});
    const shell=(m,which,sc)=>{ const ms=mesh(G.sphX,m); R.add(ms); this.shells.push({m:ms,which,sc}); return ms; };
    // the garment is a fitted layer that follows the torso (waist-to-neck for tops, tail-to-neck when it covers the hips)
    if(sp.tex){ this.oTube=new Tube(16,LOW?12:20,mat,true,.3); this.oFull=!!sp.hips; R.add(this.oTube.mesh);
      if(sp.hips==='alt'){ this.oTube2=new Tube(8,LOW?12:20,stdMat('#ffffff',{map:outfitTex(sp.hipsTex,oc),roughness:.8}),true,.3); R.add(this.oTube2.mesh); this.oFull=false; } }
    if(sp.sleeves){ const sm=sp.sleeveTex?stdMat('#ffffff',{map:outfitTex(sp.sleeveTex,oc),roughness:.85}):mat; this.sleeves=[0,1].map(()=>{ const sl=mesh(G.cylU,sm); R.add(sl); return sl; }); }
    if(sp.hood){ const hm=sp.hood==='fur'?stdMat('#f4f1ea',{roughness:1}):sp.hood==='collar'?stdMat(sp.collarCol||'#8a0c18',{roughness:.5,side:T3.DoubleSide}):sp.hood==='ermine'?stdMat('#ffffff',{map:outfitTex('ermine','#ffffff'),roughness:.9}):mat;
      this.hood=mesh(sp.hood==='collar'?COLLAR_GEO:G.torus,hm); R.add(this.hood); }
    if(sp.cape){ const cc=sp.cape===true?oc:sp.cape, cm=stdMat(cc,{roughness:.55,side:T3.FrontSide}); this.cape=mesh(CAPE_GEO,cm); R.add(this.cape);
      this.capeIn=mesh(CAPE_GEO,stdMat(sp.capeLining||dk(cc,.2),{roughness:.6,side:T3.BackSide})); R.add(this.capeIn); this.clasp=mesh(G.sphLow,MET('#f4c430',.2)); R.add(this.clasp); }
    if(sp.bow){ const bc=sp.bow==='red'?'#a0101a':sp.bow==='scarf'?'#d62839':sp.bow==='tie'?'#a0101a':'#141414', bm=stdMat(bc,{roughness:.45}); this.bow=new T3.Group(); R.add(this.bow);
      if(sp.bow==='tie'){ const t=mesh(G.cone,bm); t.scale.set(2.2,9,1.2); t.rotation.z=Math.PI; t.position.y=-4.5; this.bow.add(t); const k=mesh(G.sph,bm); k.scale.set(2,2,1.6); this.bow.add(k); }
      else { for(const sd of [-1,1]){ const w=mesh(G.cone,bm); w.scale.set(3,5,2); w.rotation.x=sd*Math.PI/2; w.position.z=sd*3; this.bow.add(w); } const k=mesh(G.sph,bm); k.scale.setScalar(1.8); this.bow.add(k); } }
    if(sp.belt){ this.belt=mesh(G.torus,MET(sp.belt,.35)); R.add(this.belt); }
    // things worn on the back (emblem, wings, spikes, backpack) ride on a mount that follows the chest
    if(sp.emblem||sp.wings||sp.spikes||sp.pack){ const mt=this.mount=new T3.Group(); R.add(mt); const ty=17.2*B.wid;
      if(sp.emblem){ const em=mesh(DECAL_GEO,new T3.MeshStandardMaterial({map:emblemTex(sp.emblem,oc),transparent:true,alphaTest:.3,roughness:.5}),false); em.position.set(1,ty+.4,0); em.scale.set(13,1,13); mt.add(em); }
      if(sp.spikes) for(let i=0;i<6;i++){ const c=mesh(G.cone,stdMat('#f2c230',{roughness:.4})); c.position.set(14-i*6,ty-1,0); c.scale.set(2.2,6-i*.4,1.4); c.rotation.z=.35; mt.add(c); }
      if(sp.pack){ const pk=mesh(G.box,stdMat('#e8e4dc',{roughness:.6})); pk.position.set(-2,ty+2,0); pk.scale.set(16,7,13); mt.add(pk); const lg=mesh(G.cylU,stdMat('#2f8cff')); lg.position.set(4,ty+5.8,0); lg.scale.set(2,1.2,2); mt.add(lg); }
      if(sp.wings){ const wm=stdMat(sp.wings==='dragon'?mix(oc,'#ffaa00',.25):'#1b1b1f',{roughness:.5,side:T3.DoubleSide}); this.oWings=[-1,1].map(sd=>{ const w=new T3.Group(); w.position.set(4,ty-2,sd*5); mt.add(w);
        const m=mesh(WING_GEO,wm); m.scale.set(18,1,sd*20); w.add(m); return {w,sd}; }); } }
  }
  setVisible(v){ this.rig.visible=v; }
  update(c,ox,oz,K=1,dt=1/60){
    const D=catDims(c,K),B=this.B,s=D.s,M=this.M,[S,Mi,P]=c.spine,a1=c.a1,a2=c.a2,am=a1+angDiff(a2,a1)/2,ca=Math.cos(am),sa=Math.sin(am);
    this.rig.position.set(Mi.x-ox,0,Mi.y-oz); this.rig.rotation.y=-am;
    const loc=(x,y)=>{ const dx=x-Mi.x,dz=y-Mi.y; return [dx*ca+dz*sa,-dx*sa+dz*ca]; };
    const legH=D.legH, sit=c.sit||0, air=c.air||0, roll=c.rollP||0, anger=c.anger||0, bodyY=legH+D.wM*.55, sp=Math.hypot(c.vx||0,c.vy||0), run=clamp(sp/250,0,1);
    // cartoon bounce: springy trot bob, stretch in the air, jelly squash (signed spring) on landing
    const sq=c.squash||0, bob=Math.pow(Math.sin(time*Math.max(4,sp*.07)),2)*2.6*s*clamp(sp/80,0,1), idle=(1-run)*(1-roll)*Math.sin(time*2.4)*.025;
    const pivotY=lerp(bodyY+air*58*s+bob-sq*4*s,D.wM*1.05,smooth(0,1,roll));
    this.roller.position.y=pivotY; this.roller.rotation.x=smooth(0,1,roll)*Math.PI;
    this.rig.scale.set(1+.11*sq+.12*air-idle*.5,1-.14*sq-.05*air+idle,1+.09*sq-.03*air-idle*.5);
    const [sx,sz]=loc(S.x,S.y),[px,pz]=loc(P.x,P.y), l1=a1-am, l2=a2-am;
    const d1=new T3.Vector3(Math.cos(l1),0,Math.sin(l1)), d2=new T3.Vector3(Math.cos(l2),0,Math.sin(l2)), n1=new T3.Vector3(-d1.z,0,d1.x), n2=new T3.Vector3(-d2.z,0,d2.x);
    const chestY=sit*5*s, hipY=-sit*bodyY*.32;
    const Sv=new T3.Vector3(sx,chestY,sz), Pv=new T3.Vector3(px,hipY,pz), Mv=new T3.Vector3(0,(chestY+hipY)/2,0);
    const front=Sv.clone().addScaledVector(d1,11*s), rear=Pv.clone().addScaledVector(d2,-10*s), br=1+Math.sin(time*2.4)*.025;
    placeEll(this.chest,Mv,front,5*s,D.wS*.9*br,D.wS*REAL_BODY*br); placeEll(this.hips,rear,Mv,5*s,D.wP*.9,D.wP*REAL_BODY);
    const bl=new T3.Vector3(0,-D.wM*.26,0); placeEll(this.belly,rear.clone().add(bl),front.clone().add(bl),-2*s,D.wM*.72,D.wM*.88*REAL_BODY);
    { const key=[rear.clone().addScaledVector(d2,-D.wP*.5).add(_v2.set(0,D.wP*.08,0)),rear,rear.clone().lerp(Mv,.5),Mv.clone().add(_v2.set(0,-D.wM*.04,0)),Mv.clone().lerp(front,.5),front,front.clone().addScaledVector(d1,D.wS*.42).add(_v2.set(0,D.wS*.12,0))];
      const prof=[[.3,.3],[.82,.74],[.92,.8],[.8,.66],[.95,.8],[.86,.74],[.5,.46]].map(([v,l],i)=>{ const w=i<3?D.wP:i===3?D.wM:D.wS; const bk=D.lion?1.2:1; return [w*v*bk,w*l*bk*(D.lion?1:REAL_BODY/.84)]; });
      tubeAlong(this.torso,key,prof,br);
      if(this.oTube){ const a=this.oFull?1:2, k=key.slice(a), pf=prof.slice(a).map(([y,z])=>[y*1.1,z*1.12]); tubeAlong(this.oTube,k,pf,br); }
      if(this.oTube2) tubeAlong(this.oTube2,key.slice(1,4),prof.slice(1,4).map(([y,z])=>[y*1.09,z*1.11]),br); }
    if(this.rump) placeEll(this.rump,rear.clone().addScaledVector(d2,-1*s),Pv.clone().addScaledVector(d2,4*s),1*s,D.wP*.74,D.wP*.86);
    if(this.bib){ this.bib.position.copy(front).addScaledVector(d1,-3*s).add(_v2.set(0,-D.wS*.12,0)); this.bib.scale.set(D.wS*.46,D.wS*.62,D.wS*.56); this.bib.rotation.y=-l1; }
    const ha=c.angle-am, hd=new T3.Vector3(Math.cos(ha),0,Math.sin(ha)), down=c.headDown||0, HR=B.head*D.hk*s;
    const neckBase=Sv.clone().addScaledVector(d1,6*s).add(_v2.set(0,D.wS*.3,0));
    const headPos=Sv.clone().addScaledVector(hd,D.lion?D.neck:D.neck*.62).add(_v2.set(0,D.wS*.42+HR*.55-down*bodyY*.6+Math.sin(time*2.4+1)*.4*s,0));
    placeEll(this.neck,neckBase,headPos,2*s,D.wS*.62,D.wS*.6);
    if(this.chestMane){ this.chestMane.position.copy(neckBase).addScaledVector(hd,2*s).add(_v2.set(0,-D.wS*.15,0)); this.chestMane.scale.set(D.wS*.75,D.wS*1.05,D.wS*1.05); }
    const Hd=this.head; Hd.position.copy(headPos); Hd.scale.setScalar(s*D.hk*(D.lion?.9:REAL_HEAD)); Hd.rotation.order='YZX';
    Hd.rotation.y=-(ha+(c.headTurn||0)); Hd.rotation.z=-.04-anger*.14-down*.5+air*.18+bob*.01;
    Hd.rotation.x=(c.chew>0?Math.sin(c.chew*45)*.1:0)+(roll>.5?Math.sin(time*2.2)*.15:0)+Math.sin(time*.7)*.04;
    const open=c.pounce?air:(c.bite>0?c.bite/.22:(c.chew>0?Math.abs(Math.sin(c.chew*30))*.6:(anger>.5?.35+anger*.3:0)));
    this.jaw.rotation.z=-open*.6; this.tongue.visible=c.chew>0||roll>.5; for(const f of this.fangs) f.visible=open>.12;
    this.blinkT-=dt; if(this.blinkT<=0){ this.blink=.18; this.blinkT=rr(2.5,6); } this.blink=Math.max(0,this.blink-dt);
    const happy=(c.blush||0)>.6&&(c.chew>0||roll>.3), wide=c.frenzy>0||c.pounce||anger>.3, bk=this.blink>0?Math.sin(this.blink/.18*Math.PI):0;
    const close=Math.max(bk,happy?.8:0,anger>.5?.3:0), lidK=close>0?close:(wide?-.12:0);
    for(const e of this.eyes){ e.up.rotation.z=e.b0-lidK*e.span*1.02;
      e.pu.visible=!wide; e.pw.visible=wide; e.pu.scale.z=e.er*(anger>.5?e.slit*.5:e.slit); }
    const lift=wide&&anger<.3?1:0, mood=anger*.55-(happy?.18:0)-lift*.12;
    for(const b of this.brows){ b.m.rotation.x=-b.sd*(mood-.06); b.m.position.y=b.er*(lift*.22-anger*.16+(happy?.1:0)); }
    this.twitchT-=dt; if(this.twitchT<=0){ this.twitch=.25; this.twitchT=rr(2,6); this.twitchSide=rand()<.5?-1:1; } this.twitch=Math.max(0,this.twitch-dt);
    for(const e of this.ears){ const base=B.ear==='curl'?.55:B.ear==='fold'?-1.25:.06, tw=(this.twitch>0&&e.sd===this.twitchSide)?Math.sin(this.twitch*60)*.25:0;
      e.g.rotation.set(e.sd*(.32+anger*.55)+tw,0,base+(B.ear==='fold'?0:anger*.95)); }
    const J=[],Kn=[];
    for(let i=0;i<4;i++){
      const isF=i<2, sd=i%2?1:-1, f=c.feet[i];
      const Jv=isF?Sv.clone().addScaledVector(d1,3*s).addScaledVector(n1,sd*D.wS*.55).add(_v2.set(0,-D.wS*.25,0)):Pv.clone().addScaledVector(n2,sd*D.wP*.58).add(_v2.set(0,-D.wP*.15,0));
      let F; const [fx,fz]=loc(f.x,f.y), pr=4.6*s*B.legW;
      if(roll>.02){ const k=smooth(0,1,roll); F=Jv.clone().addScaledVector(isF?d1:d2,isF?6*s:-4*s).addScaledVector(isF?n1:n2,sd*3*s).add(_v2.set(Math.sin(time*5+i*1.7)*3*s,-legH*.45,Math.cos(time*4+i)*2*s));
        F=new T3.Vector3(fx,-pivotY+pr,fz).lerp(F,k); }
      else { F=new T3.Vector3(fx,-pivotY+pr+f.lift*8*s,fz); if(c.pounce) F.y=Jv.y-legH*.35; if(!isF&&sit>0) F.y=lerp(F.y,-pivotY+pr,sit); }
      const L1=legH*.62,L2=legH*.62, dir=_v1.subVectors(F,Jv); let d=dir.length(); dir.normalize();
      if(d>(L1+L2)*.995){ d=(L1+L2)*.995; F.copy(Jv).addScaledVector(dir,d); }
      const a=(L1*L1-L2*L2+d*d)/(2*d), hh=Math.sqrt(Math.max(0,L1*L1-a*a));
      const bend=(isF?d1:d2).clone().multiplyScalar(isF?-1:1); bend.addScaledVector(dir,-bend.dot(dir)); if(bend.lengthSq()<1e-6) bend.set(isF?-1:1,0,0); bend.normalize();
      const Kv=Jv.clone().addScaledVector(dir,a).addScaledVector(bend,hh), r1=5.6*(D.lion?1:REAL_LEG)*s*B.legW*(1+B.fluff*.2), r2=4.4*(D.lion?1:REAL_LEG)*s*B.legW*(1+B.fluff*.15), lg=this.legs[i];
      placeSeg(lg.up,Jv,Kv,r1); lg.kn.position.copy(Kv); lg.kn.scale.setScalar(r1*.95); placeSeg(lg.lo,Kv,F,r2);
      { const th=isF?1.3:1.45, top=Jv.clone().add(_v2.set(0,D.wS*.32,0));   // muscular thigh / shoulder blending up into the body
        tubeAlong(lg.tube,[top,Jv,Jv.clone().lerp(Kv,.5),Kv,Kv.clone().lerp(F,.5),F.clone().add(_v2.set(0,pr*.2,0))],[[r1*th,r1*th*.85],[r1*1.18,r1*1.05],[r1*.92,r1*.85],[r1*.78,r1*.74],[r2*.78,r2*.74],[r2*.72,r2*.7]]); }
      lg.paw.position.copy(F); lg.paw.rotation.set(0,-(isF?l1:l2),0); lg.paw.scale.setScalar(s*B.legW*REAL_PAW*(1+(f.lift||0)*.1)); J.push(Jv); Kn.push(Kv);
    }
    const ch=c.tail,n=ch.length,pts=[],radii=[], baseY=hipY+D.wP*.5;
    for(let i=0;i<n;i++){ const [tx,tz]=loc(ch[i].x,ch[i].y),k=i/(n-1);
      const calm=baseY+k*30*s+Math.sin(k*Math.PI)*6*s-Math.pow(k,4)*6*s, runY=baseY+k*14*s, upY=baseY+k*40*s;
      let y=lerp(lerp(calm,runY,run),upY,anger); if(B.mane) y=lerp(baseY,-pivotY+5*s,smooth(0,.7,k))+Math.pow(k,4)*24*s; if(roll>0) y=lerp(y,baseY,smooth(0,1,roll));
      pts.push({x:tx,y,z:tz}); radii.push(lerp(B.tail[0],B.tail[1],k)*s*(B.mane?.55:.56)*(1+(B.tailFluff||0)*.4)*(1+anger*.6)*(k>.95?.75:1)); }
    this.tail.update(pts,radii);
    if(this.tuft){ const t=pts[n-1]; this.tuft.position.set(t.x,t.y,t.z); this.tuft.scale.set(B.tail[0]*s*.95,B.tail[0]*s*.8,B.tail[0]*s*.8); }
    const nd=_v1.subVectors(headPos,neckBase); const nl=nd.length(); nd.normalize(); const cpos=neckBase.clone().addScaledVector(nd,nl*.45), cr=D.wS*.68;
    if(this.collar){ this.collar.position.copy(cpos); this.collar.quaternion.setFromUnitVectors(ZAX,nd); this.collar.scale.set(cr,cr,cr*1.4);
      const dn=_v2.set(0,-1,0).addScaledVector(nd,nd.y).normalize(); this.bell.position.copy(cpos).addScaledVector(dn,cr*1.12).addScaledVector(nd,1.5*s); this.bell.scale.setScalar(3.4*s);
      const side=_v3.crossVectors(nd,UP).normalize(); this.tag.position.copy(cpos).addScaledVector(side,cr*1.05).addScaledVector(dn,cr*.4); this.tag.scale.set(.8*s,3*s,2.6*s); this.tag.quaternion.setFromUnitVectors(XAX,side); }
    for(const sh of this.shells){ const src=sh.which==='chest'?this.chest:this.hips; sh.m.position.copy(src.position); sh.m.quaternion.copy(src.quaternion); sh.m.scale.copy(src.scale).multiply(_v2.set(...sh.sc)); }
    if(this.sleeves) this.sleeves.forEach((sl,i)=>{ const a=J[i],b=Kn[i]; placeSeg(sl,a,a.clone().lerp(b,.6),5.6*s*B.legW*1.3); });
    if(this.hood){ this.hood.position.copy(cpos).addScaledVector(nd,-2*s).add(_v2.set(0,1.5*s,0)); this.hood.quaternion.setFromUnitVectors(ZAX,nd); this.hood.scale.set(cr*1.05,cr*1.05,cr*3.5); }
    if(this.cape){ const back=new T3.Vector3().addVectors(Sv,Pv).multiplyScalar(.5); this.cape.position.copy(back).add(_v2.set(0,D.wM*.25,0)); this.cape.rotation.set(0,-((l1+l2)/2),0);
      const flap=1+Math.sin(time*9)*.05*clamp(sp/150,0,1); this.cape.scale.set(D.seg*1.35+10*s,D.wM*1.35*flap,D.wM*1.45);
      if(this.capeIn){ this.capeIn.position.copy(this.cape.position); this.capeIn.rotation.copy(this.cape.rotation); this.capeIn.scale.copy(this.cape.scale).multiplyScalar(.985); } this.clasp.position.copy(cpos).addScaledVector(nd,-1*s).add(_v2.set(0,-D.wS*.35,0)); this.clasp.scale.setScalar(2.4*s); }
    if(this.mount){ this.mount.position.copy(this.chest.position); this.mount.quaternion.copy(this.chest.quaternion); this.mount.scale.setScalar(s);
      if(this.oWings) for(const w of this.oWings){ w.w.rotation.set(w.sd*(.55+Math.sin(time*2.6)*.12+clamp(sp/250,0,1)*.25),0,.2); } }
    if(this.belt){ const bd=_v1.subVectors(front,rear).normalize(); this.belt.position.copy(Mv); this.belt.quaternion.setFromUnitVectors(ZAX,bd); this.belt.scale.set(D.wM*.76,D.wM*.9,s*6); }
    if(this.bow){ const dn=_v2.set(0,-1,0).addScaledVector(nd,nd.y).normalize(); this.bow.position.copy(cpos).addScaledVector(dn,cr*1.0).addScaledVector(nd,2*s); this.bow.rotation.set(0,-ha,0); this.bow.scale.setScalar(s*1.1); }
  }
  dispose(){ disposeTree(this.rig); if(this.rig.parent) this.rig.parent.remove(this.rig); }
}

// ================= 3D RAT =================
const TYPES={
  grey:{fur:['#6f655c','#948a80','#463f39'],ear:'#d1a8a0',skin:'#dca7a0',tail:'#bc958e',size:20,speed:88,hp:1,pts:10,fear:.9},
  mouse:{fur:['#9a7552','#c19a70','#6d5035'],ear:'#e0b2a4',skin:'#e4ada3',tail:'#cba295',size:13,speed:155,hp:1,pts:20,fear:1.6},
  big:{fur:['#2d2825','#45403a','#161311'],ear:'#8d7570',skin:'#a6807a',tail:'#8a6e68',size:28,speed:64,hp:3,pts:50,fear:.15,red:true},
  albino:{fur:['#ece7df','#fdfbf6','#c9c1b5'],ear:'#f4c8c4',skin:'#f2b2ac',tail:'#efc2bb',size:18,speed:180,hp:1,pts:150,fear:1.9,red:true},
};
// coat colours for mice and rats; each wave mixes the colours it lists
const RAT_COLS={ brown:['#9a7552','#c19a70','#6d5035'], grey:['#7a746e','#a29c95','#4f4a45'], black:['#2b2727','#474141','#141111'], white:['#ece8e1','#fbf9f5','#c8c2b8'], piebald:['#f1ede6','#ffffff','#cfc8bd'] };
// a variant of a base type (mouse / grey rat / big rat) in a given coat with an evil level 0..3 (red eyes, devil fangs, horns)
function ratType(base,col,evil){ const key=base+'.'+col+'.'+evil; if(TYPES[key]) return key; const B=TYPES[base];
  TYPES[key]={...B,base,fur:RAT_COLS[col]||B.fur,pattern:col==='piebald'?'piebald':'solid',evil,red:evil>0||B.red,hp:B.hp+(evil>=2&&base!=='mouse'?1:0),pts:Math.round(B.pts*(1+evil*.3)),speed:B.speed*(1+evil*.05),fear:B.fear*(1-evil*.15)};
  return key; }
const ratMats={};
function getRatMats(type){ if(ratMats[type]) return ratMats[type]; const T=TYPES[type], m={ body:furMat(T.fur[0],T.fur[1],T.fur[2],T.pattern||'solid'), skin:stdMat(T.skin,{roughness:.45}), ear:stdMat(T.ear,{roughness:.6,side:T3.DoubleSide}),
  eye:new CartoonMat({color:T.evil?0xff1a10:T.red?0x9a0a14:0x050505,roughness:.05,emissive:new T3.Color(T.evil?0xff2010:0),emissiveIntensity:T.evil?.9+T.evil*.3:0}), fang:stdMat('#fffdf2',{roughness:.3}), horn:stdMat('#5a0d0d',{roughness:.35}), brow:stdMat('#1a0d0b',{roughness:.7}), tail:stdMat(T.tail,{roughness:.5,bumpMap:SKINBUMP,bumpScale:.5,side:T3.DoubleSide}),
  wound:stdMat('#fff0c8'),   /* cartoon sticking plaster where the cat bopped it */ belly:furMat(mix(T.fur[1],'#ffffff',.35),'#ffffff',T.fur[1]), hl:new T3.MeshBasicMaterial({color:0xffffff}),
  cheek:new T3.MeshBasicMaterial({color:0xff9fb0,transparent:true,opacity:.55,depthWrite:false}), earIn:stdMat('#f7a8b8',{roughness:.5,side:T3.DoubleSide}), sclera:stdMat('#ffffff',{roughness:.3}), whisk:new T3.LineBasicMaterial({color:0xeeeeee,transparent:true,opacity:.6}) }; for(const k in m){ m[k].userData.shared=true; m[k].name=k; } return ratMats[type]=m; }
class RatModel{
  constructor(type){ const T=TYPES[type],s=T.size,M=getRatMats(type); this.type=type; this.s=s; const g=this.g=new T3.Group();
    const add=(m,x,y,z,sx,sy,sz)=>{ m.position.set(x,y,z); m.scale.set(sx,sy,sz); g.add(m); return m; };
    add(mesh(G.sphX,M.body),-s*.15,0,0,s*.9,s*.55,s*.62); add(mesh(G.sphX,M.body),-s*.55,-s*.02,0,s*.62,s*.56,s*.66);
    add(mesh(G.sphX,M.belly),0,-s*.22,0,s*.7,s*.3,s*.45);
    add(mesh(G.sph,M.body),s*.78,s*.12,0,s*.48,s*.42,s*.46); add(mesh(G.sphX,M.body),s*1.15,s*.02,0,s*.32,s*.22,s*.24);
    add(mesh(G.sph,M.skin),s*1.45,s*.05,0,s*.085,s*.075,s*.095);
    for(const sd of [-1,1]){
      add(mesh(G.sph,M.sclera,false),s*.98,s*.23,sd*s*.24,s*.13,s*.15,s*.13);
      add(mesh(G.sph,M.eye,false),s*1.05,s*.235,sd*s*.25,s*.085,s*.11,s*.095);
      add(mesh(G.sphLow,M.hl,false),s*1.12,s*.29,sd*s*.255,s*.035,s*.035,s*.035);
      if(!T.evil) add(mesh(G.sph,M.skin),s*1.0,s*.02,sd*s*.24,s*.08,s*.06,s*.08).material=M.cheek;
      if(T.evil){ const b=add(mesh(G.box,M.brow,false),s*1.06,s*.38,sd*s*.22,s*.05,s*.04,s*.22); b.rotation.x=sd*.5; b.rotation.z=-.2; }   // angry brows
      if(T.evil>=2){ const f=add(mesh(G.cone,M.fang,false),s*1.36,-s*.1,sd*s*.055,s*.035,s*.14,s*.035); f.rotation.z=Math.PI+.15; }   // devil fangs
      if(T.evil>=3){ const h=add(mesh(G.cone,M.horn),s*.82,s*.62,sd*s*.16,s*.07,s*.24,s*.07); h.rotation.set(sd*.45,0,-.35); }   // little horns
      const e=add(mesh(new T3.CircleGeometry(1,20),M.ear,false),s*.58,s*.55,sd*s*.32,s*.28,s*.3,1); e.rotation.y=sd>0?.6:Math.PI-.6;
      const ei=add(mesh(new T3.CircleGeometry(1,20),M.earIn,false),s*.6,s*.55,sd*s*.335,s*.19,s*.2,1); ei.rotation.y=sd>0?.6:Math.PI-.6; }
    this.feet=[0,1,2,3].map(()=>add(mesh(G.sphLow,M.skin,false),0,0,0,s*.15,s*.07,s*.11));
    const wp=[]; for(const sd of [-1,1]) for(let k=0;k<3;k++) wp.push(s*1.35,s*.02,sd*s*.12,s*1.55,-s*.04+k*s*.05,sd*s*(.6+k*.08));
    const wg=new T3.BufferGeometry(); wg.setAttribute('position',new T3.Float32BufferAttribute(wp,3)); g.add(new T3.LineSegments(wg,M.whisk));
    this.wounds=[0,1,2].map(()=>{ const m=add(mesh(G.sphLow,M.wound,false),0,0,0,1,1,1); m.visible=false; return m; });
    this.tail=new Tube(10,LOW?5:7,M.tail); this.tail.mesh.castShadow=!LOW; this.tail.mesh.userData.ink=true;
    g.rotation.order='YXZ'; this.wounds.forEach(w=>{ w.castShadow=true; }); inkify(g,1.5); inkify(this.tail.mesh,1.3); rimify(g); rimify(this.tail.mesh); }
  attach(){ scene.add(this.g); scene.add(this.tail.mesh); this.g.visible=this.tail.mesh.visible=true; this.g.scale.setScalar(1); }
  detach(){ this.g.visible=this.tail.mesh.visible=false; }
  update(r){ const s=this.s,[X,Z]=g2w(r.x,r.y),amp=clamp(Math.hypot(r.vx,r.vy)/60,0,1),hop=Math.pow(Math.sin(r.ph),2)*amp,q=Math.pow(Math.cos(r.ph),2)*amp;
    const pop=(r.age||0)<.45?Math.max(.01,backOut((r.age||0)/.45)):1;   // springs out of the hole
    this.g.position.set(X,s*.55+hop*s*.1,Z); this.g.rotation.set(Math.sin(r.ph)*.06*amp,-(r.angle+r.sniff),Math.sin(r.ph*2)*.05*amp);
    this.g.scale.set((1+hop*.05)*pop,(1-hop*.03+q*.02)*pop,(1-hop*.02+q*.03)*pop);
    const st=s*.2, fp=[[s*.6+Math.sin(r.ph)*st,-s*.38],[s*.6+Math.sin(r.ph+Math.PI)*st,s*.38],[-s*.6+Math.sin(r.ph+Math.PI)*st*1.2,-s*.46],[-s*.6+Math.sin(r.ph)*st*1.2,s*.46]];
    this.feet.forEach((f,i)=>f.position.set(fp[i][0],-s*.5+Math.max(0,Math.sin(r.ph+(i%3?Math.PI:0)))*s*.1,fp[i][1]));
    this.wounds.forEach((w,i)=>{ const wd=r.wounds[i]; w.visible=!!wd; if(wd){ w.position.set(wd.x,s*.32,wd.y); w.scale.setScalar(wd.r); } });
    const n=r.tail.length,pts=[],radii=[]; for(let i=0;i<n;i++){ const k=i/(n-1),[tx,tz]=g2w(r.tail[i].x,r.tail[i].y); pts.push({x:tx,y:lerp(s*.42,2,smooth(0,.5,k))+Math.sin(k*Math.PI)*s*.12,z:tz}); radii.push(lerp(s*.1,s*.025,k)); }
    this.tail.update(pts,radii); }
}
const ratPool={};
function getRatModel(type){ const p=ratPool[type]||(ratPool[type]=[]); const m=p.pop()||makeRat(type); m.attach(); return m; }
function releaseRatModel(m){ m.detach(); if(m.g.parent!==scene) scene.add(m.g); (ratPool[m.type]||(ratPool[m.type]=[])).push(m); }

// ================= 3D OWNER (cowboy) =================
const HAT_BRIM=(()=>{ const pr=[[13,0],[20,.3],[27,1.3],[32,3.4],[35,6.8],[35.6,7.8],[34.6,7.6],[31,4.2],[26,2.4],[20,1.6],[13,1.4]].map(([r,y])=>new T3.Vector2(r,y)); const g=new T3.LatheGeometry(pr,40); SHARED_GEO.add(g); return g; })();
const HAT_CROWN=(()=>{ const pr=[[0,21],[6,21.5],[10,20],[12.8,16.5],[13.6,10],[14,3],[13.4,0]].map(([r,y])=>new T3.Vector2(r,y)); const g=new T3.LatheGeometry(pr,32);
  const P=g.attributes.position; for(let i=0;i<P.count;i++){ const x=P.getX(i),y=P.getY(i),z=P.getZ(i); if(y>15) P.setY(i,y-Math.max(0,1-Math.abs(z)/5)*(y-15)*.55*(x<4?1:.6)); }   // centre crease
  g.computeVertexNormals(); SHARED_GEO.add(g); return g; })();
const HUMAN_IRIS=new T3.SphereGeometry(1,24,8,0,TAU,0,.6).rotateZ(-Math.PI/2), HUMAN_PUPIL=new T3.SphereGeometry(1,16,4,0,TAU,0,.22).rotateZ(-Math.PI/2);
SHARED_GEO.add(HUMAN_IRIS); SHARED_GEO.add(HUMAN_PUPIL);
let WAVY_HAIR=null;
function wavyHair(){ if(WAVY_HAIR) return WAVY_HAIR; const geos=[];
  const lock=(pts,r)=>geos.push(new T3.TubeGeometry(new T3.CatmullRomCurve3(pts),24,r,6,false));
  for(let i=0;i<26;i++){ const a=lerp(1.05,TAU-1.05,i/25), pts=[];   // around the sides and back (the face is +x)
    for(let k=0;k<8;k++){ const y=12-k*4.1, r=19.6+k*.75+Math.sin(k*1.25+i*.9)*1.6, aa=a+Math.sin(k*1.1+i*.7)*.07; pts.push(new T3.Vector3(Math.cos(aa)*r*.98,y,Math.sin(aa)*r*.96)); }
    lock(pts,2.3); }
  const merged=mergeGeos(geos); geos.forEach(g=>g.dispose()); SHARED_GEO.add(merged); return WAVY_HAIR=merged; }
// merge non-indexed copies of simple geometries into one (one draw call)
function mergeGeos(list){ const parts=list.map(g=>g.index?g.toNonIndexed():g), n=parts.reduce((t,g)=>t+g.attributes.position.count,0), pos=new Float32Array(n*3), nor=new Float32Array(n*3); let o=0;
  for(const g of parts){ pos.set(g.attributes.position.array,o*3); nor.set(g.attributes.normal.array,o*3); o+=g.attributes.position.count; if(g!==list[parts.indexOf(g)]) g.dispose(); }
  const m=new T3.BufferGeometry(); m.setAttribute('position',new T3.BufferAttribute(pos,3)); m.setAttribute('normal',new T3.BufferAttribute(nor,3)); return m; }
function skinTex(){ if(texCache.humanSkin) return texCache.humanSkin; const c=mkCanvas(128,128),g=c.getContext('2d'); g.fillStyle='#ffffff'; /* neutral pore detail: the material colour gives the skin tone */ g.fillRect(0,0,128,128);
  for(let i=0;i<500;i++){ g.fillStyle=`rgba(${rand()<.5?'160,90,70':'255,220,200'},${rr(.04,.1).toFixed(3)})`; g.beginPath(); g.arc(rand()*128,rand()*128,rr(.6,2.2),0,TAU); g.fill(); }
  const t=canvasTex(c); t.wrapS=t.wrapT=T3.RepeatWrapping; return texCache.humanSkin=t; }
function plaidTex(base){ const key='plaid|'+base; if(texCache[key]) return texCache[key]; const c=mkCanvas(128,128),g=c.getContext('2d'); g.fillStyle=base; g.fillRect(0,0,128,128);
  const dk=mix(base,'#000000',.55); g.fillStyle=dk+'99'; for(let x=0;x<128;x+=32){ g.fillRect(x,0,14,128); g.fillRect(0,x,128,14); }
  g.fillStyle='rgba(255,255,255,.35)'; for(let x=22;x<128;x+=32){ g.fillRect(x,0,2,128); g.fillRect(0,x,128,2); }
  const t=canvasTex(c); t.wrapS=t.wrapT=T3.RepeatWrapping; t.repeat.set(3,3); return texCache[key]=t; }
function denimTex(){ if(texCache.denim) return texCache.denim; const c=mkCanvas(128,128),g=c.getContext('2d'); g.fillStyle='#3a5788'; g.fillRect(0,0,128,128);
  g.strokeStyle='rgba(255,255,255,.08)'; for(let i=-128;i<128;i+=3){ g.beginPath(); g.moveTo(i,0); g.lineTo(i+128,128); g.stroke(); }
  for(let i=0;i<300;i++){ g.fillStyle=`rgba(${rand()<.5?'20,30,60':'200,215,240'},.08)`; g.fillRect(rand()*128,rand()*128,2,1); }
  const t=canvasTex(c); t.wrapS=t.wrapT=T3.RepeatWrapping; t.repeat.set(2,4); return texCache.denim=t; }
const MAN_TORSO=(()=>{ const pr=[[0,-1],[15,0],[16.5,10],[17,24],[18.5,40],[20,56],[19,66],[14,73],[7,78],[0,79]].map(([r,y])=>new T3.Vector2(r,y)); const g=new T3.LatheGeometry(pr,LOW?18:28); SHARED_GEO.add(g); return g; })();
class ManModel{
  constructor(outfit){
    const O=typeof outfit==='object'&&outfit?outfit:{shirt:outfit||'#2f6db5'}, shirt=O.shirt;
    // cowboy: plaid shirt, red bandana, denim, leather belt with a gold buckle, tall boots, felt hat; realistic face, wavy hair
    const skin=new CartoonMat({map:skinTex(),color:0xe2a47e,roughness:.58,envMapIntensity:.4}), shirtM=stdMat('#ffffff',{map:plaidTex(shirt),roughness:.85}),
      jeans=stdMat(O.jeans||'#ffffff',{map:denimTex(),roughness:.9}), shoe=stdMat('#5a3620',{roughness:.5}), boot=stdMat(O.boot||'#6b4226',{roughness:.45}),
      hair=new CartoonMat({color:0x5a3a22,roughness:.42,envMapIntensity:.8}), dark=stdMat('#111111'), white=stdMat('#f3eee6',{roughness:.25}), lip=stdMat('#b0675c',{roughness:.45}),
      hatM=stdMat(O.hat||'#8a5a32',{roughness:.75,side:T3.DoubleSide}), bandM=stdMat('#3a2417',{roughness:.6}), gold=stdMat('#d9ab3a',{metalness:.85,roughness:.28}), red=stdMat(O.bandana||'#b8231f',{roughness:.7}),
      iris=new CartoonMat({map:realIrisTex('#a07a3a','#4b3420'),roughness:.06,envMapIntensity:1.2}), stub=new T3.MeshStandardMaterial({color:0x3a2a20,transparent:true,opacity:.18,depthWrite:false,roughness:1}),
      blushM=new T3.MeshBasicMaterial({visible:false});
    Object.entries({skin,shirt:shirtM,jeans,shoe,boot,hair,dark,white,iris,lip,hat:hatM,band:bandM,gold,red,stubble:stub,blush:blushM}).forEach(([k,m])=>{ m.name=k; });
    const root=this.root=new T3.Group(), pel=this.pelvis=new T3.Group(); root.add(pel);
    const hipM=mesh(G.sph,jeans); hipM.scale.set(18,15,23); pel.add(hipM);
    const belt=mesh(new T3.TorusGeometry(18.5,2.6,8,30),bandM); belt.rotation.x=Math.PI/2; belt.scale.set(1,1.27,1); belt.position.y=9; pel.add(belt);
    const buckle=mesh(G.box,gold); buckle.scale.set(2,7,9); buckle.position.set(18.6,9,0); pel.add(buckle);
    this.legs=[-1,1].map(sd=>{ const hip=new T3.Group(); hip.position.set(0,-4,sd*11); pel.add(hip);
      hip.add(mesh(limbGeo(8.5,40),jeans));
      const knee=new T3.Group(); knee.position.y=-42; hip.add(knee); knee.add(mesh(limbGeo(7.5,38),jeans));
      const shaft=mesh(limbGeo(8.6,16),boot); shaft.position.y=-22; knee.add(shaft);   // tall boot shaft
      const ankle=new T3.Group(); ankle.position.y=-42; knee.add(ankle);
      const ft=mesh(G.sph,boot); ft.scale.set(14,6.5,8); ft.position.set(5,-2,0); ankle.add(ft);
      const toe=mesh(G.cone,boot); toe.scale.set(5,9,5); toe.rotation.z=-Math.PI/2; toe.position.set(17,-3,0); ankle.add(toe);   // pointed toe
      const heel=mesh(G.box,shoe); heel.scale.set(5,5,6.5); heel.position.set(-5,-6,0); ankle.add(heel); return {hip,knee,ankle}; });
    const sp=this.spine=new T3.Group(); pel.add(sp);
    const chest=this.chest=mesh(MAN_TORSO,shirtM); chest.scale.set(.92,1,1.3); this.chestBase=chest.scale.clone(); sp.add(chest);
    // red bandana knotted at the throat
    const bd=mesh(new T3.TorusGeometry(8.4,2.4,8,24),red); bd.rotation.x=Math.PI/2; bd.position.y=76; bd.scale.set(1,1.15,1); sp.add(bd);
    const tri=mesh(G.cone,red); tri.scale.set(5,10,1.6); tri.rotation.set(0,Math.PI/2,Math.PI); tri.position.set(9.5,69,0); sp.add(tri);
    const neck=mesh(limbGeo(6.5,8),skin); neck.position.y=84; sp.add(neck);
    const head=this.head=new T3.Group(); head.position.y=98; head.scale.setScalar(1.12); sp.add(head);
    const add=(m,x,y,z,sx,sy,sz)=>{ m.position.set(x,y,z); m.scale.set(sx,sy,sz); head.add(m); return m; };
    // head: egg-shaped skull, defined jaw and cheekbones, a little stubble
    add(mesh(G.sph,skin),0,1,0,19.5,22,18.4); add(mesh(G.sph,skin),3.5,-9,0,15.5,12.5,15.2);
    add(mesh(G.sph,stub,false),4.2,-10.5,0,15.9,12.6,15.6);
    for(const sd of [-1,1]){ add(mesh(G.sph,skin),10.5,-1.8,sd*9.6,5.2,4.2,5);
      // eyes: white, hazel iris with pupil, upper lid and lashes, lower lid
      add(mesh(G.sph,white,false),15.4,3,sd*7.2,2.7,2.7,2.7);
      const ir=add(mesh(HUMAN_IRIS,iris,false),15.4,3,sd*7.2,2.72,2.72,2.72); ir.rotation.y=-sd*.12;
      const pu=add(mesh(HUMAN_PUPIL,dark,false),15.4,3,sd*7.2,2.75,2.75,2.75); pu.rotation.y=-sd*.12;
      add(mesh(G.sphLow,white,false),18,3.9,sd*6.4,.35,.35,.35);
      const ul=add(mesh(G.hemi,skin,false),15.3,4.3,sd*7.2,3.0,1.3,3.05); ul.rotation.z=-.35;
      const lash=add(mesh(new T3.TorusGeometry(2.6,.28,5,14,Math.PI),dark,false),16.4,4.5,sd*7.2,1,.9,1); lash.rotation.set(0,Math.PI/2,.15);
      const ll=add(mesh(G.hemi,skin,false),15.2,1.2,sd*7.2,2.8,.8,2.9); ll.rotation.z=Math.PI+.4;
      // brows: tapered, slightly raised outer ends
      const b1=add(mesh(G.sph,hair,false),17.6,7.8,sd*5.4,1.1,.9,2.6); b1.rotation.x=sd*.1; const b2=add(mesh(G.sph,hair,false),16.8,8.3,sd*9.3,1,.8,2.4); b2.rotation.x=-sd*.3;
      add(mesh(G.sph,skin),-1,-.5,sd*18.6,3.4,6.6,3);   // ears
      add(mesh(G.disc,blushM,false),0,0,0,1,1,1); }
    // nose: bridge, tip and nostril wings
    const br=add(mesh(G.sph,skin),18.4,-.5,0,2.4,7.2,2.6); br.rotation.z=-.18;
    add(mesh(G.sph,skin),20.3,-4.8,0,3,2.8,3.2); for(const sd of [-1,1]) add(mesh(G.sph,skin),18.9,-5.6,sd*2.6,2.1,1.8,2);
    // lips with a warm, slight smile
    add(mesh(G.sph,lip,false),18.6,-10.4,0,1.9,1.1,5.2); add(mesh(G.sph,lip,false),18.3,-12.2,0,2.1,1.4,4.6);
    for(const sd of [-1,1]){ const c=add(mesh(G.sph,lip,false),17.6,-10.6,sd*5.1,1,.8,1.4); c.rotation.x=sd*.6; }
    // wavy hair falling from under the hat at the sides and back, and a few strands on the forehead
    add(mesh(wavyHair(),hair),0,0,0,1,1,1);
    // cowboy hat: upturned brim, pinched crown, leather band
    const hat=new T3.Group(); hat.position.set(-2,16.5,0); hat.rotation.z=.14; hat.scale.setScalar(.86); head.add(hat);   // tipped back so the face shows
    const brim=mesh(HAT_BRIM,hatM); brim.scale.set(1.16,1,1); hat.add(brim);
    const crown=mesh(HAT_CROWN,hatM); crown.scale.set(1.28,1,1.18); hat.add(crown);
    const band=mesh(new T3.TorusGeometry(17.6,1.5,6,32),bandM); band.rotation.x=Math.PI/2; band.scale.set(1.04,.98,1); band.position.y=3.2; hat.add(band);
    this.hat=hat;
    this.arms=[-1,1].map(sd=>{ const sh=new T3.Group(); sh.position.set(0,62,sd*25); sp.add(sh);
      const ball=mesh(G.sph,shirtM); ball.scale.setScalar(9); sh.add(ball); sh.add(mesh(limbGeo(7,28),shirtM));
      const el=new T3.Group(); el.position.y=-30; sh.add(el); el.add(mesh(limbGeo(5.8,26),skin));
      const hand=new T3.Group(); hand.position.y=-30; el.add(hand); const hm=mesh(G.sph,skin); hm.scale.set(6.5,7.5,5); hand.add(hm); return {sh,el,hand,sd}; });
    root.traverse(o=>{ if(o.isMesh){ o.receiveShadow=true; } }); inkify(root,1.8); polish(root,1.1,.5); root.scale.setScalar(.72); scene.add(root);
    this.kneel=0; this.walkK=0; this.ang=null;
  }
  update(m,dt){ const [X,Z]=g2w(m.x,m.y); this.root.position.set(X,0,Z);
    if(this.ang===null) this.ang=m.angle; this.ang+=angDiff(m.angle,this.ang)*Math.min(1,dt*6); this.root.rotation.y=-this.ang;   // eased turning
    const k=this.kneel=lerp(this.kneel,m.phase==='give'?1:0,Math.min(1,dt*3)), ks=smooth(0,1,k);
    this.walkK=lerp(this.walkK,m.walking?1:0,Math.min(1,dt*5)); const wk=this.walkK*(1-ks), ph=m.ph, give=m.give;
    // weight shift: hips dip as the feet plant and rise as the legs pass, sway and twist with each step
    this.pelvis.position.y=lerp(96-2.2*wk+Math.cos(ph*2)*2.2*wk,44,ks);
    this.pelvis.rotation.set(Math.sin(ph)*.05*wk,Math.sin(ph)*.12*wk,0);
    this.legs.forEach((L,i)=>{ const f=ph+(i?Math.PI:0), swing=Math.sin(f)*.42*wk, lift=Math.max(0,Math.cos(f)); const bend=-(.06+lift*lift*.85)*wk;
      L.hip.rotation.z=lerp(swing,1.35,ks); L.knee.rotation.z=lerp(bend,-2.35,ks); L.ankle.rotation.z=lerp(-(swing+bend)*.85,.9,ks); });
    const breathe=Math.sin(time*2.1)*.012; const cb=this.chestBase; this.chest.scale.set(cb.x*(1+breathe),cb.y*(1+breathe*.6),cb.z*(1+breathe));
    this.spine.rotation.set(-Math.sin(ph)*.04*wk,-Math.sin(ph)*.2*wk,-ks*.38-give*.18-.05*wk);
    this.head.rotation.set(Math.sin(ph)*.03*wk,Math.sin(time*.8)*.08+Math.sin(ph)*.09*wk,-ks*.2+.06+Math.sin(ph*2)*.025*wk);
    this.arms.forEach(A=>{ const legSwing=Math.sin(ph+(A.sd>0?Math.PI:0)), armSwing=-legSwing*.45*wk, elbow=.2+Math.max(0,-legSwing)*.45*wk;
      A.sh.rotation.x=-A.sd*(.1+.04*wk);
      if(A.sd===1){ const g=Math.max(give,ks*.3); A.sh.rotation.z=lerp(armSwing,1.2,smooth(0,1,g)); A.el.rotation.z=lerp(elbow,.35,smooth(0,1,give)); }
      else { A.sh.rotation.z=lerp(armSwing,.55,ks); A.el.rotation.z=lerp(elbow,.6,ks); } }); }
  dispose(){ disposeTree(this.root); scene.remove(this.root); }
}

// ================= golden retriever =================
const DOG_GOLDEN={fur:['#d39a4c','#ebbf7e','#a8742e'],light:['#ecc890','#f8e2bc','#c99a58'],ear:['#c98b3e','#e2ad62','#9a6a2c']};
class DogModel{
  constructor(P=DOG_GOLDEN,scale=.78){
    const fur=furMat(...P.fur), light=furMat(...P.light), nose=new CartoonMat({color:0x1a1210,roughness:.45,map:noseTex()}),
      eye=new CartoonMat({color:0x2a160a}), hl=new T3.MeshBasicMaterial({color:0xffffff}), tongue=stdMat('#f07a8c');
    const earFur=furry(new CartoonMat({map:furTexture(P.ear[0],P.ear[1],P.ear[2],'solid','rgba(0,0,0,0)','#000'),roughness:.85}),1.6);   // feathered ears
    this.mats=[fur,light,nose,eye,hl,tongue,earFur]; Object.entries({fur,light,nose,eye,hl,tongue,earFur}).forEach(([k,m])=>{ m.name=k; });
    const root=this.root=new T3.Group(), body=this.body=new T3.Group(); root.add(body); body.position.y=40;
    const add=(m,x,y,z,sx,sy,sz,p=body)=>{ m.position.set(x,y,z); m.scale.set(sx,sy,sz); p.add(m); return m; };
    // one continuous body (rump -> ribs -> deep chest) and neck instead of stacked balls; cream chest and belly
    const V=(x,y,z=0)=>new T3.Vector3(x,y,z), torso=new Tube(16,LOW?12:20,fur,true), nk=new Tube(8,LOW?10:16,fur,true); body.add(torso.mesh,nk.mesh);
    tubeAlong(torso,[V(-42,3),V(-32,4),V(-16,2),V(2,0),V(18,0),V(28,4),V(34,9)],[[7,6],[14.5,13],[15,13.5],[14.5,12.5],[17,14],[15.5,12.5],[10,9]]);
    tubeAlong(nk,[V(26,4),V(32,12),V(37,20),V(41,26)],[[12,10.5],[10.5,9.5],[9,8.5],[8,7.5]]);
    add(mesh(G.sph,light),23,-3,0,14,14,11.5); add(mesh(G.sphX,light),0,-9,0,26,5.5,10);
    const head=this.head=new T3.Group(); head.position.set(42,27,0); head.scale.setScalar(1.32); body.add(head);   // puppy proportions: big head
    // head: rounded skull, defined stop, tapered muzzle, real dog-nose shape, mouth line
    add(mesh(G.sph,fur),0,0,0,12.5,12,11.5,head); add(mesh(G.sph,fur),4,6,0,9,6,8.5,head);
    add(mesh(G.sphX,light),13,-4,0,11.5,6.8,7.4,head); add(mesh(G.sph,light),9,-6.5,0,7,5,7.2,head);
    { const n=add(mesh(NOSE_GEO,nose,false),22.6,-1.6,0,2.6,3.4,4.4,head); n.rotation.z=.25; }
    for(const sd of [-1,1]){ const lip=add(mesh(G.cylU,nose,false),17,-8.2,sd*3.4,.45,7,.45,head); lip.rotation.set(sd*1.2,0,1.45); }
    for(const sd of [-1,1]){ const b=add(mesh(G.sph,light,false),8.4,7.4,sd*6.2,2.6,1.2,2.4,head); b.rotation.x=sd*.3; }   // light brows: a soft, cute expression
    const scl=stdMat('#ffffff',{roughness:.3}); scl.name='sclera'; this.mats.push(scl);
    this.ears=[-1,1].map(sd=>{ add(mesh(G.sph,scl,false),7.4,4.2,sd*7,2.8,3.1,2.6,head); add(mesh(G.sph,eye,false),8.7,4.1,sd*7.1,2.8,3.1,2.5,head); add(mesh(G.sphLow,hl,false),10.3,5.1,sd*6.6,.75,.75,.75,head); add(mesh(G.sphLow,hl,false),10.4,3.3,sd*7.6,.35,.35,.35,head);
      const pivot=new T3.Group(); pivot.position.set(-1,6,sd*11); head.add(pivot); add(mesh(G.sph,earFur),0,-9,sd*1.6,6.4,13.5,2.8,pivot); return {pivot,sd}; });
    this.tongue=add(mesh(G.sph,tongue,false),16,-11,0,4.5,1.2,3.4,head);
    this.legs=[[22,-6,9],[22,-6,-9],[-24,-4,9],[-24,-4,-9]].map(([x,y,z],i)=>{ const g=new T3.Group(); g.position.set(x,y,z); body.add(g);
      g.add(mesh(limbGeo(5,16),i<2?light:fur));
      const kn=new T3.Group(); kn.position.y=-18; g.add(kn); kn.add(mesh(limbGeo(3.9,14),light));
      const pw=mesh(G.sph,light); pw.scale.set(5.5,3,4.5); pw.position.set(1.5,-17,0); kn.add(pw); return {g,kn}; });
    this.tail=new Tube(9,LOW?6:9,fur); body.add(this.tail.mesh);
    root.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); inkify(root,1.7); polish(root,1.5,.7); root.scale.setScalar(scale); scene.add(root);   // small, about knee-high to the owner
    this.sitv=0; this.mv=0; this.ang=null; this.look=0; this.wag=6; this.wagT=0;
  }
  update(d,dt){ const [X,Z]=g2w(d.x,d.y); this.root.position.set(X,0,Z);
    if(this.ang===null) this.ang=d.angle; this.ang+=angDiff(d.angle,this.ang)*Math.min(1,dt*8); this.root.rotation.y=-this.ang;
    const sit=this.sitv=lerp(this.sitv,d.sit,Math.min(1,dt*4)), mv=this.mv=lerp(this.mv,d.moving,Math.min(1,dt*6)), ph=d.ph, sw=Math.sin(ph)*.55*mv;
    // trot: diagonal leg pairs, springy body bob and rock, head counter-bob, floppy ears
    this.body.position.y=40-sit*9+Math.cos(ph*2)*1.6*mv; this.body.rotation.z=sit*.5+Math.sin(ph*2)*.035*mv; this.body.rotation.x=Math.sin(ph)*.03*mv;
    this.legs.forEach((L,i)=>{ const front=i<2, s=(i===0||i===3)?1:-1, lift=Math.max(0,Math.sin(ph*s+(front?.4:-.4)))*mv;
      L.g.rotation.z=front?(sw*s-sit*.5):(sw*-s+sit*1.3); L.kn.rotation.z=front?lift*lift*.7:-lift*lift*.8-sit*1.6; });
    this.look=lerp(this.look,d.look||0,Math.min(1,dt*5));
    this.head.position.y=27+Math.sin(ph*2+1.2)*1.2*mv; this.head.rotation.z=sit*-.35+Math.sin(time*5)*.025-Math.cos(ph*2)*.04*mv; this.head.rotation.y=this.look;
    for(const e of this.ears){ e.pivot.rotation.x=e.sd*(.22+.18*mv*(.5+.5*Math.sin(ph*2+.8))+Math.sin(time*3+e.sd)*.03); e.pivot.rotation.z=Math.sin(ph*2+.5)*.12*mv; }
    this.tongue.visible=d.pant; this.tongue.scale.y=1.2+Math.sin(time*14)*.3;
    this.wag=lerp(this.wag,d.wag,Math.min(1,dt*3)); this.wagT+=dt*this.wag;
    const pts=[],radii=[]; for(let i=0;i<9;i++){ const k=i/8; pts.push({x:-38-k*30,y:6+k*16-k*k*8,z:Math.sin(this.wagT-k*1.6)*k*14*clamp(this.wag/12,.4,1)}); radii.push(lerp(3.4,2.2,k)*(1+Math.sin(k*Math.PI)*.6)); }
    this.tail.update(pts,radii); }
  dispose(){ disposeTree(this.root); scene.remove(this.root); this.mats.forEach(m=>m.dispose()); }
}

// ================= eagle =================
function featherTex(dark,light){ const key='feather|'+dark+light; if(texCache[key]) return texCache[key];
  const c=mkCanvas(256,128),g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,128); gr.addColorStop(0,light); gr.addColorStop(.55,light); gr.addColorStop(.56,dark); gr.addColorStop(1,dark);
  g.fillStyle=gr; g.beginPath(); g.moveTo(0,0); g.lineTo(256,10); for(let x=256;x>=0;x-=21){ g.lineTo(x,128-(x/256)*30); g.lineTo(x-10,100-(x/256)*30); } g.lineTo(0,90); g.closePath(); g.fill();
  g.strokeStyle='rgba(0,0,0,.25)'; g.lineWidth=1.5; for(let x=10;x<256;x+=21){ g.beginPath(); g.moveTo(x,10); g.lineTo(x-6,120-(x/256)*30); g.stroke(); }
  const t=canvasTex(c); texCache[key]=t; return t; }
// one flight feather (vane, shaft and barbs), base -> tip along the texture's x
function quillTex(base,tip){ const key='quill|'+base+tip; if(texCache[key]) return texCache[key];
  const c=mkCanvas(128,32),g=c.getContext('2d'),gr=g.createLinearGradient(0,0,128,0); gr.addColorStop(0,base); gr.addColorStop(.55,mix(base,tip,.35)); gr.addColorStop(1,tip);
  g.fillStyle=gr; g.beginPath(); g.moveTo(0,16); g.quadraticCurveTo(26,2,92,3); g.quadraticCurveTo(124,6,128,16); g.quadraticCurveTo(124,26,92,29); g.quadraticCurveTo(26,30,0,16); g.fill();
  g.globalCompositeOperation='source-atop'; g.lineWidth=1;
  for(let x=4;x<128;x+=4){ g.strokeStyle=`rgba(0,0,0,${(.08+rand()*.12).toFixed(2)})`; g.beginPath(); g.moveTo(x,16); g.lineTo(x+8,1); g.moveTo(x,16); g.lineTo(x+8,31); g.stroke(); }
  g.strokeStyle='rgba(255,248,230,.55)'; g.lineWidth=1.3; g.beginPath(); g.moveTo(0,16); g.lineTo(120,16); g.stroke();
  const t=canvasTex(c); texCache[key]=t; return t; }
const QUILL_GEO=new T3.PlaneGeometry(1,1).rotateX(-Math.PI/2).translate(.5,0,0); SHARED_GEO.add(QUILL_GEO);
// eagle flight feather: subdivided and gently curved (droops toward the tip, soft S-wave, slight cup across the vane)
const QUILL_CURVE=(()=>{ const g=new T3.PlaneGeometry(1,1,10,2).rotateX(-Math.PI/2).translate(.5,0,0), P=g.attributes.position;
  for(let i=0;i<P.count;i++){ const x=P.getX(i), z=P.getZ(i); P.setY(i,-1.8*x*x+.55*Math.sin(x*Math.PI*1.6)-.5*z*z); }
  g.computeVertexNormals(); SHARED_GEO.add(g); return g; })();
// hooked raptor beak, side profile extruded
const BEAK_GEO=(()=>{ const sh=new T3.Shape(); sh.moveTo(0,1.7); sh.bezierCurveTo(3.5,2.6,7.4,2,8.8,-.2); sh.bezierCurveTo(9.4,-1.3,9,-2.6,8.2,-2.9);
  sh.bezierCurveTo(8.3,-1.6,7.4,-.9,6,-.8); sh.bezierCurveTo(4,-.9,1.8,-1.4,0,-1.5); sh.lineTo(0,1.7);
  const g=new T3.ExtrudeGeometry(sh,{depth:3,bevelEnabled:true,bevelThickness:.5,bevelSize:.45,bevelSegments:3,curveSegments:12}); g.translate(0,0,-1.5); g.computeVertexNormals(); return g; })();
SHARED_GEO.add(BEAK_GEO);
// ===== majestic bald eagle: white head with a stern brow, golden eyes, hooked beak, layered flight feathers with
// spread "finger" primaries, fanned white tail. Same size and the same wing / wrist / talon joints as before =====
class EagleModel{
  constructor(){
    const brown=furry(stdMat('#4a2f1b',{roughness:.78})), white=furry(stdMat('#f7f4ee',{roughness:.72}),1.1), yellow=stdMat('#f0b521',{roughness:.35}),
      dark=stdMat('#15100c',{roughness:.3}), gold=new CartoonMat({color:0xe6b422,roughness:.08,envMapIntensity:1.2}), beakM=new CartoonMat({color:0xf2b62a,roughness:.3}),
      wing=new CartoonMat({map:featherTex('#2e1c10','#5c3c22'),side:T3.DoubleSide,alphaTest:.4,roughness:.8}),
      q=(bs,tp)=>new CartoonMat({map:quillTex(bs,tp),side:T3.DoubleSide,alphaTest:.35,roughness:.75}),
      secM=q('#4a3019','#1e130b'), priM=q('#3d2715','#0d0907'), tailM=q('#f1ece2','#ffffff');
    this.mats=[brown,white,yellow,dark,gold,beakM,wing,secM,priM,tailM]; Object.entries({brown,white,yellow,dark,gold,beak:beakM,wing,secondary:secM,primary:priM,tail:tailM}).forEach(([k,m])=>{ m.name=k; });
    const root=this.root=new T3.Group(), body=this.body=new T3.Group(); root.add(body);
    const add=(m,x,y,z,sx,sy,sz,p=body)=>{ m.position.set(x,y,z); m.scale.set(sx,sy,sz); p.add(m); return m; };
    const feathers=this.feathers=[]; const quill=(par,mat,x,y,z,len,wid,ang)=>{ const m=new T3.Mesh(QUILL_CURVE,mat); feathers.push({m,k:feathers.length}); m.position.set(x,y,z); m.rotation.y=ang; m.scale.set(len,1,wid); m.castShadow=true; par.add(m); return m; };
    // body: deep chest tapering to the tail, darker back
    add(mesh(G.sphX,brown),0,0,0,21,9,10); add(mesh(G.sphX,brown),6,-1.2,0,12,8.2,9.4);
    // white head and neck ruff, stern brow ridge, golden eyes, hooked beak with cere
    add(mesh(G.sph,white),17,2.6,0,8,8.4,8.6); add(mesh(G.sph,white),23.5,4,0,8.6,7.4,7.2);
    for(const sd of [-1,1]){
      add(mesh(G.sph,gold,false),27.6,5.4,sd*4.3,1.75,1.75,1.3); add(mesh(G.sph,dark,false),28.7,5.5,sd*4.55,.75,.85,.55);
      add(mesh(G.sphLow,white,false),28.4,7.1,sd*4.2,3.2,1.15,2.3).rotation.z=-.28;   // brow ridge: the eagle's fierce look
    }
    add(mesh(G.sph,yellow),29.2,4.3,0,2.4,1.8,2.1);
    add(mesh(BEAK_GEO,beakM),29.6,3.2,0,1,1,1);
    // tail: a fan of white feathers
    for(let k=0;k<7;k++) quill(body,tailM,-15,.4+k*.05,(k-3)*1.6,20,6.2,Math.PI+(k-3)*.13);
    // wings: shoulder group (g) and wrist group (og) keep the old joints so the flight animation is unchanged
    const wgeo=new T3.PlaneGeometry(1,1).rotateX(-Math.PI/2).translate(0,0,.5);
    this.wings=[-1,1].map(sd=>{ const g=new T3.Group(); g.position.set(4,4,sd*7); g.scale.set(1.1,1,1.18); body.add(g);
      const inner=new T3.Mesh(wgeo,wing); inner.scale.set(17,1,sd*38); inner.position.set(1.5,.25,-sd*4); g.add(inner);   // reaches into the body and past the wrist
      add(mesh(G.sph,brown),1,-.4,0,9,3.4,8,g);   // shoulder: feathered joint, no gap when the wing lifts
      for(let i=0;i<8;i++) quill(g,secM,-5.5,(i%2)*.12,sd*(1.5+i*3.7),13.5-i*.25,5.6,Math.PI+sd*(.06+i*.025));   // secondaries along the trailing edge
      const og=new T3.Group(); og.position.z=sd*30; g.add(og);
      const outer=new T3.Mesh(wgeo,wing); outer.scale.set(14,1,sd*22); outer.position.set(-.5,.3,-sd*7); og.add(outer);   // overlaps the inner wing at the wrist
      for(let i=0;i<6;i++){ const th=i*.16; quill(og,priM,3-i*1.6,(i%2)*.14,sd*(3+i*1.4),30-i*2.1,5,-sd*(Math.PI/2+th)); }   // spread primaries: the "fingers"
      return {g,og,sd}; });
    // legs: feathered trousers, yellow scaled feet, black talons
    this.talons=new T3.Group(); this.talons.position.set(4,-9,0); body.add(this.talons);
    for(const sd of [-1,1]){ add(mesh(G.sph,brown),0,1,sd*4,3.2,4.2,2.8,this.talons); add(mesh(G.cylU,yellow),0,-4,sd*4,1.4,8,1.4,this.talons);
      for(let k=0;k<3;k++){ const t=add(mesh(G.cone,dark),2-k*2,-9,sd*4+(k-1)*1.5,.7,3,.7,this.talons); t.rotation.z=Math.PI*.8; } }
    root.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); inkify(root,1.7); polish(root,.8,.55); root.scale.setScalar(1.7); scene.add(root);
  }
  update(e,dt){ const [X,Z]=g2w(e.x,e.y); this.root.position.set(X,e.h,Z); this.root.rotation.set(0,-e.angle,0); this.body.rotation.z=e.pitch||0; this.body.rotation.x=e.bank||0;
    const f=e.flapAmp*Math.sin(e.t*e.flapSpd); this.wings.forEach(w=>{ w.g.rotation.x=w.sd*(f*.7+.05); w.og.rotation.x=w.sd*f*.5; });
    this.talons.rotation.z=e.phase==='dive'?-.9:0;
    // a soft wave travels along the feathers, stronger on the downstroke
    const amp=.07+.08*Math.abs(f); for(const q of this.feathers) q.m.rotation.z=Math.sin(e.t*e.flapSpd*.8-q.k*.55)*amp; }
  dispose(){ disposeTree(this.root); scene.remove(this.root); this.mats.forEach(m=>m.dispose()); }
}

let BAKING=false;   // kept for the shared model code paths (no baking any more)
function makeCat(B,L,o,rig,cam){ const sp=spriteFor(rig==='lion'?['lion']:[rig+'-'+settings.colour,rig]); if(sp) return new CatSprite(sp,{cam,lion:rig==='lion'});
  return new CatModel(B,L,o); }
function makeRat(type){ const sp=spriteFor(['rat-'+type,'rat']); if(sp) return new RatSprite(sp,type,sp.id==='rat'); return new RatModel(type); }
function makeMan(outfit){ const sp=spriteFor(['man']); if(sp) return new ManSprite(sp); return new ManModel(outfit); }
function makeDog(){ const sp=spriteFor(['dog']); if(sp) return new DogSprite(sp); return new DogModel(); }
function makeEagle(){ const sp=spriteFor(['eagle']); if(sp) return new EagleSprite(sp); return new EagleModel(); }
function onSpritesLoaded(){ rebuildCatModel(); rebuildPreview();
  for(const k in ratPool){ for(const m of ratPool[k]) if(!(m instanceof RatSprite)){ m.g.removeFromParent(); if(m.tail&&m.tail.mesh) m.tail.mesh.removeFromParent(); } ratPool[k]=ratPool[k].filter(m=>m instanceof RatSprite); } }

// ================= 2D CHARACTER SPRITES (painted / semi-photorealistic art) =================
// Characters can be drawn from transparent PNG/WebP sprite sheets instead of 3D models (see docs/sprite-art-spec.md).
// public/sprites/index.json lists which characters have art; each lives in public/sprites/<id>/ with a sprite.json
// manifest and one sheet per animation (rows = directions, columns = frames). A sprite is a camera-facing billboard
// anchored at the feet: the ¾-view direction row is picked from the character's heading relative to the camera, the
// frame from the animation clock, and a soft contact shadow sits on the ground. Sheets load lazily on first use.
// Characters without art keep their 3D model, so art can be added one character at a time.
const SPRITE_OFF=location.hash==='#nosprites', SPRITE_DEBUG=location.hash==='#sprite-debug';
const spriteMan={}, spriteTex={}, SPRITE_TINT=new T3.Color(1,1,1);
let spriteIndex=null;
function loadSpriteIndex(){ if(SPRITE_OFF||spriteIndex) return;
  spriteIndex={};
  if(SPRITE_DEBUG){ for(const id of DEBUG_SPRITE_IDS) spriteMan[id]=debugManifest(id); onSpritesLoaded(); return; }
  fetch(import.meta.env.BASE_URL+'sprites/index.json').then(r=>r.ok?r.json():null).then(ix=>{ if(!alive||!ix||!Array.isArray(ix.characters)||!ix.characters.length) return;
    return Promise.all(ix.characters.map(id=>fetch(import.meta.env.BASE_URL+'sprites/'+id+'/sprite.json').then(r=>r.ok?r.json():null).then(m=>{
      if(m&&m.animations&&m.frameWidth&&m.frameHeight){ m.id=id; m.base=import.meta.env.BASE_URL+'sprites/'+id+'/'; spriteMan[id]=m; }
      else console.warn('[sprites] '+id+'/sprite.json missing or invalid'); }).catch(()=>console.warn('[sprites] could not load '+id))))
      .then(()=>{ if(alive) onSpritesLoaded(); }); }).catch(e=>console.warn('[sprites] index failed',e&&e.stack||e));
}
const spriteFor=ids=>{ for(const id of ids) if(spriteMan[id]) return spriteMan[id]; return null; };
// one GPU texture per sheet; every character instance uses a clone (shared image, own frame offset)
function sheetTexture(man,anim){ const A=man.animations[anim], key=man.id+'/'+anim; let s=spriteTex[key];
  if(!s){ s=spriteTex[key]={tex:null};
    const done=t=>{ t.encoding=T3.sRGBEncoding; t.premultiplyAlpha=true; t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy()); t.needsUpdate=true; s.tex=t; };
    if(A.canvas) done(new T3.CanvasTexture(A.canvas)); else new T3.TextureLoader().load(man.base+A.file,done,undefined,()=>console.warn('[sprites] missing '+man.base+A.file)); }
  return s.tex; }
const SPRITE_FALLBACK={run:'walk',trot:'walk',walk:'idle',sit:'idle',eat:'idle',hiss:'idle',roar:'idle',roll:'sit',sleep:'sit',pounce:'run',
  kneel:'idle',give:'kneel',glide:'fly',dive:'glide',climb:'fly',fly:'idle'};
const SHADOW_TEX=(()=>{ const c=mkCanvas(128,128),g=c.getContext('2d'),gr=g.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0,'rgba(0,0,0,.55)'); gr.addColorStop(.55,'rgba(0,0,0,.28)'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=gr; g.fillRect(0,0,128,128); return canvasTex(c); })();
const SHADOW_GEO=new T3.PlaneGeometry(1,1).rotateX(-Math.PI/2); SHARED_GEO.add(SHADOW_GEO);
const _sq=new T3.Quaternion(), _sp=new T3.Vector3(), _cp=new T3.Vector3();

class SpriteChar{
  constructor(man,{scale=1,cam=null}={}){ this.man=man; this.cam=cam; this.k=scale; this.root=new T3.Group(); this.anim=null; this.t=0; this.texs={}; this.lastT=time;
    const h=man.height||60, w=h*man.frameWidth/man.frameHeight, [ax,ay]=man.anchor||[.5,.92];
    this.geo=new T3.PlaneGeometry(w,h).translate(-w*(ax-.5),-h*(.5-ay),0);
    this.mat=new T3.MeshBasicMaterial({transparent:true,premultipliedAlpha:true,alphaTest:.01,depthWrite:false,toneMapped:false});
    this.bb=new T3.Mesh(this.geo,this.mat); this.bb.visible=false; this.bb.renderOrder=2; this.root.add(this.bb);
    const [sw,sd]=man.shadow||[w*.62,w*.3]; this.shMat=new T3.MeshBasicMaterial({map:SHADOW_TEX,transparent:true,depthWrite:false,opacity:man.shadowOpacity??.75});
    this.shadow=new T3.Mesh(SHADOW_GEO,this.shMat); this.shadow.scale.set(sw,1,sd); this.shadow.position.y=.6; this.shadow.renderOrder=1; this.root.add(this.shadow);
    this.root.scale.setScalar(scale); }
  // pick an animation (with graceful fallbacks when a sheet wasn't drawn) and advance its clock
  play(name,rate,dt){ const A=this.man.animations; while(name&&!A[name]) name=SPRITE_FALLBACK[name]; if(!name) name=Object.keys(A)[0];
    if(name!==this.anim){ this.anim=name; this.t=0; } this.t+=dt*rate; }
  draw(heading){ const man=this.man, A=man.animations[this.anim], cam=this.cam||camera;
    let tex=this.texs[this.anim]; if(!tex){ const base=sheetTexture(man,this.anim); if(base){ tex=this.texs[this.anim]=base.clone(); tex.needsUpdate=true; } }
    this.bb.visible=!!tex; if(!tex) return;
    const frames=A.frames||1, fr=A.loop===false?Math.min(frames-1,Math.floor(this.t*(A.fps||10))):Math.floor(this.t*(A.fps||10))%frames;
    // view direction: 0=S (facing the camera), then clockwise on screen S,SE,E,NE,N,NW,W,SW
    this.root.getWorldPosition(_sp); cam.getWorldPosition(_cp); const camYaw=Math.atan2(_cp.z-_sp.z,_cp.x-_sp.x);
    let dir=((Math.round(-angDiff(heading,camYaw)/(Math.PI/4))%8)+8)%8, flip=false; const rows=man.mirror?5:(man.directions||8);
    if(man.mirror&&dir>4){ dir=8-dir; flip=true; } if(rows===1) dir=0;
    tex.repeat.set((flip?-1:1)/frames,1/rows); tex.offset.set((fr+(flip?1:0))/frames,1-(dir+1)/rows);
    if(this.mat.map!==tex){ this.mat.map=tex; this.mat.needsUpdate=true; }
    this.mat.color.copy(SPRITE_TINT);
    this.root.getWorldQuaternion(_sq).invert(); this.bb.quaternion.copy(_sq).multiply(cam.quaternion);   // face the camera exactly
  }
  tick(){ const dt=clamp(time-this.lastT,0,.1); this.lastT=time; return dt; }
  setVisible(v){ this.root.visible=v; }
  dispose(){ this.root.removeFromParent(); this.geo.dispose(); this.mat.dispose(); this.shMat.dispose(); for(const k in this.texs) this.texs[k].dispose(); }
}
// cat & lion (same interface as CatModel: .rig, update(c,ox,oz,K,dt))
class CatSprite extends SpriteChar{
  constructor(man,opt){ super(man,opt); this.rig=this.root; this.lion=!!opt.lion; }
  update(c,ox,oz,K=1,dt=1/60){ const D=catDims(c,K), Mi=c.spine?c.spine[1]:{x:c.x-Math.cos(c.angle)*D.seg,y:c.y-Math.sin(c.angle)*D.seg};
    this.root.position.set(Mi.x-ox,(c.air||0)*40*K,Mi.y-oz); this.root.scale.setScalar(this.k*K); this.shadow.position.y=.6-(c.air||0)*40*K/(this.k*K);
    const sp=Math.hypot(c.vx||0,c.vy||0); let a='idle', rate=1;
    if(c.pounce) a='pounce'; else if((c.rollP||0)>.3) a='roll'; else if((c.headDown||0)>.5) a='eat'; else if((c.still||0)>9) a='sleep'; else if((c.sit||0)>.5) a='sit';
    else if((c.anger||0)>.6&&sp<40) a=this.lion?'roar':'hiss'; else if(sp>200) { a='run'; rate=sp/380; } else if(sp>12){ a='walk'; rate=Math.max(.5,sp/120); }
    this.play(a,rate,dt); this.draw(c.angle); }
}
class RatSprite extends SpriteChar{
  constructor(man,type,shared){ super(man,{scale:shared?TYPES[type].size/20:1}); this.type=type; this.g=this.root; this.tail={mesh:new T3.Object3D()}; }
  attach(){ scene.add(this.g); this.g.visible=true; this.g.scale.setScalar(this.k); } detach(){ this.g.visible=false; }
  update(r){ const dt=this.tick(), [X,Z]=g2w(r.x,r.y), sp=Math.hypot(r.vx,r.vy), pop=(r.age||0)<.45?Math.max(.01,backOut((r.age||0)/.45)):1;
    this.g.position.set(X,0,Z); this.g.scale.setScalar(this.k*pop); this.play(sp>10?'run':'idle',sp>10?sp/100:1,dt); this.draw(r.angle+r.sniff); }
}
class DogSprite extends SpriteChar{
  constructor(man){ super(man); scene.add(this.root); this.ang=null; }
  update(d,dt){ const [X,Z]=g2w(d.x,d.y); this.root.position.set(X,0,Z); if(this.ang===null) this.ang=d.angle; this.ang+=angDiff(d.angle,this.ang)*Math.min(1,dt*8);
    this.play(d.sit?'sit':d.moving>.2?'trot':'idle',1,dt); this.draw(this.ang); }
}
class ManSprite extends SpriteChar{
  constructor(man){ super(man); scene.add(this.root); this.ang=null; this.facing=new T3.Group(); this.root.add(this.facing);
    const hand=(z)=>{ const o=new T3.Object3D(); o.position.set(22,58,z); this.facing.add(o); return o; }; this.arms=[{hand:hand(-14)},{hand:hand(14)}]; }
  update(m,dt){ const [X,Z]=g2w(m.x,m.y); this.root.position.set(X,0,Z); if(this.ang===null) this.ang=m.angle; this.ang+=angDiff(m.angle,this.ang)*Math.min(1,dt*6); this.facing.rotation.y=-this.ang;
    this.play(m.phase==='give'?(m.give>.3?'give':'kneel'):m.walking?'walk':'idle',1,dt); this.draw(this.ang); }
}
class EagleSprite extends SpriteChar{
  constructor(man){ super(man); scene.add(this.root); this.facing=new T3.Group(); this.root.add(this.facing); this.talons=new T3.Object3D(); this.talons.position.set(6,-14,0); this.facing.add(this.talons); }
  update(e,dt){ const [X,Z]=g2w(e.x,e.y); this.root.position.set(X,e.h,Z); this.facing.rotation.y=-e.angle;
    this.shadow.position.y=-e.h+.6; const s=clamp(1-e.h/700,.3,1); this.shadow.scale.set(s*(this.man.shadow?.[0]||40),1,s*(this.man.shadow?.[1]||20)); this.shMat.opacity=.6*s;
    this.play({in:'fly',circle:'glide',dive:'dive',out:'climb'}[e.phase]||'fly',1,dt); this.draw(e.angle); }
}

// debug art (#sprite-debug): labelled boxes per direction/frame so the engine can be checked before real art exists
const DEBUG_SPRITE_IDS=['cat-street','cat-persian','cat-siamese','cat-curl','cat-savannah','cat-fold','cat-ragdoll','cat-van','cat-sphynx','lion','rat','dog','man','eagle'];
function debugManifest(id){ const kind=id.split('-')[0], anims={cat:['idle','walk','run','sit','pounce','hiss','eat','roll','sleep'],lion:['idle','walk','run','pounce','roar'],rat:['idle','run'],
    dog:['idle','trot','sit'],man:['idle','walk','kneel','give'],eagle:['fly','glide','dive','climb']}[kind], size=128, frames=4, dirs=['S','SE','E','NE','N','NW','W','SW'];
  const hue={cat:30,lion:45,rat:0,dog:38,man:210,eagle:20}[kind], height={cat:62,lion:120,rat:22,dog:80,man:170,eagle:70}[kind], m={id,frameWidth:size,frameHeight:size,height,directions:8,anchor:[.5,.9],animations:{}};
  for(const a of anims){ const c=mkCanvas(size*frames,size*8), g=c.getContext('2d'); g.textAlign='center'; g.textBaseline='middle';
    for(let d=0;d<8;d++) for(let f=0;f<frames;f++){ const x=f*size, y=d*size; g.fillStyle=`hsla(${hue},55%,${45+f*6}%,.85)`; g.beginPath(); g.ellipse(x+size/2,y+size*.55,size*.36,size*.34,0,0,TAU); g.fill();
      const th=d*Math.PI/4; g.strokeStyle='#fff'; g.lineWidth=6; g.beginPath(); g.moveTo(x+size/2,y+size*.55); g.lineTo(x+size/2+Math.sin(th)*size*.3,y+size*.55+Math.cos(th)*size*.3); g.stroke();   // arrow = facing on screen
      g.fillStyle='#fff'; g.font='bold 20px sans-serif'; g.fillText(dirs[d],x+size/2,y+size*.32); g.font='13px sans-serif'; g.fillText(a+' '+f,x+size/2,y+size*.78); }
    m.animations[a]={canvas:c,frames,fps:6,loop:a!=='pounce'}; }
  return m; }

// ================= treats / cheese / catnip =================
function M_(color,o={}){ return new CartoonMat(Object.assign({color,roughness:.5},o)); }
function makeTreat(id){
  const g=new T3.Group(), add=(m,x,y,z,sx,sy,sz,rz=0)=>{ m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.rotation.z=rz; g.add(m); return m; };
  const bone=M_('#f3ead8',{roughness:.4}), meat=M_('#a0521f',{roughness:.4});
  if(id==='drumstick'){ add(mesh(G.sphX,meat),-3,6,0,12,8,8.5); add(mesh(G.cyl,bone),10,6,0,2.2,14,2.2,Math.PI/2); add(mesh(G.sph,bone),17,7.5,0,2.6,2.6,2.6); add(mesh(G.sph,bone),17,4.5,0,2.6,2.6,2.6); }
  else if(id==='fish'){ const f=M_('#c9d3dd',{metalness:.5,roughness:.25}); add(mesh(G.sphX,f),0,5,0,15,5,4.5); add(mesh(G.cone,f),-17,5,0,5,7,1.5,Math.PI/2); add(mesh(G.sphLow,M_('#111')),11,6.5,2.8,1.2,1.2,1.2); }
  else if(id==='steak'){ add(mesh(new T3.CylinderGeometry(1,1,1,9),M_('#f2e1d0')),0,3,0,15,6,11); add(mesh(new T3.CylinderGeometry(1,1,1,9),M_('#a8222c',{roughness:.35})),0,3.4,0,13,6.2,9.5); }
  else if(id==='sausage'){ const t=mesh(new T3.TorusGeometry(14,4.5,12,24,Math.PI*.7),M_('#9a3c1c',{roughness:.3})); t.rotation.x=-Math.PI/2; t.position.set(-6,4.5,-6); g.add(t); }
  else if(id==='salmon'){ add(mesh(G.box,M_('#ff8a5c',{roughness:.35})),0,4,0,26,7,14); add(mesh(G.box,M_('#9a9a9a')),0,.6,0,26.4,1.2,14.4); }
  else if(id==='shrimp'){ for(let i=0;i<7;i++){ const a=-.4+i*.52; add(mesh(G.sph,M_(i%2?'#ff9a70':'#ff7f50')),Math.cos(a)*8,4.5,Math.sin(a)*8,4.5-i*.4,4.5-i*.4,4.5-i*.4); } }
  else if(id==='meatballs'){ for(const [x,z] of [[-6,-3],[5,-4],[0,5]]) add(mesh(G.sph,M_('#7a4224',{roughness:.7})),x,5.5,z,6,5.5,6); }
  else if(id==='ham'){ add(mesh(new T3.CylinderGeometry(1,1,1,28),M_('#fbe3d6')),0,2.5,0,13,4,13); add(mesh(new T3.CylinderGeometry(1,1,1,28),M_('#e88a92')),0,2.8,0,11,4.2,11); }
  else if(id==='tuna'){ add(mesh(new T3.CylinderGeometry(1,1,1,28,1,true),M_('#d9dee3',{metalness:.9,roughness:.2,side:T3.DoubleSide})),0,5,0,12,10,12); add(mesh(new T3.CylinderGeometry(1,1,1,24),M_('#d6a07a',{roughness:.8})),0,7,0,11.2,4,11.2); }
  else { add(mesh(G.sphX,M_('#a3262f')),-4,5,0,10,6,9); add(mesh(G.cyl,bone),10,5,0,2,18,2,Math.PI/2); }
  return inkify(g,1.5,true);
}
function wedgeGeometry(R,half,holes,depth){ const sh=new T3.Shape(); sh.moveTo(0,0); sh.absarc(0,0,R,-half,half,false); sh.lineTo(0,0);
  for(const h of holes){ const p=new T3.Path(); p.absarc(h.x,h.y,h.r,0,TAU,true); sh.holes.push(p); }
  const geo=new T3.ExtrudeGeometry(sh,{depth,bevelEnabled:true,bevelThickness:1.4,bevelSize:1.1,bevelSegments:2,curveSegments:LOW?14:22}); geo.rotateX(-Math.PI/2); return geo; }
// a different mouse treat on the board each wave (five small pieces: the 'lives')
const FOODS=[ {id:'cheese',label:'cheese',emoji:'🧀'},{id:'bread',label:'bread',emoji:'🍞'},{id:'peanuts',label:'peanuts',emoji:'🥜'},{id:'corn',label:'corn',emoji:'🌽'},
  {id:'cookie',label:'cookies',emoji:'🍪'},{id:'strawberry',label:'strawberries',emoji:'🍓'},{id:'grapes',label:'grapes',emoji:'🍇'},{id:'apple',label:'apple slices',emoji:'🍎'},
  {id:'seeds',label:'sunflower seeds',emoji:'🌻'},{id:'cracker',label:'crackers',emoji:'🍘'} ];
const foodFor=w=>FOODS[(w-1)%FOODS.length];
function foodPiece(id){ const p=new T3.Group(), A=(m,x,y,z,sx,sy,sz)=>{ m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.castShadow=true; p.add(m); return m; };
  switch(id){
    case 'cheese':{ const holes=[]; for(let i=0;i<3;i++) holes.push({x:rr(7,15),y:rr(-2,2),r:rr(1.4,2.2)});
      const w=new T3.Mesh(wedgeGeometry(20,.75,holes,12),[stdMat('#f2c53d',{roughness:.45}),stdMat('#d99a22',{roughness:.55})]); w.scale.set(1,.9,1); w.castShadow=true; p.add(w); break; }
    case 'bread': A(mesh(G.box,stdMat('#b8732e',{roughness:.8})),0,5,0,14,10,14); A(mesh(G.box,stdMat('#f1dcae',{roughness:.95})),0,5.2,0,12.4,10.4,12.4); A(mesh(G.sph,stdMat('#b8732e',{roughness:.8})),0,10,0,7.5,3.5,7.4); break;
    case 'peanuts': for(const [x,z,r] of [[-3,-2,.4],[4,3,-.6]]){ const pn=new T3.Group(); pn.position.set(x,3.5,z); pn.rotation.y=r; p.add(pn); const m=stdMat('#c9a06a',{roughness:.9}); for(const dx of [-3,3]){ const b=mesh(G.sph,m); b.position.x=dx; b.scale.set(4.2,3.4,3.4); b.castShadow=true; pn.add(b); } } break;
    case 'corn':{ const c=A(mesh(G.cylU,new CartoonMat({map:kernelTex(),roughness:.5})),0,5,0,5.5,15,5.5); c.rotation.z=Math.PI/2; const h=A(mesh(G.sph,stdMat('#8fb04a',{roughness:.8})),-8,5,0,4,4.6,4.6); break; }
    case 'cookie': A(mesh(G.cylU,stdMat('#c58a45',{roughness:.85})),0,2,0,10,4,10); for(let i=0;i<6;i++) A(mesh(G.sphLow,stdMat('#3a2416',{roughness:.6})),rr(-6,6),4.2,rr(-6,6),1.3,1,1.3); break;
    case 'strawberry': for(const [x,z] of [[-4,0],[5,2]]){ A(mesh(G.cone,stdMat('#d8232a',{roughness:.35,map:seedTex()})),x,6,z,5,11,5).rotation.z=Math.PI; A(mesh(G.sph,stdMat('#3f8a2e')),x,11.6,z,4.6,1.4,4.6); } break;
    case 'grapes': for(const [x,y,z] of [[0,4,0],[5,4,2],[-5,4,1],[2,4,-5],[-2,4,5],[1,9,1],[-3,8,-2],[4,8,-1]]) A(mesh(G.sph,stdMat('#6b2a8a',{roughness:.2})),x,y,z,3.6,3.6,3.6); break;
    case 'apple': for(const r of [0,1]){ const s2=new T3.Group(); s2.position.set(r?5:-4,0,r?3:-2); s2.rotation.y=r*1.4; p.add(s2);
        const f=mesh(new T3.CylinderGeometry(9,9,4,16,1,false,0,Math.PI),stdMat('#fbf0c8',{roughness:.7})); f.position.y=2; f.castShadow=true; s2.add(f);
        const k=mesh(new T3.CylinderGeometry(9.4,9.4,4.2,16,1,true,0,Math.PI),stdMat('#c8202a',{roughness:.4,side:T3.DoubleSide})); k.position.y=2; s2.add(k); } break;
    case 'seeds': for(let i=0;i<7;i++){ const sd=A(mesh(G.sph,new CartoonMat({map:stripeTex(),roughness:.6})),rr(-8,8),2,rr(-8,8),4,1.8,2.2); sd.rotation.y=rand()*TAU; } break;
    case 'cracker': A(mesh(G.box,stdMat('#e2b468',{roughness:.85})),0,2,0,15,3.4,15); for(let i=0;i<9;i++) A(mesh(G.sphLow,stdMat('#b98a3e')),-5+(i%3)*5,3.8,-5+((i/3)|0)*5,.8,.5,.8); break; }
  return p; }
function kernelTex(){ if(texCache.kernel) return texCache.kernel; const c=mkCanvas(64,64),g=c.getContext('2d'); g.fillStyle='#e8a91a'; g.fillRect(0,0,64,64);
  for(let y=0;y<64;y+=8) for(let x=(y/8%2)*4;x<64;x+=8){ g.fillStyle='#f8d34a'; g.beginPath(); g.ellipse(x+4,y+4,3.4,3.2,0,0,TAU); g.fill(); } return texCache.kernel=canvasTex(c); }
function seedTex(){ if(texCache.sseed) return texCache.sseed; const c=mkCanvas(64,64),g=c.getContext('2d'); g.fillStyle='#ffffff'; g.fillRect(0,0,64,64);
  g.fillStyle='#f6e27a'; for(let i=0;i<40;i++){ g.beginPath(); g.ellipse(rand()*64,rand()*64,1.2,1.8,0,0,TAU); g.fill(); } return texCache.sseed=canvasTex(c); }
function stripeTex(){ if(texCache.sstripe) return texCache.sstripe; const c=mkCanvas(64,32),g=c.getContext('2d'); g.fillStyle='#2a2622'; g.fillRect(0,0,64,32); g.fillStyle='#e8e2d2'; for(let x=0;x<64;x+=10) g.fillRect(x,0,3,32); return texCache.sstripe=canvasTex(c); }
function makeFood(id){
  const g=new T3.Group(), woodC=mkCanvas(256,256), wg=woodC.getContext('2d'), gr=wg.createRadialGradient(110,110,10,128,128,130); gr.addColorStop(0,'#cfa168'); gr.addColorStop(1,'#8a5e31'); wg.fillStyle=gr; wg.fillRect(0,0,256,256);
  wg.strokeStyle='rgba(90,55,20,.35)'; for(let r=8;r<128;r+=rr(5,9)){ wg.lineWidth=rr(.6,1.6); wg.beginPath(); wg.arc(132,126,r,0,TAU); wg.stroke(); }
  const board=mesh(new T3.CylinderGeometry(62,64,9,48),stdMat('#ffffff',{map:canvasTex(woodC),roughness:.55})); board.position.y=4.5; board.receiveShadow=true; g.add(board);
  // one big piece in the middle of the board; it shrinks as it is nibbled
  const holder=new T3.Group(), pc=foodPiece(id); holder.position.set(id==='cheese'?-14:0,9,0); pc.rotation.y=id==='cheese'?0:rand()*TAU; holder.add(pc); holder.scale.setScalar(2.3); holder.userData.k=2.3; g.add(holder); const wedges=[holder];
  return {g,wedges,id}; }
function setFood(id){ if(cheeseObj&&cheeseObj.id===id) return; if(cheeseObj){ world.remove(cheeseObj.g); disposeTree(cheeseObj.g); } cheeseObj=makeFood(id); world.add(cheeseObj.g); updateHud(); }
function makeCatnip(){ const g=new T3.Group(), leaf=stdMat('#4f9a32',{roughness:.5,side:T3.DoubleSide});
  for(let i=0;i<9;i++){ const a=i/9*TAU,m=mesh(G.sph,leaf); m.scale.set(12,1.6,6); m.position.set(Math.cos(a)*11,4+(i%3)*2,Math.sin(a)*11); m.rotation.set(0,-a,(i%2?.25:-.15)); g.add(m); }
  const fl=mesh(G.sph,stdMat('#c8a2f0')); fl.scale.set(4,5,4); fl.position.y=9; g.add(fl);
  const ring=new T3.Mesh(new T3.RingGeometry(30,36,40),new T3.MeshBasicMaterial({color:0xb6f28a,transparent:true,opacity:.4,depthWrite:false,side:T3.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=1; g.add(ring); g.userData.ring=ring; return inkify(g,1.4,true); }

// ================= scene building =================
let ground=null, groundTex=null, stainTex=null, stainMesh=null, cheeseObj=null, grassTime={value:0}, butterflies=[], bees=[], ambObj=null, amb=[], antMesh=null, ladyMesh=null, beetleMesh=null;
function skyTexture(T){ const c=mkCanvas(2,256),g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,256); gr.addColorStop(0,vivid(T.sky[0])); gr.addColorStop(1,vivid(T.sky[1])); g.fillStyle=gr; g.fillRect(0,0,2,256); return canvasTex(c); }
function tileTex(color,kind){ const c=mkCanvas(128,128),g=c.getContext('2d'); g.fillStyle=color; g.fillRect(0,0,128,128);
  g.fillStyle=vivid(color); g.fillRect(0,0,128,128); if(kind==='grass') for(let i=0;i<3;i++) tuft(g,rr(10,118),rr(16,120),'rgba(20,60,10,.35)',.8);
  const t=canvasTex(c); t.wrapS=t.wrapT=T3.RepeatWrapping; return t; }
// a tiny sky dome (zenith -> horizon -> ground bounce) prefiltered into an environment map: soft sky fill on every surface,
// glossy reflections in eyes and noses, and it matches the scene (bright garden, warm autumn, dark night, white snow, warm kitchen)
function envFor(T,gen){ const c=mkCanvas(4,256), g=c.getContext('2d'), gr=g.createLinearGradient(0,0,0,256), gnd=T.walls?'#b58a55':T.kind==='snow'?'#e8eef5':T.outer||T.ground[1];
  gr.addColorStop(0,vivid(T.sky[0])); gr.addColorStop(.48,vivid(T.sky[1])); gr.addColorStop(.52,gnd); gr.addColorStop(1,mix(gnd,'#000000',.35)); g.fillStyle=gr; g.fillRect(0,0,4,256);
  if(T.walls){ g.fillStyle='rgba(255,236,200,.9)'; g.fillRect(0,10,4,40); }
  const tex=new T3.CanvasTexture(c); tex.encoding=T3.sRGBEncoding; const es=new T3.Scene(); es.add(new T3.Mesh(new T3.SphereGeometry(10,32,16),new T3.MeshBasicMaterial({map:tex,side:T3.BackSide})));
  const rt=gen.fromScene(es,0); tex.dispose(); es.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }); return rt; }
let envRT=null;
// the garden gate sits where the house path meets the top fence (game coordinates)
const GATE_X=W*.3, GATE_W=84;
let gateObj=null, surroundPups=[];
function buildScene3D(){ gateObj=null; for(const pp of surroundPups) pp.model.dispose(); surroundPups=[];
  disposeTree(world); scene.remove(world); world=new T3.Group(); scene.add(world);
  const T=theme(); buildFloor(); buildCrawlers();
  // the painted floor is uploaded to the GPU once; paw prints / cracks live on a small separate overlay
  if(groundTex) groundTex.dispose(); if(stainTex) stainTex.dispose();
  groundTex=canvasTex(floor); stains=mkCanvas(W*STX,H*STX); sctx=stains.getContext('2d'); sctx.scale(STX,STX); stainTex=canvasTex(stains);
  ground=new T3.Mesh(new T3.PlaneGeometry(W,H),new CartoonMat({map:groundTex})); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; world.add(ground);
  stainMesh=new T3.Mesh(new T3.PlaneGeometry(W,H),new T3.MeshBasicMaterial({map:stainTex,transparent:true,depthWrite:false})); stainMesh.rotation.x=-Math.PI/2; stainMesh.position.y=.5; stainMesh.renderOrder=1; stainMesh.visible=false; world.add(stainMesh); stainLife=0;
  const outerT=tileTex(T.outer,T.kind==='grass'?'grass':'x'); outerT.repeat.set(60,60);
  const outer=new T3.Mesh(new T3.PlaneGeometry(9000,9000),new CartoonMat({map:outerT,roughness:.95})); outer.rotation.x=-Math.PI/2; outer.position.y=-.6; outer.receiveShadow=true; world.add(outer);
  if(envRT) envRT.dispose(); envRT=envFor(T,pmrem); scene.environment=envRT.texture;
  SPRITE_TINT.set(T.night?'#8090c4':T.ambient==='leaves'?'#fff0da':T.kind==='snow'?'#f2f7ff':T.walls?'#fff2e0':'#ffffff');   // painted sprites take on the scene's light
  scene.background=skyTexture(T); const fd=fitDist(), WX=T.weather;
  scene.fog=new T3.Fog(T.fog,fd*(WX==='mist'?.3:WX==='rain'||WX==='storm'||WX==='snowfall'?.9:1.6),fd*(WX==='mist'?1.8:WX==='rain'||WX==='storm'||WX==='snowfall'?4:6));
  const hk=T.night?.5:.2, sk=T.night?1.0:.9;
  hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity=T.hemi[2]*hk; wxBase=hemi.intensity; sun.color.set(T.sun[0]); sun.intensity=T.sun[1]*sk; if(T.sunPos) sun.position.set(W*T.sunPos[0],1100*T.sunPos[1],H*T.sunPos[2]); else sun.position.set(W*.35,1100,H*.55);
  rim.intensity=T.night?.5:.55; rim.color.set(T.night?'#a9c0ff':'#ffd9a8'); lantern.intensity=T.night?1.6:0; catLight.intensity=T.night?.9:0;
  cheeseObj=makeFood(foodFor(wave).id); world.add(cheeseObj.g);
  if(T.night){ const lamp=mesh(G.sph,new T3.MeshBasicMaterial({color:0xffd08a})); lamp.scale.setScalar(5); lamp.position.set(0,90,0); world.add(lamp);
    const pm=stdMat('#222222',{metalness:.6,roughness:.4}), pole=mesh(G.cylU,pm); pole.scale.set(1.4,90,1.4); pole.position.set(0,45,-70); world.add(pole); const arm=mesh(G.cylU,pm); arm.scale.set(1.2,70,1.2); arm.rotation.x=Math.PI/2; arm.position.set(0,90,-35); world.add(arm); }
  if(!T.walls) for(const h of holes){ const [X,Z]=g2w(h.x,h.y); const m=mesh(new T3.TorusGeometry(36,12,8,24),stdMat(mix(T.dirt[0],'#000000',.15),{roughness:1}),false); m.rotation.x=-Math.PI/2; m.scale.z=.45; m.position.set(X,2,Z); m.receiveShadow=true; world.add(m);
    const hm=new T3.Mesh(new T3.CircleGeometry(27,24),new T3.MeshBasicMaterial({color:0x050302})); hm.rotation.x=-Math.PI/2; hm.position.set(X,1.5,Z); world.add(hm); }
  if(T.fence){ const wood=stdMat(T.fence==='snow'?'#7a6250':'#9a7350',{roughness:.85}); const m=36,x0=-W/2-m,x1=W/2+m,z0=-H/2-m,z1=H/2+m, GX=GATE_X-W/2, GW=GATE_W/2;
    let posts=[]; for(let x=x0;x<=x1;x+=70) posts.push([x,z0],[x,z1]); for(let z=z0+70;z<z1;z+=70) posts.push([x0,z],[x1,z]);
    posts=posts.filter(([x,z])=>!(z===z0&&Math.abs(x-GX)<GW+20)); posts.push([GX-GW-3,z0],[GX+GW+3,z0]);   // gap + gate posts on the house side
    // the gate: hinged on its left post, swings outward (away from the yard) when the owner opens it
    { const pivot=new T3.Group(); pivot.position.set(GX-GW,0,z0); world.add(pivot); const gw=wood, bd=(x,y,sx,sy,rz=0)=>{ const b=mesh(G.box,gw); b.position.set(x,y,0); b.scale.set(sx,sy,4); b.rotation.z=rz; b.receiveShadow=true; pivot.add(b); };
      bd(GW,20,GW*2-2,6); bd(GW,44,GW*2-2,6); bd(4,32,6,36); bd(GW*2-4,32,6,36); bd(GW,32,6,36); bd(GW*.5,32,GW*1.15,4,Math.atan2(24,GW)); bd(GW*1.5,32,GW*1.15,4,-Math.atan2(24,GW));
      const latch=mesh(G.box,stdMat('#3a3a3a',{metalness:.7,roughness:.4})); latch.position.set(GW*2-8,34,3); latch.scale.set(6,3,2); pivot.add(latch);
      gateObj={pivot,open:0,creak:false}; }
    const pm=new T3.InstancedMesh(G.box,wood,posts.length); posts.forEach(([x,z],i)=>{ _m.compose(_v1.set(x,30,z),_q.identity(),_s.set(8,60,8)); pm.setMatrixAt(i,_m); }); pm.castShadow=true; pm.receiveShadow=true; world.add(pm);
    for(const y of [20,44]) for(const [cx,cz,lx,lz] of [[(x0+GX-GW)/2,z0,GX-GW-x0,5],[(GX+GW+x1)/2,z0,x1-GX-GW,5],[0,z1,x1-x0,5],[x0,0,5,z1-z0],[x1,0,5,z1-z0]]){ const r=mesh(G.box,wood,false); r.position.set(cx,y,cz); r.scale.set(lx,6,lz); r.receiveShadow=true; world.add(r); }
    if(T.fence==='snow'){ const sm=new T3.InstancedMesh(G.sph,stdMat('#ffffff',{roughness:.9}),posts.length); posts.forEach(([x,z],i)=>{ _m.compose(_v1.set(x,61,z),_q.identity(),_s.set(7,3.5,7)); sm.setMatrixAt(i,_m); }); world.add(sm); } }
  if(T.walls){ const wallM=stdMat('#eee3d0',{roughness:.9}),base=stdMat('#5a3b24'),black=new T3.MeshBasicMaterial({color:0x050302,side:T3.DoubleSide}),t=16,hgt=150;
    for(const [cx,cz,lx,lz] of [[0,-H/2-t/2,W+2*t,t],[0,H/2+t/2,W+2*t,t],[-W/2-t/2,0,t,H],[W/2+t/2,0,t,H]]){ const w=mesh(G.box,wallM,false); w.position.set(cx,hgt/2,cz); w.scale.set(lx,hgt,lz); w.receiveShadow=true; world.add(w);
      const b=mesh(G.box,base,false); b.position.set(cx,14,cz); b.scale.set(lx+(lx>lz?0:4),28,lz+(lz>lx?0:4)); world.add(b); }
    for(const h of holes){ const [X,Z]=g2w(h.x,h.y),a=new T3.Mesh(new T3.CircleGeometry(30,24,0,Math.PI),black); a.position.set(X+(h.side==='left'?2:h.side==='right'?-2:0),0,Z+(h.side==='top'?2:h.side==='bottom'?-2:0)); a.rotation.y=h.side==='top'||h.side==='bottom'?0:Math.PI/2; world.add(a); } }
  if(T.grass){ const bg=new T3.PlaneGeometry(1,1,1,3); bg.translate(0,.5,0); const p=bg.attributes.position; for(let i=0;i<p.count;i++){ const y=p.getY(i); p.setX(i,p.getX(i)*(1-y*.92)); p.setZ(i,y*y*.35); } bg.computeVertexNormals();
    const gm=new CartoonMat({side:T3.DoubleSide,roughness:.85});
    gm.onBeforeCompile=sh=>{ sh.uniforms.uTime=grassTime; sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float ph=instanceMatrix[3].x*0.02+instanceMatrix[3].z*0.017; transformed.x+=sin(uTime*1.7+ph)*position.y*position.y*0.35; transformed.z+=cos(uTime*1.3+ph)*position.y*position.y*0.2;`); };
    const N=Math.round(W*H/520*T.grassN*(LOW?.45:1)),[h0,h1,s0,s1,l0,l1]=T.grass, im=new T3.InstancedMesh(bg,gm,N); let k=0; const clumps=[...Array(Math.max(1,Math.round(N/14)))].map(()=>[rand()*W,rand()*H]);
    while(k<N){ let x,y; if(k%2){ const c=pick(clumps); x=c[0]+rr(-14,14); y=c[1]+rr(-14,14); } else { x=rand()*W; y=rand()*H; } if(Math.hypot(x-W/2,y-H/2)<80) continue; x=clamp(x,2,W-2); y=clamp(y,2,H-2);
      const [X,Z]=g2w(x,y),h=rr(9,k%2?30:20); _q.setFromAxisAngle(UP,rand()*TAU); _m.compose(_v1.set(X,0,Z),_q,_s.set(rr(3.2,4.6),h,rr(3.2,4.6))); im.setMatrixAt(k,_m); _c.setHSL(rr(h0,h1)/360,Math.min(1,rr(s0,s1)*1.35/100),rr(l0,l1)/100+.06); im.setColorAt(k,_c); k++; }
    im.receiveShadow=!LOW; im.userData.noInk=true; world.add(im); }
  // crawling bugs as tiny instanced 3D bodies (cheap)
  antMesh=ants.length?new T3.InstancedMesh(G.sphX,stdMat('#1e120a',{roughness:.3}),ants.length):null; if(antMesh) world.add(antMesh);
  ladyMesh=ladybugs.length?new T3.InstancedMesh(G.hemi,stdMat('#e0261b',{roughness:.2}),ladybugs.length):null; if(ladyMesh) world.add(ladyMesh);
  beetleMesh=beetles.length?new T3.InstancedMesh(G.hemi,stdMat('#1fae7a',{roughness:.2,metalness:.6}),beetles.length):null; if(beetleMesh) world.add(beetleMesh);
  butterflies=[]; bees=[]; const BU=T.bugs||{},area=W*H, palettes=[['#ff8c1a','#1a1a1a','#fff'],['#2f7cf6','#0b1f4d','#9fd3ff'],['#f6e05e','#8a6d00','#fff8c4'],['#f472b6','#6b1240','#ffd6ec'],['#fafafa','#555','#222']];
  for(let i=0;i<Math.round((BU.butterflies||0)*Math.max(4,area/180000)*(LOW?.6:1));i++) butterflies.push(makeButterfly(pick(palettes)));
  for(let i=0;i<Math.round((BU.bees||0)*Math.max(2,area/350000));i++) bees.push(makeBee());
  buildAmbient3D();
  for(const m of [antMesh,ladyMesh,beetleMesh]) if(m) m.userData.noInk=true;
  inkify(world,1.5,true);   // fence, walls, cheese board, hole rims, butterflies…
  if(T.night){ const sp=[]; for(let i=0;i<700;i++){ const th=rand()*TAU,ph=rr(.08,1.4),r=6000; sp.push(Math.cos(th)*Math.cos(ph)*r,Math.sin(ph)*r,Math.sin(th)*Math.cos(ph)*r); }
    const sg=new T3.BufferGeometry(); sg.setAttribute('position',new T3.Float32BufferAttribute(sp,3)); world.add(new T3.Points(sg,new T3.PointsMaterial({color:0xffffff,size:14,fog:false,transparent:true,opacity:.9}))); }
  if(!T.walls) buildSurroundings(T);
  document.body.style.background=T.fog; groundDirty=0; groundT=1;
}
// ================= the world around the yard: house, trees, birds, farm animals =================
// leafy canopy: clusters of small leaves (white base so instance colours tint it)
function leafTex(){ if(texCache.leaf) return texCache.leaf; const c=mkCanvas(256,256),g=c.getContext('2d'); g.fillStyle='#d8d8d8'; g.fillRect(0,0,256,256);
  for(let i=0;i<900;i++){ const v=Math.round(rr(150,255)); g.fillStyle=`rgb(${v},${v},${v})`; g.beginPath(); g.ellipse(rand()*256,rand()*256,rr(3,7),rr(2,4),rand()*TAU,0,TAU); g.fill(); }
  const t=canvasTex(c); t.wrapS=t.wrapT=T3.RepeatWrapping; t.repeat.set(3,2); return texCache.leaf=t; }
function woolTex(){ if(texCache.wool) return texCache.wool; const c=mkCanvas(128,128),g=c.getContext('2d'); g.fillStyle='#eeeeee'; g.fillRect(0,0,128,128);
  for(let i=0;i<260;i++){ const v=Math.round(rr(205,255)); g.strokeStyle=`rgb(${v},${v},${v})`; g.lineWidth=2.2; g.beginPath(); g.arc(rand()*128,rand()*128,rr(3,6),0,TAU); g.stroke(); }
  const t=canvasTex(c); t.wrapS=t.wrapT=T3.RepeatWrapping; t.repeat.set(2,2); return texCache.wool=t; }
let surroundLife=[];
function buildSurroundings(T){ surroundLife=[]; const g=new T3.Group(); world.add(g);
  const snow=T.kind==='snow', night=!!T.night, autumn=T.ambient==='leaves', x0=-W/2-36, x1=W/2+36, z0=-H/2-36, z1=H/2+36;
  const M=(c,o)=>stdMat(c,o), put=(m,x,y,z,sx,sy,sz,par=g)=>{ m.position.set(x,y,z); m.scale.set(sx,sy,sz); par.add(m); m.castShadow=true; m.receiveShadow=true; return m; };
  // --- house behind the far fence, facing the yard ---
  const hx=GATE_X-W/2, hz=z0-300, PX=hx+430, PZ=z0-190, PRX=150, PRZ=95,   // pond beside the house
    house=new T3.Group(); house.position.set(hx,0,hz); g.add(house);
  const wallM=M(snow?'#eadfcd':'#f2e6cf',{roughness:.9}), roofM=M('#9c3f2c',{roughness:.7}), woodM=M('#6b4528',{roughness:.8}), frameM=M('#fbfaf6',{roughness:.6}), stoneM=M('#8d8679',{roughness:.95}),
    glassM=new CartoonMat({color:night?0xffd89a:0xa9d4f2,roughness:.1,emissive:new T3.Color(night?0xffb95a:0x000000),emissiveIntensity:night?1.2:0});
  put(mesh(G.box,wallM),0,85,0,330,170,210,house); put(mesh(G.box,stoneM),0,10,0,338,20,218,house);
  const roofG=(()=>{ const sh=new T3.Shape(); sh.moveTo(-190,0); sh.lineTo(190,0); sh.lineTo(0,120); sh.lineTo(-190,0); const e=new T3.ExtrudeGeometry(sh,{depth:250,bevelEnabled:false}); e.translate(0,0,-125); return e; })();
  put(new T3.Mesh(roofG,roofM),0,170,0,1,1,1,house); if(snow) put(new T3.Mesh(roofG,M('#ffffff',{roughness:.9})),0,176,0,.98,.96,1.01,house);
  put(mesh(G.box,M('#7b5a48',{roughness:.9})),95,265,-30,34,70,34,house);   // chimney
  put(mesh(G.box,woodM),0,50,106,46,96,6,house); put(mesh(G.sphLow,M('#d4a52a',{metalness:.8,roughness:.3})),14,50,110,2.5,2.5,2.5,house);   // door + knob
  for(const [x,y] of [[-110,95],[110,95],[-55,105],[55,105]]){ if(Math.abs(x)<60&&y<110&&Math.abs(x)<30) continue; put(mesh(G.box,frameM),x,y,106,48,48,4,house); put(mesh(G.box,glassM),x,y,108,38,38,3,house);
    put(mesh(G.box,frameM),x,y,109.5,3,38,1,house); put(mesh(G.box,frameM),x,y,109.5,38,3,1,house); }
  put(mesh(G.box,woodM),0,8,128,120,6,40,house);   // porch step
  if(night){ const pl=new T3.PointLight(0xffc27a,1.2,520,2); pl.position.set(hx,110,hz+150); g.add(pl); }
  // --- trees around the yard (pines in winter, golden crowns in autumn) ---
  const trunkM=M('#5c4029',{roughness:.95}), leafCols=autumn?['#c8552a','#e0892b','#d9a531','#a83a1e']:snow?['#2f5a3c','#36654a']:['#3f8a2e','#4d9a36','#357a26','#5aa43a'];
  const leafM=new CartoonMat({map:leafTex(),roughness:.85}), snowM=M('#ffffff',{roughness:.85});
  const trunks=[], crowns=[], caps=[];   // instanced below: three draw calls for every tree
  const spots=[]; for(let i=0;i<16;i++){ for(let tries=0;tries<20;tries++){ const side=i%4, t=rand(), out=rr(140,560);
      const x=side===0?lerp(x0-500,x1+500,t):side===1?x1+out:side===2?lerp(x0-500,x1+500,t):x0-out, z=side===0?z0-out:side===2?z1+out*.6+120:lerp(z0-400,z1+300,t);
      if(Math.abs(x-hx)<300&&Math.abs(z-hz)<240) continue; if(Math.hypot((x-PX)/(PRX+90),(z-PZ)/(PRZ+90))<1) continue; if(spots.some(([a,b])=>Math.hypot(a-x,b-z)<150)) continue; spots.push([x,z]); break; } }
  for(const [x,z] of spots){ const k=rr(.85,1.45);
    if(snow){ trunks.push([x,20*k,z,7*k,40*k,7*k]); for(let j=0;j<3;j++){ crowns.push([x,(60+j*42)*k,z,(58-j*14)*k,70*k,(58-j*14)*k,pick(leafCols)]); caps.push([x,(78+j*42)*k,z,(40-j*11)*k,34*k,(40-j*11)*k]); } }
    else { trunks.push([x,45*k,z,7*k,90*k,7*k]); for(let j=0;j<5;j++){ const a=j/5*TAU+rand(), r=j?26*k:0; crowns.push([x+Math.cos(a)*r,((j?100:122)+rr(-6,6))*k,z+Math.sin(a)*r,rr(34,44)*k,rr(30,38)*k,rr(34,44)*k,pick(leafCols)]); } } }
  const inst=(geo,mat,list,colour)=>{ if(!list.length) return; const im=new T3.InstancedMesh(geo,mat,list.length);
    list.forEach((d,i)=>{ _m.compose(_v1.set(d[0],d[1],d[2]),_q.setFromAxisAngle(UP,(i*2.39)%TAU),_s.set(d[3],d[4],d[5])); im.setMatrixAt(i,_m); if(colour) im.setColorAt(i,_c.set(d[6])); });
    im.receiveShadow=true; im.userData.noInk=true; g.add(im); return im; };
  inst(G.cylU,trunkM,trunks); inst(snow?G.cone:G.sph,leafM,crowns,true); inst(G.cone,snowM,caps);
  // hedges and flowering shrubs just outside the fence, flower clumps, a stone path to the house, rolling hills far off
  { const bush=[], flowers=[], fc=snow?[]:autumn?['#e8892a','#c8552a','#f2c04a']:['#ff6f91','#ffd23f','#ffffff','#b07cff','#ff8a3d'];
    for(let i=0;i<44;i++){ const side=i%4, t=(i>>2)/11+rr(-.02,.02), o=rr(55,95), x=side<2?lerp(x0,x1,t):side===2?x0-o:x1+o, z=side<2?(side?z1+o:z0-o):lerp(z0,z1,t);
      if(side===0&&Math.abs(x-hx)<70) continue; const r=rr(22,34); bush.push([x,r*.6,z,r,r*.75,r,pick(snow?['#e9eef2','#dfe8ee']:autumn?['#7a6a2a','#8a5a24','#6a7a2a']:['#3c7a2a','#4b8a32','#356e24'])]);
      for(let k=0;k<(fc.length?5:0);k++) flowers.push([x+rr(-r,r),r*rr(.9,1.25),z+rr(-r,r),rr(3,4.5),rr(2.5,3.5),rr(3,4.5),pick(fc)]); }
    inst(G.sph,leafM,bush,true); inst(G.sphLow,M('#ffffff',{roughness:.6}),flowers,true);
    const stones=[]; for(let i=0;i<8;i++) stones.push([hx+rr(-8,8),1,z0-40-i*26,rr(13,17),2,rr(10,13),pick(['#b9b2a3','#a8a092','#c6bfb0'])]);
    inst(G.cylU,M('#ffffff',{roughness:.95}),stones,true);
    const hills=[]; for(let i=0;i<9;i++){ const a=-Math.PI*.95+i/8*Math.PI*.9, r=rr(2600,3300); hills.push([Math.cos(a)*r,-80,Math.sin(a)*r*.9-400,rr(700,1100),rr(260,420),rr(500,800),snow?'#e6eef5':autumn?'#9c8a45':'#5e9a45']); }
    const hm=inst(G.sph,M('#ffffff',{roughness:1}),hills,true); if(hm) hm.receiveShadow=false; }
  // --- songbirds: cardinals, blue jays, robins, goldfinches, rainbow lorikeets, budgies; some circle, some perch on the fence ---
  const SPECIES=[ {body:'#c8102e',belly:'#d8303e',head:'#c8102e',wing:'#9e0b22',tail:'#8a0a1d',beak:'#f08a2a',mask:'#1a1010',crest:true},   // cardinal
    {body:'#3a78d0',belly:'#f2f2ee',head:'#3a78d0',wing:'#2a5fb4',tail:'#2f66c0',beak:'#222222',mask:'#151515',crest:true,bars:true},     // blue jay
    {body:'#6b5a4c',belly:'#e5732e',head:'#3a312b',wing:'#5a4a3e',tail:'#3e342d',beak:'#e3b23a'},                                          // robin
    {body:'#f6d21e',belly:'#f9e04a',head:'#f6d21e',wing:'#1d1d1d',tail:'#1d1d1d',beak:'#f2a65a',mask:'#1d1d1d',bars:true},                 // goldfinch
    {body:'#2fa84f',belly:'#f05a28',head:'#2f5fd6',wing:'#2a9446',tail:'#e8c83a',beak:'#e0332c'},                                          // rainbow lorikeet
    {body:'#7fd34a',belly:'#a6e05a',head:'#f2e65a',wing:'#4f9a2e',tail:'#2f5fd6',beak:'#e8b07a'} ];                                       // budgie
  const birdMat={}, BM=c=>birdMat[c]||(birdMat[c]=M(c,{roughness:.6,side:T3.DoubleSide})), wingG=new T3.PlaneGeometry(1,1).rotateX(-Math.PI/2).translate(0,0,.5);
  const makeBird=sp=>{ const b=new T3.Group(); g.add(b);
    put(mesh(G.sphX,BM(sp.body)),0,0,0,8.5,3.8,3.8,b); put(mesh(G.sph,BM(sp.belly)),2,-1.4,0,5.5,2.9,3.2,b); put(mesh(G.sph,BM(sp.head)),8,1.8,0,3.6,3.4,3.2,b);
    if(sp.crest){ const c=put(mesh(G.cone,BM(sp.head)),7.2,5.6,0,1.4,3.6,1.1,b); c.rotation.z=.6; }
    if(sp.mask) for(const sd of [-1,1]) put(mesh(G.sphLow,BM(sp.mask)),10,2,sd*1.9,1.4,1.2,1,b);
    for(const sd of [-1,1]) put(mesh(G.sphLow,BM('#0d0d0d')),10.4,2.6,sd*2.3,.6,.6,.6,b);
    const bk=put(mesh(G.cone,BM(sp.beak)),12,1.6,0,1.1,3.2,1.1,b); bk.rotation.z=-Math.PI/2;
    // tail: a fan of three feathers
    for(let k=-1;k<=1;k++){ const t=new T3.Mesh(QUILL_GEO,BM(sp.tail)); t.position.set(-6.5,.6,k*1.2); t.rotation.y=Math.PI+k*.22; t.rotation.z=.12; t.scale.set(11,1,3.4); t.castShadow=true; b.add(t); }
    const wings=[-1,1].map(sd=>{ const w=new T3.Group(); w.position.set(1.5,1.2,sd*2.4); b.add(w); const pl=new T3.Mesh(wingG,BM(sp.wing)); pl.scale.set(8,1,sd*14); w.add(pl);
      if(sp.bars){ const bar=new T3.Mesh(wingG,BM('#ffffff')); bar.scale.set(1.6,1,sd*13); bar.position.set(-1.5,.12,0); w.add(bar); } return w; });
    return {b,wings}; };
  for(let i=0;i<(night?2:7);i++){ const {b,wings}=makeBird(SPECIES[i%SPECIES.length]);
    const R0=rr(420,900), Y=rr(240,460), sp=rr(.2,.36)*(i%2?1:-1), ph=rand()*TAU, fl=rr(10,15), sc=rr(1.1,1.5); b.scale.setScalar(sc);
    surroundLife.push(t=>{ const a=ph+t*sp; b.position.set(Math.cos(a)*R0,Y+Math.sin(t*.7+ph)*30,Math.sin(a)*R0*.8-180); b.rotation.y=-(a+(sp>0?Math.PI/2:-Math.PI/2));
      b.rotation.z=Math.sin(t*.7+ph)*.08; const f=Math.sin(t*fl+ph), glide=(Math.sin(t*.5+ph)>.6)?.25:1; wings.forEach((w,j)=>{ w.rotation.x=(j?1:-1)*(f*.75*glide+.1); }); }); }
  if(!night) for(let i=0;i<5;i++){ const {b,wings}=makeBird(SPECIES[(i*3+1)%SPECIES.length]); const onTop=i%2, x=onTop?rr(x0+60,x1-60):(i<3?x0:x1), z=onTop?z0:rr(z0+60,z1-60);
    b.position.set(x,62,z); b.rotation.y=rand()*TAU; b.scale.setScalar(1.25); wings.forEach((w,j)=>{ w.rotation.x=(j?1:-1)*-.15; });
    const ph=rand()*10; surroundLife.push(t=>{ const c=(t+ph)%4; b.rotation.z=c<.3?-Math.sin(c/.3*Math.PI)*.5:0; b.position.y=62+(c>2&&c<2.25?Math.sin((c-2)/.25*Math.PI)*5:0); }); }
  // --- two fluffy puppies playing chase in the front yard (they nap at night) ---
  { const PUPS=[{fur:['#f4f1ea','#ffffff','#d8d0c4'],light:['#ffffff','#ffffff','#ebe5da'],ear:['#efe6d8','#ffffff','#d4c8b6']},
      {fur:['#6a4228','#8a5a38','#3e2414'],light:['#d6a874','#ecc898','#a8784a'],ear:['#4e2e1a','#6a4228','#2e1a0e']}];
    const pcx=GATE_X-190, pcy=-150; let lastT=null;
    PUPS.forEach((P,i)=>surroundPups.push({model:new DogModel(P,.44),i,d:{x:pcx+(i?60:-60),y:pcy,angle:0,ph:0,moving:0,sit:0,wag:9,pant:true,look:0}}));
    surroundLife.push(t=>{ const dt=lastT===null?0:Math.min(.1,t-lastT); lastT=t;
      for(const pp of surroundPups){ const d=pp.d, cyc=(t+pp.i*.4)%9, run=!night&&cyc<6, a=t*1.25+pp.i*Math.PI;
        if(run){ const nx=pcx+Math.cos(a)*75, ny=pcy+Math.sin(a)*40; d.angle=Math.atan2(ny-d.y,nx-d.x); d.ph+=Math.hypot(nx-d.x,ny-d.y)*.12; d.x=nx; d.y=ny; d.moving=1; d.sit=0; d.wag=11; d.pant=true; }
        else { const o=surroundPups[1-pp.i].d; d.moving=0; d.sit=1; d.wag=night?2:15; d.pant=!night; d.angle+=angDiff(Math.atan2(o.y-d.y,o.x-d.x),d.angle)*Math.min(1,dt*4); }
        pp.model.update(d,dt); } }); }
  // small farm animals: shadow-free (cheap), built from a few soft shapes
  const P0=(m,x,y,z,sx,sy,sz,par)=>{ m.position.set(x,y,z); m.scale.set(sx,sy,sz); par.add(m); return m; }, eyeM=M('#111111',{roughness:.2}), yel=M('#e9a822',{roughness:.5});
  const hen=(c1,c2,k=1)=>{ const h=new T3.Group(), fm=M(c1,{roughness:.8}), head=new T3.Group(), combM=M('#d8281e',{roughness:.5});
    P0(mesh(G.sph,fm,false),0,16,0,12,10,9,h); const t=P0(mesh(G.cone,M(c2,{roughness:.8}),false),-11,22,0,6,12,5,h); t.rotation.z=.9;
    head.position.set(9,24,0); h.add(head); P0(mesh(G.sph,fm,false),0,0,0,5,5.5,4.6,head);
    if(k>.7){ P0(mesh(G.sph,combM,false),1,5,0,3,2.6,1.2,head); P0(mesh(G.sph,combM,false),4,-3,0,1.2,2.2,1,head); }
    const bk=P0(mesh(G.cone,yel,false),5.6,.3,0,1.3,3.2,1.3,head); bk.rotation.z=-Math.PI/2; for(const sd of [-1,1]) P0(mesh(G.sphLow,eyeM,false),2.4,1.4,sd*3.6,.8,.8,.8,head);
    for(const sd of [-1,1]) P0(mesh(G.cylU,yel,false),0,4,sd*3.5,.8,9,.8,h); h.scale.setScalar(k); return {g:h,head,peck:true}; };
  const duck=(body,headC,bill,k=1,ring=false,chest=null)=>{ const d=new T3.Group(), bm=M(body,{roughness:.6}), head=new T3.Group();
    P0(mesh(G.sphX,bm,false),0,10,0,14,8,9,d); if(chest) P0(mesh(G.sph,M(chest,{roughness:.6}),false),8,10,0,7,7,7.5,d);
    const tl=P0(mesh(G.cone,bm,false),-14,14,0,3.5,7,4,d); tl.rotation.z=1.1;
    head.position.set(12,20,0); d.add(head); P0(mesh(G.sph,M(headC,{roughness:.35}),false),0,0,0,5.2,5.4,4.8,head);
    if(ring) P0(mesh(G.torus,M('#ffffff'),false),-1,-4.5,0,4.6,4.6,6,head).rotation.x=Math.PI/2;
    P0(mesh(G.sph,M(bill,{roughness:.5}),false),5.8,-1,0,4.2,1.2,2.8,head); for(const sd of [-1,1]) P0(mesh(G.sphLow,eyeM,false),2.6,1.6,sd*3.8,.8,.8,.8,head);
    const legs=[-1,1].map(sd=>P0(mesh(G.cylU,M('#f08a24'),false),1,2,sd*3.5,.9,6,.9,d)); d.scale.setScalar(k); return {g:d,head,legs,peck:true}; };
  // free-roaming poultry: wander to a random spot, peck a while, wander on; ducks waddle
  const roam=(a,cx,cz,rx,rz,speed,waddle=false)=>{ g.add(a.g); let x=cx+rr(-rx,rx), z=cz+rr(-rz,rz), tx=x, tz=z, wait=rand()*3, ang=rand()*TAU, lastT=null, ph=rand()*10;
    a.g.position.set(x,0,z);
    surroundLife.push(t=>{ const dt=lastT===null?0:Math.min(.1,t-lastT); lastT=t; const dx=tx-x, dz=tz-z, d=Math.hypot(dx,dz);
      if(wait>0){ wait-=dt; const pk=Math.max(0,Math.sin((t+ph)*5)); a.head.rotation.z=-pk*1.0; a.head.position.y=(a.head.userData.y0??(a.head.userData.y0=a.head.position.y))-pk*5; a.g.rotation.x=0; }
      else if(d<4){ wait=rr(1.5,5); tx=cx+rr(-rx,rx); tz=cz+rr(-rz,rz); }
      else { const st=Math.min(d,speed*dt); x+=dx/d*st; z+=dz/d*st; const want=Math.atan2(-dz,dx); ang+=angDiff(want,ang)*Math.min(1,dt*6);
        a.head.rotation.z=Math.sin(t*9+ph)*.12; if(a.head.userData.y0!==undefined) a.head.position.y=a.head.userData.y0; a.g.rotation.x=waddle?Math.sin(t*10+ph)*.14:0;
        if(a.legs) a.legs.forEach((l,i)=>{ l.rotation.z=Math.sin(t*12+ph+i*Math.PI)*.5; }); }
      a.g.position.set(x,Math.abs(Math.sin(t*12+ph))*(wait>0?0:1.2),z); a.g.rotation.y=ang; }); };
  const HENS=[['#f7f2ea','#efe6d6'],['#b5652c','#8e4a1e'],['#2b2523','#463b36'],['#8d8a86','#5f5c58'],['#d9a54a','#b07d2a']];
  HENS.forEach(([a,b])=>roam(hen(a,b),hx+rr(-120,140),hz+190,170,55,22));
  for(let i=0;i<4;i++) roam(hen('#f8df5a','#f2cf3a',.5),hx+rr(-60,80),hz+200,110,40,30);   // fluffy chicks
  roam(duck('#f6f4ee','#f6f4ee','#f2a02a'),PX-PRX-40,PZ+60,70,50,18,true);                                       // white Pekin
  roam(duck('#8a7f72','#1f6b3a','#d9b23a',1,true,'#6b3a22'),PX+PRX+50,PZ,60,70,18,true);                         // mallard drake
  roam(duck('#8b6a4a','#7a5a3e','#e08a2a'),PX-60,PZ+PRZ+50,90,35,18,true);                                       // mallard hen
  // --- the pond: clear water over a dark bed, lily pads, a stone and grass rim, reeds, swans, ducks and koi ---
  { const pond=new T3.Group(); pond.position.set(PX,0,PZ); g.add(pond);
    const bed=mesh(new T3.CircleGeometry(1,40),M(snow?'#9fb4c4':'#2c5a52',{roughness:1}),false); bed.rotation.x=-Math.PI/2; bed.scale.set(PRX,PRZ,1); bed.position.y=.15; pond.add(bed);
    const water=new T3.Mesh(new T3.CircleGeometry(1,40),new T3.MeshStandardMaterial({color:snow?0xdde9f2:0x5aa7c8,roughness:snow?.6:.06,metalness:.1,transparent:true,opacity:snow?.92:.62,depthWrite:false,envMapIntensity:1.4}));
    water.rotation.x=-Math.PI/2; water.scale.set(PRX,PRZ,1); water.position.y=2.4; water.renderOrder=2; pond.add(water);
    // rim: stones and short grass tufts all around, a few reeds
    const rim=[], tufts=[], reeds=[]; for(let i=0;i<46;i++){ const a=i/46*TAU+rr(-.04,.04), rx=Math.cos(a)*(PRX+rr(2,10)), rz=Math.sin(a)*(PRZ+rr(2,10));
      rim.push([PX+rx,2,PZ+rz,rr(8,13),rr(4,7),rr(7,11),pick(['#a8a092','#8f887b','#bdb5a6'])]);
      for(let k=0;k<3;k++){ const o=rr(10,24); tufts.push([PX+Math.cos(a+rr(-.06,.06))*(PRX+o),5,PZ+Math.sin(a+rr(-.06,.06))*(PRZ+o),rr(2.2,3.4),rr(8,15),rr(2.2,3.4),pick(snow?['#dfe8ee','#cfdbe4']:['#4f9a2e','#5fae36','#3f8a26'])]); } }
    for(let i=0;i<14;i++){ const a=rr(.6,2.4)+(i%2?Math.PI:0); reeds.push([PX+Math.cos(a)*(PRX-6),18,PZ+Math.sin(a)*(PRZ-6),1.2,36,1.2,'#5d8a3a']); }
    const inst=(geo,mat,list)=>{ const im=new T3.InstancedMesh(geo,mat,list.length); list.forEach((d,i)=>{ _m.compose(_v1.set(d[0],d[1],d[2]),_q.setFromAxisAngle(UP,(i*2.39)%TAU),_s.set(d[3],d[4],d[5])); im.setMatrixAt(i,_m); im.setColorAt(i,_c.set(d[6])); }); im.userData.noInk=true; g.add(im); return im; };
    inst(G.sph,M('#ffffff',{roughness:.9}),rim); inst(G.cone,M('#ffffff',{roughness:.8}),tufts); if(!snow){ inst(G.cylU,M('#ffffff',{roughness:.8}),reeds);
      inst(G.cylU,M('#ffffff',{roughness:.8}),reeds.slice(0,8).map(r=>[r[0],38,r[2],2.4,9,2.4,'#6b4428'])); }   // cattail heads
    if(!snow) for(let i=0;i<5;i++){ const lp=mesh(new T3.CircleGeometry(1,16,.3,TAU-.3),M('#3f8a2e',{roughness:.6,side:T3.DoubleSide}),false); lp.rotation.x=-Math.PI/2; const a=rand()*TAU, r=rr(.35,.8);
      lp.position.set(Math.cos(a)*PRX*r,2.7,Math.sin(a)*PRZ*r); lp.scale.setScalar(rr(9,13)); pond.add(lp);
      if(i%2===0){ const fl=mesh(G.sph,M('#f6a6c8',{roughness:.5}),false); fl.position.set(lp.position.x+2,4.5,lp.position.z); fl.scale.set(3.4,2.4,3.4); pond.add(fl); } }
    // koi under the surface
    const KOI=['#f2701e','#ffffff','#f2b21e','#e8402a','#f4f0e8','#ff8a3d'];
    if(!snow) for(let i=0;i<7;i++){ const f=new T3.Group(), fm=M(KOI[i%KOI.length],{roughness:.35}); pond.add(f);
      P0(mesh(G.sphX,fm,false),0,0,0,7,2.2,2.6,f); const tl=P0(mesh(G.cone,fm,false),-8.5,0,0,2.6,5,1,f); tl.rotation.z=Math.PI/2; if(i%2) P0(mesh(G.sph,M('#e8402a'),false),2,1.2,0,3,1.2,1.6,f);
      const r=rr(.25,.7), sp=rr(.25,.5)*(i%2?1:-1), ph=rand()*TAU;
      surroundLife.push(t=>{ const a=ph+t*sp; f.position.set(Math.cos(a)*PRX*r,1.1,Math.sin(a)*PRZ*r); f.rotation.y=-(a+(sp>0?Math.PI/2:-Math.PI/2)); tl.rotation.y=Math.sin(t*8+ph)*.4; }); }
    // swans: white, long S-curved neck, orange bill with a black knob
    const swan=()=>{ const sw=new T3.Group(), wm=M('#fbfaf6',{roughness:.6}); P0(mesh(G.sphX,wm,false),0,5,0,18,8,11,sw); const wg=P0(mesh(G.sph,wm,false),-4,10,0,13,6,9.5,sw); wg.rotation.z=-.25;
      const neck=new T3.Mesh(new T3.TubeGeometry(new T3.CatmullRomCurve3([new T3.Vector3(10,8,0),new T3.Vector3(15,16,0),new T3.Vector3(12,25,0),new T3.Vector3(15,33,0)]),16,2.3,8,false),wm); sw.add(neck);
      P0(mesh(G.sph,wm,false),16.5,34,0,3.6,3.4,3.2,sw); const bl=P0(mesh(G.cone,M('#f07a1e'),false),21,33,0,1.5,5,1.4,sw); bl.rotation.z=-Math.PI/2-.3; P0(mesh(G.sphLow,M('#151515'),false),18.6,34.2,0,1.4,1.4,1.3,sw);
      for(const sd of [-1,1]) P0(mesh(G.sphLow,eyeM,false),17.4,35,sd*2.6,.6,.6,.6,sw); return sw; };
    const swimmers=[swan(),swan(),duck('#f6f4ee','#f6f4ee','#f2a02a',.9).g,duck('#8a7f72','#1f6b3a','#d9b23a',.9,true,'#6b3a22').g];
    swimmers.forEach((sw,i)=>{ if(snow&&i>1) return; pond.add(sw); const r=rr(.35,.65), sp=rr(.1,.18)*(i%2?1:-1), ph=i*1.6;
      surroundLife.push(t=>{ const a=ph+t*sp; sw.position.set(Math.cos(a)*PRX*r,i<2?-1:-4.5,Math.sin(a)*PRZ*r); sw.rotation.y=-(a+(sp>0?Math.PI/2:-Math.PI/2)); sw.rotation.z=Math.sin(t*1.6+ph)*.04; }); }); }
  // --- sheep grazing beside the yard ---
  const woolM=new CartoonMat({color:snow?0xf4f1ea:0xf1ece2,map:woolTex(),roughness:.95}), faceM=M('#2a2420',{roughness:.8});
  for(let i=0;i<2;i++){ const sh=new T3.Group(), sx=x1+rr(150,260), sz=rr(-H*.25,H*.2)+i*120; sh.position.set(sx,0,sz); sh.rotation.y=rr(1.2,2.2); g.add(sh);
    for(const [x,y,z,r] of [[0,34,0,20],[-12,33,6,15],[-12,33,-6,15],[12,34,6,15],[12,34,-6,15],[0,42,0,14],[-18,35,0,13]]) put(mesh(G.sph,woolM),x,y,z,r,r*.9,r,sh);
    const head=new T3.Group(); head.position.set(22,36,0); sh.add(head); put(mesh(G.sph,faceM),6,0,0,9,7,6,head); put(mesh(G.sph,woolM),1,5,0,6,5,6,head);
    for(const sd of [-1,1]){ const e=put(mesh(G.sph,faceM),2,2,sd*7,2,5,1.4,head); e.rotation.x=sd*1.1; put(mesh(G.sphLow,M('#f3e7c8')),10,2,sd*4,1.2,1.2,1.2,head); }
    for(const [x,z] of [[12,7],[12,-7],[-12,7],[-12,-7]]) put(mesh(G.cylU,faceM),x,10,z,2.6,20,2.6,sh);
    const ph=rand()*10; surroundLife.push(t=>{ const gz=(Math.sin(t*.35+ph)+1)/2; head.rotation.z=-gz*.9; head.position.y=36-gz*12; }); }
  // --- a rabbit hopping about on the left ---
  { const furM=M(snow?'#f3f0ea':'#9a7b5e',{roughness:.9}), rb=new T3.Group(), rx=x0-170, rz=H*.15; g.add(rb);
    put(mesh(G.sph,furM),0,10,0,11,9,8,rb); put(mesh(G.sph,furM),10,17,0,6.5,6,5.5,rb); put(mesh(G.sph,M('#ffffff')),-11,13,0,4,4,4,rb);
    for(const sd of [-1,1]){ const e=put(mesh(G.sph,furM),8,30,sd*2.6,2,9,1.4,rb); e.rotation.x=sd*.15; put(mesh(G.sphLow,eyeM),14,19,sd*3.6,1,1,1,rb); }
    const ph=rand()*10; surroundLife.push(t=>{ const c=(t+ph)%2.6, hop=c<.45?Math.sin(c/.45*Math.PI):0; rb.position.set(rx+Math.sin((t+ph)*.12)*90,hop*14,rz+Math.cos((t+ph)*.09)*120); rb.rotation.y=-((t+ph)*.12)+Math.PI/2; }); }
}
function updateCrawlers(dt){
  for(const a of ants){ a.s+=a.spd*dt; if(a.s>a.tr.len) a.s-=a.tr.len; }
  const walk=b=>{ b.a+=rr(-2,2)*dt*2; b.x+=Math.cos(b.a)*b.spd*dt; b.y+=Math.sin(b.a)*b.spd*dt; if(b.x<10||b.x>W-10||b.y<10||b.y>H-10) b.a=Math.atan2(H/2-b.y,W/2-b.x)+rr(-.8,.8); };
  ladybugs.forEach(walk); beetles.forEach(walk);
  if(antMesh){ ants.forEach((a,i)=>{ const p=trailPos(a.tr,a.s),q=trailPos(a.tr,a.s+2),[X,Z]=g2w(p.x+a.off,p.y); _q.setFromAxisAngle(UP,-Math.atan2(q.y-p.y,q.x-p.x)); _m.compose(_v1.set(X,1.2,Z),_q,_s.set(4.5,1.5,2)); antMesh.setMatrixAt(i,_m); }); antMesh.instanceMatrix.needsUpdate=true; }
  if(ladyMesh){ ladybugs.forEach((b,i)=>{ const [X,Z]=g2w(b.x,b.y); _q.setFromAxisAngle(UP,-b.a); _m.compose(_v1.set(X,0,Z),_q,_s.set(6,3.6,5.2)); ladyMesh.setMatrixAt(i,_m); }); ladyMesh.instanceMatrix.needsUpdate=true; }
  if(beetleMesh){ beetles.forEach((b,i)=>{ const [X,Z]=g2w(b.x,b.y); _q.setFromAxisAngle(UP,-b.a); _m.compose(_v1.set(X,0,Z),_q,_s.set(8.5,3.4,5)); beetleMesh.setMatrixAt(i,_m); }); beetleMesh.instanceMatrix.needsUpdate=true; }
}
function wingTexture(p){ const key='wing|'+p.join('|'); if(texCache[key]) return texCache[key]; const c=mkCanvas(128,128),g=c.getContext('2d'),[c1,c2,c3]=p;
  const wing=(cx,cy,rx,ry,rot)=>{ g.save(); g.translate(cx,cy); g.rotate(rot); const gr=g.createRadialGradient(0,0,2,0,0,Math.max(rx,ry)); gr.addColorStop(0,c1); gr.addColorStop(.75,c1); gr.addColorStop(1,c2); g.fillStyle=gr; g.beginPath(); g.ellipse(0,0,rx,ry,0,0,TAU); g.fill(); g.strokeStyle=c2; g.lineWidth=3; g.stroke(); g.restore(); };
  wing(80,40,40,34,-.5); wing(46,52,32,26,.4); g.fillStyle=c3; for(const [x,y] of [[98,24],[86,50],[52,64]]){ g.beginPath(); g.arc(x,y,4,0,TAU); g.fill(); } const t=canvasTex(c); texCache[key]=t; return t; }
function makeButterfly(p){ const g=new T3.Group(), wm=new CartoonMat({map:wingTexture(p),transparent:true,alphaTest:.4,side:T3.DoubleSide,roughness:.6}), wgeo=new T3.PlaneGeometry(1,1).rotateX(-Math.PI/2).translate(0,0,.5);
  const L=new T3.Mesh(wgeo,wm),R=new T3.Mesh(wgeo,wm),s=rr(18,26); L.scale.set(s,1,s); R.scale.set(s,1,-s); g.add(L,R); const body=mesh(G.sphX,stdMat('#1c1410')); body.scale.set(s*.45,1.4,1.4); g.add(body); world.add(g);
  return {g,L,R,x:rand()*W,y:rand()*H,h:rr(30,90),vx:rr(-30,30),vy:rr(-30,30),t:rand()*10}; }
function makeBee(){ const g=new T3.Group(),c=mkCanvas(64,16),x=c.getContext('2d'); for(let i=0;i<8;i++){ x.fillStyle=i%2?'#2a1a05':'#f5c518'; x.fillRect(i*8,0,8,16); }
  const body=mesh(G.sphX,stdMat('#ffffff',{map:canvasTex(c),roughness:.5})); body.scale.set(6,3.6,3.6); g.add(body);
  const wm=new T3.MeshBasicMaterial({color:0xeaf4ff,transparent:true,opacity:.5,side:T3.DoubleSide,depthWrite:false}), L=mesh(G.sphLow,wm,false), R=mesh(G.sphLow,wm,false); L.scale.set(4,.3,2.6); R.scale.set(4,.3,2.6); L.position.set(-1,3,-3); R.position.set(-1,3,3); g.add(L,R); world.add(g);
  return {g,L,R,cx:rand()*W,cy:rand()*H,t:rand()*10,x:0,y:0,a:0,r:rr(20,50)}; }
function updateFliers(dt){
  for(const b of butterflies){ b.t+=dt; b.vx+=rr(-1,1)*120*dt; b.vy+=rr(-1,1)*120*dt;
    if(cat.visible){ const dx=b.x-cat.x,dy=b.y-cat.y,d=Math.hypot(dx,dy); if(d<170&&d>0){ b.vx+=dx/d*400*dt; b.vy+=dy/d*400*dt; } }
    if(b.x<40) b.vx+=80*dt; if(b.x>W-40) b.vx-=80*dt; if(b.y<40) b.vy+=80*dt; if(b.y>H-40) b.vy-=80*dt;
    const sp=Math.hypot(b.vx,b.vy); if(sp>110){ b.vx*=110/sp; b.vy*=110/sp; } b.x+=b.vx*dt; b.y+=b.vy*dt; b.h=clamp(b.h+Math.sin(b.t*1.7)*20*dt,25,110);
    const [X,Z]=g2w(b.x,b.y); b.g.position.set(X,b.h+Math.sin(b.t*8)*3,Z); b.g.rotation.y=-Math.atan2(b.vy,b.vx); const f=Math.sin(b.t*14)*1.1; b.L.rotation.x=-f; b.R.rotation.x=f; }
  for(const b of bees){ b.t+=dt; const nx=b.cx+Math.cos(b.t*1.3)*b.r+Math.sin(b.t*3.7)*12, ny=b.cy+Math.sin(b.t*1.9)*b.r*.7+Math.cos(b.t*4.3)*10; b.a=Math.atan2(ny-b.y,nx-b.x); b.x=nx; b.y=ny;
    if(rand()<dt*.08){ b.cx=clamp(b.cx+rr(-200,200),40,W-40); b.cy=clamp(b.cy+rr(-200,200),40,H-40); } const [X,Z]=g2w(b.x,b.y); b.g.position.set(X,40+Math.sin(b.t*2.3)*12,Z); b.g.rotation.y=-b.a; const fl=.3+.7*Math.abs(Math.sin(b.t*60)); b.L.scale.z=b.R.scale.z=2.6*fl; }
}
function dotTexture(soft){ const c=mkCanvas(64,64),g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(soft?.25:.6,'rgba(255,255,255,'+(soft?.6:1)+')'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64); return canvasTex(c); }
const DOT=dotTexture(false), GLOW=dotTexture(true);
// ---- weather: rain / storm streaks, lightning + thunder, frost sparkle, rainbow ----
let wx=[], wxObj=null, wxBase=1, wxFlash=0, wxNext=3, wxBolt=null, rainNode=null;
function buildWeather(){ wx=[]; wxObj=null; wxBolt=null; wxFlash=0; wxNext=rr(3,7); const T=theme(), X=T.weather;
  if(X==='rain'||X==='storm'){ const n=Math.round(W*H/(LOW?2400:1200)*(X==='storm'?1.5:1)), pos=new Float32Array(n*6);
    for(let i=0;i<n;i++) wx.push({x:rr(-250,W+250),y:rr(-250,H+250),h:rr(0,650),vh:rr(760,980)});
    const g=new T3.BufferGeometry(); g.setAttribute('position',new T3.BufferAttribute(pos,3)); wxObj=new T3.LineSegments(g,new T3.LineBasicMaterial({color:0xd6e4f2,transparent:true,opacity:X==='storm'?.5:.42,depthWrite:false})); wxObj.frustumCulled=false; world.add(wxObj);
    if(X==='storm'){ const pts=[]; let x=rr(-600,600), y=1400; for(let i=0;i<12;i++){ const nx=x+rr(-90,90), ny=y-110; pts.push(x,y,-H*.9,nx,ny,-H*.9); x=nx; y=ny; }
      const bg=new T3.BufferGeometry(); bg.setAttribute('position',new T3.Float32BufferAttribute(pts,3)); wxBolt=new T3.LineSegments(bg,new T3.LineBasicMaterial({color:0xeaf2ff,fog:false})); wxBolt.visible=false; world.add(wxBolt); } }
  if(X==='frost'){ const n=Math.round(W*H/5000), pos=new Float32Array(n*3); for(let i=0;i<n;i++){ const [X2,Z2]=g2w(rand()*W,rand()*H); pos[i*3]=X2; pos[i*3+1]=rr(1,6); pos[i*3+2]=Z2; }
    const g=new T3.BufferGeometry(); g.setAttribute('position',new T3.BufferAttribute(pos,3)); wxObj=new T3.Points(g,new T3.PointsMaterial({map:GLOW,size:10,color:0xdff4ff,transparent:true,depthWrite:false,opacity:.8})); world.add(wxObj); }
  if(X==='rainbow'){ const arc=new T3.Mesh(new T3.TorusGeometry(W*.62,70,10,72,Math.PI),new T3.MeshBasicMaterial({map:rainbowTex(),transparent:true,opacity:.5,depthWrite:false,fog:false,side:T3.DoubleSide})); arc.position.set(0,-100,-H/2-200); arc.rotation.x=.75; arc.material.opacity=.4;   /* leans toward the camera so it arches over the far half of the yard in the gameplay view */ world.add(arc); }
  setRain(X==='rain'||X==='storm'?(X==='storm'?.11:.07):0); }
function setRain(vol){ const a=ac; if(rainNode&&(!vol||!a)){ try{ rainNode.g.gain.setTargetAtTime(0,a.currentTime,.4); const n=rainNode; setTimeout(()=>{ try{ n.s.stop(); }catch(e){} },1500); }catch(e){} rainNode=null; }
  if(!vol||!a||rainNode) return; const src=a.createBufferSource(); src.buffer=noiseBuf(a,2.5); src.loop=true; const f=a.createBiquadFilter(); f.type='lowpass'; f.frequency.value=2200; const g=a.createGain(); g.gain.value=0;
  src.connect(f).connect(g).connect(master); src.start(); g.gain.setTargetAtTime(vol,a.currentTime,.8); rainNode={s:src,g}; }
function updateWeather(dt){ const X=theme().weather; if(!X) return;
  if((X==='rain'||X==='storm')&&wxObj){ const P=wxObj.geometry.attributes.position.array, wind=X==='storm'?-60:-20;
    wx.forEach((q,i)=>{ q.h-=q.vh*dt; q.x+=wind*dt*.3; if(q.h<0){ q.h=rr(500,650); q.x=rr(-250,W+250); q.y=rr(-250,H+250); } const [X2,Z2]=g2w(q.x,q.y), k=i*6; P[k]=X2; P[k+1]=q.h; P[k+2]=Z2; P[k+3]=X2-wind*.03; P[k+4]=q.h+26; P[k+5]=Z2; });
    wxObj.geometry.attributes.position.needsUpdate=true; }
  if(X==='storm'){ wxNext-=dt; if(wxNext<=0){ wxNext=rr(4,9); wxFlash=1; if(wxBolt){ wxBolt.position.x=rr(-W*.6,W*.6); wxBolt.visible=true; } const d=rr(.4,1.6); timers.push(setTimeout(()=>sfx.thunder(),d*1000)); }
    wxFlash=Math.max(0,wxFlash-dt*2.6); const fl=wxFlash>.5?1:wxFlash*1.6*(Math.sin(time*60)>0?1:.4); hemi.intensity=wxBase*(1+fl*5); if(wxBolt) wxBolt.visible=wxFlash>.45; }
  if(X==='frost'&&wxObj) wxObj.material.opacity=.45+.4*Math.abs(Math.sin(time*1.7)); }
function buildAmbient3D(){ buildWeather(); amb=[]; ambObj=null; const A=theme().ambient;
  if(A==='snow'){ const n=Math.round(W*H/(LOW?3500:1800)),pos=new Float32Array(n*3); for(let i=0;i<n;i++) amb.push({x:rr(-200,W+200),y:rr(-200,H+200),h:rr(0,500),vx:rr(-15,5),vh:rr(30,65),ph:rand()*TAU});
    const g=new T3.BufferGeometry(); g.setAttribute('position',new T3.BufferAttribute(pos,3)); ambObj=new T3.Points(g,new T3.PointsMaterial({map:DOT,size:6,transparent:true,depthWrite:false})); world.add(ambObj); }
  if(A==='fireflies'){ const n=Math.max(18,Math.round(W*H/40000)),pos=new Float32Array(n*3),col=new Float32Array(n*3); for(let i=0;i<n;i++) amb.push({x:rand()*W,y:rand()*H,h:rr(15,90),vx:0,vy:0,ph:rand()*TAU,t:rand()*10});
    const g=new T3.BufferGeometry(); g.setAttribute('position',new T3.BufferAttribute(pos,3)); g.setAttribute('color',new T3.BufferAttribute(col,3)); ambObj=new T3.Points(g,new T3.PointsMaterial({map:GLOW,size:26,transparent:true,depthWrite:false,vertexColors:true,blending:T3.AdditiveBlending,fog:false})); world.add(ambObj); }
  if(A==='leaves'){ const n=Math.max(25,Math.round(W*H/30000)),lc=mkCanvas(64,40),lg=lc.getContext('2d'); drawLeaf(lg,32,20,26,0,'#ffffff');
    const im=new T3.InstancedMesh(new T3.PlaneGeometry(1,.62),new CartoonMat({map:canvasTex(lc),alphaTest:.5,side:T3.DoubleSide,roughness:.8}),n);
    for(let i=0;i<n;i++){ amb.push({x:rand()*W,y:rand()*H,h:rr(0,300),vx:rr(25,60),vy:rr(-10,20),vh:rr(25,50),rot:rand()*TAU,vr:rr(-3,3),size:rr(12,20),t:rand()*10}); im.setColorAt(i,_c.set(pick(LEAF_COLORS))); } ambObj=im; world.add(im); } }
const fireGlow=p=>Math.pow(Math.max(0,Math.sin(p.t*2.2+p.ph)),4);
function updateAmbient3D(dt){ const A=theme().ambient; if(!ambObj) return;
  if(A==='snow'){ const P=ambObj.geometry.attributes.position.array; amb.forEach((p,i)=>{ p.x+=(p.vx+Math.sin(time+p.ph)*8)*dt; p.h-=p.vh*dt; if(p.h<0){ p.h=500; p.x=rr(-200,W+200); p.y=rr(-200,H+200); } const [X,Z]=g2w(p.x,p.y); P[i*3]=X; P[i*3+1]=p.h; P[i*3+2]=Z; }); ambObj.geometry.attributes.position.needsUpdate=true; }
  if(A==='fireflies'){ const P=ambObj.geometry.attributes.position.array,C=ambObj.geometry.attributes.color.array;
    amb.forEach((p,i)=>{ p.t+=dt; p.vx+=rr(-1,1)*60*dt; p.vy+=rr(-1,1)*60*dt; const sp=Math.hypot(p.vx,p.vy); if(sp>30){ p.vx*=30/sp; p.vy*=30/sp; } p.x+=p.vx*dt; p.y+=p.vy*dt; if(p.x<20||p.x>W-20) p.vx*=-1; if(p.y<20||p.y>H-20) p.vy*=-1;
      const [X,Z]=g2w(p.x,p.y),b=fireGlow(p); P[i*3]=X; P[i*3+1]=p.h+Math.sin(p.t)*6; P[i*3+2]=Z; C[i*3]=.85*b; C[i*3+1]=b; C[i*3+2]=.4*b; }); ambObj.geometry.attributes.position.needsUpdate=true; ambObj.geometry.attributes.color.needsUpdate=true; }
  if(A==='leaves'){ amb.forEach((p,i)=>{ p.t+=dt; p.x+=(p.vx+Math.sin(p.t*1.3)*25)*dt; p.y+=(p.vy+Math.cos(p.t*1.7)*15)*dt; p.h=Math.max(0,p.h-p.vh*dt); p.rot+=p.vr*dt;
      if((p.h<=0&&rand()<dt*.3)||p.x>W+60){ p.x=rr(-60,W*.5); p.y=rand()*H; p.h=rr(150,320); } const [X,Z]=g2w(p.x,p.y);
      _q.setFromEuler(_e.set(p.h>0?Math.sin(p.t*3)*1.2:-Math.PI/2,p.rot,p.h>0?Math.cos(p.t*2.3):0)); _m.compose(_v1.set(X,p.h+.8,Z),_q,_s.set(p.size,p.size,1)); ambObj.setMatrixAt(i,_m); }); ambObj.instanceMatrix.needsUpdate=true; } }

// ================= particles / hearts / rings / reticle =================
const MAXP=LOW?450:900, pMesh=new T3.InstancedMesh(G.sphLow,stdMat('#ffffff'),MAXP); pMesh.count=0; pMesh.instanceColor=new T3.InstancedBufferAttribute(new Float32Array(MAXP*3),3); pMesh.frustumCulled=false; scene.add(pMesh); inkify(pMesh,1.1,true);
let parts=[];
function addPart(o){ if(parts.length<MAXP) parts.push(o); }
// cartoon 'poof': fluffy cloud puffs that spring out and shrink away, plus a shower of bright confetti
const POOF_COLS=['#ff4d6d','#ffd23f','#3ddc97','#4cc9f0','#b388ff','#ff8c42','#ffffff'], PUFF_COLS=['#ffffff','#f3f0ff','#fff4dc'];
function poof(x,y,n=20,dir,speed=300,h=12,puffs=true){
  if(puffs) for(let i=0;i<Math.max(4,n/3|0);i++){ const a=rand()*TAU,s=rr(25,85),l=rr(.45,.75); addPart({x:x+Math.cos(a)*6,y:y+Math.sin(a)*6,z:h+rr(0,10),vx:Math.cos(a)*s,vy:Math.sin(a)*s,vz:rr(15,60),life:l,max:l,size:rr(7,12)*(n>12?1.15:.8),col:new T3.Color(pick(PUFF_COLS)),puff:true}); }
  for(let i=0;i<n;i++){ const a=dir===undefined?rand()*TAU:dir+rr(-1.1,1.1),s=speed*rr(.3,1),l=rr(.7,1.1); addPart({x,y,z:h,vx:Math.cos(a)*s,vy:Math.sin(a)*s,vz:rr(140,330),life:l,max:l,size:rr(1.8,3.2),col:new T3.Color(pick(POOF_COLS)),grav:650}); } }
function burst(x,y,n,colors,spd=220,life=.6,size=4,h=6){ for(let i=0;i<n;i++){ const a=rand()*TAU,s=spd*rr(.3,1); addPart({x,y,z:h,vx:Math.cos(a)*s,vy:Math.sin(a)*s,vz:rr(60,260),life,max:life,size:size*rr(.6,1.3)*.7,col:new T3.Color(pick(colors)),grav:700}); } }
function updateParts(dt){ let k=0;
  const drag=Math.pow(.02,dt);
  for(const p of parts){ p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
    if(p.puff){ p.vx*=drag; p.vy*=drag; p.vz*=drag; } else { p.vz-=(p.grav||900)*dt; p.vx*=.985; p.vy*=.985; if(p.z<=0){ p.z=0; p.vz*=-.45; p.vx*=.6; p.vy*=.6; } }
    if(p.life>0){ const pk=1-p.life/p.max, [X,Z]=g2w(p.x,p.y), sc=p.size*(p.puff?(pk<.3?backOut(pk/.3):1-smooth(.3,1,pk)):Math.min(1,p.life/p.max*2)); _m.compose(_v1.set(X,p.z+p.size,Z),_q.identity(),_s.set(sc,sc,sc)); pMesh.setMatrixAt(k,_m); pMesh.setColorAt(k,p.col); k++; } }
  parts=parts.filter(p=>p.life>0); pMesh.count=k; pMesh.instanceMatrix.needsUpdate=true; pMesh.instanceColor.needsUpdate=true; }
const heartTex=(()=>{ const c=mkCanvas(64,64),g=c.getContext('2d'); g.fillStyle='#fff'; heartShape(g,32,8,48); g.fill(); return canvasTex(c); })();
let hearts=[];
function addHeart(x,y,h){ const sp=new T3.Sprite(new T3.SpriteMaterial({map:heartTex,color:pick(['#ff6b8a','#ff8fab','#ff4d6d']),transparent:true,depthWrite:false})); const s=rr(10,16); sp.scale.set(s,s,1); scene.add(sp); hearts.push({sp,x,y,h,vx:rr(-15,15),vy:rr(-15,15),vh:rr(40,60),life:1.8}); }
function updateHearts(dt){ for(const h of hearts){ h.life-=dt; h.x+=h.vx*dt; h.y+=h.vy*dt; h.h+=h.vh*dt; const [X,Z]=g2w(h.x,h.y); h.sp.position.set(X+Math.sin(h.life*6)*3,h.h,Z); h.sp.material.opacity=Math.min(1,h.life); if(h.life<=0){ scene.remove(h.sp); h.sp.material.dispose(); } } hearts=hearts.filter(h=>h.life>0); }
let rings=[];
function addRing(x,y,R,color,life){ const m=new T3.Mesh(new T3.RingGeometry(.9,1,72),new T3.MeshBasicMaterial({color,transparent:true,depthWrite:false,side:T3.DoubleSide})); m.rotation.x=-Math.PI/2; const [X,Z]=g2w(x,y); m.position.set(X,3,Z); scene.add(m); rings.push({m,R,life,max:life}); }
function updateRings(dt){ for(const r of rings){ r.life-=dt; const k=1-r.life/r.max; r.m.scale.setScalar(Math.max(1,r.R*k)); r.m.material.opacity=(1-k)*.85; if(r.life<=0){ scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); } } rings=rings.filter(r=>r.life>0); }
const retCv=mkCanvas(128,128); { const g=retCv.getContext('2d'); g.lineCap='round';
  // two passes: dark outline first, then white on top, so the reticle reads on light floors (kitchen, snow) and dark ones alike
  for(const [col,lw,grow] of [['rgba(25,18,10,.85)',11,2.5],['#fff',5,0]]){ g.strokeStyle=col; g.fillStyle=col; g.lineWidth=lw; g.setLineDash([10,16]); g.beginPath(); g.arc(64,64,57,0,TAU); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.ellipse(64,72,12+grow,10+grow,0,0,TAU); g.fill(); for(const [x,y] of [[-12,-8],[-4,-16],[4,-16],[12,-8]]){ g.beginPath(); g.arc(64+x,64+y,4.5+grow,0,TAU); g.fill(); } } }
const reticle=new T3.Mesh(new T3.PlaneGeometry(1,1),new T3.MeshBasicMaterial({map:canvasTex(retCv),transparent:true,depthWrite:false,opacity:.9})); reticle.rotation.x=-Math.PI/2; reticle.renderOrder=5; scene.add(reticle);

// ================= stains =================
let groundDirty=0, groundT=0, stainLife=0;
function markStains(){ groundDirty=1; stainLife=12; if(stainMesh) stainMesh.visible=true; }
function clearStains(){ if(sctx) sctx.clearRect(0,0,W,H); stainLife=0; groundDirty=0; if(stainMesh) stainMesh.visible=false; if(stainTex) stainTex.needsUpdate=true; }
function pawPrint(x,y,a){ sctx.save(); sctx.translate(x,y); sctx.rotate(a); sctx.fillStyle='rgba(120,145,175,.45)'; sctx.beginPath(); sctx.ellipse(0,0,3.6,3,0,0,TAU); sctx.fill(); for(const [tx,ty] of [[4,-3],[5.5,-1],[5.5,1],[4,3]]){ sctx.beginPath(); sctx.arc(tx,ty*1.1,1.3,0,TAU); sctx.fill(); } sctx.restore(); markStains(); }
function refreshGround(dt){ groundT+=dt; if(groundT<(LOW?.2:.12)) return false; groundT=0; stainTex.needsUpdate=true; return true; }

// ================= camera =================
const camS={yaw:Math.PI/2,pitch:.85,dist:1000,tx:0,ty:0,tz:0}, camU={yaw:0,yawT:0,pitch:0,zoom:1};
let orbitYaw=0, shake=0;
function fitDist(){ const vf=camera.fov*Math.PI/360,asp=camera.aspect||1; return Math.max((H/2)/Math.tan(vf),(W/2)/(Math.tan(vf)*asp))*1.06+40; }
function updateCamera(dt){
  const v=settings.view, fit=fitDist(); let pitch=.86, yaw=Math.PI/2, tx=0, ty=0, tz=0, dist=fit*1.08;
  camU.yaw+=angDiff(camU.yawT,camU.yaw)*Math.min(1,dt*6);
  if(state==='menu'){ yaw=Math.PI/2+.45; pitch=.62; dist=fit*1.02; }
  else if(state==='treat'&&cat.visible&&man){
    const ma=Math.atan2(cat.y-man.y,cat.x-man.x);
    const [mx,mz]=g2w(man.x,man.y);
    if(cat.rollP>.05){ yaw=ma+.75; pitch=.42; dist=420; tx=lerp(cat.x-W/2,mx,.3); tz=lerp(cat.y-H/2,mz,.3); ty=55; }
    else { yaw=ma+.55; pitch=.28; dist=500; tx=lerp(cat.x-W/2,mx,.45); tz=lerp(cat.y-H/2,mz,.45); ty=62; }
    yaw+=camU.yaw;
  }
  else if(lion&&lion.phase!=='leave'){ pitch=.6; dist=fit*1.05; yaw+=camU.yaw; }
  else { yaw+=camU.yaw;
    if(v==='top'){ pitch=1.45; dist=fit; } else if(v==='angle'){ pitch=.86; dist=fit*1.1; tz=H*.04; }
    else if(v==='follow'){ pitch=.62; dist=430; tx=cat.x-W/2; tz=cat.y-H/2; } else if(v==='orbit'){ orbitYaw+=dt*.22; yaw+=orbitYaw; pitch=.78; dist=fit*1.12; } }
  if(state!=='treat'){ pitch=clamp(pitch+camU.pitch,.16,1.52); dist*=camU.zoom; }
  const k=1-Math.exp(-dt*3);
  camS.yaw+=angDiff(yaw,camS.yaw)*k; camS.pitch+=(pitch-camS.pitch)*k; camS.dist+=(dist-camS.dist)*k; camS.tx+=(tx-camS.tx)*k; camS.ty+=(ty-camS.ty)*k; camS.tz+=(tz-camS.tz)*k;
  const cp=Math.cos(camS.pitch), d=camS.dist;
  camera.position.set(camS.tx+cp*Math.cos(camS.yaw)*d,camS.ty+Math.sin(camS.pitch)*d,camS.tz+cp*Math.sin(camS.yaw)*d);
  if(shake>0){ const k=shake*1.4; camera.position.x+=(Math.sin(time*47)+Math.sin(time*29.3)*.6)*k; camera.position.y+=Math.sin(time*53.7+1)*k; camera.position.z+=(Math.sin(time*41.1+2)+Math.sin(time*23.9)*.6)*k; }
  camera.lookAt(camS.tx,camS.ty,camS.tz); camera.updateMatrixWorld();
  rim.position.set(camS.tx-Math.cos(camS.yaw)*600,350,camS.tz-Math.sin(camS.yaw)*600); rim.target.position.set(camS.tx,0,camS.tz);
  const w=screenToWorld(mouse.sx,mouse.sy); if(w){ mouse.x=w.x; mouse.y=w.y; }
}
const ray=new T3.Raycaster(), ndc=new T3.Vector2(), gplane=new T3.Plane(new T3.Vector3(0,1,0),0), hitP=new T3.Vector3();
function screenToWorld(sx,sy){ ndc.set(sx/innerWidth*2-1,-(sy/innerHeight)*2+1); ray.setFromCamera(ndc,camera); if(ray.ray.intersectPlane(gplane,hitP)) return {x:clamp(hitP.x+W/2,-50,W+50),y:clamp(hitP.z+H/2,-50,H+50)}; return null; }
function toScreen(x,y,h){ _v1.set(x-W/2,h,y-H/2).project(camera); return {x:(_v1.x+1)/2*innerWidth,y:(1-_v1.y)/2*innerHeight,vis:_v1.z<1&&_v1.z>-1}; }

// ================= simulation: body / feet / tail =================
const GROUP=[0,1,1,0];
function catDims(c,K){ const B=c.B||breed(),lion=!!B.mane,s=K*(B.scale||1)*(1+(c.air||0)*.12),sit=c.sit||0,hk=lion?1.1:HEADK,neck=(13+B.head*.45)*s,wk=lion?1:1.08;
  return {B,s,hk,lion,seg:24*B.len*s*(lion?1:.82)*(1-.22*sit)*(1+(c.air||0)*.12),wS:15*B.wid*s*wk,wM:12.5*B.wid*s*wk,wP:15.5*B.wid*s*wk,neck,legH:(lion?22:18)*s*B.leg,
    bite:neck*(lion?1:.62)+B.head*hk*s*(1.02+B.muzzle/B.head*.12)}; }
function followSeg(prev,cur,len,ref,maxB){ let a=Math.atan2(prev.y-cur.y,prev.x-cur.x); const da=angDiff(a,ref); if(da>maxB) a=ref+maxB; else if(da<-maxB) a=ref-maxB; cur.x=prev.x-Math.cos(a)*len; cur.y=prev.y-Math.sin(a)*len; return a; }
function footTargets(c,D){ const [S,,P]=c.spine,s=D.s,B=D.B,sit=c.sit||0,d1x=Math.cos(c.a1),d1y=Math.sin(c.a1),n1x=-d1y,n1y=d1x,d2x=Math.cos(c.a2),d2y=Math.sin(c.a2),n2x=-d2y,n2y=d2x,out=[];
  for(const sd of [-1,1]) out.push({x:S.x+d1x*9*s*B.leg+n1x*sd*D.wS*.72,y:S.y+d1y*9*s*B.leg+n1y*sd*D.wS*.72,px:S.x+d1x*30*s+n1x*sd*7*s,py:S.y+d1y*30*s+n1y*sd*7*s});
  for(const sd of [-1,1]){ const f=2*s+sit*10*s; out.push({x:P.x+d2x*f+n2x*sd*D.wP*.8,y:P.y+d2y*f+n2y*sd*D.wP*.8,px:P.x-d2x*26*s+n2x*sd*9*s,py:P.y-d2y*26*s+n2y*sd*9*s}); } return out; }
function resetSim(c){ c.spine=null; c.feet=null; c.tail=[]; }
function makeChain(n,x,y,a,len){ const c=[]; for(let i=0;i<n;i++) c.push({x:x-Math.cos(a)*len*i,y:y-Math.sin(a)*len*i}); return c; }
function updateChain(ch,ax,ay,len,sway,t,freq){ ch[0].x=ax; ch[0].y=ay; const n=ch.length; for(let i=1;i<n;i++){ const p=ch[i-1],q=ch[i]; let dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy)||1; const w=Math.sin(t*freq-i*.55)*sway*(i/n); q.x+=-dy/d*w; q.y+=dx/d*w; dx=q.x-p.x; dy=q.y-p.y; d=Math.hypot(dx,dy)||1; q.x=p.x+dx/d*len; q.y=p.y+dy/d*len; } }
function updateCatTail(ch,ax,ay,baseAng,len,amp,t,freq){ ch[0].x=ax; ch[0].y=ay; let prevA=baseAng+Math.PI; const n=ch.length,bend=Math.sin(t*freq)*amp,flick=Math.sin(t*freq*2.3+1)*amp*.5;
  for(let i=1;i<n;i++){ const p=ch[i-1],q=ch[i]; let a=Math.atan2(q.y-p.y,q.x-p.x); const k=i/n,rest=prevA+bend*(.5+k)+(k>.7?flick:0)+.03; a+=angDiff(rest,a)*.16; const rel=angDiff(a,prevA); if(rel>.42) a=prevA+.42; else if(rel<-.42) a=prevA-.42; q.x=p.x+Math.cos(a)*len; q.y=p.y+Math.sin(a)*len; prevA=a; } }
function updateCatSim(c,dt,K){
  const D=catDims(c,K),B=D.B,s=D.s;
  if(!c.spine){ const dx=Math.cos(c.angle),dy=Math.sin(c.angle); c.spine=[{x:c.x,y:c.y},{x:c.x-dx*D.seg,y:c.y-dy*D.seg},{x:c.x-dx*D.seg*2,y:c.y-dy*D.seg*2}]; c.a1=c.a2=c.angle; c.feet=null; c.tail=[]; }
  const [S,M,P]=c.spine; S.x=c.x; S.y=c.y; const maxB=c.pounce?.12:.6; c.a1=followSeg(S,M,D.seg,c.angle,maxB); c.a2=followSeg(M,P,D.seg,c.a1,maxB*.8);
  const T=footTargets(c,D); if(!c.feet) c.feet=T.map(t=>({x:t.x,y:t.y,fx:t.x,fy:t.y,tx:t.x,ty:t.y,t:1,dur:.12,lift:0}));
  const vx=c.vx||0,vy=c.vy||0,sp=Math.hypot(vx,vy);
  if(c.pounce) c.feet.forEach((f,i)=>{ f.x=T[i].px; f.y=T[i].py; f.t=1; f.lift=0; });
  else { for(const f of c.feet){ if(f.t<1){ f.t=Math.min(1,f.t+dt/f.dur); const e=f.t*f.t*(3-2*f.t); f.x=f.fx+(f.tx-f.fx)*e; f.y=f.fy+(f.ty-f.fy)*e; f.lift=Math.sin(Math.PI*f.t); } else f.lift=0; }
    const stepping=gr=>c.feet.some((f,i)=>f.t<1&&GROUP[i]===gr), stride=15*s*B.leg, dur=Math.max(.075,Math.min(.16,stride/(sp+1)*.9));
    c.feet.forEach((f,i)=>{ if(f.t<1) return; const t=T[i],d=Math.hypot(t.x-f.x,t.y-f.y); if(d>stride*3.5){ f.x=t.x; f.y=t.y; return; } const blocked=stepping(1-GROUP[i]);
      if((d>stride&&!blocked)||(sp<5&&d>2.5*s&&!c.feet.some(q=>q.t<1))){ f.fx=f.x; f.fy=f.y; f.tx=t.x+vx*.07; f.ty=t.y+vy*.07; f.t=0; f.dur=dur; } }); }
  const segLen=(B.mane?7.2:3.9)*s*B.tailLen,rx=P.x-Math.cos(c.a2)*10*s,ry=P.y-Math.sin(c.a2)*10*s; if(c.tail.length===0) c.tail=makeChain(13,rx,ry,c.a2,segLen);
  const anger=c.anger||0, amp=c.rollP>0?.16:(anger>.3?.2:(sp<40?.11:.05)), freq=anger>.3?5.5:(c.frenzy>0?4.5:1.4); updateCatTail(c.tail,rx,ry,c.a2,segLen,amp,time,freq);
}

// ================= game state =================
let state='menu', rats=[], texts=[], catnips=[], cheeseWobT=-1, nibbleFx=0, nibbleT=0, foodShown=100;
// how fast one rodent eats (% per second): set by the difficulty, rises 6% per wave, big rats eat more, small mice less
function nibbleRate(T){ const b=T.base||'grey'; return (level().nibble??.9)*(1+(wave-1)*.06)*(b==='big'?1.5:b==='mouse'?.7:1)*(1+(T.evil||0)*.15); }
let waveTarget=0, caught=0, waitNext=false;
let score=0, best=0, wave=1, cheese=CHEESE_MAX, toSpawn=0, spawnTimer=0, spawnBase=1, waveBanner=0;
let combo=1, lastHit=-9, time=0, hits=0, swings=0, killed=0, fadeT=0;
let lion=null, lionModel=null, pawUsed=false, clawUsed=false, powerBanner=0, powerText='';
let eagle=null, eagleModel=null;
let man=null, manModel=null, dog=null, dogModel=null, treatObj=null, treatBanner=0, catModel=null;
const mouse={x:W/2,y:H*.6,sx:innerWidth/2,sy:innerHeight*.6,shown:false};
const cat={x:0,y:0,vx:0,vy:0,angle:-Math.PI/2,headTurn:0,pounce:null,air:0,bite:0,chew:0,blood:0,frenzy:0,cd:0,visible:false,tail:[],spine:null,feet:null,sit:0,still:0,anger:0,blush:0,rollT:-1,rollP:0,rollDone:false,headDown:0};
function catHeadPos(){ const D=catDims(cat,CS); return {x:cat.x+Math.cos(cat.angle)*D.bite,y:cat.y+Math.sin(cat.angle)*D.bite}; }
function biteR(){ return (cat.frenzy>0?60:36)*(level().reach||1); }   // easier modes: a bigger catch radius
const lookOpts=()=>({eyes:settings.eyes,collar:settings.collar,hat:settings.hat,outfit:settings.outfit,glasses:settings.glasses,hatCol:settings.hatCol,outfitCol:settings.outfitCol,glassesCol:settings.glassesCol});
function rebuildCatModel(){ if(catModel) catModel.dispose(); catModel=makeCat(breed(),makeLook(settings.breed,settings.colour),lookOpts(),'cat-'+settings.breed); scene.add(catModel.rig); catModel.setVisible(cat.visible); resetSim(cat); if(cat.visible) updateCatSim(cat,0,CS); }
// 20 waves, each harder than the last: more rodents to catch, faster, shorter gaps, mice turning into rats,
// new coat colours, and from wave 6 on they turn evil (red eyes -> devil fangs -> horns)
const MAX_WAVES=20;
const WAVE_CATCH=15;   // every wave ends after 15 mice / rats are caught
function waveDef(w){ const k=(w-1)/(MAX_WAVES-1);
  return { target:WAVE_CATCH, speed:1+k*.85, gap:1.3-k*.8, evil:w>=16?3:w>=11?2:w>=6?1:0, rat:clamp((w-2)/12,0,.7), big:clamp((w-7)/18,0,.4),
    colours:w<=2?['brown','grey']:w<=4?['brown','grey','black']:w<=7?['grey','black','white']:w<=10?['black','white','grey','piebald']:['black','piebald','white','grey'] }; }
function pickType(){ const D=waveDef(wave), r=rand(); if(wave>=3&&r<.04) return 'albino';
  const base=r<.04+D.big?'big':r<.04+D.big+D.rat?'grey':'mouse'; return ratType(base,pick(D.colours),D.evil); }
function spawnRat(forceType){ const type=forceType||pickType(),T=TYPES[type],h=pick(holes),a=Math.atan2(H/2-h.y,W/2-h.x),lm=state==='menu'?1:level().m;
  const r={type,x:h.x,y:h.y,vx:0,vy:0,hp:T.hp,maxHp:T.hp,size:T.size,speed:T.speed*lm*(state==='menu'?1:1+(waveDef(wave).speed-1)*(level().ramp??1))*((T.base||type)==='mouse'&&state!=='menu'?(level().small??1):1)*rr(.85,1.15),t:rand()*10,wob:rr(2,5),angle:a,ph:0,pause:0,sniff:0,hitCd:0,bleed:false,drip:0,wounds:[],age:0,tail:makeChain(10,h.x,h.y,a,T.size*.28)};
  if(type==='albino'){ let o; do{o=pick(holes);}while(o===h); r.tx=o.x; r.ty=o.y; } r.model=getRatModel(type); rats.push(r); return r; }
function clearWorld(){
  for(const r of rats) if(r.model) releaseRatModel(r.model); rats=[]; texts=[];
  for(const n of catnips) scene.remove(n.obj); catnips=[]; parts=[];
  if(manModel){ manModel.dispose(); manModel=null; } man=null; if(dogModel){ dogModel.dispose(); dogModel=null; } dog=null; removeTreat();
  if(lionModel){ lionModel.dispose(); lionModel=null; } lion=null; endEagle();
  clearStains(); if(cheeseObj) cheeseObj.wedges.forEach(w=>w.visible=true);
}
function removeTreat(){ if(treatObj&&treatObj.obj){ if(treatObj.obj.parent) treatObj.obj.parent.remove(treatObj.obj); disposeTree(treatObj.obj); } treatObj=null; }
let paused=false, pauseDrawn=false;
function canPause(){ return state==='play'||state==='treat'; }
function setPaused(on){ on=!!on&&canPause(); if(on===paused) return; paused=on; pauseDrawn=false; ui.paused=on;
  if(on){ setGrowl(false); pointers.clear(); camDrag=null; try{ if(ac) ac.suspend(); }catch(e){} try{ speechSynthesis.pause(); }catch(e){} }
  else { try{ if(ac&&!muted) ac.resume(); }catch(e){} try{ speechSynthesis.resume(); }catch(e){} last=performance.now(); }
  sync(); }
function togglePause(){ setPaused(!paused); }
function startGame(){ waitNext=false; ui.waveDone=null; ui.won=false; setPaused(false); audio(); sfx.meow(); clearWorld(); best=loadBest(); score=0; wave=1; cheese=CHEESE_MAX; combo=1; lastHit=-9; hits=0; swings=0; killed=0;
  Object.assign(cat,{x:W/2,y:H*.75,vx:0,vy:0,angle:-Math.PI/2,headTurn:0,pounce:null,air:0,bite:0,chew:0,blood:0,frenzy:0,cd:0,visible:true,sit:0,still:0,anger:0,blush:0,rollT:-1,rollP:0,headDown:0});
  resetSim(cat); updateCatSim(cat,0,CS); catModel.setVisible(true); startWave(); state='play';
  Object.assign(ui,{menu:false,over:false,hud:true,controls:true}); updateHud(); }
function quitToMenu(){ setPaused(false); showMenu(); }
function showMenu(){ waitNext=false; ui.waveDone=null; applyScene('garden'); state='menu'; cat.visible=false; catModel.setVisible(false); clearWorld(); setGrowl(false); Object.assign(ui,{over:false,hud:false,controls:false,menu:true}); updatePowers(); }
function sceneFor(w){ const plan=SCENE_PLAN[settings.level]||SCENE_PLAN.normal; return plan[Math.min(plan.length,Math.max(1,w))-1]||'garden'; }
function applyScene(id){ if(!THEMES[id]||id===curScene) return; curScene=id; buildScene3D(); }
function startWave(){ applyScene(sceneFor(wave)); if(wave>maxWave){ const before=maxWave; maxWave=wave; ui.maxWave=maxWave; try{ localStorage.setItem('gardenCatMaxWave',maxWave); }catch(e){}
    const fresh=[]; for(const k in ACC) for(const id in ACC[k]){ const d=ACC[k][id]; if(d.tier==='wave'&&d.wave>before&&d.wave<=maxWave) fresh.push(d.label); } if(fresh.length) timers.push(setTimeout(()=>toast('🎁 Unlocked: '+fresh.join(', ')),1600)); }
  const D=waveDef(wave); waveTarget=D.target; toSpawn=9999; cheese=CHEESE_MAX; setFood(foodFor(wave).id); caught=0; spawnBase=D.gap; spawnTimer=1.4; waveBanner=2; pawUsed=false; clawUsed=false; if(wave>1) sfx.wave(); updatePowers(); }
function maxAlive(){ return Math.min(12,3+Math.ceil(wave/2.5)+(settings.level==='hard'?2:settings.level==='easy'?-1:0)); }
// target reached: stop spawning, the rest scatter back into their holes
function checkWaveDone(){ if(state!=='play'||caught<waveTarget||toSpawn===0) return; toSpawn=0; for(const r of rats) if(!r.dead){ r.dead=true; poof(r.x,r.y,12,undefined,260); } popText(W/2,H*.4,'WAVE COMPLETE!','#ffc93c',34); }
function spawnGap(){ return Math.max(.25,spawnBase*level().gap); }
function gameOver(){ state='over'; ui.canPause=false; setGrowl(false); if(score>best){ best=score; saveBest(best); }
  ui.finalScore=score; ui.overMsg=`The bandicoots ate all the ${foodFor(wave).label} while ${settings.name} was on patrol!`;
  const acc=swings?Math.round(hits/swings*100):0; ui.won=false; ui.finalInfo=`${settings.name} caught ${killed} rodents · Wave ${wave}/${MAX_WAVES} · ${level().label.replace(/^\S+ /,'')} mode · ${acc}% pounce accuracy · Best ${best}`;
  sfx.hiss(); sfx.lose(); ui.controls=false; updatePowers(); timers.push(setTimeout(()=>{ if(state==='over'){ ui.over=true; sync(); } },900)); updateHud(); }
function updateHud(){ ui.score=score; ui.wave=wave; ui.maxWaves=MAX_WAVES; ui.target=waveTarget; ui.caught=Math.min(caught,waveTarget); ui.best=Math.max(best,score);
  const ch=Math.max(0,cheese), fe=foodFor(wave).emoji, seg=Math.ceil(ch/10); ui.cheeseText=innerWidth<=640?`${fe} ${Math.ceil(ch)}%`:`${fe} ${'▰'.repeat(seg)}${'▱'.repeat(10-seg)} ${Math.ceil(ch)}%`;
  const fr=cat.frenzy>0?' 🌿 FRENZY':''; ui.comboOn=!!(combo>1||fr); if(ui.comboOn) ui.comboText=(combo>1?`COMBO x${combo}`:'')+fr;
  updatePowers(); setFoodSize(); }
function setFoodSize(){ if(!cheeseObj) return; const h=cheeseObj.wedges[0], f=Math.max(0,cheese)/CHEESE_MAX; h.visible=f>0; h.scale.setScalar(h.userData.k*(.28+.72*Math.sqrt(f))); }
function updatePowers(){ Object.assign(ui,{canPause:canPause(),powers:state==='play'&&!waitNext,pawUsed,clawUsed,pawUrgent:!pawUsed&&cheese<=40,clawUrgent:!clawUsed&&cheese<=40}); sync(); }
function setLevel(id){ if(!LEVELS[id]||id===settings.level) return; const ratio=LEVELS[id].m/level().m; settings.level=id; saveSettings(); for(const r of rats) r.speed*=ratio; best=loadBest(); updateHud(); }
function setView(id){ if(!VIEWS[id]) return; settings.view=id; saveSettings(); camU.pitch=0; camU.zoom=1; if(id!=='orbit') orbitYaw=0; updateHud(); }

// ---- treat break: owner + golden retriever ----
function startTreat(){
  state='treat'; setGrowl(false); cat.pounce=null; cat.air=0; cat.rollDone=false; cat.rollT=-1; updatePowers();
  const tr=TREATS[(wave-1)%TREATS.length], cx=clamp(cat.x,90,W-90), cy=clamp(cat.y,90,H-90), cands=[{x:cx,y:H+140},{x:cx,y:-140},{x:-140,y:cy},{x:W+140,y:cy}];
  let st=cands[0],bd=1e9; for(const c of cands){ const d=Math.hypot(c.x-cat.x,c.y-cat.y); if(d<bd){ bd=d; st=c; } }
  // with a fence, the owner walks down the path from the house, opens the gate, and comes in through it
  let path=[]; if(gateObj){ st={x:GATE_X,y:-210}; path=[{x:GATE_X,y:-105,gateIn:true},{x:GATE_X,y:-36},{x:GATE_X,y:45,gateOut:true}]; }
  const from=path.length?path[path.length-1]:st, dx=cat.x-from.x, dy=cat.y-from.y, d=Math.hypot(dx,dy)||1, stop=Math.min(180,d*.8);
  // a new outfit colour scheme every wave
  const outfit={shirt:pick(SHIRTS),hat:pick(['#8a5a32','#3a2a20','#c9a36a','#5c5c5c','#efe4cc','#6e2f22']),bandana:pick(['#b8231f','#1f4fb8','#2e8b57','#e0a020','#1a1a1a','#7a2a8a']),
    jeans:pick(['#ffffff','#c9d6f0','#8f97a6','#d8c8b0','#6a6f80']),boot:pick(['#6b4226','#3a2618','#8a5a32','#1e1a18'])};
  man={x:st.x,y:st.y,sx:st.x,sy:st.y,tx:cat.x-dx/d*stop,ty:Math.max(60,cat.y-dy/d*stop),angle:Math.atan2(from.y-st.y,from.x-st.x)||Math.PI/2,ph:0,phase:'in',t:0,give:0,holding:true,walking:true,shirt:outfit.shirt,outfit,treat:tr,path,wp:0,trail:[]};
  manModel=makeMan(outfit);
  const tobj=makeTreat(tr.id); manModel.arms[1].hand.add(tobj); tobj.position.set(0,-10,0); tobj.scale.setScalar(.9);
  treatObj={obj:tobj,held:true,id:tr.id,k:1,eating:false,crunchT:0,x:0,y:0};
  dog={x:gateObj?st.x-30:st.x-dy/d*70-dx/d*40,y:gateObj?st.y-40:st.y+dx/d*70-dy/d*40,angle:man.angle,ph:0,moving:0,sit:0,wag:6,pant:true,look:0,barked:false}; dogModel=makeDog();
  treatBanner=3.5; sfx.wave();
}
const withArticle=l=>/s$/.test(l)?'some '+l:(/^[aeiou]/.test(l)?'an ':'a ')+l;
function finishTreat(){ if(manModel){ manModel.dispose(); manModel=null; } man=null; if(dogModel){ dogModel.dispose(); dogModel=null; } dog=null; removeTreat();
  if(wave>=MAX_WAVES){ gameWon(); return; }
  wave++;
  // wait for the player: a 'continue' card shows what the next wave brings
  state='play'; waitNext=true; const D=waveDef(wave), NS=THEMES[sceneFor(wave)];
  ui.waveDone={scene:NS?NS.label:'',cleared:wave-1,next:wave,total:MAX_WAVES,target:D.target,food:foodFor(wave).label,foodEmoji:foodFor(wave).emoji,score,evil:D.evil,rats:D.rat+D.big>.5,colours:D.colours}; updateHud(); }
function continueWave(){ if(!waitNext) return; waitNext=false; ui.waveDone=null; startWave(); updateHud(); }
function gameWon(){ state='over'; ui.canPause=false; setGrowl(false); if(score>best){ best=score; saveBest(best); } ui.won=true;
  ui.finalScore=score; ui.overMsg=`Bandicoots eliminated! ${settings.name} defended the farm through all ${MAX_WAVES} waves. Happy farming!`;
  const acc=swings?Math.round(hits/swings*100):0; ui.finalInfo=`${settings.name} caught ${killed} rodents · ${level().label.replace(/^\S+ /,'')} mode · ${acc}% pounce accuracy · Best ${best}`;
  sfx.victory(); ui.controls=false; updatePowers(); timers.push(setTimeout(()=>{ if(state==='over'){ ui.over=true; sync(); } },900)); updateHud(); }
function updateGate(dt){ if(!gateObj) return; const near=man&&Math.hypot(man.x-GATE_X,man.y+36)<95, want=man&&((man.phase==='gate'&&man.t>.3)||near)?1:0;
  gateObj.open+=(want-gateObj.open)*Math.min(1,dt*(want?3.2:1.8)); gateObj.pivot.rotation.y=smooth(0,1,gateObj.open)*1.7;
  if(want&&!gateObj.creak){ gateObj.creak=true; sfx.creak(); } if(!want&&gateObj.open<.05) gateObj.creak=false; }
function updateTreat(dt){
  const m=man; if(!m) return; m.t+=dt;
  if(m.phase==='in'||m.phase==='out'){ const P=m.path||[], inn=m.phase==='in', wpt=(m.wp>=0&&m.wp<P.length)?P[m.wp]:null;
    const tx=wpt?wpt.x:(inn?m.tx:m.sx), ty=wpt?wpt.y:(inn?m.ty:m.sy), dx=tx-m.x, dy=ty-m.y, d=Math.hypot(dx,dy);
    if(d<4){ if(wpt){ if(gateObj&&gateObj.open<.9&&(inn?wpt.gateIn:wpt.gateOut)){ m.resume=m.phase; m.phase='gate'; m.t=0; m.walking=false; } else m.wp+=inn?1:-1; }
      else if(inn){ m.phase='give'; m.t=0; m.walking=false; } else { finishTreat(); return; } }
    else { const sp=120*dt, mv=Math.min(d,sp); m.x+=dx/d*mv; m.y+=dy/d*mv; m.angle=Math.atan2(dy,dx); m.ph+=mv*.066; m.walking=true;
      const tl=m.trail[m.trail.length-1]; if(!tl||Math.hypot(tl.x-m.x,tl.y-m.y)>4){ m.trail.push({x:m.x,y:m.y}); if(m.trail.length>60) m.trail.shift(); } } }
  else if(m.phase==='gate'){   // reach out, lift the latch, swing the gate open, then walk on
    m.angle+=angDiff(Math.atan2(-36-m.y,GATE_X-m.x),m.angle)*Math.min(1,dt*6); m.give=m.t<.5?Math.min(.75,m.t*2.5):Math.max(0,m.give-dt*2);
    if(gateObj.open>.9&&m.t>.6){ m.phase=m.resume; m.wp+=m.phase==='in'?1:-1; m.give=0; m.walking=true; } }
  else if(m.phase==='give'){ m.angle+=angDiff(Math.atan2(cat.y-m.y,cat.x-m.x),m.angle)*Math.min(1,dt*5);
    const petting=cat.rollP>.6; m.give=m.holding?Math.min(1,m.t/.7):(petting?Math.min(1,m.give+dt*2):Math.max(0,m.give-dt*2));
    if(m.t>.9&&m.holding){ m.holding=false; const a=m.angle; treatObj.x=clamp(m.x+Math.cos(a)*90,30,W-30); treatObj.y=clamp(m.y+Math.sin(a)*90,30,H-30); treatObj.held=false;
      manModel.arms[1].hand.remove(treatObj.obj); scene.add(treatObj.obj); const [X,Z]=g2w(treatObj.x,treatObj.y); treatObj.obj.position.set(X,0,Z); treatObj.obj.rotation.set(0,rand()*TAU,0); treatObj.obj.scale.setScalar(1.15);
      say(`Good job, ${settings.name}! Here's ${withArticle(m.treat.label.toLowerCase())}.`); }
    if(!m.holding&&treatObj&&treatObj.k<=0&&cat.rollDone&&m.t>2){ m.phase='out'; m.walking=true; m.give=0; m.wp=(m.path||[]).length-1; } }
  if(manModel) manModel.update(m,dt);
  if(dog){ let tx,ty; const trl=m.trail||[];
    if(gateObj&&m.phase!=='give'&&trl.length){ const q=trl[Math.max(0,trl.length-14)]; tx=q.x; ty=q.y; }
    else { const ma=m.angle, side=m.phase==='give'?75:65, back=m.phase==='give'?-10:35; tx=m.x-Math.sin(ma)*side-Math.cos(ma)*back; ty=m.y+Math.cos(ma)*side-Math.sin(ma)*back; }
    const dx=tx-dog.x, dy=ty-dog.y, d=Math.hypot(dx,dy);
    const sp=d>6?Math.min(230,d*3):0; dog.moving=clamp(sp/120,0,1); if(sp>0){ dog.x+=dx/d*sp*dt; dog.y+=dy/d*sp*dt; dog.angle+=angDiff(Math.atan2(dy,dx),dog.angle)*Math.min(1,dt*6); dog.ph+=sp*dt*.09; }
    else dog.angle+=angDiff(Math.atan2(cat.y-dog.y,cat.x-dog.x),dog.angle)*Math.min(1,dt*3);
    dog.sit=(m.phase==='give'&&d<12)?1:0; dog.wag=dog.sit?13:7;
    if(m.phase==='give'&&!dog.barked&&m.t>.4){ dog.barked=true; sfx.woof(); }
    dog.look=clamp(angDiff(Math.atan2(cat.y-dog.y,cat.x-dog.x),dog.angle),-.6,.6)*-1;
    dogModel.update(dog,dt); }
}

// ---- Big Paw Touch (white lion) ----
function usePaw(){
  if(state!=='play'||paused) return;
  if(pawUsed||lion){ toast('🐾 Big Paw is resting 💤'); sfx.nope(); return; }
  audio(); pawUsed=true; updatePowers();
  const lx=W/2+rr(-W*.2,W*.2), ly=clamp(H/2+170,H*.55,H*.75);
  lion={x:lx+rr(-150,150),y:H+330,vx:0,vy:0,angle:0,headTurn:0,air:0,bite:0,chew:0,blood:0,frenzy:0,sit:0,anger:1,blush:0,rollP:0,B:LION_B,tail:[],spine:null,feet:null,phase:'leap',t:0,landed:false};
  lion.angle=Math.atan2(ly-lion.y,lx-lion.x); lion.pounce={t:0,dur:1.05,sx:lion.x,sy:lion.y,ex:lx,ey:ly};
  lionModel=makeCat(LION_B,LION_L,{eyes:'copper',collar:'none'},'lion'); scene.add(lionModel.rig);
  powerBanner=2.6; powerText='🐾 BIG PAW TOUCH!'; sfx.roar(); shake=6;
}
function updateLion(dt){ const L=lion; L.t+=dt;
  if(L.phase==='leap'){ const p=L.pounce; p.t+=dt; const k=Math.min(1,p.t/p.dur),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; L.x=p.sx+(p.ex-p.sx)*e; L.y=p.sy+(p.ey-p.sy)*e; L.air=Math.sin(Math.PI*k)*2.2; L.anger=1;
    if(k>=1){ L.pounce=null; L.air=0; L.phase='roar'; L.t=0; lionSlam(); } }
  else if(L.phase==='roar'){ L.anger=1; L.headTurn=Math.sin(L.t*3)*.3; L.bite=.22*Math.abs(Math.sin(L.t*1.6)); if(L.t>1.9){ L.phase='leave'; L.t=0; L.anger=0; } }
  else if(L.phase==='leave'){ L.angle+=angDiff(Math.PI/2,L.angle)*Math.min(1,dt*3); L.vx=Math.cos(L.angle)*430; L.vy=Math.sin(L.angle)*430; L.x+=L.vx*dt; L.y+=L.vy*dt;
    if(L.y>H+400){ lion=null; lionModel.dispose(); lionModel=null; updatePowers(); return; } }
  updateCatSim(L,dt,CS); lionModel.update(L,W/2,H/2,1,dt); }
const LION_RADIUS=340;
function lionSlam(){ const L=lion; L.landed=true; sfx.slam(); setTimeout(()=>sfx.roar(),150); shake=24; addRing(L.x,L.y,LION_RADIUS,0xfff6e0,.9); addRing(L.x,L.y,LION_RADIUS*.6,0xffc870,.6);
  const T=theme(), dust=T.kind==='snow'?['#ffffff','#e6eef5','#cfdbe6']:T.kind==='tiles'?['#d9b980','#bf9a60','#8a6a40']:['#8a6a44','#6b4a2c','#a88a5c','#5e9c36']; burst(L.x,L.y,LOW?50:90,dust,560,1.4,6);
  sctx.save(); sctx.strokeStyle='rgba(40,25,10,.55)'; sctx.lineCap='round'; for(let i=0;i<14;i++){ let a=rand()*TAU,x=L.x,y=L.y; sctx.lineWidth=rr(1.5,3.5); sctx.beginPath(); sctx.moveTo(x,y); for(let k=0;k<6;k++){ a+=rr(-.4,.4); const l=rr(14,32); x+=Math.cos(a)*l; y+=Math.sin(a)*l; sctx.lineTo(x,y); } sctx.stroke(); } sctx.restore(); markStains();
  let n=0; for(const r of rats){ const d=Math.hypot(r.x-L.x,r.y-L.y); if(!r.dead&&d<LION_RADIUS){ r.lionAt=time+d/1100; n++; } } popText(L.x,L.y,n?`${n} RAT${n>1?'S':''} CRUSHED!`:'MISSED!','#fff6dc',26); }
function lionKill(r){ r.dead=true; killed++; caught++; checkWaveDone(); const pts=Math.round(TYPES[r.type].pts*level().pts); score+=pts; poof(r.x,r.y,16,undefined,320); popText(r.x,r.y,'+'+pts,'#fff4d0',20); if(rand()<.4) sfx.squeal(.08); if(rand()<.5) sfx.pop(); updateHud(); }

// ---- Grip Claw (eagle) ----
function nearestRatToCheese(){ let best=null,bd=1e9; for(const r of rats){ if(r.dead||r.lionAt||r.caught) continue; const d=Math.hypot(r.x-W/2,r.y-H/2); if(d<bd){ bd=d; best=r; } } return best; }
function useClaw(){
  if(state!=='play'||paused) return;
  if(clawUsed||eagle){ toast(eagle?'🦅 The eagle is already hunting':'🦅 Grip Claw is resting 💤'); sfx.nope(); return; }
  const target=nearestRatToCheese(); if(!target){ toast('🦅 No rats to grab yet'); return; }
  audio(); clawUsed=true; updatePowers();
  const fromLeft=target.x>W/2;
  eagle={x:fromLeft?-350:W+350,y:rr(H*.2,H*.8),h:420,angle:0,phase:'in',t:0,target,carry:null,flapAmp:.7,flapSpd:7,pitch:0,bank:0,flapT:0,orbitA:0,orbitDir:1,orbitDone:0,dive:null};
  eagle.angle=Math.atan2(target.y-eagle.y,target.x-eagle.x); eagleModel=makeEagle();
  powerBanner=2.2; powerText='🦅 GRIP CLAW!'; sfx.screech();
}
const EAGLE_ORBIT_R=150, EAGLE_ORBIT_SPEED=2.6;   // one lap ≈ 2.4 s
function eagleRetarget(e){ if(e.target&&!e.target.dead&&!e.target.caught) return true; e.target=nearestRatToCheese(); if(!e.target){ e.phase='out'; return false; } return true; }
function eagleSnatch(e){ const r=e.target; r.caught=true; r.dead=true; killed++; caught++; checkWaveDone(); const pts=Math.round(TYPES[r.type].pts*2*level().pts); score+=pts; popText(r.x,r.y,'SNATCHED! +'+pts,'#e8f4ff',22);
  sfx.squeal(.16); burst(r.x,r.y,12,['#7a5434','#f6f3ec','#ffd23f'],180,.8,3,20); r.model.tail.mesh.visible=false; eagleModel.talons.add(r.model.g); r.model.g.position.set(0,-14,0); r.model.g.rotation.set(0,0,0); r.model.g.scale.setScalar(.6);
  e.carry=r.model; e.phase='out'; e.t=0; updateHud(); }
function updateEagle(dt){ const e=eagle; e.t+=dt; e.flapT-=dt;
  if(e.phase==='in'){ if(eagleRetarget(e)){ const r=e.target, dx=r.x-e.x, dy=r.y-e.y, d=Math.hypot(dx,dy), turn=angDiff(Math.atan2(dy,dx),e.angle);
      e.angle+=turn*Math.min(1,dt*3); e.bank=lerp(e.bank,clamp(-turn,-.6,.6),Math.min(1,dt*4)); e.x+=Math.cos(e.angle)*480*dt; e.y+=Math.sin(e.angle)*480*dt;
      e.h=lerp(e.h,230,Math.min(1,dt*1.5)); e.flapAmp=.6; e.flapSpd=6; e.pitch=-.08;
      if(d<EAGLE_ORBIT_R+20){ e.phase='circle'; e.orbitA=Math.atan2(e.y-r.y,e.x-r.x); e.orbitDir=angDiff(e.angle,e.orbitA)>0?1:-1; e.orbitDone=0; sfx.screech(); } } }
  else if(e.phase==='circle'){ if(eagleRetarget(e)){ const r=e.target, step=EAGLE_ORBIT_SPEED*dt;
      e.orbitA+=step*e.orbitDir; e.orbitDone+=step; const k=Math.min(1,e.orbitDone/TAU);
      const R=EAGLE_ORBIT_R*(1-k*.25), tx=r.x+Math.cos(e.orbitA)*R, ty=r.y+Math.sin(e.orbitA)*R;   // the lap tightens a little as it lines up
      const nx=lerp(e.x,tx,Math.min(1,dt*8)), ny=lerp(e.y,ty,Math.min(1,dt*8)); e.angle=Math.atan2(ny-e.y,nx-e.x)||e.angle; e.x=nx; e.y=ny;
      e.h=lerp(230,150,k); e.bank=lerp(e.bank,-e.orbitDir*.55,Math.min(1,dt*4)); e.flapAmp=.2; e.flapSpd=3; e.pitch=-.05;   // majestic glide
      if(e.orbitDone>=TAU){ e.phase='dive'; e.dive={t:0,dur:.6,sx:e.x,sy:e.y,sh:e.h}; sfx.screech(); } } }
  else if(e.phase==='dive'){ if(eagleRetarget(e)){ const r=e.target, D=e.dive; D.t+=dt; const k=Math.min(1,D.t/D.dur), ease=k*k*(3-2*k);
      // guided swoop: the path is anchored to the mouse's live position, so it always ends exactly on it
      const nx=lerp(D.sx,r.x,ease), ny=lerp(D.sy,r.y,ease); if(Math.hypot(nx-e.x,ny-e.y)>.5) e.angle=Math.atan2(ny-e.y,nx-e.x); e.x=nx; e.y=ny;
      e.h=lerp(D.sh,16,Math.pow(k,.8)); e.bank*=.9; e.flapAmp=.18; e.flapSpd=3; e.pitch=lerp(-.5,-.15,k);
      if(k>=1) eagleSnatch(e); } }
  else { e.h+=260*dt; e.flapAmp=.95; e.flapSpd=10; e.pitch=.35; e.bank*=.95; e.x+=Math.cos(e.angle)*480*dt; e.y+=Math.sin(e.angle)*480*dt;
    if(e.flapT<=0){ e.flapT=.5; sfx.flap(); }
    if(e.h>700||e.x<-600||e.x>W+600||e.y<-600||e.y>H+600){ endEagle(); return; } }
  if(eagle) eagleModel.update(e,dt);
}
function endEagle(){ if(eagle&&eagle.carry){ eagle.carry.g.scale.setScalar(1); releaseRatModel(eagle.carry); } if(eagleModel){ eagleModel.dispose(); eagleModel=null; } eagle=null; }

// ================= input =================
const pointers=new Map(); let camDrag=null;
function setScreen(e){ mouse.sx=e.clientX; mouse.sy=e.clientY; mouse.shown=true; const w=screenToWorld(mouse.sx,mouse.sy); if(w){ mouse.x=w.x; mouse.y=w.y; } }
function pinchDist(){ if(pointers.size<2) return 0; const [a,b]=[...pointers.values()]; return Math.hypot(a.x-b.x,a.y-b.y); }
listen(glc,'pointerdown',e=>{ audio(); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); try{ glc.setPointerCapture(e.pointerId); }catch(_){}
  if(e.button===2||e.button===1||pointers.size>=2){ camDrag={d:pinchDist()}; return; } setScreen(e); if(state==='play'&&!paused) pounce(); });
listen(glc,'pointermove',e=>{ const p=pointers.get(e.pointerId);
  if(camDrag&&p){ const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY; const f=pointers.size>=2?.5:1;
    camU.yaw+=dx*.006*f; camU.yawT=camU.yaw; camU.pitch=clamp(camU.pitch-dy*.004*f,-1.2,.8);
    if(pointers.size>=2){ const d=pinchDist(); if(camDrag.d&&d) camU.zoom=clamp(camU.zoom*camDrag.d/d,.35,2.2); camDrag.d=d; } return; }
  if(p){ p.x=e.clientX; p.y=e.clientY; } setScreen(e); });
function endPointer(e){ pointers.delete(e.pointerId); if(pointers.size===0) camDrag=null; }
listen(glc,'pointerup',endPointer); listen(glc,'pointercancel',endPointer);
listen(glc,'pointerleave',()=>{ if(matchMedia('(hover:hover)').matches) mouse.shown=false; });
listen(glc,'contextmenu',e=>e.preventDefault());
listen(glc,'wheel',e=>{ e.preventDefault(); camU.zoom=clamp(camU.zoom*Math.exp(e.deltaY*.001),.35,2.2); },{passive:false});
function rotateCam(dir){ camU.yawT+=dir*Math.PI/4; }
listen(window,'keydown',e=>{ if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')) return; const k=e.key.toLowerCase();
  if(k==='p'||e.key==='Escape'){ if(canPause()){ e.preventDefault(); togglePause(); } return; }
  if(paused) return;
  if(k==='m') toggleMute(); if(k==='v'){ const ids=Object.keys(VIEWS); setView(ids[(ids.indexOf(settings.view)+1)%ids.length]); }
  if(k==='b'||k==='l') usePaw(); if(k==='g') useClaw(); if(k==='q') rotateCam(-1); if(k==='e') rotateCam(1);
  if(e.key===' '&&state==='play'){ e.preventDefault(); pounce(); } });
function toggleMute(){ muted=!muted; ui.muted=muted; sync(); if(muted){ setGrowl(false); try{ speechSynthesis.cancel(); }catch(e){} } }
function reach(){ return cat.frenzy>0?330:230; }
function pounce(){ if(paused||cat.pounce||cat.cd>0) return; const a=Math.atan2(mouse.y-cat.y,mouse.x-cat.x),head=catDims(cat,CS).bite;
  let tx=mouse.x,ty=mouse.y; const fromX=cat.x+Math.cos(a)*head,fromY=cat.y+Math.sin(a)*head,dx=tx-fromX,dy=ty-fromY; let d=Math.hypot(dx,dy); const R=reach(); if(d>R){ tx=fromX+dx/d*R; ty=fromY+dy/d*R; d=R; }
  cat.angle=a; cat.headTurn=0; cat.sit=0; cat.still=0; cat.pounce={t:0,dur:.2+Math.max(0,d)/1300,sx:cat.x,sy:cat.y,ex:clamp(tx-Math.cos(a)*head,20,W-20),ey:clamp(ty-Math.sin(a)*head,20,H-20)};
  cat.bite=0; swings++; sfx.pounce(); if(COLLARS[settings.collar].c) sfx.jingle(); }
function land(){ cat.cd=cat.frenzy>0?.05:.14; cat.bite=.22; cat.squashT=0; const hp=catHeadPos(),R=biteR(); let any=false;
  if(theme().footprints&&cat.feet) for(const f of cat.feet) pawPrint(f.x,f.y,cat.angle);
  for(const n of catnips){ if(!n.dead&&Math.hypot(n.x-hp.x,n.y-hp.y)<R+22){ n.dead=true; any=true; startFrenzy(n.x,n.y); } }
  for(const r of rats){ if(r.dead||r.lionAt) continue; if(Math.hypot(r.x-hp.x,r.y-hp.y)<R+r.size*.7){ any=true; r.hp--; r.hitCd=.45; if(r.hp<=0) eat(r); else wound(r,hp); } }
  if(any){ hits++; shake=Math.max(shake,4); } else { sfx.miss(); combo=1; const T=theme(); burst(hp.x,hp.y,10,T.kind==='snow'?['#ffffff','#e6eef5']:T.kind==='tiles'?['#d9b980','#bf9a60']:['#3f7a22','#5e9c36','#7ab648'],140,.5,3); updateHud(); } }
function wound(r,hp){ const a=Math.atan2(r.y-hp.y,r.x-hp.x); r.bleed=true; r.speed*=1.12; r.vx+=Math.cos(a)*320; r.vy+=Math.sin(a)*320; if(r.wounds.length<3) r.wounds.push({x:rr(-.6,.6)*r.size,y:rr(-.35,.35)*r.size,r:r.size*rr(.16,.24)});
  sfx.squeal(.14); noise(.08,.25,'bandpass',1800,1); poof(r.x,r.y,8,a,220,14,false); burst(r.x,r.y,4,['#ffe14a','#ffffff'],60,.7,2.4,r.size*1.6); sfx.boing(); popText(r.x,r.y,pick(['BOP!','BONK!','POW!']),'#ffe14a',18); cat.bite=.22; }
function eat(r){ r.dead=true; killed++; caught++; checkWaveDone(); if(time-lastHit<1.6) combo=Math.min(10,combo+1); else combo=1; lastHit=time;
  const pts=Math.round(TYPES[r.type].pts*combo*(cat.frenzy>0?2:1)*level().pts); score+=pts; const a=cat.angle; sfx.squeal(.16); sfx.pop(); if(r.type==='albino') sfx.bonus();
  poof(r.x,r.y,LOW?20:30,undefined,360); poof(r.x,r.y,8,a,480,12,false); burst(r.x,r.y,6,TYPES[r.type].fur,140,1,2.5,10);
  cat.chew=.45; cat.bite=.22; popText(r.x,r.y,'+'+pts,r.type==='albino'?'#fff':'#fbf6e6',r.type==='albino'?30:22); if(combo>=4&&combo%2===0) setTimeout(sfx.meow,250);
  if(rand()<.06&&catnips.length===0) spawnCatnip(); updateHud(); }
function spawnCatnip(){ const n={x:rr(W*.15,W*.85),y:rr(H*.18,H*.82),life:7,t:0,obj:makeCatnip()}; const [X,Z]=g2w(n.x,n.y); n.obj.position.set(X,0,Z); scene.add(n.obj); catnips.push(n); }
function startFrenzy(x,y){ cat.frenzy=6; sfx.purr(); sfx.meow(); burst(x,y,26,['#6fcf4a','#3f9a2a','#b6f28a'],260,.9,4); popText(x,y,'CATNIP FRENZY!','#b6f28a',26); updateHud(); }
function targetAcquired(){ if(state!=='play'||!cat.visible||lion) return false; if(cat.pounce) return growlOn; const hp=catHeadPos(); if(Math.hypot(mouse.x-hp.x,mouse.y-hp.y)>reach()+40) return false; const R=biteR();
  for(const r of rats) if(!r.dead&&Math.hypot(r.x-mouse.x,r.y-mouse.y)<R+r.size*.9) return true; for(const r of rats) if(!r.dead&&Math.hypot(r.x-hp.x,r.y-hp.y)<70) return true; return false; }
function popText(x,y,txt,color='#fbf6e6',size=22){ texts.push({x,y,h:50,txt,color,size,life:1}); }

// ================= update =================
function update(dt){ updateGate(dt);
  time+=dt; shake=Math.max(0,shake-dt*40); waveBanner=Math.max(0,waveBanner-dt); treatBanner=Math.max(0,treatBanner-dt); powerBanner=Math.max(0,powerBanner-dt);
  const T=theme(); ambT-=dt; if(ambT<=0){ ambT=rr(4,10); if(ac){ if(T.sound==='birds') sfx.bird(); else if(T.sound==='birdsRare'&&rand()<.35) sfx.bird(); else if(T.sound==='crickets'){ sfx.cricket(); ambT=rr(1,3); } } }
  if(stainLife>0){ stainLife-=dt; fadeT+=dt; if(stainLife<=0) clearStains(); else if(fadeT>1.2){ fadeT=0; sctx.save(); sctx.globalCompositeOperation='destination-out'; sctx.fillStyle='rgba(0,0,0,.1)'; sctx.fillRect(0,0,W,H); sctx.restore(); groundDirty=1; } }
  updateCamera(dt); updateCrawlers(dt); updateFliers(dt); updateAmbient3D(dt); updateWeather(dt); grassTime.value=time;
  if(state==='play'){ if(combo>1&&time-lastHit>1.6){ combo=1; updateHud(); }
    if(!lion){ spawnTimer-=dt; if(toSpawn>0&&spawnTimer<=0&&rats.length<maxAlive()){ spawnRat(); toSpawn--; spawnTimer=spawnGap()*rr(.6,1.4); if(wave>=4&&rand()<.2&&toSpawn>0){ spawnRat(); toSpawn--; } }
      if(!waitNext&&toSpawn===0&&rats.length===0&&!eagle) startTreat(); } }
  else if(state==='treat') updateTreat(dt);
  if(lion) updateLion(dt); if(eagle) updateEagle(dt);
  const acq=targetAcquired(); if(acq&&!growlOn&&time-lastHiss>2){ lastHiss=time; sfx.hiss(); } setGrowl(acq); cat.anger+=((acq?1:0)-cat.anger)*Math.min(1,dt*8);
  if(cat.visible){ updateCat(dt); catModel.update(cat,W/2,H/2,1,dt); }
  updateRats(dt);
  if(cheeseObj){ let sx=1,sy=1; if(cheeseWobT>=0){ cheeseWobT+=dt; const w=Math.exp(-5*cheeseWobT)*Math.sin(cheeseWobT*24)*.16; sx=1+w; sy=1-w*1.4; if(cheeseWobT>1.4) cheeseWobT=-1; } else { const b=Math.sin(time*2.2)*.012; sx=1-b; sy=1+b; } cheeseObj.g.scale.set(sx,sy,sx); }
  for(const n of catnips){ n.life-=dt; n.t+=dt; n.obj.rotation.y+=dt*.8; n.obj.position.y=Math.abs(Math.sin(n.t*3.2))*7; n.obj.userData.ring.material.opacity=.25+.2*Math.sin(n.t*5); n.obj.visible=!(n.life<2&&Math.sin(n.t*18)>0); if(n.life<=0||n.dead) scene.remove(n.obj); } catnips=catnips.filter(n=>n.life>0&&!n.dead);
  updateParts(dt); updateHearts(dt); updateRings(dt);
  for(const t of texts){ t.life-=dt*1.1; t.h+=50*dt; } texts=texts.filter(t=>t.life>0);
  const showRet=state==='play'&&mouse.shown&&cat.visible; reticle.visible=showRet;
  if(showRet){ const [X,Z]=g2w(mouse.x,mouse.y),hp=catHeadPos(); reticle.position.set(X,1.5,Z); const far=Math.hypot(mouse.x-hp.x,mouse.y-hp.y)>reach();
    reticle.scale.setScalar(biteR()*2.3*(growlOn?1+.06*Math.sin(time*20):1)); reticle.material.color.set(growlOn?0xff3020:0xffffff); reticle.material.opacity=far?.55:1; }
  if(T.night){ const [X,Z]=g2w(cat.x,cat.y); catLight.position.set(X,120,Z); catLight.intensity=cat.visible?.9:0; }
  if(groundDirty){ if(refreshGround(dt)) groundDirty=0; } else groundT+=dt;
}
function updateCat(dt){
  const c=cat; c.cd=Math.max(0,c.cd-dt); c.bite=Math.max(0,c.bite-dt); c.chew=Math.max(0,c.chew-dt);
  if(c.squashT>=0){ c.squashT+=dt; c.squash=Math.exp(-8*c.squashT)*Math.cos(c.squashT*15); if(c.squashT>.9){ c.squashT=-1; c.squash=0; } } else c.squash=0;
  if(c.frenzy>0){ c.frenzy-=dt; if(c.frenzy<=0){ c.frenzy=0; updateHud(); } }
  const D=catDims(c,CS);
  if(c.rollT>=0){ c.rollT+=dt; const t=c.rollT; c.rollP=t<.7?t/.7:t<3.4?1:Math.max(0,1-(t-3.4)/.7); c.blush=1; c.vx=c.vy=0; c.headDown=Math.max(0,c.headDown-dt*3);
    if(t>.7&&t<3.4){ c.heartT=(c.heartT||0)-dt; if(c.heartT<=0){ c.heartT=.22; addHeart(c.x+rr(-20,20),c.y+rr(-20,20),40); } }
    if(t>4.1){ c.rollT=-1; c.rollP=0; c.rollDone=true; sfx.meow(1.15); } updateCatSim(c,dt,CS); return; }
  c.blush=Math.max(0,c.blush-dt*.6);
  let aim=null, lookAt=null; if(state==='play') aim=mouse; else if(state==='treat'){ if(treatObj&&!treatObj.held&&treatObj.k>0) aim={x:treatObj.x,y:treatObj.y}; else if(man) lookAt=man; }
  if(c.pounce){ const p=c.pounce; p.t+=dt; const k=Math.min(1,p.t/p.dur),e=1-(1-k)*(1-k); c.x=p.sx+(p.ex-p.sx)*e; c.y=p.sy+(p.ey-p.sy)*e; c.air=Math.sin(Math.PI*k); c.vx=c.vy=0; if(k>=1){ c.pounce=null; c.air=0; land(); } }
  else { let want=0,dx=0,dy=0,d=1; if(aim){ dx=aim.x-c.x; dy=aim.y-c.y; d=Math.hypot(dx,dy)||1; const stopAt=D.bite+(state==='treat'?2:4); const max=(c.frenzy>0?560:state==='treat'?200:390)*(c.chew>0&&state==='play'?.45:1); want=d>stopAt?Math.min(max,(d-stopAt)*5):0; }
    c.vx+=((aim?dx/d*want:0)-c.vx)*Math.min(1,dt*7); c.vy+=((aim?dy/d*want:0)-c.vy)*Math.min(1,dt*7); c.x=clamp(c.x+c.vx*dt,20,W-20); c.y=clamp(c.y+c.vy*dt,20,H-20);
    const tgt=aim||lookAt; if(tgt){ const tdx=tgt.x-c.x,tdy=tgt.y-c.y; if(Math.hypot(tdx,tdy)>25){ const ta=Math.atan2(tdy,tdx),da=angDiff(ta,c.angle); c.angle+=da*Math.min(1,dt*(Math.hypot(c.vx,c.vy)>30?6:2.5)); c.headTurn+=(clamp(da,-.5,.5)-c.headTurn)*Math.min(1,dt*10); } } }
  const sp=Math.hypot(c.vx,c.vy); if(sp<5&&!c.pounce) c.still+=dt; else c.still=0; c.sit+=((c.still>1.3&&state!=='treat'?1:0)-c.sit)*Math.min(1,dt*(c.still>1.3?2:8));
  let eating=false;
  if(state==='treat'&&treatObj&&!treatObj.held&&treatObj.k>0){ const hp=catHeadPos();
    if(Math.hypot(treatObj.x-hp.x,treatObj.y-hp.y)<22){ eating=true; if(!treatObj.eating){ treatObj.eating=true; sfx.purr(2); }
      c.chew=.3; c.blush=1; treatObj.k-=dt/1.8; treatObj.crunchT-=dt; if(treatObj.crunchT<=0){ treatObj.crunchT=.35; sfx.chew(); } treatObj.obj.scale.setScalar(1.15*Math.max(.05,treatObj.k));
      if(treatObj.k<=0){ const bonus=Math.round(25*wave*level().pts); score+=bonus; popText(treatObj.x,treatObj.y,`YUM! +${bonus}`,'#ffc93c',24); updateHud(); treatObj.obj.visible=false; c.rollT=0; c.sit=0; sfx.mrrp(); sfx.purr(4); } } }
  c.headDown+=((eating?1:0)-c.headDown)*Math.min(1,dt*5);
  if(state==='play'){ const hp=catHeadPos(),cr=(c.frenzy>0?28:17)*(level().reach||1); for(const r of rats){ if(r.dead||r.hitCd>0||r.lionAt) continue; if(Math.hypot(r.x-hp.x,r.y-hp.y)<cr+r.size*.65){ r.hitCd=.45; r.hp--; shake=Math.max(shake,3); if(r.hp<=0) eat(r); else wound(r,hp); } } }
  if(theme().footprints&&c.feet) for(const f of c.feet){ if(f.t<1&&!f.printed&&f.t>.9){ f.printed=true; pawPrint(f.tx,f.ty,c.angle); } if(f.t<.5) f.printed=false; }
  updateCatSim(c,dt,CS);
}
function updateRats(dt){
  const ch={x:W/2,y:H/2},hp=cat.visible?catHeadPos():null;
  for(const r of rats){ if(r.dead) continue; r.age+=dt;
    if(r.lionAt&&time>=r.lionAt){ lionKill(r); continue; }
    if(lion){ r.sniff=Math.sin(time*60)*.08; r.vx*=.8; r.vy*=.8; r.model.update(r); continue; }
    const T=TYPES[r.type]; r.t+=dt; r.hitCd=Math.max(0,r.hitCd-dt);
    const tx=r.tx??ch.x,ty=r.ty??ch.y; let dx=tx-r.x,dy=ty-r.y; const d=Math.hypot(dx,dy)||1; dx/=d; dy/=d;
    const w=Math.sin(r.t*r.wob)*.35; let mx=(dx-dy*w)*r.speed,my=(dy+dx*w)*r.speed,scared=false;
    if(hp&&state==='play'){ const ax=r.x-hp.x,ay=r.y-hp.y,ad=Math.hypot(ax,ay)||1; if(ad<150){ const k=(150-ad)/150*T.fear*1.7*(level().fear??1); mx+=ax/ad*k*r.speed; my+=ay/ad*k*r.speed; scared=k>.3; } }
    if(eagle&&eagle.target===r){ if(eagle.phase==='dive'){ mx=0; my=0; } else if(eagle.phase==='circle'){ mx*=.3; my*=.3; } }
    if(r.pause>0){ r.pause-=dt; mx*=.03; my*=.03; r.sniff=Math.sin(r.t*38)*.09; if(scared) r.pause=0; } else { r.sniff=0; if(!scared&&r.type!=='albino'&&rand()<dt*.35) r.pause=rr(.2,.6); }
    r.vx+=(mx-r.vx)*Math.min(1,dt*7); r.vy+=(my-r.vy)*Math.min(1,dt*7); r.x=clamp(r.x+r.vx*dt,-30,W+30); r.y=clamp(r.y+r.vy*dt,-30,H+30);
    const sp=Math.hypot(r.vx,r.vy); if(sp>8) r.angle+=angDiff(Math.atan2(r.vy,r.vx),r.angle)*Math.min(1,dt*10); r.ph+=sp*dt/(r.size*.42);
    updateChain(r.tail,r.x-Math.cos(r.angle)*r.size*1.02,r.y-Math.sin(r.angle)*r.size*1.02,r.size*.28,sp>20?1.2:.5,r.t,9);
    if(r.bleed){ r.drip-=dt; if(r.drip<=0){ r.drip=rr(.22,.38); burst(r.x,r.y,1,['#ffe14a','#ffffff','#9be7ff'],35,.6,2.2,r.size*1.5); } }
    if(rand()<dt*.05&&state==='play') sfx.squeal(.025);
    if(r.type==='albino'){ if(d<25||r.t>8){ r.dead=true; if(state==='play') popText(r.x,r.y,'escaped!','#fff',16); } }
    else if(r.tx!==undefined){ if(d<25) r.dead=true; }
    else if(state==='play'&&(r.nibbling||d<46+r.size*.5)){
      if(scared){ r.nibbling=false; }
      else { if(!r.nibbling){ r.nibbling=true; r.na=Math.atan2(r.y-ch.y,r.x-ch.x); if(rand()<.5) popText(r.x,r.y,'NIBBLING!','#ff7a6a',18); }
        const rad=44+r.size*.55, nx=ch.x+Math.cos(r.na)*rad, ny=ch.y+Math.sin(r.na)*rad;   // sit at its spot on the rim, nose to the food
        r.x+=(nx-r.x)*Math.min(1,dt*6); r.y+=(ny-r.y)*Math.min(1,dt*6); r.vx*=.5; r.vy*=.5; r.angle+=angDiff(r.na+Math.PI,r.angle)*Math.min(1,dt*8); r.sniff=Math.sin(r.t*34)*.14;
        cheese-=nibbleRate(T)*dt; nibbleFx+=dt; } }
    if(!r.dead) r.model.update(r); }
  if(nibbleFx>0&&state==='play'){ nibbleT-=dt; if(nibbleT<=0){ nibbleT=.45; sfx.nibble(); cheeseWobT=0; burst(ch.x,ch.y,4,['#ffe48a','#f2c94c','#fff3c0'],90,.6,2.4,14); combo=1; }
    const shown=Math.ceil(Math.max(0,cheese)); if(shown!==foodShown){ foodShown=shown; updateHud(); } if(cheese<=0){ cheese=0; gameOver(); } }
  nibbleFx=0;
  for(const r of rats) if(r.dead&&r.model&&!r.caught){ releaseRatModel(r.model); r.model=null; }
  rats=rats.filter(r=>!r.dead);
}

// ================= overlay =================
function bannerText(txt,y,size,color,sc=1){ octx.save(); octx.translate(innerWidth/2,y); octx.scale(sc,sc); octx.font=`${size}px Bungee, sans-serif`; octx.lineJoin='round'; octx.lineWidth=Math.max(5,size/6); octx.strokeStyle='#1d2a14'; octx.strokeText(txt,0,0); octx.fillStyle=color; octx.fillText(txt,0,0); octx.restore(); }
const springIn=(age,dur=.35)=>age<dur?Math.max(.01,backOut(age/dur)):1;
function drawOverlay(){
  const sw=innerWidth,sh=innerHeight; octx.setTransform(DPR,0,0,DPR,0,0); octx.clearRect(0,0,sw,sh); octx.textAlign='center'; octx.textBaseline='middle';
  octx.lineJoin='round';
  for(const t of texts){ const p=toScreen(t.x,t.y,t.h); if(!p.vis) continue; const sc=springIn(1-t.life,.22), wob=Math.sin((1-t.life)*14)*.08*t.life;
    octx.save(); octx.translate(p.x,p.y); octx.rotate(wob); octx.scale(sc,sc); octx.globalAlpha=Math.min(1,t.life*2); octx.font=`${t.size}px Bungee, sans-serif`; octx.lineWidth=6; octx.strokeStyle='#1d2a14'; octx.strokeText(t.txt,0,0); octx.fillStyle=t.color; octx.fillText(t.txt,0,0); octx.restore(); }
  octx.globalAlpha=1;
  for(const r of rats){ if(r.maxHp<=1) continue; const p=toScreen(r.x,r.y,r.size*1.4+14); if(!p.vis) continue; for(let i=0;i<r.maxHp;i++){ octx.fillStyle=i<r.hp?'#e0443a':'rgba(0,0,0,.45)'; octx.beginPath(); octx.arc(p.x-(r.maxHp-1)*6+i*12,p.y,4,0,TAU); octx.fill(); } }
  if(state==='play'&&waveBanner>0&&!lion){ octx.globalAlpha=Math.min(1,waveBanner*1.5); bannerText(`WAVE ${wave}`,sh*.27,Math.min(64,sw/9),'#ffc93c',springIn(2-waveBanner,.45)); octx.globalAlpha=1; }
  if(powerBanner>0){ octx.globalAlpha=Math.min(1,powerBanner*1.5); bannerText(powerText,sh*.2,Math.min(52,sw/11),'#fff6dc',springIn((powerText.includes('PAW')?2.6:2.2)-powerBanner,.4)); octx.globalAlpha=1; }
  if(state==='treat'&&treatBanner>0&&man){ octx.globalAlpha=Math.min(1,treatBanner*1.5); bannerText(`WAVE ${wave} CLEARED!`,sh*.14,Math.min(48,sw/12),'#ffc93c',springIn(3.5-treatBanner,.45)); bannerText(`${man.treat.emoji} ${man.treat.label} for ${settings.name}`,sh*.14+Math.min(44,sw/12),Math.min(24,sw/22),'#fbf6e6'); octx.globalAlpha=1; }
  if(state==='treat'&&cat.rollP>.5){ octx.globalAlpha=Math.min(1,(cat.rollP-.5)*2); bannerText(`${settings.name} loves you! 💕`,sh*.86,Math.min(30,sw/16),'#ffd1dc'); octx.globalAlpha=1; }
}

// ================= menu preview (drag to spin 360°) =================
let pr=null,pscene=null,pcam=null,pmodel=null,pground=null,pyaw=(location.hash.startsWith("#pv")?parseFloat(location.hash.slice(3))||0:.7),pdrag=null;
const pcat={x:0,y:0,vx:0,vy:0,angle:0,headTurn:0,pounce:null,air:0,bite:0,chew:0,blood:0,frenzy:0,tail:[],spine:null,feet:null,sit:0,anger:0,blush:0,rollP:0,headDown:0};
let ppmrem=null, penvRT=null;
function initPreview(){ try{ pr=new T3.WebGLRenderer({canvas:pv,antialias:true}); }catch(e){ pr=null; return; }
  pr.outputEncoding=T3.sRGBEncoding; pr.toneMapping=T3.CustomToneMapping; pr.toneMappingExposure=.98; ppmrem=new T3.PMREMGenerator(pr); pr.shadowMap.enabled=true; pr.shadowMap.type=T3.PCFSoftShadowMap;
  pscene=new T3.Scene(); pcam=new T3.PerspectiveCamera(32,2,5,4000); pscene.add(new T3.HemisphereLight(0xffffff,0x6a7a50,.35));
  const d=new T3.DirectionalLight(0xfff0dc,1.2); d.position.set(150,300,120); d.castShadow=true; d.shadow.mapSize.set(1024,1024); Object.assign(d.shadow.camera,{left:-200,right:200,top:200,bottom:-200,near:10,far:900}); d.shadow.bias=-.0006; pscene.add(d);
  const r=new T3.DirectionalLight(0xffe2c0,.7); r.position.set(-200,150,-200); pscene.add(r);
  listen(pv,'pointerdown',e=>{ pdrag=e.clientX; try{ pv.setPointerCapture(e.pointerId); }catch(_){} });
  listen(pv,'pointermove',e=>{ if(pdrag!==null){ pyaw+=(e.clientX-pdrag)*.012; pdrag=e.clientX; } });
  const end=()=>{ pdrag=null; }; listen(pv,'pointerup',end); listen(pv,'pointercancel',end); }
const PV_LION=location.hash==="#pv-lion", PVK=PV_LION?.7:1.6;
// dev: #face:<breed>:<yaw>:<dist>:<mood> close-up of the cat's face in the menu preview (e.g. #face:persian:0.6:90)
const PV_FACE=(()=>{ if(!location.hash.startsWith('#face')) return null; const [,b,y,d,m]=location.hash.split(':'); if(b&&BREEDS[b]) settings.breed=b; return {yaw:parseFloat(y)||0,d:parseFloat(d)||80,mood:m||''}; })();   // dev: #pv-lion shows the lion in the 360° preview
function rebuildPreview(){ if(!pr) return; if(pmodel) pmodel.dispose(); pcat.B=PV_LION?LION_B:null; pmodel=PV_LION?makeCat(LION_B,LION_L,{eyes:"copper",collar:"none"},'lion',pcam):makeCat(breed(),makeLook(settings.breed,settings.colour),lookOpts(),'cat-'+settings.breed,pcam); pscene.add(pmodel.rig); resetSim(pcat); updateCatSim(pcat,0,PVK); }
function previewGround(){ if(!pr) return; if(pground){ pscene.remove(pground); pground.geometry.dispose(); pground.material.map.dispose(); pground.material.dispose(); }
  const t=canvasTex(floor); t.repeat.set(.3,.45); t.offset.set(.1,.1); pground=new T3.Mesh(new T3.CircleGeometry(260,48),new CartoonMat({map:t})); pground.rotation.x=-Math.PI/2; pground.receiveShadow=true; pscene.add(pground);
  if(penvRT) penvRT.dispose(); penvRT=envFor(theme(),ppmrem); pscene.environment=penvRT.texture;
  pscene.background=skyTexture(theme()); pscene.fog=new T3.Fog(theme().fog,350,900); }
function renderPreview(dt){ if(!pr||state!=='menu') return; const w=pv.clientWidth,h=pv.clientHeight; if(!w) return;
  if(pv.width!==Math.round(w*DPR)||pv.height!==Math.round(h*DPR)){ pr.setPixelRatio(DPR); pr.setSize(w,h,false); pcam.aspect=w/h; pcam.updateProjectionMatrix(); }
  const ph=time%8; pcat.anger=ph>5&&ph<6.2?Math.min(1,(ph-5)*5):Math.max(0,pcat.anger-dt*4); pcat.bite=ph>6.2&&ph<6.4?.22:0; pcat.headTurn=Math.sin(time*.9)*.3;
  pcat.sit=ph<4?Math.min(1,pcat.sit+dt):Math.max(0,pcat.sit-dt*2); updateCatSim(pcat,dt,PVK); pmodel.update(pcat,0,0,PVK,dt);
  if(PV_FACE){ pcat.anger=PV_FACE.mood==='angry'?1:0; pcat.bite=0; pcat.headTurn=0; pcat.sit=1; updateCatSim(pcat,0,PVK); pmodel.update(pcat,0,0,PVK,dt);
    if(pmodel.head){ const hp=pmodel.head.getWorldPosition(new T3.Vector3()), q=pmodel.head.getWorldQuaternion(new T3.Quaternion()), f=new T3.Vector3(1,0,0).applyQuaternion(q); f.y=0; f.normalize();
      const sdv=new T3.Vector3(-f.z,0,f.x), a=PV_FACE.yaw; pcam.position.copy(hp).addScaledVector(f,Math.cos(a)*PV_FACE.d).addScaledVector(sdv,Math.sin(a)*PV_FACE.d).add(new T3.Vector3(0,PV_FACE.d*.18,0)); pcam.lookAt(hp); } }
  else { const dist=PV_LION?190:250; pcam.position.set(Math.cos(pyaw)*dist*.92,dist*.3,Math.sin(pyaw)*dist*.92); pcam.lookAt(10,PV_LION?80:48,0); }
  INK_RES.value.set(w/1.3,h/1.3); FUR_SHELLS.value=LOW?6:12; FUR_CELLK.value=.5; FUR_LENK.value=.62;   /* close-up: fine, short, dense hair (no woollen look) */ pr.render(pscene,pcam); }

// ================= menu choices (rendered by React) =================
const THUMBS={}; for(const id in THEMES) THUMBS[id]=themeThumb(THEMES[id]);
function choose(key,id){ audio(); if(key==='level'){ setLevel(id); return; } if(key==='view'){ setView(id); return; }
  if(ACC[key]){ const msg=accLocked(key,id); if(msg){ toast(msg); sfx.nope(); return; } if(settings[key]!==id) settings[key+'Col']=''; }
  settings[key]=id; saveSettings();
  if(['breed','colour','eyes','collar','hat','outfit','glasses','hatCol','outfitCol','glassesCol'].includes(key)){ rebuildCatModel(); rebuildPreview(); if(key==='collar'&&COLLARS[id].c) sfx.jingle(); else sfx.meow(); }
  sync(); }
function setName(v){ settings.name=String(v).trim().slice(0,14)||'Kitty'; saveSettings(); updateHud(); }
function attract(dt){ if(rats.length<5&&rand()<dt*1.2){ const r=spawnRat(pick(['grey','grey','mouse','big'])); let o; do{o=pick(holes);}while(Math.hypot(o.x-r.x,o.y-r.y)<10); r.tx=o.x; r.ty=o.y; } }

// ================= resize, adaptive quality & loop =================
let DPR=1, dprCap=LOW?1.25:1.75, ftAvg=16, slowT=0;
function render3D(){ for(const f of surroundLife) f(time); FUR_SHELLS.value=furGame; INK_RES.value.set(innerWidth,innerHeight); FUR_CELLK.value=2; FUR_LENK.value=1.7; renderer.render(scene,camera); }
// adaptive quality ladder for steady frame rate: resolution -> shadows -> resolution -> outlines
function degrade(){
  if(furGame>6){ furGame=6; return true; }
  if(dprCap>1){ dprCap=Math.max(1,dprCap-.25); resize(); return true; }
  if(renderer.shadowMap.enabled){ renderer.shadowMap.enabled=false; scene.traverse(o=>{ if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{ m.needsUpdate=true; }); }); return true; }
  if(dprCap>.75){ dprCap=.75; resize(); return true; }
  if(furGame>3){ furGame=3; return true; }
  return false; }
function resize(){ DPR=Math.min(dprCap,window.devicePixelRatio||1); renderer.setPixelRatio(DPR); renderer.setSize(innerWidth,innerHeight,false); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  ov.width=innerWidth*DPR; ov.height=innerHeight*DPR; ov.style.width=innerWidth+'px'; ov.style.height=innerHeight+'px'; if(scene.fog){ const fd=fitDist(); scene.fog.near=fd*1.6; scene.fog.far=fd*6; } }
let last=performance.now(), menuSkip=0;
function frame(now){ const raw=Math.max(0,now-last), dt=Math.min(.05,raw/1000); last=Math.max(last,now);
  if(paused){ if(!pauseDrawn){ try{ render3D(); drawOverlay(); }catch(err){ console.error(err); } pauseDrawn=true; } if(alive) rafId=requestAnimationFrame(frame); return; }
  ftAvg=ftAvg*.95+Math.min(raw,100)*.05; if(ftAvg>24&&state!=='menu'&&!document.hidden){ slowT+=dt; if(slowT>2.5){ degrade(); slowT=0; ftAvg=16; } } else slowT=0;
  try{ if(state==='menu') attract(dt); update(dt);
    if(state!=='menu'||(++menuSkip%4)===0) render3D();   // menu: background only every 4th frame (it is behind the card)
    drawOverlay(); renderPreview(dt); }catch(err){ console.error(err); }
  if(alive) rafId=requestAnimationFrame(frame); }
loadSpriteIndex();
resize(); buildScene3D(); rebuildCatModel(); catModel.setVisible(false); initPreview(); previewGround(); rebuildPreview(); best=loadBest();
listen(window,'resize',()=>{ resize(); updateHud(); pauseDrawn=false; });
listen(document,'visibilitychange',()=>{ if(document.hidden) setPaused(true); });
listen(window,'blur',()=>setPaused(true)); updateHud(); rafId=requestAnimationFrame(frame);

// automated smoke-test hooks (index.html#test, #test-roll, #test-claw)
if(location.hash.startsWith('#test')){ muted=true; const h=location.hash;
  { intervals.push(setInterval(()=>{ for(let i=0;i<2;i++) update(1/30); render3D(); drawOverlay(); },33));
    timers.push(setTimeout(()=>{ startGame(); if(h==='#test-roll') toSpawn=0; const wm=h.match(/wave([0-9]+)/); if(wm){ wave=+wm[1]; startWave(); updateHud(); } },200));   // #test-wave16: start at wave 16
    if(h==='#test') timers.push(setTimeout(()=>{ for(let i=0;i<8;i++){ const r=spawnRat(); r.x=W/2+rr(-300,300); r.y=H/2+rr(-200,250); } usePaw(); },1000));
    if(h==='#test-claw') timers.push(setTimeout(()=>{ for(let i=0;i<4;i++){ const r=spawnRat(); r.x=W/2+rr(-250,250); r.y=H/2+rr(-150,200); } useClaw(); },800)); }
}

sync();
return {
  thumbs: THUMBS,
  getSettings: () => ({ ...settings }),
  startGame, continueWave, showMenu, quitToMenu, togglePause, setPaused, usePaw, useClaw, rotateCam, toggleMute, setLevel, setView, choose, setName,
  destroy() {
    alive=false; cancelAnimationFrame(rafId); unlisteners.forEach(f=>f()); timers.forEach(clearTimeout); intervals.forEach(clearInterval);
    setGrowl(false); try{ speechSynthesis.cancel(); }catch(e){}
    try{ if(ac) ac.close(); }catch(e){}
    try{ renderer.dispose(); renderer.forceContextLoss(); }catch(e){}
    try{ if(pr){ pr.dispose(); pr.forceContextLoss(); } }catch(e){}
  },
};
}
