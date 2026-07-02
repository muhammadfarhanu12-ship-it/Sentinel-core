import { ArrowRight, Building2, Mail, MapPin, MessageSquare, Shield } from 'lucide-react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

function handleContactSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}

export default function Contact() {
  return (
    <PublicLayout>
      <SEO
        title="Contact Mefyx | AI Security Sales and Support"
        description="Contact Mefyx for AI security platform questions, pricing, enterprise sales, product support, and security monitoring guidance."
        path="/contact"
      />

      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div>
            <span className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Contact Mefyx</span>
            </span>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Talk with us about securing your AI stack.
            </h1>
            <p className="text-lg md:text-xl text-slate-400 leading-relaxed mb-10">
              Share your AI security goals, deployment needs, or enterprise requirements. The Mefyx team can help with threat detection, monitoring, API security, and SOC automation planning.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
                <Mail className="w-6 h-6 text-indigo-300 mb-3" />
                <h2 className="font-semibold mb-1">Business Email</h2>
                <a href="mailto:sales@mefyx.com" className="text-sm text-slate-400 hover:text-indigo-300 transition-colors">sales@mefyx.com</a>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
                <Building2 className="w-6 h-6 text-indigo-300 mb-3" />
                <h2 className="font-semibold mb-1">Company</h2>
                <p className="text-sm text-slate-400">Mefyx Security Inc.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
                <MapPin className="w-6 h-6 text-indigo-300 mb-3" />
                <h2 className="font-semibold mb-1">Location</h2>
                <p className="text-sm text-slate-400">Remote-first security team</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
                <Shield className="w-6 h-6 text-indigo-300 mb-3" />
                <h2 className="font-semibold mb-1">Security</h2>
                <p className="text-sm text-slate-400">AI application protection and monitoring</p>
              </div>
            </div>
          </div>

          <form
            className="rounded-xl border border-white/10 bg-slate-900/60 p-6 md:p-8 h-fit"
            aria-label="Contact Mefyx"
            onSubmit={handleContactSubmit}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <label className="block text-sm font-medium text-slate-200">
                First name
                <input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="firstName" type="text" autoComplete="given-name" required />
              </label>
              <label className="block text-sm font-medium text-slate-200">
                Last name
                <input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="lastName" type="text" autoComplete="family-name" required />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-200 mt-5">
              Work email
              <input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="email" type="email" autoComplete="email" placeholder="name@company.com" required />
            </label>
            <label className="block text-sm font-medium text-slate-200 mt-5">
              Company
              <input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="company" type="text" autoComplete="organization" />
            </label>
            <label className="block text-sm font-medium text-slate-200 mt-5">
              Message
              <textarea className="mt-2 min-h-36 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="message" placeholder="Tell us about your AI security needs" required />
            </label>
            <button type="submit" className="mt-6 w-full inline-flex items-center justify-center space-x-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.35)]">
              <span>Contact Sales</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </section>

      <section className="py-24 bg-slate-900/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Need to evaluate Mefyx first?</h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-8">
            Review platform capabilities and documentation, then connect with sales for deployment planning.
          </p>
          <Link to="/docs" className="inline-flex items-center justify-center bg-slate-900/50 hover:bg-slate-800/80 border border-white/10 text-white px-6 py-3 rounded-lg font-medium transition-all">
            View Documentation
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
