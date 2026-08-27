import{c as s,j as i}from"./index-DukSF-13.js";/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=s("GraduationCap",[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z",key:"j76jl0"}],["path",{d:"M22 10v6",key:"1lu8f3"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5",key:"1r8lef"}]]);/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=s("Lock",[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]]);/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=s("Mail",[["rect",{width:"20",height:"16",x:"2",y:"4",rx:"2",key:"18n3k1"}],["path",{d:"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",key:"1ocrg3"}]]);function u({items:e,value:n,onChange:d,ariaLabel:r}){return i.jsx("div",{className:"vq-tabs",role:"tablist","aria-label":r,children:e.map(a=>i.jsxs("button",{role:"tab","aria-selected":n===a.id,disabled:a.disabled,className:"vq-tab",onClick:()=>d(a.id),onKeyDown:t=>{const l=e.findIndex(c=>c.id===n);t.key==="ArrowRight"&&d(e[(l+1)%e.length].id),t.key==="ArrowLeft"&&d(e[(l-1+e.length)%e.length].id)},children:[a.label,typeof a.count=="number"&&i.jsx("span",{className:"vq-tab__count vq-num",children:a.count}),n===a.id&&i.jsx("span",{className:"vq-tab__ink","aria-hidden":!0})]},a.id))})}function k({items:e,value:n,onChange:d,ariaLabel:r}){return i.jsx("div",{className:"vq-seg",role:"group","aria-label":r,children:e.map(a=>i.jsxs("button",{type:"button",className:"vq-seg__btn","aria-pressed":n===a.id,onClick:()=>d(a.id),children:[a.icon,a.label]},a.id))})}export{h as G,b as L,p as M,k as S,u as T};
