import { Shield } from 'lucide-react';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

const sections = [
  {
    title: 'Information We Collect',
    body: 'We may collect account details, business contact information, billing information, product usage data, device and log information, and content submitted to Mefyx services for security analysis. Customers are responsible for ensuring they have appropriate rights to submit data to the platform.',
  },
  {
    title: 'How We Use Information',
    body: 'We use information to provide and improve Mefyx services, authenticate users, process payments, monitor platform reliability, detect abuse, support customers, communicate product updates, and meet legal and security obligations.',
  },
  {
    title: 'Security and Retention',
    body: 'We apply administrative, technical, and organizational safeguards designed to protect customer information. We retain information for as long as needed to provide services, comply with legal obligations, resolve disputes, and enforce agreements.',
  },
  {
    title: 'Sharing and Processors',
    body: 'We may share information with trusted service providers that support hosting, analytics, payments, communication, security, and customer operations. We do not sell personal information. We may disclose information when required by law or to protect rights, users, and services.',
  },
  {
    title: 'Customer Controls',
    body: 'Customers may request access, correction, export, or deletion of eligible personal information, subject to contractual, legal, and security requirements. Account administrators can manage team access and security settings inside the product.',
  },
  {
    title: 'International Transfers',
    body: 'Mefyx may process information in locations where we or our service providers operate. When required, we use appropriate safeguards for international data transfers.',
  },
  {
    title: 'Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. Material changes will be reflected by updating the effective date or providing additional notice when appropriate.',
  },
];

export default function PrivacyPolicy() {
  return (
    <PublicLayout>
      <SEO
        title="Mefyx Privacy Policy | Data Protection and Platform Privacy"
        description="Read the Mefyx Privacy Policy for information about data collection, platform usage, security safeguards, sharing, retention, and customer privacy rights."
        path="/privacy-policy"
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
              For privacy questions, contact Mefyx at privacy@mefyx.com or write to Mefyx Security Inc. This template is provided for professional placeholder purposes and should be reviewed by counsel before publication.
            </p>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
