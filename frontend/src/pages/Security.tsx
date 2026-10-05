import { ArrowRight, Database, FileCheck2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { MarketingLayout } from '../components/layout/MarketingLayout';

const controls = [
  {
    icon: ShieldCheck,
    title: 'Gateway enforcement',
    body: 'Gateway Run scans requests before forwarding them to the selected provider. A blocked request returns HTTP 403 with policy_blocked. Requests marked for redaction or mandatory review are also stopped before the provider call.',
  },
  {
    icon: LockKeyhole,
    title: 'Financial actions and approvals',
    body: 'Financial guardrails assess supplied transaction and tool context. Risky actions can require MFA or human review. Your application must honor these decisions and complete approval before executing a payment, wire, wallet transfer, or other tool action.',
  },
  {
    icon: Database,
    title: 'Data handling and logs',
    body: 'Requests reach Mefyx servers for analysis. Usage and audit records include redacted prompt excerpts and request metadata. Scan logs can include redacted excerpts of up to 2,000 characters. Redaction covers supported patterns; it is not a promise that every sensitive value will be detected.',
  },
  {
    icon: FileCheck2,
    title: 'Security Scan mode',
    body: 'Security Scan returns the assessment, sanitized content, and review or MFA flags. A successful API response can still contain a blocked decision. Your application must inspect the result and enforce it before any separate model call or financial action.',
  },
];

const resourceClass = 'inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-emerald-300/50 hover:bg-emerald-300/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300';

export default function Security() {
  return (
    <MarketingLayout>
      <SEO
        title="Mefyx Security | Controls, Data Handling, and Approvals"
        description="Understand Mefyx gateway enforcement, financial action approvals, prompt redaction, audit history, provider support, and security limitations."
        path="/security"
      />

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Security at Mefyx</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">Know what protects your AI workflow.</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-400">
          Mefyx adds request inspection, sensitive data redaction, and decisions about risky financial actions between your app and its AI provider. These controls work with the approval and execution rules in your application.
        </p>
      </section>

      <section className="border-y border-white/10 bg-slate-900/30" aria-labelledby="security-controls">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <h2 id="security-controls" className="mb-8 text-2xl font-semibold tracking-tight text-white sm:text-3xl">What happens to a request</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {controls.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 sm:p-8">
                <Icon className="mb-5 h-6 w-6 text-emerald-300" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-2" aria-label="Audit history and provider availability">
        <article>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Audit history and retention</h2>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            Audit history is available for 7 days on Free, 30 days on Pro, and 365 days on Business. These plan windows control accessible audit history; they do not guarantee that all stored data is deleted at that point. Mefyx is not a zero-retention service.
          </p>
          <Link to="/privacy" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-emerald-300 hover:text-emerald-200">Read the Privacy Policy <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </article>
        <article>
          <h2 className="text-2xl font-semibold tracking-tight text-white">Provider and plan availability</h2>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            The gateway supports OpenAI, Gemini, Claude, and Grok. Free includes selected Gemini models. Pro and Business include selected models across all four providers. Availability depends on the account plan and configured provider credentials. Forwarded requests are also subject to the selected provider&apos;s data handling terms.
          </p>
          <p className="mt-4 text-sm leading-7 text-slate-400">MFA and human review are Business plan controls. Include the relevant tool and transaction context when integrating financial guardrails.</p>
        </article>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-6 sm:p-9">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Security controls and audit evidence</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Mefyx is not a compliance certification. Its controls and logs can support your security review, but they do not certify your application or replace your own compliance assessment. Test your integration, review decisions, and retain control over financial execution.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link to="/docs" className={resourceClass}>Read the Docs <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link to="/contact" className={resourceClass}>Contact Mefyx <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
