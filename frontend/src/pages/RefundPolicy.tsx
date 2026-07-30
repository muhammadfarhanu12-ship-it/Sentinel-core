import { FileText } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

const sections = [
  {
    title: 'Subscription Billing',
    body: 'Mefyx subscriptions may be billed through monthly plans, annual plans, usage-based charges, invoices, or other terms shown at checkout or in a signed order form. By purchasing a paid plan, you authorize Mefyx or its payment processor to charge the applicable fees, taxes, and renewal amounts for your selected subscription.',
  },
  {
    title: 'Monthly and Annual Subscriptions',
    body: 'Monthly subscriptions renew each month until canceled. Annual subscriptions renew each year until canceled and may be priced differently from month-to-month plans. Unless a checkout page, order form, or written agreement states otherwise, subscription fees are charged in advance for the selected billing period.',
  },
  {
    title: 'Cancellation Process',
    body: 'You may cancel a subscription from your account billing settings when available or by contacting Mefyx support. Cancellation stops future renewals, but access to paid features may continue until the end of the current billing period unless otherwise stated in your plan or agreement.',
  },
  {
    title: 'Refund Eligibility',
    body: 'Fees are generally non-refundable once a subscription period begins, except where required by law, expressly stated in a written agreement, or approved by Mefyx. Refund requests may be reviewed based on the billing event, account status, service access, usage, applicable plan terms, and whether the request relates to a first-time purchase, billing error, or service issue.',
  },
  {
    title: 'Duplicate or Accidental Payments',
    body: 'If you believe you were charged twice, charged accidentally, or billed for an incorrect amount, contact support with the account email, invoice or receipt number, charge date, and a brief description of the issue. Confirmed duplicate or accidental payments may be refunded or credited as appropriate.',
  },
  {
    title: 'Contact Support',
    body: 'For billing, cancellation, or refund questions, contact Mefyx support. We may need account ownership verification before discussing billing details or processing a request.',
  },
];

export default function RefundPolicy() {
  return (
    <PublicLayout>
      <SEO
        title="Mefyx Refund Policy | Subscription Billing and Cancellations"
        description="Review the Mefyx Refund Policy for monthly and annual subscriptions, cancellation process, refund eligibility, duplicate payments, and billing support."
        path="/refunds"
      />

      <section className="pt-32 pb-16 px-6 max-w-4xl mx-auto">
        <span className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
          <FileText className="w-3.5 h-3.5" />
          <span>Legal</span>
        </span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">Refund Policy</h1>
        <p className="text-slate-400 text-lg leading-relaxed">
          This Refund Policy explains how Mefyx handles subscription billing, cancellations, refund requests, and duplicate or accidental payments.
        </p>
        <p className="text-sm text-slate-500 mt-6">Last updated: July 30, 2026</p>
      </section>

      <section className="pb-24 px-6 max-w-4xl mx-auto">
        <div className="space-y-6">
          {sections.map((section) => (
            <article key={section.title} className="rounded-xl border border-white/10 bg-slate-900/50 p-6">
              <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed">{section.body}</p>
            </article>
          ))}
          <article className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-6">
            <h2 className="text-xl font-semibold mb-3">Support Contact</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Contact support at <a href="mailto:support@mefyx.com" className="text-indigo-300 hover:text-indigo-200 transition-colors">support@mefyx.com</a> with your account email and invoice details so the Mefyx team can review your request.
            </p>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
