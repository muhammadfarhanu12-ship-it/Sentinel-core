import { FileText } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

const sections = [
  {
    title: 'Use of Services',
    body: 'Mefyx provides AI security, monitoring, and automation services for authorized business use. You agree to use the services only in compliance with applicable laws, documentation, policies, and your agreement with Mefyx.',
  },
  {
    title: 'Accounts and Security',
    body: 'You are responsible for maintaining accurate account information, protecting credentials, managing team access, and promptly notifying Mefyx of unauthorized access or suspected compromise.',
  },
  {
    title: 'Customer Data',
    body: 'Customers retain ownership of data submitted to the services. You grant Mefyx the rights needed to process customer data for providing, securing, supporting, and improving the services as described in your agreement and privacy documentation.',
  },
  {
    title: 'Acceptable Use',
    body: 'You may not misuse the services, interfere with platform operation, bypass security controls, submit unlawful content, reverse engineer protected components, or use Mefyx to violate third-party rights.',
  },
  {
    title: 'Subscriptions and Payment',
    body: 'Paid plans may be billed according to the selected subscription, usage, order form, or invoice. Fees are generally non-refundable except as required by law or expressly stated in a written agreement.',
  },
  {
    title: 'Availability and Support',
    body: 'Mefyx works to provide reliable services, but availability may vary due to maintenance, incidents, third-party services, or events outside our reasonable control. Support terms may depend on the selected plan.',
  },
  {
    title: 'Disclaimers and Limitation of Liability',
    body: 'Services are provided subject to applicable warranties in your agreement. To the maximum extent permitted by law, Mefyx limits liability for indirect, incidental, special, consequential, or punitive damages.',
  },
  {
    title: 'Changes and Termination',
    body: 'Mefyx may update services and terms from time to time. Either party may terminate use of the services as permitted by the applicable agreement, and certain obligations may survive termination.',
  },
];

export default function TermsOfService() {
  return (
    <PublicLayout>
      <SEO
        title="Mefyx Terms of Service | Platform Terms and Conditions"
        description="Review the Mefyx Terms of Service covering account use, customer data, acceptable use, subscriptions, support, disclaimers, and termination."
        path="/terms-of-service"
      />

      <section className="pt-32 pb-16 px-6 max-w-4xl mx-auto">
        <span className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
          <FileText className="w-3.5 h-3.5" />
          <span>Legal</span>
        </span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">Terms of Service</h1>
        <p className="text-slate-400 text-lg leading-relaxed">
          These Terms of Service describe the baseline terms for accessing and using Mefyx websites, products, APIs, and related services.
        </p>
        <p className="text-sm text-slate-500 mt-6">Last updated: July 2, 2026</p>
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
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              For contract or legal questions, contact legal@mefyx.com. This template is professional placeholder content and should be reviewed by counsel before publication.
            </p>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
