import{c as o,C as p,j as n}from"./index-ZIRcj8HQ.js";import{c as u}from"./utils-BQHNewu7.js";/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",key:"1u773s"}],["path",{d:"M12 17h.01",key:"p32p05"}]],y=o("circle-question-mark",m);/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]],h=o("circle-x",N);/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["path",{d:"M7 18v-6a5 5 0 1 1 10 0v6",key:"pcx96s"}],["path",{d:"M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z",key:"1b4s83"}],["path",{d:"M21 12h1",key:"jtio3y"}],["path",{d:"M18.5 4.5 18 5",key:"g5sp9y"}],["path",{d:"M2 12h1",key:"1uaihz"}],["path",{d:"M12 2v1",key:"11qlp1"}],["path",{d:"m4.929 4.929.707.707",key:"1i51kw"}],["path",{d:"M12 12v6",key:"3ahymv"}]],S=o("siren",f);/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=[["path",{d:"M21 4v16",key:"7j8fe9"}],["path",{d:"M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z",key:"zs4d6"}]],x=o("skip-forward",k);function b(e){return Array.isArray(e)?e.map(t=>{if(typeof t=="string")return{type:t.toUpperCase(),status:"UNKNOWN",details:"The action outcome was not recorded."};const r=t&&typeof t=="object"&&!Array.isArray(t)?t:{},a=String(r.status??r.state??"").trim().toUpperCase(),s=r.details??r.detail,i=a==="SUCCESS"||a==="SKIPPED"?a:a==="FAILED"||a==="ERROR"?"FAILED":"UNKNOWN";return{type:String(r.type??r.action_type??r.name??"ACTION_RECORDED").toUpperCase(),status:i,details:typeof s=="string"&&s.trim()?s:i==="UNKNOWN"?"The action outcome could not be verified.":void 0,reason:typeof r.reason=="string"?r.reason:void 0}}):[]}function c(e){return e==="QUARANTINE_REQUEST"?"Quarantine request":e==="ALERT_EMAIL"?"Email alert":e==="ALERT_WEBHOOK"?"Webhook alert":e==="FORCE_2FA_VERIFICATION"?"2FA verification":e.replace(/_/g," ").toLowerCase().replace(/\b\w/g,t=>t.toUpperCase())}function d(e){return e==="UNKNOWN"?"Unverified":e.charAt(0)+e.slice(1).toLowerCase()}function l(e){var t;return e.details||((t=e.reason)==null?void 0:t.replace(/_/g," ").toLowerCase())||""}function g(e){const t=l(e);return{level:e.status==="SUCCESS"?"ok":e.status==="FAILED"?"error":e.status==="SKIPPED"?"info":"warn",message:`${c(e.type)}: ${d(e.status)}${t?` — ${t}`:""}`}}const A={SUCCESS:{icon:p,className:"border-emerald-400/30 bg-emerald-500/10 text-emerald-200"},FAILED:{icon:h,className:"border-red-400/30 bg-red-500/10 text-red-200"},SKIPPED:{icon:x,className:"border-amber-400/30 bg-amber-500/10 text-amber-200"},UNKNOWN:{icon:y,className:"border-slate-400/30 bg-slate-500/10 text-slate-300"}};function _({action:e,showDetails:t=!1}){const{icon:r,className:a}=A[e.status],s=l(e);return n.jsxs("span",{className:"inline-flex max-w-full flex-col items-start gap-1",children:[n.jsxs("span",{className:u("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",a),title:s||void 0,children:[n.jsx(r,{className:"h-3.5 w-3.5 shrink-0","aria-hidden":"true"}),n.jsxs("span",{children:[c(e.type),": ",d(e.status)]})]}),t&&s?n.jsx("span",{className:"break-words text-xs text-slate-400",children:s}):null]})}export{h as C,_ as R,S,b as n,g as r};
