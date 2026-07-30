import { Shield } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

const sections = [
  {
    title: 'Information We Collect',
    body: 'We may collect information that you provide directly, information generated through use of the services, device and log information, billing-related details, communications with Mefyx, and content submitted to the platform for AI security analysis. Customers are responsible for ensuring they have appropriate rights to submit data to Mefyx.',
  },
  {
    title: 'Account Information',
    body: 'Account information may include names, email addresses, company names, roles, authentication details, team membership, billing contacts, support requests, and security settings. We use this information to create accounts, authenticate users, manage access, provide support, process subscriptions, and communicate service-related updates.',
  },
  {
    title: 'Usage Analytics',
    body: 'We may collect product usage analytics, feature interactions, API request metadata, performance metrics, error reports, security event summaries, and aggregated trends. We use this information to operate, secure, debug, measure, and improve Mefyx services and to detect abuse or misuse.',
  },
  {
    title: 'Cookies',
    body: 'Mefyx may use cookies, local storage, and similar technologies to keep users signed in, remember preferences, measure website performance, understand visitor behavior, protect sessions, and improve the website. Browser settings may allow you to block or delete cookies, but some features may not work properly without them.',
  },
  {
    title: 'Security',
    body: 'We use administrative, technical, and organizational safeguards designed to protect information, including access controls, encryption where appropriate, monitoring, logging, and security review practices. No method of transmission or storage is completely secure, and customers should also protect their credentials, devices, and integrations.',
  },
  {
    title: 'Data Retention',
    body: 'We retain information for as long as needed to provide services, maintain accounts, meet legal and tax obligations, resolve disputes, enforce agreements, prevent abuse, and preserve security records. Retention periods may vary by data type, account settings, subscription status, legal requirements, and customer instructions.',
  },
  {
    title: 'Third-Party Services',
    body: 'We may use trusted third-party providers for hosting, infrastructure, analytics, payment processing, email delivery, customer support, security monitoring, and similar business operations. These providers may process information only as needed to perform services for Mefyx. We do not sell personal information.',
  },
  {
    title: 'User Rights',
    body: 'Depending on your location and relationship with Mefyx, you may have rights to access, correct, export, delete, restrict, or object to certain processing of personal information. Account administrators can manage team access and product settings, and eligible requests may be sent to Mefyx for review subject to legal, contractual, and security requirements.',
  },
];

type PrivacyPolicyProps = {
  canonicalPath?: string;
};

export default function PrivacyPolicy({ canonicalPath = '/privacy' }: PrivacyPolicyProps) {
  return (
    <PublicLayout>
      <SEO
        title="Mefyx Privacy Policy | Data Protection and Platform Privacy"
        description="Read the Mefyx Privacy Policy for information about data collection, account information, analytics, cookies, security, retention, third-party services, and user rights."
        path={canonicalPath}
      />

      <section className="pt-32 pb-16 px-6 max-w-4xl mx-auto">
        <span className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
          <Shield className="w-3.5 h-3.5" />
          <span>Legal</span>
        </span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">Privacy Policy</h1>
        <p className="text-slate-400 text-lg leading-relaxed">
          This Privacy Policy explains how Mefyx Security Inc. collects, uses, protects, and shares information when customers and visitors use Mefyx websites, products, and services.
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
              For privacy questions or rights requests, contact Mefyx at <a href="mailto:privacy@mefyx.com" className="text-indigo-300 hover:text-indigo-200 transition-colors">privacy@mefyx.com</a> or through the contact options available on the Mefyx website.
            </p>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
