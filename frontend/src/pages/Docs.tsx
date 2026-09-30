import { ArrowRight, BookOpen, Code2, KeyRound, PackageCheck, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

const docsSections = [
  {
    id: 'api-documentation',
    icon: Code2,
    title: 'API Documentation',
    description: 'POST /api/v1/scan returns a security assessment. POST /api/v1/gateway/chat accepts a provider, model, and prompt or messages, and returns content, usage, security, and request_id inside the API data envelope.',
  },
  {
    id: 'quick-start',
    icon: Terminal,
    title: 'Quick Start',
    description: 'With Node.js 18 or later, install packages/mefyx-sdk from a repository checkout into your server application. Set MEFYX_BASE_URL to your API origin (for example http://localhost:8000, without /api) and MEFYX_API_KEY to a key created in your account. Save the example as scan.mjs and run node scan.mjs.',
  },
  {
    id: 'authentication',
    icon: KeyRound,
    title: 'Authentication',
    description: 'Run these examples on your server and keep credentials out of browser bundles. The SDK sends apiKey as x-api-key. You can supply bearerToken instead for an authenticated session. Your account plan determines quotas, models, and available scan tiers.',
  },
  {
    id: 'sdk',
    icon: PackageCheck,
    title: 'JavaScript SDK (local package)',
    description: 'The repository includes @mefyx/sdk with TypeScript declarations and scan() and chat() methods. It is not published to npm yet. Methods return the API data field and throw MefyxApiError for API failures. Security policies are applied by the server; there is no named policy selector.',
  },
];

export default function Docs() {
  return (
    <PublicLayout>
      <SEO
        title="Mefyx Docs | AI Security API and JavaScript SDK"
        description="Connect to the Mefyx scan and gateway APIs with the repository's JavaScript SDK, authentication guidance, and request examples."
        path="/docs"
      />

      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Documentation</span>
            </span>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Build secure AI workflows with Mefyx.
            </h1>
            <p className="text-lg md:text-xl text-slate-400 leading-relaxed">
              Connect your server application to the scan and gateway APIs with the repository's JavaScript SDK.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-10">
              <a href="#quick-start" className="inline-flex items-center justify-center space-x-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-all">
                <span>Quick Start</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a href="#api-documentation" className="inline-flex items-center justify-center bg-slate-900/50 hover:bg-slate-800/80 border border-white/10 text-white px-6 py-3 rounded-lg font-medium transition-all">
                API Documentation
              </a>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/70 overflow-hidden">
            <div className="h-12 border-b border-white/5 bg-slate-950/50 flex items-center px-4 space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <div className="px-6 pt-6 text-sm text-slate-400">
              <p>Install the local package into your server application. Replace the path with your repository checkout:</p>
              <pre className="mt-3 text-slate-300 overflow-x-auto"><code>npm install /path/to/sentinel-dashboard/packages/mefyx-sdk</code></pre>
            </div>
            <pre className="p-6 text-sm text-slate-300 overflow-x-auto">
              <code>{`import { Mefyx } from '@mefyx/sdk';

const mefyx = new Mefyx({
  baseUrl: process.env.MEFYX_BASE_URL,
  apiKey: process.env.MEFYX_API_KEY,
});

const result = await mefyx.scan({
  prompt: 'Summarize our public product guide.',
  provider: 'local',
  model: 'local',
});

console.log(result.status, result.risk_score);
console.log(result.sanitized_content);`}</code>
            </pre>
            <p className="px-6 pb-6 text-sm text-slate-400 leading-relaxed">
              This example requests a standalone scan. The local provider label does not forward to a local LLM.
              A successful scan response can still report BLOCKED or REDACTED; inspect its decision and review flags before taking further action.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 bg-slate-900/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {docsSections.map((section) => (
            <article key={section.id} id={section.id} className="scroll-mt-24 rounded-xl bg-slate-950/50 border border-white/5 p-6">
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                <section.icon className="w-6 h-6 text-indigo-300" />
              </div>
              <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed">{section.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-8 md:p-10 flex flex-col md:flex-row gap-8 md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3">Ready to connect your first application?</h2>
            <p className="text-slate-400 max-w-2xl">
              Create a Mefyx account, generate an API key, and start inspecting AI traffic with the same controls described in the docs.
            </p>
          </div>
          <Link to="/signup" className="inline-flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-all shrink-0">
            Start Free
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
