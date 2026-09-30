import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { motion } from 'framer-motion';
import { Code, Database, Server, Shield, Zap } from 'lucide-react';

export default function Documentation() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-5xl mx-auto pb-12"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mefyx AI Platform Architecture</h1>
        <p className="text-slate-400 mt-2 text-lg">
          The "Cloudflare for AI" — A comprehensive security gateway protecting LLM applications from prompt injections, data exfiltration, and malicious automation.
        </p>
      </div>

      {/* Architecture Diagram */}
      <Card className="bg-slate-900/40 border-white/5">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Server className="w-5 h-5 text-indigo-400" />
            <CardTitle>Architecture Diagram</CardTitle>
          </div>
          <CardDescription>High-level flow of the Mefyx AI ecosystem.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-[#0d1117] border border-white/10 rounded-lg p-6 font-mono text-sm text-slate-300 overflow-x-auto whitespace-pre">
{`[ User Application ]
       │
       ▼  (1) POST /api/v1/gateway/chat (HTTP or SDK)
┌─────────────────────────────────────────────────────────┐
│                 MEFYX GATEWAY (Edge)                    │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │ Rate Limiter │──▶│ Auth & Tier  │──▶│ Policy Engine│  │
│  └──────────────┘   └──────────────┘   └─────────────┘  │
│                            │                            │
│                            ▼                            │
│  ┌───────────────────────────────────────────────────┐  │
│  │                SECURITY ENGINE                    │  │
│  │  • Prompt Injection Detector  • PII Scanner       │  │
│  │  • Malicious Intent Analysis  • Data Redactor     │  │
│  └───────────────────────────────────────────────────┘  │
│                            │                            │
│                            ▼                            │
│  ┌───────────────────────────────────────────────────┐  │
│  │              ROUTING & LOAD BALANCING             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
       │                     │                     │
       ▼                     ▼                     ▼
[ OpenAI API ]        [ Anthropic ]         [ Local LLM ]

       ▲
       │ (2) Telemetry & Logs
       ▼
┌─────────────────────────────────────────────────────────┐
│               MEFYX AI CONTROL PLANE                    │
│                                                         │
│  • Threat Intelligence Engine (Global Pattern DB)       │
│  • Monitoring Dashboard (Analytics, Logs, Billing)      │
└─────────────────────────────────────────────────────────┘`}
          </div>
        </CardContent>
      </Card>

      {/* API Endpoints */}
      <Card className="bg-slate-900/40 border-white/5">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            <CardTitle>API Endpoints</CardTitle>
          </div>
          <CardDescription>Core REST endpoints for the Gateway and Dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3">
                <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs font-bold">POST</span>
                <span className="font-mono text-sm text-slate-200">/api/v1/gateway/chat</span>
              </div>
              <div className="p-4 bg-slate-900/30 text-sm text-slate-400">
                Mefyx gateway endpoint. Accepts a provider, model, and prompt or messages. It scans the request, rejects BLOCKED or REDACTED results with HTTP 403, and forwards permitted messages to the selected provider. Returns content, usage, security, and request_id in the data envelope.
              </div>
            </div>
            
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3">
                <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs font-bold">POST</span>
                <span className="font-mono text-sm text-slate-200">/api/v1/scan</span>
              </div>
              <div className="p-4 bg-slate-900/30 text-sm text-slate-400">
                Standalone security assessment. Accepts prompt (or text), provider, and model, with optional scan context. Returns status, decision, risk_score, sanitized_content, and other analysis fields in the data envelope. Inspect the decision even when HTTP succeeds; this endpoint does not generate a chat completion.
              </div>
            </div>

            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3">
                <span className="bg-clean/20 text-clean px-2 py-0.5 rounded text-xs font-bold">GET</span>
                <span className="font-mono text-sm text-slate-200">/api/v1/analytics</span>
              </div>
              <div className="p-4 bg-slate-900/30 text-sm text-slate-400">
                Retrieves aggregated threat intelligence and usage metrics for the dashboard.
              </div>
            </div>

            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3">
                <span className="bg-clean/20 text-clean px-2 py-0.5 rounded text-xs font-bold">GET</span>
                <span className="font-mono text-sm text-slate-200">/api/v1/reports/threat-counts</span>
              </div>
              <div className="p-4 bg-slate-900/30 text-sm text-slate-400">
                Compliance reporting: daily/weekly threat counts with time filters (supports CSV/JSON export via <span className="font-mono">/api/v1/reports/threat-counts/export</span>).
              </div>
            </div>

            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="bg-slate-950/50 px-4 py-2 border-b border-white/10 flex items-center space-x-3">
                <span className="bg-clean/20 text-clean px-2 py-0.5 rounded text-xs font-bold">GET</span>
                <span className="font-mono text-sm text-slate-200">/api/v1/reports/remediations</span>
              </div>
              <div className="p-4 bg-slate-900/30 text-sm text-slate-400">
                Lists automated remediation actions for audit trails (supports CSV/JSON export via <span className="font-mono">/api/v1/reports/remediations/export</span>).
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Schema */}
      <Card className="bg-slate-900/40 border-white/5">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-blue-400" />
            <CardTitle>Data Schema</CardTitle>
          </div>
          <CardDescription>Core database entities (PostgreSQL / ClickHouse).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0d1117] border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300">
              <div className="text-indigo-400 font-bold mb-2">Table: Users</div>
              id: UUID PRIMARY KEY<br/>
              email: VARCHAR UNIQUE<br/>
              tier: ENUM('FREE', 'PRO', 'BUSINESS')<br/>
              monthly_limit: INT<br/>
              created_at: TIMESTAMP
            </div>
            <div className="bg-[#0d1117] border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300">
              <div className="text-indigo-400 font-bold mb-2">Table: API_Keys</div>
              id: UUID PRIMARY KEY<br/>
              user_id: UUID FOREIGN KEY<br/>
              key_hash: VARCHAR<br/>
              usage_count: INT<br/>
              status: ENUM('ACTIVE', 'REVOKED', 'QUARANTINED')
            </div>
            <div className="bg-[#0d1117] border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300 md:col-span-2">
              <div className="text-indigo-400 font-bold mb-2">Table: Security_Logs (ClickHouse for scale)</div>
              id: UUID PRIMARY KEY<br/>
              api_key_id: UUID<br/>
              timestamp: TIMESTAMP<br/>
              status: ENUM('CLEAN', 'BLOCKED', 'REDACTED')<br/>
              threat_type: VARCHAR<br/>
              threat_score: FLOAT<br/>
              is_quarantined: BOOLEAN<br/>
              tokens_used: INT<br/>
              latency_ms: INT<br/>
              raw_payload: JSONB
            </div>
            <div className="bg-[#0d1117] border border-white/10 rounded-lg p-4 font-mono text-xs text-slate-300 md:col-span-2">
              <div className="text-indigo-400 font-bold mb-2">Table: Remediation_Logs</div>
              id: UUID PRIMARY KEY<br/>
              created_at: TIMESTAMP<br/>
              user_id: UUID<br/>
              api_key_id: UUID<br/>
              security_log_id: UUID<br/>
              request_id: VARCHAR<br/>
              threat_type: VARCHAR<br/>
              threat_score: FLOAT<br/>
              actions: JSONB<br/>
              email_to: VARCHAR<br/>
              webhook_urls: JSONB<br/>
              error: VARCHAR
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Example Requests & Responses */}
      <Card className="bg-slate-900/40 border-white/5">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Code className="w-5 h-5 text-clean" />
            <CardTitle>SDK Integration & Examples</CardTitle>
          </div>
          <CardDescription>A local JavaScript package for the Mefyx scan and gateway APIs, with TypeScript declarations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">1. Install and configure the local SDK</h3>
            <p className="text-sm text-slate-400 mb-3">
              Requires Node.js 18 or later. The package in packages/mefyx-sdk is not published to npm yet.
              Install it into your server application using the path to your repository checkout:
            </p>
            <pre className="bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto"><code>npm install /path/to/sentinel-dashboard/packages/mefyx-sdk</code></pre>
            <p className="text-sm text-slate-400 my-3">
              Set MEFYX_BASE_URL to your API origin (for example http://localhost:8000, without /api) and MEFYX_API_KEY to your account API key.
              Keep credentials on your server. Save the following as gateway.mjs and run node gateway.mjs.
              Gateway calls require a provider key configured on the API server and a model allowed by your plan;
              inspect GET /api/v1/gateway/capabilities for availability. The model below is an example supported by the repository's Free tier.
            </p>
            <pre className="bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto"><code>
{`import { Mefyx, MefyxApiError } from '@mefyx/sdk';

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
}`}</code></pre>
            <p className="text-sm text-slate-400 mt-3">
              Use mefyx.scan(&#123; prompt: 'Summarize our public guide.', provider: 'local', model: 'local' &#125;)
              for a standalone assessment. A successful scan can report BLOCKED or REDACTED; inspect status, decision,
              review_required, and requires_2fa before acting. The local label does not forward to a local LLM.
              Both methods use backend policies and account entitlements; there is no named policy selector.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">2. Gateway HTTP request</h3>
            <p className="text-sm text-slate-400 mb-3">
              POST /api/v1/gateway/chat with Content-Type: application/json and x-api-key: your API key.
              Alternatively, use Authorization: Bearer with a session token. The SDK sends this JSON body unchanged:
            </p>
            <pre className="bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto"><code>
{`{
  "provider": "gemini",
  "model": "gemini-2.5-flash-lite",
  "messages": [
    { "role": "user", "content": "Explain prompt injection briefly." }
  ],
  "max_tokens": 256,
  "project": "support-app"
}`}</code></pre>
            <p className="text-sm text-slate-400 mt-3">
              You can supply prompt instead of messages. Message roles are system, user, or assistant.
              Optional fields include temperature (0–2), max_tokens (1–8192), metadata, project, and app_name.
              Project is a free-text metadata label. The gateway forwards the original messages for permitted requests;
              it rejects redacted scan results and redacts sensitive patterns from returned provider content.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">3. Gateway success response (HTTP 200, illustrative values)</h3>
            <pre className="bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto"><code>
{`{
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
}`}</code></pre>
            <p className="text-sm text-slate-400 mt-3">
              The SDK returns data directly. Token counts and security values vary by request; estimated_cost is an estimate field, not an invoice.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-2">4. Gateway policy failure (HTTP 403, illustrative values)</h3>
            <pre className="bg-[#0d1117] border border-white/10 rounded-lg p-4 text-sm text-slate-300 overflow-x-auto"><code>
{`{
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
}`}</code></pre>
            <p className="text-sm text-slate-400 mt-3">
              The SDK throws MefyxApiError for this response. Other failures include authentication or validation errors,
              model_denied (403), quota_exceeded (429), provider_not_configured (503), and provider failures (502).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Implementation Suggestions */}
      <Card className="bg-slate-900/40 border-white/5">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-red-400" />
            <CardTitle>Implementation Suggestions</CardTitle>
          </div>
          <CardDescription>Tech stack and scaling strategies for millions of API calls.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            <li className="flex items-start space-x-3">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
              <div>
                <strong className="text-slate-200 block">Edge Computing (Cloudflare Workers / Fastly)</strong>
                <span className="text-sm text-slate-400">Deploy the Gateway API at the edge to minimize latency. Rate limiting and basic regex/keyword scanning (Free Tier) should happen here before hitting heavier models.</span>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
              <div>
                <strong className="text-slate-200 block">High-Performance Data Store (Redis & ClickHouse)</strong>
                <span className="text-sm text-slate-400">Use Redis for distributed rate limiting and tier enforcement. Use ClickHouse for ingesting millions of security logs per second to power the Dashboard analytics.</span>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
              <div>
                <strong className="text-slate-200 block">Tiered Security Engine</strong>
                <span className="text-sm text-slate-400">Free tier uses fast heuristics (YARA rules, Regex). Pro/Business tiers route prompts through a specialized, fine-tuned fast LLM (e.g., Gemini Flash or Llama 3 8B) trained specifically on prompt injection datasets.</span>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
              <div>
                <strong className="text-slate-200 block">Global Threat Intelligence Network</strong>
                <span className="text-sm text-slate-400">Anonymize and aggregate blocked prompts across all customers to continuously update the signature database. A zero-day prompt injection discovered on Customer A's app instantly protects Customer B.</span>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}
