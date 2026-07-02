import { ArrowRight, CheckCircle2, Shield, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

const plans = [
  {
    name: 'Starter',
    price: '$0',
    description: 'For developers validating AI security controls on early projects.',
    features: ['1,000 AI requests per month', 'Basic prompt scanning', 'Security logs', 'Single API key'],
    cta: 'Start Free',
    to: '/signup',
  },
  {
    name: 'Growth',
    price: '$19',
    description: 'For teams shipping AI features that need stronger monitoring and response.',
    features: ['50,000 AI requests per month', 'Advanced threat detection', 'PII redaction', 'Threat analytics dashboard', 'Priority scanning'],
    cta: 'Upgrade to Growth',
    to: '/signup',
    featured: true,
  },
  {
    name: 'Business',
    price: '$49',
    description: 'For companies standardizing AI security across multiple products.',
    features: ['Unlimited projects', 'Team dashboard', 'Multiple API keys', 'Audit-ready reports', 'Priority support'],
    cta: 'Start Business',
    to: '/signup',
  },
];

export default function Pricing() {
  return (
    <PublicLayout>
      <SEO
        title="Mefyx Pricing | AI Security Plans for Teams"
        description="Compare Mefyx pricing plans for AI security, threat detection, monitoring, API protection, and enterprise SOC automation."
        path="/pricing"
      />

      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto text-center">
        <span className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Simple Security Pricing</span>
        </span>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Secure AI applications at every stage.</h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
          Start with core AI security controls, then scale into deeper monitoring, team workflows, and enterprise-grade automation as your usage grows.
        </p>
      </section>

      <section className="pb-24 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`relative rounded-2xl p-8 flex flex-col border ${
                plan.featured
                  ? 'bg-slate-900 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.15)] md:-translate-y-4'
                  : 'bg-slate-900/40 border-white/10'
              }`}
            >
              {plan.featured && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  Most Popular
                </div>
              )}
              <h2 className={`text-xl font-semibold mb-2 ${plan.featured ? 'text-indigo-300' : 'text-slate-200'}`}>{plan.name}</h2>
              <div className="flex items-baseline mb-5">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                <span className="text-slate-400 ml-2">/month</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed mb-8">{plan.description}</p>
              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start space-x-3 text-sm text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={plan.to}
                className={`w-full py-3 px-4 rounded-lg text-center font-medium transition-colors ${
                  plan.featured
                    ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg'
                    : 'border border-white/10 hover:bg-slate-800 text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="py-24 bg-indigo-950/20 border-y border-indigo-500/10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
          <div className="lg:col-span-2">
            <div className="flex items-center space-x-3 mb-5">
              <div className="w-12 h-12 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <Users className="w-6 h-6 text-indigo-300" />
              </div>
              <span className="text-sm font-medium text-indigo-300 uppercase tracking-wider">Enterprise</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Need custom controls, volume, or deployment support?</h2>
            <p className="text-slate-400 text-lg leading-relaxed max-w-3xl">
              Enterprise plans include custom request volume, advanced governance, dedicated onboarding, security reviews, and support for SOC automation workflows.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <Link to="/contact" className="inline-flex items-center justify-center space-x-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.35)]">
              <span>Contact Sales</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/docs" className="inline-flex items-center justify-center space-x-2 bg-slate-900/50 hover:bg-slate-800/80 border border-white/10 text-white px-6 py-3 rounded-lg font-medium transition-all">
              <Shield className="w-4 h-4" />
              <span>Review Platform Docs</span>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
