import { ArrowRight, Building2, LoaderCircle, Mail, MapPin, MessageSquare, Shield } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';
import { submitContact } from '../services/contact';

export default function Contact() {
  const submissionInFlight = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleContactSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlight.current) return;

    const form = event.target;
    const data = new FormData(form);
    submissionInFlight.current = true;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await submitContact({
        firstName: String(data.get('firstName') || ''),
        lastName: String(data.get('lastName') || ''),
        email: String(data.get('email') || ''),
        company: String(data.get('company') || ''),
        message: String(data.get('message') || ''),
      });
      form.reset();
      setFeedback({ type: 'success', message: "Thanks, we'll get back to you shortly" });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : "We couldn't send your message. Please try again or email support@mefyx.com.",
      });
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  }

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
                <h2 className="font-semibold mb-1">Customer Support</h2>
                <a href="mailto:support@mefyx.com" className="text-sm text-slate-400 hover:text-indigo-300 transition-colors">support@mefyx.com</a>
              </div>
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
            aria-busy={isSubmitting}
            onSubmit={handleContactSubmit}
          >
            <fieldset disabled={isSubmitting} className="min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label className="block text-sm font-medium text-slate-200">
                  First name
                  <input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="firstName" type="text" autoComplete="given-name" maxLength={100} required />
                </label>
                <label className="block text-sm font-medium text-slate-200">
                  Last name
                  <input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="lastName" type="text" autoComplete="family-name" maxLength={100} required />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-200 mt-5">
                Work email
                <input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="email" type="email" autoComplete="email" placeholder="name@company.com" maxLength={254} required />
              </label>
              <label className="block text-sm font-medium text-slate-200 mt-5">
                Company
                <input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="company" type="text" autoComplete="organization" maxLength={200} />
              </label>
              <label className="block text-sm font-medium text-slate-200 mt-5">
                Message
                <textarea className="mt-2 min-h-36 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60" name="message" placeholder="Tell us about your AI security needs" maxLength={5000} required />
              </label>
              <button type="submit" disabled={isSubmitting} className="mt-6 w-full inline-flex items-center justify-center space-x-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.35)] disabled:opacity-60 disabled:cursor-wait">
                <span>{isSubmitting ? 'Sending...' : 'Contact Sales'}</span>
                {isSubmitting ? <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="w-4 h-4" aria-hidden="true" />}
              </button>
            </fieldset>
            {feedback && (
              <p role={feedback.type === 'success' ? 'status' : 'alert'} className={`mt-4 text-sm ${feedback.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
                {feedback.message}
              </p>
            )}
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
