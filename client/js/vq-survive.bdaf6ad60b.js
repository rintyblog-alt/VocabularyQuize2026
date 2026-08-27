var __VQSurviveBundle=(()=>{var ft=Object.defineProperty;var $t=Object.getOwnPropertyDescriptor;var Zt=Object.getOwnPropertyNames;var Kt=Object.prototype.hasOwnProperty;var X=(s,t,e)=>()=>{if(e)throw e[0];try{return s&&(t=s(s=0)),t}catch(i){throw e=[i],i}};var O=(s,t)=>{for(var e in t)ft(s,e,{get:t[e],enumerable:!0})},Qt=(s,t,e,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of Zt(t))!Kt.call(s,a)&&a!==e&&ft(s,a,{get:()=>t[a],enumerable:!(i=$t(t,a))||i.enumerable});return s};var Jt=s=>Qt(ft({},"__esModule",{value:!0}),s);var Nt={};O(Nt,{PENDING:()=>le});var le,Bt=X(()=>{le=!0});var Lt={};O(Lt,{PENDING:()=>ue});var ue,Ct=X(()=>{ue=!0});var Ut={};O(Ut,{PENDING:()=>de});var de,Ht=X(()=>{de=!0});var Ot={};O(Ot,{PENDING:()=>fe});var fe,Vt=X(()=>{fe=!0});var jt={};O(jt,{PENDING:()=>pe});var pe,Yt=X(()=>{pe=!0});var ve={};O(ve,{App:()=>dt,CSS:()=>tt,default:()=>be,saveTier:()=>Xt});var y={bg:"#0b0e26",bgDeep:"#070919",panel:"rgba(255,255,255,.065)",panelHi:"rgba(255,255,255,.11)",line:"rgba(255,255,255,.14)",ink:"#f3f5ff",inkSub:"rgba(243,245,255,.66)",inkFaint:"rgba(243,245,255,.40)",amber:"#ffb020",mint:"#37e0b0",pink:"#ff5d8f",blue:"#5b8cff",violet:"#a77bff",danger:"#ff5b5b",good:"#3ddc84"},W=[{id:"sun",name:"\u30B5\u30F3",hex:"#ffbe2e",rgb:[1,.745,.18]},{id:"sea",name:"\u30B7\u30FC",hex:"#3aa9ff",rgb:[.227,.663,1]},{id:"coral",name:"\u30B3\u30FC\u30E9\u30EB",hex:"#ff6b7a",rgb:[1,.42,.478]},{id:"leaf",name:"\u30EA\u30FC\u30D5",hex:"#4fd97b",rgb:[.31,.851,.482]},{id:"grape",name:"\u30B0\u30EC\u30FC\u30D7",hex:"#a97bff",rgb:[.663,.482,1]},{id:"peach",name:"\u30D4\u30FC\u30C1",hex:"#ff9a5c",rgb:[1,.604,.361]},{id:"aqua",name:"\u30A2\u30AF\u30A2",hex:"#35ded0",rgb:[.208,.871,.816]},{id:"berry",name:"\u30D9\u30EA\u30FC",hex:"#ff5fb4",rgb:[1,.373,.706]}];var tt=`
:host{
  all: initial;
  position: absolute; inset: 0;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans",
               "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Segoe UI", Roboto, sans-serif;
  color: ${y.ink};
  background: ${y.bg};
  overflow: hidden;
  contain: layout paint style;
  -webkit-tap-highlight-color: transparent;
  --vs-amber: ${y.amber};
  --vs-mint: ${y.mint};
  --vs-pink: ${y.pink};
  --vs-blue: ${y.blue};
  --vs-violet: ${y.violet};
  --vs-ink: ${y.ink};
  --vs-ink-sub: ${y.inkSub};
  --vs-panel: ${y.panel};
  --vs-line: ${y.line};
  --vs-radius: 18px;
  --vs-safe-t: env(safe-area-inset-top, 0px);
  --vs-safe-b: env(safe-area-inset-bottom, 0px);
  --vs-safe-l: env(safe-area-inset-left, 0px);
  --vs-safe-r: env(safe-area-inset-right, 0px);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
input, select { font: inherit; color: inherit; }

.vs-root{ position:absolute; inset:0; overflow:hidden; }

/* \u2500\u2500 \u753B\u9762\u306E \u51FA\u3057\u5165\u308C \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vs-screen{
  position:absolute; inset:0;
  opacity:0; visibility:hidden;
  transition: opacity .28s ease, transform .28s ease;
  transform: scale(.985);
  will-change: opacity, transform;
}
.vs-screen[data-on="1"]{ opacity:1; visibility:visible; transform:none; }
@media (prefers-reduced-motion: reduce){
  .vs-screen{ transition-duration: .01ms; transform:none; }
}

/* \u2500\u2500 \u753B\u9762\u3044\u3063\u3071\u3044\u306E \u677F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vs-canvas{ position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }

/* \u2500\u2500 \u3088\u304F\u4F7F\u3046 \u90E8\u54C1 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.vs-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:10px;
  height:52px; padding:0 26px; border-radius:15px;
  font-size:16px; font-weight:800; letter-spacing:.02em;
  background:linear-gradient(180deg, #ffc94a, ${y.amber});
  color:#231702;
  box-shadow:0 6px 0 #b97400, 0 12px 26px rgba(255,176,32,.28);
  transition: transform .12s cubic-bezier(.2,.9,.3,1.3), box-shadow .12s ease, filter .12s ease;
  user-select:none; -webkit-user-select:none;
}
.vs-btn:hover{ filter:brightness(1.05); }
.vs-btn:active{ transform:translateY(4px); box-shadow:0 2px 0 #b97400, 0 6px 14px rgba(255,176,32,.24); }
.vs-btn:focus-visible{ outline:3px solid #fff; outline-offset:3px; }
.vs-btn[disabled]{ opacity:.45; pointer-events:none; }
.vs-btn.is-ghost{
  background:${y.panel}; color:${y.ink};
  border:1px solid ${y.line}; box-shadow:none;
}
.vs-btn.is-ghost:active{ transform:translateY(2px); box-shadow:none; }
.vs-btn.is-mint{
  background:linear-gradient(180deg,#5ff0c6,${y.mint}); color:#04281f;
  box-shadow:0 6px 0 #17a17c, 0 12px 26px rgba(55,224,176,.26);
}
.vs-btn.is-mint:active{ box-shadow:0 2px 0 #17a17c, 0 6px 14px rgba(55,224,176,.22); }
.vs-btn.is-sm{ height:40px; padding:0 16px; font-size:14px; border-radius:12px; box-shadow:0 4px 0 rgba(0,0,0,.28); }
.vs-btn.is-sm:active{ transform:translateY(3px); box-shadow:0 1px 0 rgba(0,0,0,.28); }

.vs-card{
  background:${y.panel};
  border:1px solid ${y.line};
  border-radius:var(--vs-radius);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
}
.vs-chip{
  display:inline-flex; align-items:center; gap:6px;
  height:28px; padding:0 12px; border-radius:999px;
  background:${y.panelHi}; border:1px solid ${y.line};
  font-size:12px; font-weight:700; color:${y.inkSub};
}
.vs-h1{ font-size:clamp(30px,6vw,56px); font-weight:900; letter-spacing:-.02em; line-height:1.05; }
.vs-h2{ font-size:clamp(18px,3vw,24px); font-weight:800; letter-spacing:-.01em; }
.vs-sub{ color:${y.inkSub}; font-size:14px; line-height:1.7; }
.vs-mono{ font-variant-numeric: tabular-nums; font-feature-settings:"tnum"; }
.vs-hide{ display:none !important; }

/* \u76EE\u306B \u898B\u3048\u306A\u3044\u304C \u8AAD\u307F\u4E0A\u3052\u306B\u306F \u51FA\u3059 */
.vs-sr{
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}
`;var et=class{constructor(t){this.host=t,this.mountEl=document.createElement("div"),this.mountEl.className="vq-survive-host",this.mountEl.style.cssText="position:absolute;inset:0;overflow:hidden;",t.appendChild(this.mountEl),this.root=this.mountEl.attachShadow({mode:"open"});let e=document.createElement("style");e.textContent=tt,this.root.appendChild(e),this.container=document.createElement("div"),this.container.className="vs-root",this.root.appendChild(this.container),this.screens=new Map,this.current="",this._ro=null,this._raf=0,this._last=0,this._tickers=new Set,this._destroyed=!1,this._size={w:0,h:0},this.live=document.createElement("div"),this.live.className="vs-sr",this.live.setAttribute("role","status"),this.live.setAttribute("aria-live","polite"),this.container.appendChild(this.live),this._observeSize()}_observeSize(){let t=()=>{let e=this.mountEl.clientWidth,i=this.mountEl.clientHeight;if(!(e===this._size.w&&i===this._size.h)){this._size.w=e,this._size.h=i;for(let a of this.screens.values())if(a.resize)try{a.resize(e,i)}catch{}}};typeof ResizeObserver=="function"?(this._ro=new ResizeObserver(t),this._ro.observe(this.mountEl)):(this._onWin=t,window.addEventListener("resize",t)),t()}get size(){return this._size}register(t,e){let i=document.createElement("section");return i.className="vs-screen",i.setAttribute("data-screen",t),i.setAttribute("aria-hidden","true"),i.inert=!0,e.el&&i.appendChild(e.el),this.container.appendChild(i),e.wrap=i,e.shell=this,this.screens.set(t,e),e}get(t){return this.screens.get(t)}async show(t,e){if(this._destroyed)return;if(this.current===t){let r=this.screens.get(t);if(r&&r.enter)try{await r.enter(e)}catch(o){console.error("[VocabuSurvive] enter",o)}return}let i=this.screens.get(this.current),a=this.screens.get(t);if(!a){console.warn("[VocabuSurvive] \u753B\u9762\u304C \u3042\u308A\u307E\u305B\u3093: "+t);return}if(i){if(i.wrap.setAttribute("data-on","0"),i.wrap.setAttribute("aria-hidden","true"),i.wrap.inert=!0,i.exit)try{await i.exit()}catch(r){console.error("[VocabuSurvive] exit",r)}i.tick&&this._tickers.delete(i)}if(this.current=t,a.wrap.setAttribute("data-on","1"),a.wrap.setAttribute("aria-hidden","false"),a.wrap.inert=!1,a.resize)try{a.resize(this._size.w,this._size.h)}catch{}if(a.enter)try{await a.enter(e)}catch(r){console.error("[VocabuSurvive] enter",r)}a.tick&&this._tickers.add(a),this._ensureLoop(),a.title&&this.announce(a.title)}announce(t){try{this.live.textContent=String(t||"")}catch{}}_ensureLoop(){if(this._raf||this._destroyed||!this._tickers.size)return;this._last=typeof performance<"u"?performance.now():Date.now();let t=e=>{if(this._destroyed){this._raf=0;return}let i=Math.min(.1,(e-this._last)/1e3);this._last=e;for(let a of this._tickers)try{a.tick(i,e)}catch(r){console.error("[VocabuSurvive] tick",r)}this._raf=this._tickers.size?requestAnimationFrame(t):0};this._raf=requestAnimationFrame(t)}addTicker(t){this._tickers.add(t),this._ensureLoop()}removeTicker(t){this._tickers.delete(t)}destroy(){this._destroyed=!0,this._raf&&(cancelAnimationFrame(this._raf),this._raf=0),this._tickers.clear();for(let t of this.screens.values())try{t.destroy&&t.destroy()}catch{}if(this.screens.clear(),this._ro){try{this._ro.disconnect()}catch{}this._ro=null}if(this._onWin){try{window.removeEventListener("resize",this._onWin)}catch{}this._onWin=null}try{this.mountEl.remove()}catch{}}};function D(s,t,...e){let i=document.createElement(s);if(t)for(let a in t){let r=t[a];r==null||r===!1||(a==="class"?i.className=r:a==="style"?i.style.cssText=r:a==="text"?i.textContent=String(r):a.startsWith("on")&&typeof r=="function"?i.addEventListener(a.slice(2).toLowerCase(),r):a==="html"?i.innerHTML=r:i.setAttribute(a,r===!0?"":String(r)))}for(let a of e)a==null||a===!1||i.appendChild(typeof a=="string"||typeof a=="number"?document.createTextNode(String(a)):a);return i}function st(s,t,...e){let i=document.createElementNS("http://www.w3.org/2000/svg",s);if(t)for(let a in t){let r=t[a];r!=null&&r!==!1&&i.setAttribute(a,String(r))}for(let a of e)a&&i.appendChild(a);return i}var V="0.1.0",pt="2026-08-28";function te(s){let t=s.getExtension("ANGLE_instanced_arrays"),e=s.getExtension("OES_vertex_array_object");return s.getExtension("OES_element_index_uint"),s.getExtension("OES_standard_derivatives"),s.getExtension("WEBGL_depth_texture"),s.__isGL2=!1,s.__hasInstancing=!!t,s.__hasVAO=!!e,t&&(s.drawArraysInstanced=t.drawArraysInstancedANGLE.bind(t),s.drawElementsInstanced=t.drawElementsInstancedANGLE.bind(t),s.vertexAttribDivisor=t.vertexAttribDivisorANGLE.bind(t)),e&&(s.createVertexArray=e.createVertexArrayOES.bind(e),s.bindVertexArray=e.bindVertexArrayOES.bind(e),s.deleteVertexArray=e.deleteVertexArrayOES.bind(e)),s}function wt(s,t={}){let e={alpha:t.alpha===!0,antialias:t.antialias!==!1,depth:!0,stencil:!1,premultipliedAlpha:!0,preserveDrawingBuffer:!1,powerPreference:t.powerPreference||"high-performance",failIfMajorPerformanceCaveat:!1,desynchronized:!0},i=null;try{i=s.getContext("webgl2",e)}catch{}if(i){i.__isGL2=!0,i.__hasInstancing=!0,i.__hasVAO=!0;try{i.getExtension("EXT_color_buffer_float")}catch{}try{i.__aniso=i.getExtension("EXT_texture_filter_anisotropic")}catch{}return i}try{i=s.getContext("webgl",e)||s.getContext("experimental-webgl",e)}catch{}return i?te(i):null}function xt(s,t,e,i){let a=s.createShader(t);if(s.shaderSource(a,e),s.compileShader(a),!s.getShaderParameter(a,s.COMPILE_STATUS)){let r=s.getShaderInfoLog(a)||"",o=e.split(`
`).map((u,c)=>String(c+1).padStart(4," ")+" | "+u),n=/:(\d+):/.exec(r),h=o.slice(0,12).join(`
`);if(n){let u=Number(n[1])-1;h=o.slice(Math.max(0,u-4),u+5).join(`
`)}throw s.deleteShader(a),new Error("[VocabuSurvive] shader \u4F5C\u308A\u640D\u306A\u3044 ("+i+`):
`+r+`
`+h)}return a}var j=class{constructor(t,e,i,a="prog"){this.gl=t,this.name=a;let r=xt(t,t.VERTEX_SHADER,e,a+".vs"),o=xt(t,t.FRAGMENT_SHADER,i,a+".fs"),n=t.createProgram();if(t.attachShader(n,r),t.attachShader(n,o),t.linkProgram(n),t.deleteShader(r),t.deleteShader(o),!t.getProgramParameter(n,t.LINK_STATUS)){let c=t.getProgramInfoLog(n)||"";throw t.deleteProgram(n),new Error("[VocabuSurvive] program \u7E4B\u304E\u640D\u306A\u3044 ("+a+"): "+c)}this.program=n,this._u=Object.create(null),this._a=Object.create(null);let h=t.getProgramParameter(n,t.ACTIVE_UNIFORMS);for(let c=0;c<h;c++){let l=t.getActiveUniform(n,c);if(!l)continue;let d=l.name.replace(/\[0\]$/,"");this._u[d]=t.getUniformLocation(n,l.name)}let u=t.getProgramParameter(n,t.ACTIVE_ATTRIBUTES);for(let c=0;c<u;c++){let l=t.getActiveAttrib(n,c);l&&(this._a[l.name]=t.getAttribLocation(n,l.name))}}use(){return this.gl.useProgram(this.program),this}attr(t){let e=this._a[t];return e===void 0?-1:e}loc(t){return this._u[t]||null}u1f(t,e){let i=this._u[t];return i&&this.gl.uniform1f(i,e),this}u1i(t,e){let i=this._u[t];return i&&this.gl.uniform1i(i,e),this}u2f(t,e,i){let a=this._u[t];return a&&this.gl.uniform2f(a,e,i),this}u3f(t,e,i,a){let r=this._u[t];return r&&this.gl.uniform3f(r,e,i,a),this}u4f(t,e,i,a,r){let o=this._u[t];return o&&this.gl.uniform4f(o,e,i,a,r),this}u3v(t,e){let i=this._u[t];return i&&this.gl.uniform3fv(i,e),this}u4v(t,e){let i=this._u[t];return i&&this.gl.uniform4fv(i,e),this}uMat4(t,e){let i=this._u[t];return i&&this.gl.uniformMatrix4fv(i,!1,e),this}destroy(){try{this.gl.deleteProgram(this.program)}catch{}this.program=null}};var it=class{constructor(t,e,i){this.gl=t,this.target=e,this.capacity=Math.max(256,i|0),this.buffer=t.createBuffer(),t.bindBuffer(e,this.buffer),t.bufferData(e,this.capacity,t.DYNAMIC_DRAW)}upload(t,e){let i=this.gl,a=e===void 0?t.byteLength:e;i.bindBuffer(this.target,this.buffer),a>this.capacity&&(this.capacity=1<<Math.ceil(Math.log2(a)),i.bufferData(this.target,this.capacity,i.DYNAMIC_DRAW));let r=a===t.byteLength?t:new Uint8Array(t.buffer,t.byteOffset,a);i.bufferSubData(this.target,0,r)}destroy(){try{this.gl.deleteBuffer(this.buffer)}catch{}this.buffer=null}};function gt(s,t){let e=s.createFramebuffer(),i=s.createTexture();s.bindTexture(s.TEXTURE_2D,i);let a=!!s.__isGL2;a?s.texImage2D(s.TEXTURE_2D,0,s.DEPTH_COMPONENT24,t,t,0,s.DEPTH_COMPONENT,s.UNSIGNED_INT,null):s.texImage2D(s.TEXTURE_2D,0,s.DEPTH_COMPONENT,t,t,0,s.DEPTH_COMPONENT,s.UNSIGNED_INT,null),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_MAG_FILTER,s.NEAREST),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_S,s.CLAMP_TO_EDGE),s.texParameteri(s.TEXTURE_2D,s.TEXTURE_WRAP_T,s.CLAMP_TO_EDGE),s.bindFramebuffer(s.FRAMEBUFFER,e),s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,i,0),a&&(s.drawBuffers([s.NONE]),s.readBuffer(s.NONE));let r=s.checkFramebufferStatus(s.FRAMEBUFFER)===s.FRAMEBUFFER_COMPLETE;if(s.bindFramebuffer(s.FRAMEBUFFER,null),!r){try{s.deleteFramebuffer(e),s.deleteTexture(i)}catch{}return null}return{fb:e,tex:i,size:t}}var yt=`
precision highp float;
attribute vec3 a_pos;
attribute vec3 a_nor;
attribute vec2 a_uv;
attribute vec4 a_m0;
attribute vec4 a_m1;
attribute vec4 a_m2;
attribute vec4 a_m3;
attribute vec4 a_color;
attribute vec4 a_params;   /* x=\u81EA\u3089\u5149\u308B y=\u7E01\u306E\u5F37\u3055 z=\u7E1E\u306E\u7D30\u304B\u3055 w=\u63FA\u308C */

uniform mat4 u_viewProj;
uniform mat4 u_shadowMat;
uniform float u_time;

varying vec3 v_world;
varying vec3 v_nor;
varying vec2 v_uv;
varying vec4 v_color;
varying vec4 v_params;
varying vec4 v_shadowPos;

void main() {
  mat4 M = mat4(a_m0, a_m1, a_m2, a_m3);
  vec3 p = a_pos;
  /* w \u304C 0 \u3067\u306A\u3051\u308C\u3070 \u305D\u306E\u5834\u3067 \u63FA\u3089\u3059\uFF08\u65D7\u30FB\u6C34\u8349\u30FB\u96F2\uFF09\u3002
     \u9802\u70B9\u3067 \u3084\u308B\u306E\u3067 \u8FFD\u52A0\u306E \u63CF\u304D \u306F \u8981\u3089\u306A\u3044\u3002 */
  if (a_params.w > 0.001) {
    float ph = M[3].x * 0.7 + M[3].z * 0.9 + u_time * 1.7;
    p.x += sin(ph) * a_params.w * (p.y + 0.5);
    p.z += cos(ph * 0.83) * a_params.w * 0.6 * (p.y + 0.5);
  }
  vec4 wp = M * vec4(p, 1.0);
  v_world = wp.xyz;
  /* \u5927\u304D\u3055\u304C \u4E00\u69D8\u3067\u306A\u3044 \u3068\u304D\u3082 \u6CD5\u7DDA\u304C \u66F2\u304C\u3089\u306A\u3044\u3088\u3046\u306B\u3001
     3x3 \u306E \u5404\u5217\u306E \u9577\u3055\u3067 \u5272\u308B\uFF08\u9006\u8EE2\u7F6E\u306E \u5B89\u3044\u4EE3\u7528\uFF09\u3002 */
  vec3 s = vec3(length(M[0].xyz), length(M[1].xyz), length(M[2].xyz));
  mat3 R = mat3(M[0].xyz / max(s.x, 1e-5), M[1].xyz / max(s.y, 1e-5), M[2].xyz / max(s.z, 1e-5));
  v_nor = normalize(R * a_nor);
  v_uv = a_uv;
  v_color = a_color;
  v_params = a_params;
  v_shadowPos = u_shadowMat * wp;
  gl_Position = u_viewProj * wp;
}`,Mt=`
precision mediump float;

varying vec3 v_world;
varying vec3 v_nor;
varying vec2 v_uv;
varying vec4 v_color;
varying vec4 v_params;
varying vec4 v_shadowPos;

uniform vec3 u_lightDir;      /* \u5149\u306E \u5411\u304D\uFF08\u6B63\u898F\u5316\u6E08\u307F\u30FB\u5149\u6E90\u2192\u7269\uFF09 */
uniform vec3 u_lightColor;
uniform vec3 u_ambTop;        /* \u4E0A\u304B\u3089\u306E \u74B0\u5883\u5149\uFF08\u7A7A\u306E \u8272\uFF09 */
uniform vec3 u_ambBottom;     /* \u4E0B\u304B\u3089\u306E \u8DF3\u306D\u8FD4\u308A\uFF08\u5730\u9762\u306E \u8272\uFF09 */
uniform vec3 u_camPos;
uniform vec3 u_fogColor;
uniform vec2 u_fogRange;      /* x=\u59CB\u307E\u308A y=\u7D42\u308F\u308A */
uniform sampler2D u_shadowMap;
uniform float u_shadowOn;
uniform float u_shadowTexel;

float shadowAt(vec4 sp) {
  vec3 q = sp.xyz / sp.w;
  q = q * 0.5 + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  /* \u50BE\u3044\u305F \u9762\u307B\u3069 \u6DF1\u3055\u306E \u305A\u308C\u304C \u51FA\u308B\u306E\u3067 \u9003\u304C\u3057\u3092 \u5927\u304D\u304F\u3059\u308B */
  float bias = 0.0016;
  float sum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j)) * u_shadowTexel;
      float d = texture2D(u_shadowMap, q.xy + o).r;
      sum += (q.z - bias > d) ? 0.0 : 1.0;
    }
  }
  return sum / 9.0;
}

void main() {
  vec3 N = normalize(v_nor);
  vec3 V = normalize(u_camPos - v_world);
  vec3 L = -u_lightDir;

  /* \u534A\u30E9\u30F3\u30D0\u30FC\u30C8\u3002\u5F71\u5074\u304C \u771F\u3063\u9ED2\u306B \u306A\u3089\u306A\u3044\u3002 */
  float nl = dot(N, L) * 0.5 + 0.5;
  nl = nl * nl;

  float sh = 1.0;
  if (u_shadowOn > 0.5) sh = mix(1.0, shadowAt(v_shadowPos), 0.82);

  /* \u4E0A\u4E0B\u3067 \u8272\u306E \u9055\u3046 \u74B0\u5883\u5149\u3002\u5730\u9762\u306E \u7167\u308A\u8FD4\u3057\u304C \u5165\u308B\u3060\u3051\u3067 \u7ACB\u4F53\u306B \u898B\u3048\u308B\u3002 */
  float up = N.y * 0.5 + 0.5;
  vec3 amb = mix(u_ambBottom, u_ambTop, up);

  vec3 base = v_color.rgb;

  /* \u6BB5\u306E\u3042\u308B \u3064\u3084\u30023 \u6BB5\u306B \u5272\u308B\u3002 */
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 34.0);
  spec = step(0.28, spec) * 0.35 + step(0.7, spec) * 0.35;

  /* \u7E01\u306E \u5149\u3002\u8F2A\u90ED\u304C \u5206\u304B\u308C\u3066 \u304A\u3082\u3061\u3083\u306B \u898B\u3048\u308B\u3002 */
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * v_params.y;

  /* \u7E1E\uFF08\u8D70\u8DEF\u306E \u7AEF\u30FB\u5371\u306A\u3044\u3068\u3053\u308D\uFF09*/
  float stripe = 1.0;
  if (v_params.z > 0.001) {
    float t = fract((v_uv.x + v_uv.y) * v_params.z);
    stripe = mix(1.0, 0.62, step(0.5, t));
  }

  vec3 col = base * stripe * (amb + u_lightColor * nl * sh);
  col += u_lightColor * spec * sh * 0.5;
  col += base * rim;
  col += base * v_params.x;            /* \u81EA\u3089\u5149\u308B */

  /* \u9727\u3002\u7A7A\u3078 \u6EB6\u304B\u3059\u3002 */
  float d = length(u_camPos - v_world);
  float f = clamp((d - u_fogRange.x) / max(u_fogRange.y - u_fogRange.x, 1.0), 0.0, 1.0);
  f = f * f;
  col = mix(col, u_fogColor, f);

  gl_FragColor = vec4(col, v_color.a);
}`,Et=`
precision highp float;
attribute vec3 a_pos;
attribute vec4 a_m0;
attribute vec4 a_m1;
attribute vec4 a_m2;
attribute vec4 a_m3;
attribute vec4 a_params;
uniform mat4 u_shadowMat;
uniform float u_time;
void main() {
  mat4 M = mat4(a_m0, a_m1, a_m2, a_m3);
  vec3 p = a_pos;
  if (a_params.w > 0.001) {
    float ph = M[3].x * 0.7 + M[3].z * 0.9 + u_time * 1.7;
    p.x += sin(ph) * a_params.w * (p.y + 0.5);
    p.z += cos(ph * 0.83) * a_params.w * 0.6 * (p.y + 0.5);
  }
  gl_Position = u_shadowMat * M * vec4(p, 1.0);
}`,At=`
precision mediump float;
void main() { gl_FragColor = vec4(1.0); }`,St=`
precision highp float;
attribute vec2 a_pos;
varying vec2 v_ndc;
void main() { v_ndc = a_pos; gl_Position = vec4(a_pos, 1.0, 1.0); }`,Tt=`
precision mediump float;
varying vec2 v_ndc;
uniform mat4 u_invViewProj;
uniform vec3 u_camPos;
uniform vec3 u_top;
uniform vec3 u_horizon;
uniform vec3 u_ground;
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform float u_time;
uniform float u_clouds;

/* \u5B89\u3044 \u96D1\u97F3\uFF08\u5024\u30CE\u30A4\u30BA\uFF09\u3002\u96F2\u306E \u5E2F \u7528\u3002 */
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec4 far = u_invViewProj * vec4(v_ndc, 1.0, 1.0);
  vec3 dir = normalize(far.xyz / far.w - u_camPos);

  float h = dir.y;
  vec3 col;
  if (h >= 0.0) {
    col = mix(u_horizon, u_top, pow(clamp(h, 0.0, 1.0), 0.55));
    if (u_clouds > 0.5) {
      /* \u7A7A\u3092 \u5E73\u3089\u306A \u677F\u306B \u5199\u3057\u3066 \u96F2\u3092 \u5F15\u304D\u4F38\u3070\u3059 */
      float t = 0.14 / max(h, 0.02);
      vec2 uv = dir.xz * t + vec2(u_time * 0.004, u_time * 0.002);
      float n = noise(uv * 2.2) * 0.55 + noise(uv * 5.1) * 0.3 + noise(uv * 11.0) * 0.15;
      float c = smoothstep(0.55, 0.86, n) * smoothstep(0.0, 0.22, h);
      col = mix(col, vec3(1.0), c * 0.75);
    }
  } else {
    col = mix(u_horizon, u_ground, pow(clamp(-h, 0.0, 1.0), 0.45));
  }
  /* \u592A\u967D\u3002\u4E38\u3068 \u5E83\u304C\u308A\u306E 2 \u679A\u3002 */
  float sd = max(dot(dir, -u_sunDir), 0.0);
  col += u_sunColor * pow(sd, 900.0) * 2.2;
  col += u_sunColor * pow(sd, 12.0) * 0.16;
  gl_FragColor = vec4(col, 1.0);
}`;var z=Math.PI*2,Se=Math.PI/180;function C(s,t,e){return s<t?t:s>e?e:s}function $(s,t,e){return s+(t-s)*e}function ee(s,t){let e=(t-s)%z;return e>Math.PI&&(e-=z),e<-Math.PI&&(e+=z),e}function Y(s,t,e,i){return $(s,t,1-Math.exp(-e*i))}function Pt(s,t,e,i){return s+ee(s,t)*(1-Math.exp(-e*i))}var F={create(s=0,t=0,e=0){return new Float32Array([s,t,e])},set(s,t,e,i){return s[0]=t,s[1]=e,s[2]=i,s},copy(s,t){return s[0]=t[0],s[1]=t[1],s[2]=t[2],s},add(s,t,e){return s[0]=t[0]+e[0],s[1]=t[1]+e[1],s[2]=t[2]+e[2],s},sub(s,t,e){return s[0]=t[0]-e[0],s[1]=t[1]-e[1],s[2]=t[2]-e[2],s},scale(s,t,e){return s[0]=t[0]*e,s[1]=t[1]*e,s[2]=t[2]*e,s},addScaled(s,t,e,i){return s[0]=t[0]+e[0]*i,s[1]=t[1]+e[1]*i,s[2]=t[2]+e[2]*i,s},dot(s,t){return s[0]*t[0]+s[1]*t[1]+s[2]*t[2]},len(s){return Math.hypot(s[0],s[1],s[2])},lenSq(s){return s[0]*s[0]+s[1]*s[1]+s[2]*s[2]},dist(s,t){return Math.hypot(s[0]-t[0],s[1]-t[1],s[2]-t[2])},distSq(s,t){let e=s[0]-t[0],i=s[1]-t[1],a=s[2]-t[2];return e*e+i*i+a*a},normalize(s,t){let e=Math.hypot(t[0],t[1],t[2])||1;return s[0]=t[0]/e,s[1]=t[1]/e,s[2]=t[2]/e,s},cross(s,t,e){let i=t[0],a=t[1],r=t[2],o=e[0],n=e[1],h=e[2];return s[0]=a*h-r*n,s[1]=r*o-i*h,s[2]=i*n-a*o,s},lerp(s,t,e,i){return s[0]=t[0]+(e[0]-t[0])*i,s[1]=t[1]+(e[1]-t[1])*i,s[2]=t[2]+(e[2]-t[2])*i,s}},x={create(){let s=new Float32Array(16);return s[0]=s[5]=s[10]=s[15]=1,s},identity(s){return s[0]=1,s[1]=0,s[2]=0,s[3]=0,s[4]=0,s[5]=1,s[6]=0,s[7]=0,s[8]=0,s[9]=0,s[10]=1,s[11]=0,s[12]=0,s[13]=0,s[14]=0,s[15]=1,s},copy(s,t){return s.set(t),s},multiply(s,t,e){let i=t[0],a=t[1],r=t[2],o=t[3],n=t[4],h=t[5],u=t[6],c=t[7],l=t[8],d=t[9],f=t[10],p=t[11],m=t[12],b=t[13],_=t[14],g=t[15];for(let v=0;v<4;v++){let w=e[v*4],A=e[v*4+1],S=e[v*4+2],T=e[v*4+3];s[v*4]=w*i+A*n+S*l+T*m,s[v*4+1]=w*a+A*h+S*d+T*b,s[v*4+2]=w*r+A*u+S*f+T*_,s[v*4+3]=w*o+A*c+S*p+T*g}return s},perspective(s,t,e,i,a){let r=1/Math.tan(t/2);return s.fill(0),s[0]=r/e,s[5]=r,s[11]=-1,s[10]=(a+i)/(i-a),s[14]=2*a*i/(i-a),s},ortho(s,t,e,i,a,r,o){return s.fill(0),s[0]=2/(e-t),s[5]=2/(a-i),s[10]=-2/(o-r),s[12]=-(e+t)/(e-t),s[13]=-(a+i)/(a-i),s[14]=-(o+r)/(o-r),s[15]=1,s},lookAt(s,t,e,i){let a=t[0]-e[0],r=t[1]-e[1],o=t[2]-e[2],n=Math.hypot(a,r,o)||1;a/=n,r/=n,o/=n;let h=i[1]*o-i[2]*r,u=i[2]*a-i[0]*o,c=i[0]*r-i[1]*a;n=Math.hypot(h,u,c),n?(h/=n,u/=n,c/=n):(h=1,u=0,c=0);let l=r*c-o*u,d=o*h-a*c,f=a*u-r*h;return s[0]=h,s[1]=l,s[2]=a,s[3]=0,s[4]=u,s[5]=d,s[6]=r,s[7]=0,s[8]=c,s[9]=f,s[10]=o,s[11]=0,s[12]=-(h*t[0]+u*t[1]+c*t[2]),s[13]=-(l*t[0]+d*t[1]+f*t[2]),s[14]=-(a*t[0]+r*t[1]+o*t[2]),s[15]=1,s},compose(s,t,e,i,a,r,o,n){let h=Math.cos(a),u=Math.sin(a);return s[0]=h*r,s[1]=0,s[2]=-u*r,s[3]=0,s[4]=0,s[5]=o,s[6]=0,s[7]=0,s[8]=u*n,s[9]=0,s[10]=h*n,s[11]=0,s[12]=t,s[13]=e,s[14]=i,s[15]=1,s},composeXYZ(s,t,e,i,a,r,o,n,h,u){let c=Math.cos(a),l=Math.sin(a),d=Math.cos(r),f=Math.sin(r),p=Math.cos(o),m=Math.sin(o),b=d*p+f*l*m,_=c*m,g=-f*p+d*l*m,v=-d*m+f*l*p,w=c*p,A=f*m+d*l*p,S=f*c,T=-l,N=d*c;return s[0]=b*n,s[1]=_*n,s[2]=g*n,s[3]=0,s[4]=v*h,s[5]=w*h,s[6]=A*h,s[7]=0,s[8]=S*u,s[9]=T*u,s[10]=N*u,s[11]=0,s[12]=t,s[13]=e,s[14]=i,s[15]=1,s},invert(s,t){let e=t[0],i=t[1],a=t[2],r=t[3],o=t[4],n=t[5],h=t[6],u=t[7],c=t[8],l=t[9],d=t[10],f=t[11],p=t[12],m=t[13],b=t[14],_=t[15],g=e*n-i*o,v=e*h-a*o,w=e*u-r*o,A=i*h-a*n,S=i*u-r*n,T=a*u-r*h,N=c*m-l*p,E=c*b-d*p,P=c*_-f*p,I=l*b-d*m,L=l*_-f*m,B=d*_-f*b,M=g*B-v*L+w*I+A*P-S*E+T*N;return M?(M=1/M,s[0]=(n*B-h*L+u*I)*M,s[1]=(a*L-i*B-r*I)*M,s[2]=(m*T-b*S+_*A)*M,s[3]=(d*S-l*T-f*A)*M,s[4]=(h*P-o*B-u*E)*M,s[5]=(e*B-a*P+r*E)*M,s[6]=(b*w-p*T-_*v)*M,s[7]=(c*T-d*w+f*v)*M,s[8]=(o*L-n*P+u*N)*M,s[9]=(i*P-e*L-r*N)*M,s[10]=(p*S-m*w+_*g)*M,s[11]=(l*w-c*S-f*g)*M,s[12]=(n*E-o*I-h*N)*M,s[13]=(e*I-i*E+a*N)*M,s[14]=(m*v-p*A-b*g)*M,s[15]=(c*A-l*v+d*g)*M,s):x.identity(s)},transformPoint(s,t,e){let i=e[0],a=e[1],r=e[2],o=t[3]*i+t[7]*a+t[11]*r+t[15]||1;return s[0]=(t[0]*i+t[4]*a+t[8]*r+t[12])/o,s[1]=(t[1]*i+t[5]*a+t[9]*r+t[13])/o,s[2]=(t[2]*i+t[6]*a+t[10]*r+t[14])/o,s}};function Rt(s){let t=s>>>0;return function(){t|=0,t=t+1831565813|0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}var at=24,Z=at*4,rt=class{constructor(t,e){if(this.canvas=t,this.settings=e,this.gl=wt(t,{antialias:(e.msaa|0)>0}),!this.gl)throw new Error("WEBGL_UNAVAILABLE");let i=this.gl;this.isGL2=!!i.__isGL2,this.hasInstancing=!!i.__hasInstancing,this.progMain=new j(i,yt,Mt,"main"),this.progShadow=new j(i,Et,At,"shadow"),this.progSky=new j(i,St,Tt,"sky"),this.skyBuf=i.createBuffer(),i.bindBuffer(i.ARRAY_BUFFER,this.skyBuf),i.bufferData(i.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),i.STATIC_DRAW),this.meshes=new Map,this.shadow=null,e.shadow&&(this.shadow=gt(i,e.shadowSize),this.shadow||(this.settings=Object.assign({},e,{shadow:!1}))),this._viewProj=x.create(),this._invViewProj=x.create(),this._shadowMat=x.create(),this._tmpM=x.create(),this._tmpV=x.create(),this._eye=F.create(),this._planes=new Float32Array(24),this._camPos=F.create(),this.stats={draws:0,instances:0,culled:0,tris:0,meshes:0},this.time=0,this.sky={top:[.36,.62,.94],horizon:[.75,.87,.98],ground:[.3,.4,.48],sun:[1,.95,.82]},this.light={dir:F.create(-.42,-.78,-.46),color:[1.06,1.02,.94]},F.normalize(this.light.dir,this.light.dir),this.ambTop=[.36,.42,.52],this.ambBottom=[.2,.2,.24],this.fog={color:[.75,.87,.98],near:e.drawDistance*.45,far:e.drawDistance},this.shadowCenter=F.create(0,0,0),this.shadowRadius=34,i.enable(i.DEPTH_TEST),i.depthFunc(i.LEQUAL),i.enable(i.CULL_FACE),i.cullFace(i.BACK),this._sized={w:0,h:0}}addMesh(t,e){let i=this.gl,r=(Array.isArray(e)?e:[e]).map(n=>{let h=new Float32Array(n.position.length/3*8);for(let l=0,d=0;l<n.position.length;l+=3,d+=8)h[d]=n.position[l],h[d+1]=n.position[l+1],h[d+2]=n.position[l+2],h[d+3]=n.normal[l],h[d+4]=n.normal[l+1],h[d+5]=n.normal[l+2],h[d+6]=n.uv[l/3*2],h[d+7]=n.uv[l/3*2+1];let u=i.createBuffer();i.bindBuffer(i.ARRAY_BUFFER,u),i.bufferData(i.ARRAY_BUFFER,h,i.STATIC_DRAW);let c=i.createBuffer();return i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,c),i.bufferData(i.ELEMENT_ARRAY_BUFFER,n.index,i.STATIC_DRAW),{vbo:u,ibo:c,count:n.index.length,type:n.index instanceof Uint32Array?i.UNSIGNED_INT:i.UNSIGNED_SHORT,bound:n.bound}}),o={id:t,lods:r,buckets:r.map(()=>({data:new Float32Array(at*64),n:0,buf:null}))};return this.meshes.set(t,o),this.stats.meshes=this.meshes.size,o}hasMesh(t){return this.meshes.has(t)}resize(){let t=this.gl,e=this.canvas,i=this.settings,a=Math.max(1,e.clientWidth||1),r=Math.max(1,e.clientHeight||1),o=Math.min(i.dpr,i.pixelRatio*i.dpr),n=Math.round(a*o),h=Math.round(r*o),u=n*h;if(u>i.maxPixels){let c=Math.sqrt(i.maxPixels/u);n=Math.max(1,Math.round(n*c)),h=Math.max(1,Math.round(h*c))}return(e.width!==n||e.height!==h)&&(e.width=n,e.height=h),this._sized.w=n,this._sized.h=h,t.viewport(0,0,n,h),{w:n,h,cssW:a,cssH:r}}_extractPlanes(t){let e=this._planes,i=[[t[3]+t[0],t[7]+t[4],t[11]+t[8],t[15]+t[12]],[t[3]-t[0],t[7]-t[4],t[11]-t[8],t[15]-t[12]],[t[3]+t[1],t[7]+t[5],t[11]+t[9],t[15]+t[13]],[t[3]-t[1],t[7]-t[5],t[11]-t[9],t[15]-t[13]],[t[3]+t[2],t[7]+t[6],t[11]+t[10],t[15]+t[14]],[t[3]-t[2],t[7]-t[6],t[11]-t[10],t[15]-t[14]]];for(let a=0;a<6;a++){let r=i[a],o=Math.hypot(r[0],r[1],r[2])||1;e[a*4]=r[0]/o,e[a*4+1]=r[1]/o,e[a*4+2]=r[2]/o,e[a*4+3]=r[3]/o}}_inFrustum(t,e,i,a){let r=this._planes;for(let o=0;o<6;o++)if(r[o*4]*t+r[o*4+1]*e+r[o*4+2]*i+r[o*4+3]<-a)return!1;return!0}begin(t){x.copy(this._viewProj,t.viewProj),x.invert(this._invViewProj,this._viewProj),F.copy(this._camPos,t.pos),this._extractPlanes(this._viewProj);for(let e of this.meshes.values())for(let i of e.buckets)i.n=0;this.stats.draws=0,this.stats.instances=0,this.stats.culled=0,this.stats.tris=0}draw(t,e,i,a=0,r=.16,o=0,n=0,h=1){let u=this.meshes.get(t);if(!u)return!1;let c=e[12],l=e[13],d=e[14],f=u.lods[0].bound.r*h;if(!this._inFrustum(c,l,d,f))return this.stats.culled++,!1;let p=this._camPos,m=Math.hypot(c-p[0],l-p[1],d-p[2]);if(m-f>this.settings.drawDistance)return this.stats.culled++,!1;let b=0;if(u.lods.length>1){let w=m/Math.max(1,this.settings.drawDistance);b=w>.42?Math.min(u.lods.length-1,2):w>.16?Math.min(u.lods.length-1,1):0}let _=u.buckets[b],g=(_.n+1)*at;if(g>_.data.length){let w=new Float32Array(Math.max(g,_.data.length*2));w.set(_.data),_.data=w}let v=_.n*at;return _.data.set(e,v),_.data[v+16]=i[0],_.data[v+17]=i[1],_.data[v+18]=i[2],_.data[v+19]=i.length>3?i[3]:1,_.data[v+20]=a,_.data[v+21]=r,_.data[v+22]=o,_.data[v+23]=n,_.n++,!0}_bindMeshAttrs(t,e,i){let a=this.gl;a.bindBuffer(a.ARRAY_BUFFER,e.vbo);let r=t.attr("a_pos");if(r>=0&&(a.enableVertexAttribArray(r),a.vertexAttribPointer(r,3,a.FLOAT,!1,32,0),a.vertexAttribDivisor(r,0)),i){let o=t.attr("a_nor");o>=0&&(a.enableVertexAttribArray(o),a.vertexAttribPointer(o,3,a.FLOAT,!1,32,12),a.vertexAttribDivisor(o,0));let n=t.attr("a_uv");n>=0&&(a.enableVertexAttribArray(n),a.vertexAttribPointer(n,2,a.FLOAT,!1,32,24),a.vertexAttribDivisor(n,0))}a.bindBuffer(a.ELEMENT_ARRAY_BUFFER,e.ibo)}_bindInstanceAttrs(t,e,i){let a=this.gl;e.buf||(e.buf=new it(a,a.ARRAY_BUFFER,Z*64)),e.buf.upload(e.data,e.n*Z),a.bindBuffer(a.ARRAY_BUFFER,e.buf.buffer);let r=["a_m0","a_m1","a_m2","a_m3"];for(let n=0;n<4;n++){let h=t.attr(r[n]);h<0||(a.enableVertexAttribArray(h),a.vertexAttribPointer(h,4,a.FLOAT,!1,Z,n*16),a.vertexAttribDivisor(h,1))}if(i){let n=t.attr("a_color");n>=0&&(a.enableVertexAttribArray(n),a.vertexAttribPointer(n,4,a.FLOAT,!1,Z,64),a.vertexAttribDivisor(n,1))}let o=t.attr("a_params");o>=0&&(a.enableVertexAttribArray(o),a.vertexAttribPointer(o,4,a.FLOAT,!1,Z,80),a.vertexAttribDivisor(o,1))}_disableAll(t){let e=this.gl;for(let i of["a_pos","a_nor","a_uv","a_m0","a_m1","a_m2","a_m3","a_color","a_params"]){let a=t.attr(i);a>=0&&(e.vertexAttribDivisor(a,0),e.disableVertexAttribArray(a))}}_updateShadowMat(t,e){let i=this.light.dir,a=this._eye;F.set(a,t[0]-i[0]*e*2.2,t[1]-i[1]*e*2.2,t[2]-i[2]*e*2.2);let r=Math.abs(i[1])>.98?[0,0,1]:[0,1,0];x.lookAt(this._tmpV,a,t,r),x.ortho(this._tmpM,-e,e,-e,e,.1,e*5),x.multiply(this._shadowMat,this._tmpM,this._tmpV)}end(t){let e=this.gl;if(this.time+=t||0,this.settings.shadow&&this.shadow){this._updateShadowMat(this.shadowCenter,this.shadowRadius),e.bindFramebuffer(e.FRAMEBUFFER,this.shadow.fb),e.viewport(0,0,this.shadow.size,this.shadow.size),e.clear(e.DEPTH_BUFFER_BIT),e.cullFace(e.FRONT);let a=this.progShadow.use();a.uMat4("u_shadowMat",this._shadowMat).u1f("u_time",this.time);for(let r of this.meshes.values())for(let o=0;o<r.lods.length;o++){let n=r.buckets[o];n.n&&(this._bindMeshAttrs(a,r.lods[o],!1),this._bindInstanceAttrs(a,n,!1),e.drawElementsInstanced(e.TRIANGLES,r.lods[o].count,r.lods[o].type,0,n.n))}this._disableAll(a),e.cullFace(e.BACK),e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,this._sized.w,this._sized.h)}e.depthMask(!1),e.disable(e.DEPTH_TEST);{let a=this.progSky.use();e.bindBuffer(e.ARRAY_BUFFER,this.skyBuf);let r=a.attr("a_pos");r>=0&&(e.enableVertexAttribArray(r),e.vertexAttribDivisor(r,0),e.vertexAttribPointer(r,2,e.FLOAT,!1,0,0)),a.uMat4("u_invViewProj",this._invViewProj).u3v("u_camPos",this._camPos).u3v("u_top",this.sky.top).u3v("u_horizon",this.sky.horizon).u3v("u_ground",this.sky.ground).u3v("u_sunColor",this.sky.sun).u3v("u_sunDir",this.light.dir).u1f("u_time",this.time).u1f("u_clouds",this.settings.clouds?1:0),e.drawArrays(e.TRIANGLES,0,3),r>=0&&e.disableVertexAttribArray(r)}e.enable(e.DEPTH_TEST),e.depthMask(!0),e.clear(e.DEPTH_BUFFER_BIT);let i=this.progMain.use();i.uMat4("u_viewProj",this._viewProj).uMat4("u_shadowMat",this._shadowMat).u3v("u_lightDir",this.light.dir).u3v("u_lightColor",this.light.color).u3v("u_ambTop",this.ambTop).u3v("u_ambBottom",this.ambBottom).u3v("u_camPos",this._camPos).u3v("u_fogColor",this.fog.color).u2f("u_fogRange",this.fog.near,this.fog.far).u1f("u_time",this.time).u1f("u_shadowOn",this.settings.shadow&&this.shadow?1:0).u1f("u_shadowTexel",this.shadow?1/this.shadow.size:0),this.shadow&&(e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.shadow.tex),i.u1i("u_shadowMap",0)),e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA);for(let a of this.meshes.values())for(let r=0;r<a.lods.length;r++){let o=a.buckets[r];if(!o.n)continue;let n=a.lods[r];this._bindMeshAttrs(i,n,!0),this._bindInstanceAttrs(i,o,!0),e.drawElementsInstanced(e.TRIANGLES,n.count,n.type,0,o.n),this.stats.draws++,this.stats.instances+=o.n,this.stats.tris+=n.count/3*o.n}this._disableAll(i),e.disable(e.BLEND)}clearColor(t,e,i){this.gl.clearColor(t,e,i,1),this.gl.clear(this.gl.COLOR_BUFFER_BIT|this.gl.DEPTH_BUFFER_BIT)}destroy(){let t=this.gl;try{for(let i of this.meshes.values()){for(let a of i.lods)t.deleteBuffer(a.vbo),t.deleteBuffer(a.ibo);for(let a of i.buckets)a.buf&&a.buf.destroy()}this.meshes.clear(),this.shadow&&(t.deleteFramebuffer(this.shadow.fb),t.deleteTexture(this.shadow.tex)),t.deleteBuffer(this.skyBuf),this.progMain.destroy(),this.progShadow.destroy(),this.progSky.destroy();let e=t.getExtension("WEBGL_lose_context");e&&e.loseContext()}catch{}this.gl=null}};var nt=class{constructor(){this.target=F.create(0,0,0),this.pos=F.create(0,4,8),this.look=F.create(0,0,0),this.yaw=0,this.pitch=.3,this.wantYaw=0,this.wantPitch=.3,this.distance=7.2,this.wantDistance=7.2,this.minDistance=1.6,this.maxDistance=13,this.height=1.35,this.fov=62*Math.PI/180,this.near=.14,this.far=420,this.view=x.create(),this.proj=x.create(),this.viewProj=x.create(),this.shake=0,this._shakeT=0,this._tmp=F.create(),this.raycast=null,this.pitchMin=-.3,this.pitchMax=1.1,this.invertY=!1,this.sensitivity=1}rotate(t,e){this.wantYaw-=t*.0032*this.sensitivity;let i=this.invertY?-1:1;this.wantPitch=C(this.wantPitch+e*.0026*this.sensitivity*i,this.pitchMin,this.pitchMax),this.wantYaw>z&&(this.wantYaw-=z),this.wantYaw<-z&&(this.wantYaw+=z)}zoom(t){this.wantDistance=C(this.wantDistance+t*.01,this.minDistance,this.maxDistance)}snap(t,e){F.copy(this.target,t),e!==void 0&&(this.yaw=this.wantYaw=e),this.pitch=this.wantPitch,this.distance=this.wantDistance,this._place(0)}hit(t){this.shake=Math.max(this.shake,t)}_place(t){let e=Math.cos(this.pitch),i=Math.sin(this.pitch),a=Math.cos(this.yaw),r=Math.sin(this.yaw),o=this.target[0],n=this.target[1]+this.height,h=this.target[2],u=r*e,c=i,l=a*e,d=this.distance;if(this.raycast){F.set(this._tmp,u,c,l);let b=this.raycast([o,n,h],this._tmp,d+.35);b>=0&&(d=Math.max(this.minDistance*.6,b-.32))}let f=o+u*d,p=n+c*d,m=h+l*d;if(this.shake>.001){this._shakeT+=t*44;let b=this.shake;f+=Math.sin(this._shakeT*1.7)*.09*b,p+=Math.sin(this._shakeT*2.3+1.1)*.09*b,m+=Math.cos(this._shakeT*1.9+.4)*.09*b}F.set(this.pos,f,p,m),F.set(this.look,o,n,h),x.lookAt(this.view,this.pos,this.look,[0,1,0])}update(t,e,i,a){this.target[0]=Y(this.target[0],e[0],14,t),this.target[1]=Y(this.target[1],e[1],9,t),this.target[2]=Y(this.target[2],e[2],14,t),this.yaw=Pt(this.yaw,this.wantYaw,13,t),this.pitch=Y(this.pitch,this.wantPitch,13,t);let r=C((i-4)*.16,0,1.5);this.distance=Y(this.distance,this.wantDistance+r,4.5,t),this.shake>0&&(this.shake=Math.max(0,this.shake-t*2.6)),this._place(t);let o=this.fov+C((i-5)*.012,0,.16);return x.perspective(this.proj,o,Math.max(.2,a),this.near,this.far),x.multiply(this.viewProj,this.proj,this.view),this}forward(t){let e=Math.cos(this.yaw),i=Math.sin(this.yaw);return F.set(t,-i,0,-e)}right(t){let e=Math.cos(this.yaw),i=Math.sin(this.yaw);return F.set(t,e,0,-i)}};function K(s,t,e,i){let a=new Float32Array(s),r=new Float32Array(t),o=new Float32Array(e),n=s.length/3>65535?new Uint32Array(i):new Uint16Array(i),h=0,u=[1/0,1/0,1/0],c=[-1/0,-1/0,-1/0];for(let l=0;l<a.length;l+=3){let d=a[l],f=a[l+1],p=a[l+2],m=d*d+f*f+p*p;m>h&&(h=m),d<u[0]&&(u[0]=d),d>c[0]&&(c[0]=d),f<u[1]&&(u[1]=f),f>c[1]&&(c[1]=f),p<u[2]&&(u[2]=p),p>c[2]&&(c[2]=p)}return{position:a,normal:r,uv:o,index:n,bound:{r:Math.sqrt(h),min:u,max:c}}}function H(s=3,t=.14,e=1,i=1,a=1){let r=[],o=[],n=[],h=[],u=Math.max(1,s|0),c=.5,l=[[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]],[[1,0,0],[0,0,-1],[0,1,0]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]]],d=Math.min(.499,Math.max(0,t)),f=c-d;for(let p=0;p<6;p++){let[m,b,_]=l[p],g=r.length/3;for(let v=0;v<=u;v++)for(let w=0;w<=u;w++){let A=w/u*2-1,S=v/u*2-1,T=m[0]*c+b[0]*A*c+_[0]*S*c,N=m[1]*c+b[1]*A*c+_[1]*S*c,E=m[2]*c+b[2]*A*c+_[2]*S*c,P=Math.max(-f,Math.min(f,T)),I=Math.max(-f,Math.min(f,N)),L=Math.max(-f,Math.min(f,E)),B=T-P,M=N-I,q=E-L,J=Math.hypot(B,M,q);J>1e-6?(B/=J,M/=J,q/=J):(B=m[0],M=m[1],q=m[2]),r.push((P+B*d)*e,(I+M*d)*i,(L+q*d)*a),o.push(B,M,q),n.push(w/u,v/u)}for(let v=0;v<u;v++)for(let w=0;w<u;w++){let A=g+v*(u+1)+w,S=A+1,T=A+u+1,N=T+1;h.push(A,T,S,S,T,N)}}return K(r,o,n,h)}function U(s=16,t=12,e=.5){let i=[],a=[],r=[],o=[];for(let n=0;n<=t;n++){let h=n/t,u=h*Math.PI,c=Math.sin(u),l=Math.cos(u);for(let d=0;d<=s;d++){let f=d/s,p=f*Math.PI*2,m=c*Math.cos(p),b=l,_=c*Math.sin(p);i.push(m*e,b*e,_*e),a.push(m,b,_),r.push(f,h)}}for(let n=0;n<t;n++)for(let h=0;h<s;h++){let u=n*(s+1)+h,c=u+1,l=u+s+1,d=l+1;n!==0&&o.push(u,l,c),n!==t-1&&o.push(c,l,d)}return K(i,a,r,o)}function Q(s=16,t=.5,e=.5,i=1,a=!0){let r=[],o=[],n=[],h=[],u=i/2,c=(e-t)/i;for(let l=0;l<=1;l++){let d=l===0?-u:u,f=l===0?e:t;for(let p=0;p<=s;p++){let m=p/s*Math.PI*2,b=Math.cos(m),_=Math.sin(m);r.push(b*f,d,_*f);let g=Math.hypot(1,c)||1;o.push(b/g,c/g,_/g),n.push(p/s,l)}}for(let l=0;l<s;l++){let d=l,f=l+1,p=l+s+1,m=p+1;h.push(d,p,f,f,p,m)}if(a)for(let[l,d,f]of[[-u,e,-1],[u,t,1]]){if(d<=1e-6)continue;let p=r.length/3;r.push(0,l,0),o.push(0,f,0),n.push(.5,.5);for(let m=0;m<=s;m++){let b=m/s*Math.PI*2;r.push(Math.cos(b)*d,l,Math.sin(b)*d),o.push(0,f,0),n.push(.5+Math.cos(b)*.5,.5+Math.sin(b)*.5)}for(let m=0;m<s;m++)f>0?h.push(p,p+1+m,p+2+m):h.push(p,p+2+m,p+1+m)}return K(r,o,n,h)}function G(s=16,t=6,e=.4,i=.5){let a=[],r=[],o=[],n=[],h=[];for(let c=0;c<=t;c++){let l=c/t*(Math.PI/2);h.push({y:-i/2-Math.cos(l)*e,rr:Math.sin(l)*e,ny:-Math.cos(l)})}for(let c=0;c<=t;c++){let l=c/t*(Math.PI/2);h.push({y:i/2+Math.sin(l)*e,rr:Math.cos(l)*e,ny:Math.sin(l)})}let u=h.length;for(let c=0;c<u;c++){let l=h[c];for(let d=0;d<=s;d++){let f=d/s*Math.PI*2,p=Math.cos(f),m=Math.sin(f);a.push(p*l.rr,l.y,m*l.rr);let b=Math.sqrt(Math.max(0,1-l.ny*l.ny));r.push(p*b,l.ny,m*b),o.push(d/s,c/(u-1))}}for(let c=0;c<u-1;c++)for(let l=0;l<s;l++){let d=c*(s+1)+l,f=d+1,p=d+s+1,m=p+1;n.push(d,p,f,f,p,m)}return K(a,r,o,n)}function mt(s=24,t=10,e=.5,i=.15){let a=[],r=[],o=[],n=[];for(let h=0;h<=t;h++){let u=h/t*Math.PI*2,c=Math.cos(u),l=Math.sin(u);for(let d=0;d<=s;d++){let f=d/s*Math.PI*2,p=Math.cos(f),m=Math.sin(f);a.push((e+i*c)*p,i*l,(e+i*c)*m),r.push(c*p,l,c*m),o.push(d/s,h/t)}}for(let h=0;h<t;h++)for(let u=0;u<s;u++){let c=h*(s+1)+u,l=c+1,d=c+s+1,f=d+1;n.push(c,d,l,l,d,f)}return K(a,r,o,n)}var k={body:"vs_bean_body",head:"vs_bean_head",eye:"vs_bean_eye",pupil:"vs_bean_pupil",visor:"vs_bean_visor",limb:"vs_bean_limb",foot:"vs_bean_foot",stem:"vs_bean_stem",leaf:"vs_bean_leaf"};function Dt(s){let t=s;t.hasMesh(k.body)||(t.addMesh(k.body,[G(20,8,.42,.36),G(12,5,.42,.36),G(8,3,.42,.36)]),t.addMesh(k.head,[U(20,14,.5),U(12,8,.5),U(8,5,.5)]),t.addMesh(k.eye,[U(14,10,.5),U(8,6,.5)]),t.addMesh(k.pupil,[U(10,8,.5),U(6,4,.5)]),t.addMesh(k.visor,[H(3,.3),H(2,.3),H(1,.22)]),t.addMesh(k.limb,[G(12,5,.5,.4),G(8,3,.5,.4)]),t.addMesh(k.foot,[H(3,.34),H(1,.3)]),t.addMesh(k.stem,[Q(8,.5,.62,1,!1)]),t.addMesh(k.leaf,[U(12,8,.5),U(6,4,.5)]))}var R=x.create(),se=[1,1,1,1],ie=[.09,.1,.16,1],ae=[.36,.84,.42,1],re=[.42,.72,.36,1],ot=class{constructor(t){this.color=[t[0],t[1],t[2],1],this.dark=[t[0]*.62,t[1]*.62,t[2]*.62,1],this.phase=Math.random()*z,this.blink=0,this.blinkAt=1.4+Math.random()*3,this.squash=1,this.tilt=0,this.armSwing=0,this.faceYaw=0,this.emote="",this.emoteT=0,this.hidden=!1}update(t,e){let i=Math.max(0,e.speed||0),a=e.grounded?1.6+i*.72:3.2;this.phase+=t*a,this.phase>z*64&&(this.phase-=z*64),this.blinkAt-=t,this.blinkAt<=0&&(this.blink=.16,this.blinkAt=1.8+Math.random()*3.4),this.blink>0&&(this.blink=Math.max(0,this.blink-t));let r=e.grounded?1:C(1+(e.vy||0)*.03,.86,1.16);this.squash=$(this.squash,r,1-Math.exp(-14*t)),this.tilt=$(this.tilt,C(i*.026,0,.2)+(e.stunned>0?.35:0),1-Math.exp(-10*t)),this.armSwing=$(this.armSwing,C(i*.13,.15,1),1-Math.exp(-9*t)),this.emoteT>0?this.emoteT=Math.max(0,this.emoteT-t):this.emote=""}playEmote(t,e){this.emote=t,this.emoteT=e||.9}draw(t,e,i,a,r,o=1){if(this.hidden)return;let n=o,h=this.phase,u=this.armSwing,c=this.squash,l=1/Math.sqrt(Math.max(.4,c)),d=(Math.sin(h*2)*.5+.5)*.055*u,f=i+(.52+d)*n*c,p=Math.sin(h)*.06*u;x.composeXYZ(R,e,f,a,this.tilt,r,p,.86*n*l,.94*n*c,.8*n*l),t.draw(k.body,R,this.color,0,.24,0,0,n);let m=f+.52*n*c,b=r+this.faceYaw;x.composeXYZ(R,e,m,a,this.tilt*.7,b,p*.6,.78*n*l,.74*n*c,.74*n*l),t.draw(k.head,R,this.color,0,.28,0,0,n);let _=Math.cos(b),g=Math.sin(b),v=.3*n,w=.155*n,A=m+.04*n,S=this.blink>0?.16:1;for(let E of[-1,1]){let P=e+g*v+_*w*E,I=a+_*v-g*w*E;x.compose(R,P,A,I,b,.185*n,.185*n*S,.13*n),t.draw(k.eye,R,se,.1,.05,0,0,n),x.compose(R,e+g*(v+.045*n)+_*w*E,A,a+_*(v+.045*n)-g*w*E,b,.095*n,.105*n*S,.07*n),t.draw(k.pupil,R,ie,0,0,0,0,n)}x.composeXYZ(R,e+g*.2*n,m+.21*n,a+_*.2*n,-.16,b,0,.66*n,.14*n,.6*n),t.draw(k.visor,R,this.dark,0,.34,0,0,n);let T=m+.36*n,N=Math.sin(h*1.3)*.1*(.4+u);x.composeXYZ(R,e,T+.09*n,a,N*.4,b,N,.05*n,.26*n,.05*n),t.draw(k.stem,R,re,0,.2,0,0,n);for(let E of[-1,1]){let P=e+_*.13*n*E+g*.02*n,I=a-g*.13*n*E+_*.02*n;x.composeXYZ(R,P,T+.2*n,I,.2,b,E*(.72+N),.24*n,.075*n,.15*n),t.draw(k.leaf,R,ae,0,.3,0,0,n)}for(let E of[-1,1]){let P=Math.sin(h+(E>0?0:Math.PI))*u*.85,I=this.emote==="hit"?1.1:0,L=e+_*.4*n*E+g*.02*n,B=a-g*.4*n*E+_*.02*n;x.composeXYZ(R,L,f+.14*n,B,P*.9,r,E*(.3+I)-P*.15,.2*n,.42*n,.2*n),t.draw(k.limb,R,this.dark,0,.22,0,0,n)}for(let E of[-1,1]){let P=Math.sin(h+(E>0?Math.PI:0))*u,I=.34*n,L=e+_*.18*n*E-g*P*.16*n,B=a-g*.18*n*E-_*P*.16*n,M=i+I*.5+Math.max(0,P)*.1*n;x.composeXYZ(R,L,M,B,-P*.55,r,0,.21*n,I,.21*n),t.draw(k.limb,R,this.dark,0,.2,0,0,n),x.composeXYZ(R,L-g*.08*n,i+.055*n+Math.max(0,P)*.1*n,B-_*.08*n,-P*.3,r,0,.27*n,.13*n,.36*n),t.draw(k.foot,R,this.color,0,.18,0,0,n)}}};var ht="VOCABUSURVIVE",_t=[[1,.839,.42],[1,.561,.694],[.561,.722,1],[.431,.941,.812]];function ne(s){let t=_t.length-1,e=Math.max(0,Math.min(1,s))*t,i=Math.min(t-1,Math.floor(e)),a=e-i,r=_t[i],o=_t[i+1],n=h=>Math.round((r[h]+(o[h]-r[h])*a)*255);return"rgb("+n(0)+","+n(1)+","+n(2)+")"}var ct=class{constructor(t){this.settings=t.settings,this.onStart=t.onStart||(()=>{}),this.title="VocabuSurvive \u8AAD\u307F\u8FBC\u307F\u753B\u9762",this.progress=0,this.ready=!1,this.started=!1,this._t=0,this._renderer=null,this._cam=null,this._beans=[],this._mat=x.create(),this._glFailed=!1,this.el=this._build()}_build(){let t=D("canvas",{class:"vs-canvas","aria-hidden":"true"});this.canvas=t;let e=D("h1",{class:"vs-load-title","aria-label":"VocabuSurvive"});for(let a=0;a<ht.length;a++){let r=ht.length>1?a/(ht.length-1):0,o=D("span",{class:"vs-load-ch","aria-hidden":"true",style:"animation-delay:"+a*42+"ms;color:"+ne(r)},ht[a]);e.appendChild(o)}this.barFill=D("i",{class:"vs-load-fill"}),this.pctEl=D("span",{class:"vs-load-pct vs-mono",text:"0%"}),this.stepEl=D("span",{class:"vs-load-step",text:"\u6E96\u5099\u3057\u3066\u3044\u307E\u3059"}),this.startBtn=D("button",{class:"vs-btn vs-load-start",type:"button",onclick:()=>this._start()},"START"),this.startBtn.disabled=!1,this.hintEl=D("p",{class:"vs-load-hint",text:"\u30AF\u30A4\u30BA\u3092\u89E3\u304D\u306A\u304C\u3089\u8D70\u308B\u30018\u4EBA\u307E\u3067\u306E\u30A2\u30B9\u30EC\u30C1\u30C3\u30AF\u3002"});let i=D("div",{class:"vs-load-bar",role:"progressbar","aria-valuemin":"0","aria-valuemax":"100","aria-valuenow":"0","aria-label":"\u8AAD\u307F\u8FBC\u307F"},this.barFill);return this.barEl=i,D("div",{class:"vs-load"},t,D("div",{class:"vs-load-vignette","aria-hidden":"true"}),D("div",{class:"vs-load-top"},D("div",{class:"vs-load-badge"},st("svg",{viewBox:"0 0 24 24",width:"18",height:"18","aria-hidden":"true"},st("path",{d:"M12 3c2.6 2.1 4 4.6 4 7.4A4 4 0 0 1 12 15a4 4 0 0 1-4-4.6C8 7.6 9.4 5.1 12 3Z",fill:y.mint}),st("path",{d:"M12 15v6",stroke:y.mint,"stroke-width":"2","stroke-linecap":"round",fill:"none"})),D("span",{text:"VocabuQuiz"})),e,this.hintEl),D("div",{class:"vs-load-bottom"},this.startBtn,D("div",{class:"vs-load-status"},i,D("div",{class:"vs-load-line"},this.stepEl,this.pctEl))),D("div",{class:"vs-load-ver vs-mono",text:"v"+V}))}_initGL(){if(!(this._renderer||this._glFailed))try{let t=Object.assign({},this.settings,{drawDistance:90,shadowSize:Math.min(1024,this.settings.shadowSize||1024),clouds:!1}),e=new rt(this.canvas,t);this._renderer=e,e.sky.top=[.1,.12,.3],e.sky.horizon=[.3,.2,.52],e.sky.ground=[.05,.06,.16],e.sky.sun=[1,.72,.45],e.ambTop=[.3,.28,.46],e.ambBottom=[.14,.12,.22],e.fog.color=[.16,.14,.32],e.fog.near=28,e.fog.far=86,e.light.dir.set([-.38,-.72,-.58]),e.shadowRadius=9,e.addMesh("vs_load_pad",[Q(30,3,3.2,.55,!0),Q(14,3,3.2,.55,!0)]),e.addMesh("vs_load_cube",[H(3,.16),H(1,.14)]),e.addMesh("vs_load_ring",[mt(26,10,.5,.09),mt(12,6,.5,.09)]),Dt(e),this._cam=new nt,this._cam.wantDistance=9.2,this._cam.wantPitch=.24,this._cam.height=.75,this._cam.snap([0,0,0],0);let i=Rt(20260828);this._beans=[];for(let a=0;a<4;a++){let r=W[(a*3+1)%W.length],o=new ot(r.rgb);o.phase=i()*z,this._beans.push({v:o,x:a===0?0:(i()-.5)*9,z:a===0?0:-3-i()*7,scale:a===0?1:.62+i()*.16,hop:i()*z,speed:1.6+i()*1.1,yawSpin:a===0?0:(i()-.5)*.6})}this._cubes=[];for(let a=0;a<26;a++)this._cubes.push({x:(i()-.5)*34,y:1+i()*9,z:-4-i()*26,s:.4+i()*1.1,r:i()*z,sp:(i()-.5)*.8,c:(()=>{let r=W[i()*W.length|0].rgb;return[r[0],r[1],r[2],1]})(),bob:i()*z})}catch(t){this._glFailed=!0;try{this.canvas.style.display="none"}catch{}console.warn("[VocabuSurvive] \u8AAD\u307F\u8FBC\u307F\u753B\u9762\u306E \u7ACB\u4F53\u3092 \u51FA\u305B\u307E\u305B\u3093:",t&&t.message)}}setProgress(t,e){this.progress=C(t,0,1);let i=Math.round(this.progress*100);this.barFill.style.width=i+"%",this.pctEl.textContent=i+"%",this.barEl.setAttribute("aria-valuenow",String(i)),e&&(this.stepEl.textContent=e),this.progress>=1&&(this.ready=!0,this.stepEl.textContent="\u6E96\u5099\u3067\u304D\u307E\u3057\u305F",this.el.setAttribute("data-ready","1"),this._pendingStart&&(this._pendingStart=!1,this._go()))}_start(){if(!this.started){if(this.startBtn.disabled=!0,!this.ready){this._pendingStart=!0,this.stepEl.textContent="\u3082\u3046\u5C11\u3057\u3067 \u59CB\u307E\u308A\u307E\u3059",this.el.setAttribute("data-waiting","1");return}this._go()}}_go(){this.started||(this.started=!0,this.el.setAttribute("data-go","1"),setTimeout(()=>{try{this.onStart()}catch(t){console.error(t)}},240))}async enter(){this.started=!1,this._pendingStart=!1,this.el.removeAttribute("data-go"),this.el.removeAttribute("data-waiting"),this.startBtn.disabled=!1,this._initGL()}exit(){}resize(){}tick(t){let e=this._renderer;if(!e||!e.gl)return;this._t+=t;let i=e.resize(),a=this._cam;a.wantYaw=Math.sin(this._t*.16)*.55,a.update(t,[0,.1,0],0,i.w/Math.max(1,i.h)),e.shadowCenter[0]=0,e.shadowCenter[1]=0,e.shadowCenter[2]=0,e.begin(a),x.compose(this._mat,0,-.14,0,this._t*.1,1.16,1.1,1.16),e.draw("vs_load_pad",this._mat,[.46,.5,.82,1],0,.34,0,0,3.8),x.compose(this._mat,0,-.1,0,-this._t*.35,8,2.4,8),e.draw("vs_load_ring",this._mat,[.36,.88,.72,1],.55,.4,0,0,4.1);for(let r of this._cubes){let o=r.y+Math.sin(this._t*.8+r.bob)*.35;x.compose(this._mat,r.x,o,r.z,r.r+this._t*r.sp,r.s,r.s,r.s),e.draw("vs_load_cube",this._mat,r.c,.06,.3,0,0,r.s)}for(let r=0;r<this._beans.length;r++){let o=this._beans[r];o.hop+=t*o.speed*2.4;let n=Math.abs(Math.sin(o.hop))*(r===0?.42:.3),h=Math.cos(o.hop)*6;o.v.update(t,{speed:r===0?2.2:3,grounded:n<.04,vy:h,yaw:0,stunned:0});let u=r===0?Math.sin(this._t*.5)*.45:this._t*o.yawSpin;o.v.faceYaw=r===0?Math.sin(this._t*.9)*.22:0,o.v.draw(e,o.x,n,o.z,u,o.scale)}e.end(t)}destroy(){if(this._renderer){try{this._renderer.destroy()}catch{}this._renderer=null}}},Ft=`
.vs-load{ position:absolute; inset:0; overflow:hidden; background:${y.bgDeep}; }
.vs-load-vignette{
  position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(120% 80% at 50% 8%, transparent 40%, rgba(4,5,16,.55) 100%),
    linear-gradient(180deg, rgba(4,5,16,.42) 0%, transparent 26%, transparent 62%, rgba(4,5,16,.72) 100%);
}
.vs-load-top{
  position:absolute; left:50%; top:calc(4.5vh + var(--vs-safe-t)); transform:translateX(-50%);
  width:min(720px, calc(100% - 40px));
  display:flex; flex-direction:column; align-items:center; gap:12px;
  text-align:center; pointer-events:none;
}
.vs-load-bottom{
  position:absolute; left:50%; bottom:calc(5vh + var(--vs-safe-b)); transform:translateX(-50%);
  width:min(420px, calc(100% - 40px));
  display:flex; flex-direction:column; align-items:center; gap:14px;
  text-align:center;
}
.vs-load-badge{
  display:inline-flex; align-items:center; gap:7px;
  height:30px; padding:0 14px; border-radius:999px;
  background:rgba(255,255,255,.09); border:1px solid rgba(255,255,255,.16);
  font-size:12px; font-weight:800; letter-spacing:.10em; color:rgba(243,245,255,.86);
}
/* \u2605 \u8272\u306F JS \u304C 1 \u6587\u5B57\u305A\u3064 \u5165\u308C\u308B\uFF08\u4E0A\u306E gradientAt\uFF09\u3002
     \u3053\u3053\u3067\u306F \u5F62\u3068 \u5F71\u3060\u3051\u3002\u5207\u308A\u629C\u304D\u306B\u306F \u983C\u3089\u306A\u3044\u3002 */
.vs-load-title{
  font-size:clamp(30px, 8.2vw, 76px); font-weight:900; letter-spacing:-.028em;
  line-height:1; margin:2px 0 0;
  display:flex; flex-wrap:wrap; justify-content:center;
  filter: drop-shadow(0 3px 0 rgba(10,6,30,.55)) drop-shadow(0 12px 30px rgba(120,140,255,.34));
}
.vs-load-ch{
  display:inline-block;
  animation: vsDrop .62s cubic-bezier(.18,1.2,.34,1) both;
}
@keyframes vsDrop{
  from{ transform:translateY(-26px) scale(.86); opacity:0; }
  to{ transform:none; opacity:1; }
}
.vs-load-hint{
  color:rgba(243,245,255,.78); font-size:clamp(12px,2.4vw,15px); max-width:34em;
  text-shadow:0 2px 10px rgba(6,8,24,.9), 0 0 22px rgba(6,8,24,.7);
}
.vs-load-start{
  min-width:212px; height:58px; font-size:19px; letter-spacing:.10em;
  animation: vsPulse 2.6s ease-in-out infinite;
}
.vs-load[data-ready="1"] .vs-load-start{ animation: vsPulse 1.6s ease-in-out infinite; }
@keyframes vsPulse{
  0%,100%{ box-shadow:0 6px 0 #b97400, 0 12px 26px rgba(255,176,32,.28); }
  50%{ box-shadow:0 6px 0 #b97400, 0 16px 42px rgba(255,176,32,.52); }
}
.vs-load[data-go="1"]{ animation: vsGo .34s ease forwards; }
@keyframes vsGo{ to{ opacity:0; transform:scale(1.04); } }
.vs-load-status{ width:min(360px,80%); display:flex; flex-direction:column; gap:7px; margin-top:6px; }
.vs-load-bar{ height:6px; border-radius:999px; background:rgba(255,255,255,.13); overflow:hidden; }
.vs-load-fill{
  display:block; height:100%; width:0%; border-radius:999px;
  background:linear-gradient(90deg, ${y.mint}, ${y.blue});
  transition: width .28s cubic-bezier(.3,.8,.3,1);
}
.vs-load-line{ display:flex; justify-content:space-between; font-size:11.5px; color:rgba(243,245,255,.52); }
.vs-load-ver{
  position:absolute; right:calc(14px + var(--vs-safe-r)); bottom:calc(12px + var(--vs-safe-b));
  font-size:11px; color:rgba(243,245,255,.34); letter-spacing:.06em;
}
@media (max-height: 560px){
  .vs-load-hint{ display:none; }
  .vs-load-top{ top:calc(2vh + var(--vs-safe-t)); gap:6px; }
  .vs-load-bottom{ bottom:calc(2.5vh + var(--vs-safe-b)); gap:8px; }
  .vs-load-start{ height:46px; min-width:180px; font-size:17px; }
}
@media (prefers-reduced-motion: reduce){
  .vs-load-ch, .vs-load-start, .vs-load[data-go="1"]{ animation:none !important; }
}
`;var lt=null;function oe(){let s={webgl2:!1,webgl1:!1,maxTexture:0,instancedExt:!1,renderer:""},t=null;try{t=document.createElement("canvas"),t.width=t.height=1;let e=null;try{e=t.getContext("webgl2",{failIfMajorPerformanceCaveat:!1})}catch{}if(e)s.webgl2=!0,s.maxTexture=e.getParameter(e.MAX_TEXTURE_SIZE)||0;else{try{e=t.getContext("webgl")||t.getContext("experimental-webgl")}catch{}e&&(s.webgl1=!0,s.maxTexture=e.getParameter(e.MAX_TEXTURE_SIZE)||0,s.instancedExt=!!e.getExtension("ANGLE_instanced_arrays"))}if(e){try{let i=e.getExtension("WEBGL_debug_renderer_info");i&&(s.renderer=String(e.getParameter(i.UNMASKED_RENDERER_WEBGL)||""))}catch{}try{let i=e.getExtension("WEBGL_lose_context");i&&i.loseContext()}catch{}}}catch{}return t=null,s}function he(){try{if(navigator.userAgentData&&typeof navigator.userAgentData.mobile=="boolean")return navigator.userAgentData.mobile}catch{}return/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(String(navigator.userAgent||""))}function ce(){let s=String(navigator.userAgent||"");return/iPhone|iPad|iPod/i.test(s)?!0:/Macintosh/.test(s)&&(navigator.maxTouchPoints||0)>1}function bt(){if(lt)return lt;let s=oe(),t=Math.max(1,Number(navigator.hardwareConcurrency||0)||4),e=Number(navigator.deviceMemory||0)||0,i=he(),a=ce(),r=(navigator.maxTouchPoints||0)>0||"ontouchstart"in window,o=!1;try{o=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}catch{}let n=Math.min(3,Math.max(1,Number(window.devicePixelRatio||1))),h="medium",u=e>0&&e<8||t<=4;return!s.webgl2&&!s.webgl1?h="low":s.webgl2?u?h=i?"low":"medium":i?h=t>=8?"high":"medium":h=t>=12&&(e===0||e>=16)?"ultra":"high":h="low",o&&h==="ultra"&&(h="high"),lt={tier:h,webgl2:s.webgl2,webgl1:s.webgl1,mobile:i,ios:a,cores:t,memory:e,dpr:n,renderer:s.renderer,touch:r,reduceMotion:o,maxTexture:s.maxTexture},lt}var It={low:{shadow:!1,shadowSize:0,pixelRatio:.75,fog:!0,clouds:!1,water:!1,particles:.25,drawDistance:90,msaa:0,targetFps:30,obstacleDetail:0},medium:{shadow:!0,shadowSize:1024,pixelRatio:1,fog:!0,clouds:!1,water:!0,particles:.6,drawDistance:140,msaa:0,targetFps:60,obstacleDetail:1},high:{shadow:!0,shadowSize:2048,pixelRatio:1,fog:!0,clouds:!0,water:!0,particles:1,drawDistance:200,msaa:4,targetFps:60,obstacleDetail:2},ultra:{shadow:!0,shadowSize:2048,pixelRatio:1.25,fog:!0,clouds:!0,water:!0,particles:1.4,drawDistance:260,msaa:4,targetFps:60,obstacleDetail:2}};function zt(s){let t=bt(),e=s&&s!=="auto"?s:t.tier,i=It[e]||It.medium,a=e==="low"?9e5:e==="medium"?16e5:26e5;return Object.assign({},i,{tier:e,autoTier:t.tier,maxPixels:a,dpr:t.dpr})}var Gt="[VocabuSurvive]",dt=class{constructor(){this.shell=null,this.container=null,this.settings=null,this.caps=null,this.opened=!1,this.screenName="",this._loadPromise=null,this._modules=null,this._err=""}async open(t,e){if(this.opened&&this.container===t)return this;this.opened&&this.close(),this.container=t,this.opened=!0,this._err="",this.caps=bt();let i=e&&e.tier||_e();this.settings=zt(i),this.shell=new et(t),vt(this.shell.root,Ft);let a=new ct({settings:this.settings,onStart:()=>this._startFromLoading()});return this.shell.register("loading",a),await this.shell.show("loading"),this.screenName="loading",this._loadPromise=this._loadRest(a),this}async _loadRest(t){let e=[["\u97F3\u3092 \u7528\u610F\u3057\u3066\u3044\u307E\u3059",()=>Promise.resolve().then(()=>(Bt(),Nt))],["\u30B3\u30FC\u30B9\u3092 \u8AAD\u307F\u8FBC\u3093\u3067\u3044\u307E\u3059",()=>Promise.resolve().then(()=>(Ct(),Lt))],["\u30ED\u30D3\u30FC\u3092 \u7528\u610F\u3057\u3066\u3044\u307E\u3059",()=>Promise.resolve().then(()=>(Ht(),Ut))],["\u901A\u4FE1\u306E \u6E96\u5099\u3092\u3057\u3066\u3044\u307E\u3059",()=>Promise.resolve().then(()=>(Vt(),Ot))],["\u8A66\u5408\u306E \u4ED5\u7D44\u307F\u3092 \u8AAD\u307F\u8FBC\u3093\u3067\u3044\u307E\u3059",()=>Promise.resolve().then(()=>(Yt(),jt))]],i={},a=["audio","courses","lobby","net","match"];for(let r=0;r<e.length;r++){let[o,n]=e[r];t.setProgress(r/e.length,o);try{i[a[r]]=await n()}catch(h){console.error(Gt,"\u8AAD\u307F\u8FBC\u307F\u5931\u6557:",o,h),this._err=String(h&&h.message||h),i[a[r]]=null}await me()}this._modules=i;try{await this._registerScreens(i)}catch(r){console.error(Gt,r),this._err=String(r&&r.message||r)}return t.setProgress(1,"\u6E96\u5099\u3067\u304D\u307E\u3057\u305F"),i}async _registerScreens(t){if(t.lobby&&t.lobby.LobbyScreen){vt(this.shell.root,t.lobby.LOBBY_CSS||"");let e=new t.lobby.LobbyScreen({settings:this.settings,app:this,onPlay:i=>this.startMatch(i),onExit:()=>this.backToQuiz()});this.shell.register("lobby",e)}if(t.match&&t.match.MatchScreen){vt(this.shell.root,t.match.MATCH_CSS||"");let e=new t.match.MatchScreen({settings:this.settings,app:this,onQuit:()=>this.goLobby(),onAgain:i=>this.startMatch(i)});this.shell.register("match",e)}}async _startFromLoading(){if(this._loadPromise)try{await this._loadPromise}catch{}await this.goLobby()}async goLobby(){this.shell&&(this.shell.get("lobby")?(this.screenName="lobby",await this.shell.show("lobby")):(this.screenName="loading",await this.shell.show("loading")))}async startMatch(t){if(!this.shell||!this.shell.get("match")){await this.goLobby();return}this.screenName="match",await this.shell.show("match",t)}backToQuiz(){try{if(typeof window.__vqSurviveExit=="function"){window.__vqSurviveExit();return}let t=document.querySelector('#appTabBar [data-app-tab="home"]');t&&t.click()}catch{}}close(){if(this.opened){if(this.opened=!1,this.screenName="",this.shell){try{this.shell.destroy()}catch{}this.shell=null}this.container=null,this._loadPromise=null}}state(){return{version:V,build:pt,opened:this.opened,screen:this.screenName,tier:this.settings?this.settings.tier:"",autoTier:this.caps?this.caps.tier:"",webgl2:this.caps?this.caps.webgl2:!1,mobile:this.caps?this.caps.mobile:!1,loaded:this._modules?Object.keys(this._modules).filter(t=>!!this._modules[t]):[],error:this._err}}};function vt(s,t){if(!t)return;let e=document.createElement("style");e.textContent=t,s.appendChild(e)}function me(){return new Promise(s=>{typeof requestAnimationFrame=="function"?requestAnimationFrame(()=>s()):setTimeout(s,16)})}var qt="vq.survive.tier.v1";function _e(){try{return localStorage.getItem(qt)||"auto"}catch{return"auto"}}function Xt(s){try{localStorage.setItem(qt,String(s||"auto"))}catch{}}var ut=new dt,Wt={version:V,build:pt,open:(s,t)=>ut.open(s,t),close:()=>ut.close(),state:()=>ut.state(),setTier:s=>(Xt(s),s),__app:ut};try{typeof window<"u"&&(window.VocabuSurvive=Wt,window.dispatchEvent(new CustomEvent("vq-survive-ready",{detail:{version:V}})))}catch{}var be=Wt;return Jt(ve);})();
