import{c as o,j as e}from"./index-ZIRcj8HQ.js";import{C as s,a as t,b as a,d as r,c as i}from"./Card-DB9u6ADD.js";import{D as l}from"./database-BUhhkfTy.js";import{S as n}from"./shield-CcrXTDva.js";import{Z as d}from"./zap-bz9F-7If.js";import{m as c}from"./proxy-D8j9pjOU.js";import"./utils-BQHNewu7.js";/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=[["path",{d:"m16 18 6-6-6-6",key:"eg8j8"}],["path",{d:"m8 6-6 6 6 6",key:"ppft3o"}]],m=o("code",x);/**
 * @license lucide-react v0.546.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=[["rect",{width:"20",height:"8",x:"2",y:"2",rx:"2",ry:"2",key:"ngkwjq"}],["rect",{width:"20",height:"8",x:"2",y:"14",rx:"2",ry:"2",key:"iecqi9"}],["line",{x1:"6",x2:"6.01",y1:"6",y2:"6",key:"16zg32"}],["line",{x1:"6",x2:"6.01",y1:"18",y2:"18",key:"nzw8ys"}]],h=o("server",p);function v(){return e.jsxs(c.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},className:"space-y-8 max-w-5xl mx-auto pb-12",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-3xl font-bold tracking-tight",children:"Mefyx AI Platform Architecture"}),e.jsx("p",{className:"text-slate-400 mt-2 text-lg",children:'The "Cloudflare for AI" — A comprehensive security gateway protecting LLM applications from prompt injections, data exfiltration, and malicious automation.'})]}),e.jsxs(s,{className:"bg-slate-900/40 border-white/5",children:[e.jsxs(t,{children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(h,{className:"w-5 h-5 text-indigo-400"}),e.jsx(a,{children:"Current Architecture"})]}),e.jsx(r,{children:"The gateway checks requests, then forwards permitted messages to the provider and model selected by the caller."})]}),e.jsx(i,{children:e.jsx("div",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-6 font-mono text-sm text-slate-300 overflow-x-auto whitespace-pre",children:`[ User Application ]
       │
       ▼  POST /api/v1/gateway/chat (HTTP or SDK)
┌─────────────────────────────────────────────────────────┐
│                     MEFYX GATEWAY                       │
│                                                         │
│  Authentication, tier, quota and rate-limit checks       │
│                         │                               │
│                         ▼                               │
│  Security scan and policy decision                      │
│  Blocked or redacted requests return HTTP 403.           │
│                         │                               │
│                         ▼                               │
│  Forward permitted messages to the caller's             │
│  selected provider and model.                           │
└─────────────────────────────────────────────────────────┘
       │
       ▼  One requested provider (subject to availability)
[ Gemini API ]  [ OpenAI API ]  [ Anthropic API ]  [ xAI API ]

[ Gateway request records ]
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                   WORKSPACE DASHBOARD                   │
│                                                         │
│  • Workspace audit logs and usage records               │
│  • Analytics and billing                                │
└─────────────────────────────────────────────────────────┘`})})]}),e.jsxs(s,{className:"bg-slate-900/40 border-white/5",children:[e.jsxs(t,{children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(d,{className:"w-5 h-5 text-yellow-400"}),e.jsx(a,{children:"API Endpoints"})]}),e.jsx(r,{children:"Core REST endpoints for the Gateway and Dashboard."})]}),e.jsx(i,{children:e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"border border-white/10 rounded-lg overflow-hidden",children:[e.jsxs("div",{className:"bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3",children:[e.jsx("span",{className:"bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs font-bold",children:"POST"}),e.jsx("span",{className:"font-mono text-sm text-slate-200",children:"/api/v1/gateway/chat"})]}),e.jsx("div",{className:"p-4 bg-slate-900/30 text-sm text-slate-400",children:"Mefyx gateway endpoint. Accepts a provider, model, and prompt or messages. It scans the request, rejects BLOCKED or REDACTED results with HTTP 403, and forwards permitted messages to the selected provider. Returns content, usage, security, and request_id in the data envelope."})]}),e.jsxs("div",{className:"border border-white/10 rounded-lg overflow-hidden",children:[e.jsxs("div",{className:"bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3",children:[e.jsx("span",{className:"bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs font-bold",children:"POST"}),e.jsx("span",{className:"font-mono text-sm text-slate-200",children:"/api/v1/scan"})]}),e.jsx("div",{className:"p-4 bg-slate-900/30 text-sm text-slate-400",children:"Standalone security assessment. Accepts prompt (or text), provider, and model, with optional scan context. Returns status, decision, risk_score, sanitized_content, and other analysis fields in the data envelope. Inspect the decision even when HTTP succeeds; this endpoint does not generate a chat completion."})]}),e.jsxs("div",{className:"border border-white/10 rounded-lg overflow-hidden",children:[e.jsxs("div",{className:"bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3",children:[e.jsx("span",{className:"bg-clean/20 text-clean px-2 py-0.5 rounded text-xs font-bold",children:"GET"}),e.jsx("span",{className:"font-mono text-sm text-slate-200",children:"/api/v1/analytics"})]}),e.jsx("div",{className:"p-4 bg-slate-900/30 text-sm text-slate-400",children:"Retrieves aggregated threat intelligence and usage metrics for the dashboard."})]}),e.jsxs("div",{className:"border border-white/10 rounded-lg overflow-hidden",children:[e.jsxs("div",{className:"bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3",children:[e.jsx("span",{className:"bg-clean/20 text-clean px-2 py-0.5 rounded text-xs font-bold",children:"GET"}),e.jsx("span",{className:"font-mono text-sm text-slate-200",children:"/api/v1/reports/threat-counts"})]}),e.jsxs("div",{className:"p-4 bg-slate-900/30 text-sm text-slate-400",children:["Compliance reporting: daily/weekly threat counts with time filters (supports CSV/JSON export via ",e.jsx("span",{className:"font-mono",children:"/api/v1/reports/threat-counts/export"}),")."]})]}),e.jsxs("div",{className:"border border-white/10 rounded-lg overflow-hidden",children:[e.jsxs("div",{className:"bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3",children:[e.jsx("span",{className:"bg-clean/20 text-clean px-2 py-0.5 rounded text-xs font-bold",children:"GET"}),e.jsx("span",{className:"font-mono text-sm text-slate-200",children:"/api/v1/reports/remediations"})]}),e.jsxs("div",{className:"p-4 bg-slate-900/30 text-sm text-slate-400",children:["Lists automated remediation actions for audit trails (supports CSV/JSON export via ",e.jsx("span",{className:"font-mono",children:"/api/v1/reports/remediations/export"}),")."]})]})]})})]}),e.jsxs(s,{className:"bg-slate-900/40 border-white/5",children:[e.jsxs(t,{children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(l,{className:"w-5 h-5 text-blue-400"}),e.jsx(a,{children:"Proposed Data Schema (Not yet implemented)"})]}),e.jsx(r,{children:"Illustrative PostgreSQL / ClickHouse design for exploration. These proposed tables are not the current storage schema; ClickHouse ingestion is not implemented."})]}),e.jsx(i,{children:e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-6",children:[e.jsxs("div",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300",children:[e.jsx("div",{className:"text-indigo-400 font-bold mb-2",children:"Proposed table: Users"}),"id: UUID PRIMARY KEY",e.jsx("br",{}),"email: VARCHAR UNIQUE",e.jsx("br",{}),"tier: ENUM('FREE', 'PRO', 'BUSINESS')",e.jsx("br",{}),"monthly_limit: INT",e.jsx("br",{}),"created_at: TIMESTAMP"]}),e.jsxs("div",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300",children:[e.jsx("div",{className:"text-indigo-400 font-bold mb-2",children:"Proposed table: API_Keys"}),"id: UUID PRIMARY KEY",e.jsx("br",{}),"user_id: UUID FOREIGN KEY",e.jsx("br",{}),"key_hash: VARCHAR",e.jsx("br",{}),"usage_count: INT",e.jsx("br",{}),"status: ENUM('ACTIVE', 'REVOKED', 'QUARANTINED')"]}),e.jsxs("div",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300 md:col-span-2",children:[e.jsx("div",{className:"text-indigo-400 font-bold mb-2",children:"Proposed table: Security_Logs (ClickHouse, not yet implemented)"}),"id: UUID PRIMARY KEY",e.jsx("br",{}),"api_key_id: UUID",e.jsx("br",{}),"timestamp: TIMESTAMP",e.jsx("br",{}),"status: ENUM('CLEAN', 'BLOCKED', 'REDACTED')",e.jsx("br",{}),"threat_type: VARCHAR",e.jsx("br",{}),"threat_score: FLOAT",e.jsx("br",{}),"is_quarantined: BOOLEAN",e.jsx("br",{}),"tokens_used: INT",e.jsx("br",{}),"latency_ms: INT",e.jsx("br",{}),"raw_payload: JSONB"]}),e.jsxs("div",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300 md:col-span-2",children:[e.jsx("div",{className:"text-indigo-400 font-bold mb-2",children:"Proposed table: Remediation_Logs"}),"id: UUID PRIMARY KEY",e.jsx("br",{}),"created_at: TIMESTAMP",e.jsx("br",{}),"user_id: UUID",e.jsx("br",{}),"api_key_id: UUID",e.jsx("br",{}),"security_log_id: UUID",e.jsx("br",{}),"request_id: VARCHAR",e.jsx("br",{}),"threat_type: VARCHAR",e.jsx("br",{}),"threat_score: FLOAT",e.jsx("br",{}),"actions: JSONB",e.jsx("br",{}),"email_to: VARCHAR",e.jsx("br",{}),"webhook_urls: JSONB",e.jsx("br",{}),"error: VARCHAR"]})]})})]}),e.jsxs(s,{className:"bg-slate-900/40 border-white/5",children:[e.jsxs(t,{children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(m,{className:"w-5 h-5 text-clean"}),e.jsx(a,{children:"SDK Integration & Examples"})]}),e.jsx(r,{children:"A local JavaScript package for the Mefyx scan and gateway APIs, with TypeScript declarations."})]}),e.jsxs(i,{className:"space-y-6",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"text-sm font-semibold text-slate-200 mb-2",children:"1. Install and configure the local SDK"}),e.jsx("p",{className:"text-sm text-slate-400 mb-3",children:"Requires Node.js 18 or later. The package in packages/mefyx-sdk is not published to npm yet. Install it into your server application using the path to your repository checkout:"}),e.jsx("pre",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto",children:e.jsx("code",{children:"npm install /path/to/sentinel-dashboard/packages/mefyx-sdk"})}),e.jsx("p",{className:"text-sm text-slate-400 my-3",children:"Set MEFYX_BASE_URL to your API origin (for example http://localhost:8000, without /api) and MEFYX_API_KEY to your account API key. Keep credentials on your server. Save the following as gateway.mjs and run node gateway.mjs. Gateway calls require a provider key configured on the API server and a model allowed by your plan; inspect GET /api/v1/gateway/capabilities for availability. The model below is an example supported by the repository's Free tier."}),e.jsx("pre",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto",children:e.jsx("code",{children:`import { Mefyx, MefyxApiError } from '@mefyx/sdk';

const mefyx = new Mefyx({
  baseUrl: process.env.MEFYX_BASE_URL,
  apiKey: process.env.MEFYX_API_KEY,
});

try {
  const result = await mefyx.chat({
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    messages: [{ role: 'user', content: 'Explain prompt injection briefly.' }],
    max_tokens: 256,
    project: 'support-app',
  });
  // The SDK returns the data field from the HTTP response.
  console.log(result.content, result.security, result.usage);
} catch (error) {
  if (error instanceof MefyxApiError) {
    console.error(error.status, error.code, error.details);
  } else {
    throw error;
  }
}`})}),e.jsx("p",{className:"text-sm text-slate-400 mt-3",children:"Use mefyx.scan({ prompt: 'Summarize our public guide.', provider: 'local', model: 'local' }) for a standalone assessment. A successful scan can report BLOCKED or REDACTED; inspect status, decision, review_required, and requires_2fa before acting. The local label does not forward to a local LLM. Both methods use backend policies and account entitlements; there is no named policy selector."})]}),e.jsxs("div",{children:[e.jsx("h3",{className:"text-sm font-semibold text-slate-200 mb-2",children:"2. Gateway HTTP request"}),e.jsx("p",{className:"text-sm text-slate-400 mb-3",children:"POST /api/v1/gateway/chat with Content-Type: application/json and x-api-key: your API key. Alternatively, use Authorization: Bearer with a session token. The SDK sends this JSON body unchanged:"}),e.jsx("pre",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto",children:e.jsx("code",{children:`{
  "provider": "gemini",
  "model": "gemini-2.5-flash-lite",
  "messages": [
    { "role": "user", "content": "Explain prompt injection briefly." }
  ],
  "max_tokens": 256,
  "project": "support-app"
}`})}),e.jsx("p",{className:"text-sm text-slate-400 mt-3",children:"You can supply prompt instead of messages. Message roles are system, user, or assistant. Optional fields include temperature (0–2), max_tokens (1–8192), metadata, project, and app_name. Project is a free-text metadata label. The gateway forwards the original messages for permitted requests; it rejects redacted scan results and redacts sensitive patterns from returned provider content."})]}),e.jsxs("div",{children:[e.jsx("h3",{className:"text-sm font-semibold text-slate-200 mb-2",children:"3. Gateway success response (HTTP 200, illustrative values)"}),e.jsx("pre",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto",children:e.jsx("code",{children:`{
  "success": true,
  "data": {
    "provider": "gemini",
    "model": "gemini-2.5-flash-lite",
    "content": "Prompt injection attempts to redirect an AI application's instructions.",
    "usage": {
      "input_tokens": 12,
      "output_tokens": 16,
      "total_tokens": 28,
      "estimated_cost": 0.0,
      "estimated": true
    },
    "security": {
      "decision": "allow",
      "risk_score": 0,
      "threat_type": "NONE",
      "matched_policies": [],
      "status": "CLEAN",
      "requires_2fa": false,
      "review_required": false
    },
    "request_id": "example-request-id"
  },
  "error": null
}`})}),e.jsx("p",{className:"text-sm text-slate-400 mt-3",children:"The SDK returns data directly. Token counts and security values vary by request; estimated_cost is an estimate field, not an invoice."})]}),e.jsxs("div",{children:[e.jsx("h3",{className:"text-sm font-semibold text-slate-200 mb-2",children:"4. Gateway policy failure (HTTP 403, illustrative values)"}),e.jsx("pre",{className:"bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto",children:e.jsx("code",{children:`{
  "success": false,
  "data": null,
  "error": {
    "code": "policy_blocked",
    "message": "Request blocked by Mefyx policy.",
    "details": {
      "request_id": "example-request-id",
      "security": {
        "decision": "block",
        "risk_score": 95,
        "threat_type": "PROMPT_INJECTION",
        "matched_policies": [],
        "status": "BLOCKED",
        "requires_2fa": false,
        "review_required": false
      }
    },
    "request_id": "example-request-id"
  }
}`})}),e.jsx("p",{className:"text-sm text-slate-400 mt-3",children:"The SDK throws MefyxApiError for this response. Other failures include authentication or validation errors, model_denied (403), quota_exceeded (429), provider_not_configured (503), and provider failures (502)."})]})]})]}),e.jsxs(s,{className:"bg-slate-900/40 border-white/5",children:[e.jsxs(t,{children:[e.jsxs("div",{className:"flex items-center space-x-2",children:[e.jsx(n,{className:"w-5 h-5 text-red-400"}),e.jsx(a,{children:"Implementation Proposals (Not yet implemented)"})]}),e.jsx(r,{children:"Ideas for future evaluation. The proposed additions below are not shipped capabilities or performance commitments."})]}),e.jsx(i,{children:e.jsxs("ul",{className:"space-y-4",children:[e.jsxs("li",{className:"flex items-start space-x-3",children:[e.jsx("div",{className:"w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"}),e.jsxs("div",{children:[e.jsx("strong",{className:"text-slate-200 block",children:"Proposed: Edge deployment (Not yet implemented)"}),e.jsx("span",{className:"text-sm text-slate-400",children:"Explore Cloudflare Workers or Fastly for gateway checks and rule scanning. Evaluate runtime compatibility and measure end-to-end latency before choosing an edge deployment."})]})]}),e.jsxs("li",{className:"flex items-start space-x-3",children:[e.jsx("div",{className:"w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"}),e.jsxs("div",{children:[e.jsx("strong",{className:"text-slate-200 block",children:"Proposed: Redis and ClickHouse scaling (Not yet implemented)"}),e.jsx("span",{className:"text-sm text-slate-400",children:"Explore Redis for distributed rate limiting and ClickHouse for log analytics. A possible target of millions of logs per second would require implementation and representative benchmarks; no such throughput is established."})]})]}),e.jsxs("li",{className:"flex items-start space-x-3",children:[e.jsx("div",{className:"w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"}),e.jsxs("div",{children:[e.jsx("strong",{className:"text-slate-200 block",children:"Proposed: YARA and fine-tuned classifiers (Not yet implemented)"}),e.jsx("span",{className:"text-sm text-slate-400",children:"Explore YARA scanning and classifiers fine-tuned on prompt-injection datasets; evaluate detection quality and latency before adoption. Current scanning uses regex rules, structural checks on paid tiers, and optional Gemini classification on Business."})]})]}),e.jsxs("li",{className:"flex items-start space-x-3",children:[e.jsx("div",{className:"w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0"}),e.jsxs("div",{children:[e.jsx("strong",{className:"text-slate-200 block",children:"Proposed: Global pattern database (Not yet implemented)"}),e.jsx("span",{className:"text-sm text-slate-400",children:"Explore opt-in, anonymized signature sharing across customers and reviewed rule distribution. Any protection benefit or propagation time would need validation; this proposal does not provide instant protection across customers today."})]})]})]})})]})]})}export{v as default};
