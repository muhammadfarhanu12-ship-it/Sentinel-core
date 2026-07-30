import { FileText } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

const sections = [
  {
    title: 'Acceptance of Terms',
    body: 'By accessing or using Mefyx websites, products, dashboards, APIs, or related services, you agree to these Terms of Service and any applicable order form, subscription terms, or written agreement. If you use Mefyx on behalf of an organization, you represent that you have authority to bind that organization.',
  },
  {
    title: 'Account Responsibilities',
    body: 'You are responsible for maintaining accurate account, billing, and security contact information, protecting credentials, configuring appropriate access controls, and managing all activity under your account. You must promptly notify Mefyx of any unauthorized access, suspected compromise, or security incident involving your account.',
  },
  {
    title: 'Acceptable Use',
    body: 'You may use Mefyx only for lawful, authorized, defensive, and business purposes. You may not use the services to attack systems without permission, distribute malware, conduct phishing, violate third-party rights, bypass platform controls, overload infrastructure, reverse engineer protected components, or interfere with service availability.',
  },
  {
    title: 'Subscription and Billing',
    body: 'Paid plans may be billed monthly, annually, by usage, invoice, or as otherwise stated at checkout or in an order form. Subscriptions renew until canceled, and you authorize Mefyx or its payment processor to charge applicable fees and taxes. Failure to pay may result in suspension or termination. Refunds are handled under the Refund Policy, applicable law, or a separate written agreement.',
  },
  {
    title: 'Intellectual Property',
    body: 'Mefyx and its licensors retain all rights in the platform, software, APIs, documentation, designs, security models, trademarks, and related technology. Customers retain ownership of data they submit to the services and grant Mefyx the rights needed to host, process, secure, support, and improve the services. Feedback may be used by Mefyx without restriction or obligation.',
  },
  {
    title: 'AI-Generated Content Disclaimer',
    body: 'Mefyx may use AI systems or automated analysis to classify requests, generate security explanations, recommend actions, or summarize events. AI-generated outputs may be incomplete, inaccurate, or unsuitable for a particular use case. You are responsible for reviewing outputs and making final operational, legal, compliance, or security decisions.',
  },
  {
    title: 'Cybersecurity Services Disclaimer',
    body: 'Mefyx provides tools designed to assist with AI application security, monitoring, detection, redaction, and response workflows. The services do not guarantee that every vulnerability, attack, policy violation, data exposure, or security incident will be detected, prevented, or remediated. You remain responsible for your security program, configurations, authorization scope, and defense-in-depth controls.',
  },
  {
    title: 'Limitation of Liability',
    body: 'To the maximum extent permitted by law, Mefyx will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, loss of profits, loss of data, business interruption, or security incidents arising from use of the services. Unless a separate agreement states otherwise, Mefyx aggregate liability is limited to the amounts paid for the services during the twelve months before the claim, or $100 for free services.',
  },
  {
    title: 'Termination',
    body: 'You may stop using the services or cancel your subscription as described in your account or order terms. Mefyx may suspend or terminate access for non-payment, breach of these terms, legal risk, security risk, misuse, or discontinued services. Provisions that by their nature should survive termination will continue to apply.',
  },
  {
    title: 'Governing Law',
    body: 'Unless a separate written agreement states otherwise, these terms are governed by the laws of the State of Delaware and applicable federal laws of the United States, without regard to conflict of law rules. Venue and dispute procedures may be further defined in an applicable order form or agreement.',
  },
];

type TermsOfServiceProps = {
  canonicalPath?: string;
};

export default function TermsOfService({ canonicalPath = '/terms' }: TermsOfServiceProps) {
  return (
    <PublicLayout>
      <SEO
        title="Mefyx Terms of Service | Platform Terms and Conditions"
        description="Review the Mefyx Terms of Service covering account responsibilities, acceptable use, subscriptions, intellectual property, AI content, cybersecurity disclaimers, liability, and termination."
        path={canonicalPath}
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
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              For contract, legal, or terms-related questions, contact Mefyx at <a href="mailto:legal@mefyx.com" className="text-indigo-300 hover:text-indigo-200 transition-colors">legal@mefyx.com</a> or through the contact options available on the Mefyx website.
            </p>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
