import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowRight, CheckCircle2, Database, Key, Layers, Lock, Shield, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  points: string[];
};

const features: Feature[] = [
  {
    icon: Shield,
    title: 'AI Security',
    description: 'Mefyx protects AI applications with policy controls, prompt inspection, and model-aware risk analysis before requests reach production systems.',
    points: ['Prompt injection defense', 'Sensitive data controls', 'Policy-driven allow and block decisions'],
  },
  {
    icon: Zap,
    title: 'Threat Detection',
    description: 'Detect suspicious prompts, automated abuse, credential exposure, and anomalous AI traffic with real-time security scoring.',
    points: ['Live risk scoring', 'Abuse pattern detection', 'High-signal alerts for security teams'],
  },
  {
    icon: Activity,
    title: 'Security Monitoring',
    description: 'Monitor AI requests, blocked threats, API usage, and security events from a unified platform built for modern AI operations.',
    points: ['Live security logs', 'Usage and cost visibility', 'Team-ready reporting'],
  },
  {
    icon: Key,
    title: 'API Security',
    description: 'Protect AI endpoints, keys, and integrations with request-level controls that make secure adoption easier across teams.',
    points: ['API key governance', 'Request audit trails', 'Integration-friendly controls'],
  },
  {
    icon: Layers,
    title: 'SOC Automation',
    description: 'Turn AI security signals into repeatable response workflows so analysts can triage, investigate, and act faster.',
    points: ['Automated enrichment', 'Escalation-ready evidence', 'Remediation workflow support'],
  },
  {
    icon: Lock,
    title: 'Data Protection',
    description: 'Reduce the chance of sensitive data exposure with detection and redaction patterns designed for AI inputs and outputs.',
    points: ['PII detection', 'Secret and token masking', 'Compliance-ready activity history'],
  },
];

export default function Features() {
  return (
    <PublicLayout>
      <SEO
        title="Mefyx Features | AI Security, Threat Detection, and SOC Automation"
        description="Explore Mefyx features for AI security, threat detection, security monitoring, API security, data protection, and SOC automation."
        path="/features"
      />

      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <div className="max-w-3xl">
          <span className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
            <Shield className="w-3.5 h-3.5" />
            <span>Mefyx Platform</span>
          </span>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            AI security features built for production teams.
          </h1>
          <p className="text-lg md:text-xl text-slate-400 leading-relaxed">
            Mefyx gives engineering, security, and operations teams a practical control plane for protecting AI applications, monitoring live traffic, and automating response.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-10">
            <Link to="/signup" className="inline-flex items-center justify-center space-x-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.35)]">
              <span>Start Free</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/docs" className="inline-flex items-center justify-center bg-slate-900/50 hover:bg-slate-800/80 border border-white/10 text-white px-6 py-3 rounded-lg font-medium transition-all">
              Read the Docs
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 bg-slate-900/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-xl bg-slate-950/50 border border-white/5 p-6 hover:border-indigo-500/30 hover:bg-slate-900/70 transition-all">
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
                <feature.icon className="w-6 h-6 text-indigo-300" />
              </div>
              <h2 className="text-xl font-semibold mb-3">{feature.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-5">{feature.description}</p>
              <ul className="space-y-3">
                {feature.points.map((point) => (
                  <li key={point} className="flex items-start space-x-3 text-sm text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-clean shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Security visibility from the first request.</h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              Connect Mefyx in front of your AI services to inspect prompts, monitor behavior, and create a repeatable security record for every application using large language models.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6">
            <Database className="w-8 h-8 text-cyan-300 mb-4" />
            <p className="text-3xl font-bold mb-2">One platform</p>
            <p className="text-sm text-slate-400 leading-relaxed">
              Secure prompts, APIs, logs, alerts, and response workflows without splitting AI security work across disconnected tools.
            </p>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
