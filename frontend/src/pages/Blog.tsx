import { ArrowRight, CalendarDays, Search, Shield, Tags } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { PublicLayout } from '../components/layout/PublicLayout';

const categories = ['AI Security', 'Threat Research', 'API Security', 'SOC Automation', 'Product Updates'];

const articles = [
  {
    title: 'How to evaluate prompt injection risk before launch',
    category: 'AI Security',
    date: 'July 2026',
    excerpt: 'A practical checklist for mapping model behavior, trust boundaries, and security controls before releasing AI features.',
  },
  {
    title: 'Building useful alerts for AI threat detection',
    category: 'Threat Research',
    date: 'June 2026',
    excerpt: 'Alert quality matters. Learn how teams can reduce noise while preserving the evidence analysts need for fast triage.',
  },
  {
    title: 'API security patterns for multi-model AI products',
    category: 'API Security',
    date: 'May 2026',
    excerpt: 'Explore controls for API keys, request inspection, tenant boundaries, and safe model provider abstraction.',
  },
];

export default function Blog() {
  return (
    <PublicLayout>
      <SEO
        title="Mefyx Blog | AI Security Research and Product Updates"
        description="Read Mefyx articles on AI security, prompt injection, threat detection, API protection, SOC automation, and secure AI operations."
        path="/blog"
      />

      <section className="pt-32 pb-16 px-6 max-w-7xl mx-auto">
        <span className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-medium text-indigo-300 mb-6">
          <Shield className="w-3.5 h-3.5" />
          <span>Security Blog</span>
        </span>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Research, guides, and notes for secure AI teams.
            </h1>
            <p className="text-lg md:text-xl text-slate-400 leading-relaxed max-w-3xl">
              Follow Mefyx articles on AI security, threat detection, API protection, monitoring, and operational playbooks for production AI systems.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5 h-fit">
            <label htmlFor="blog-search" className="text-sm font-medium text-slate-200">Search articles</label>
            <div className="relative mt-3">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="blog-search"
                type="search"
                placeholder="Search AI security topics"
                className="w-full rounded-lg border border-white/10 bg-slate-950/70 py-3 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="pb-10 px-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-3" aria-label="Blog categories">
          {categories.map((category) => (
            <button key={category} type="button" className="inline-flex items-center space-x-2 rounded-full border border-white/10 bg-slate-900/50 px-4 py-2 text-sm text-slate-300 hover:border-indigo-500/40 hover:text-white transition-colors">
              <Tags className="w-3.5 h-3.5 text-indigo-300" />
              <span>{category}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="py-20 bg-slate-900/30 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {articles.map((article) => (
            <article key={article.title} className="rounded-xl bg-slate-950/50 border border-white/5 p-6 hover:border-indigo-500/30 hover:bg-slate-900/70 transition-all">
              <div className="flex items-center justify-between gap-4 text-xs text-slate-500 mb-5">
                <span className="text-indigo-300">{article.category}</span>
                <span className="inline-flex items-center space-x-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>{article.date}</span>
                </span>
              </div>
              <h2 className="text-xl font-semibold mb-3">{article.title}</h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">{article.excerpt}</p>
              <Link to="/blog" className="inline-flex items-center space-x-2 text-sm font-medium text-indigo-300 hover:text-indigo-200 transition-colors">
                <span>Read article</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
