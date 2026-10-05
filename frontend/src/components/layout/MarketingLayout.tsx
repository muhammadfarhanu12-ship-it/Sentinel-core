import type { ReactNode } from 'react';
import { ArrowUpRight, Menu, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const navigation = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
];

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080d14] font-sans text-slate-100 selection:bg-emerald-300/20 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-emerald-300 [&_summary:focus-visible]:outline-2 [&_summary:focus-visible]:outline-offset-4 [&_summary:focus-visible]:outline-emerald-300">
      <a href="#main-content" className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-emerald-300 p-3 text-slate-950 focus:not-sr-only">Skip to content</a>
      <header className="relative z-20 border-b border-white/10">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
          <Link to="/" aria-label="Mefyx home" className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><ShieldCheck aria-hidden="true" className="size-7 text-emerald-300" />Mefyx<span className="text-emerald-300">.</span></Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
            {navigation.map((item) => <a key={item.href} href={item.href} className="transition-colors hover:text-emerald-300">{item.label}</a>)}
          </nav>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link to="/signin" className="hidden text-slate-300 hover:text-white sm:block">Sign in</Link>
            <Link to="/signup" className="hidden min-h-10 items-center gap-2 rounded-md bg-emerald-300 px-4 text-slate-950 transition-colors hover:bg-emerald-200 sm:inline-flex">Start Free <ArrowUpRight aria-hidden="true" className="size-4" /></Link>
            <details className="group md:hidden">
              <summary aria-label="Open navigation" className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md border border-white/15 [&::-webkit-details-marker]:hidden"><Menu aria-hidden="true" className="size-5" /></summary>
              <nav aria-label="Mobile navigation" className="absolute inset-x-0 top-20 flex flex-col gap-1 border-b border-white/15 bg-[#101923] p-5 shadow-xl">
                {navigation.map((item) => <a key={item.href} href={item.href} className="rounded-md px-3 py-3 hover:bg-white/5">{item.label}</a>)}
                <Link to="/security" className="rounded-md px-3 py-3 hover:bg-white/5">Security</Link>
                <Link to="/signin" className="rounded-md px-3 py-3 hover:bg-white/5">Sign in</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="flex flex-col justify-between gap-8 md:flex-row">
            <div className="max-w-xs"><Link to="/" className="inline-flex items-center gap-2 text-xl font-semibold"><ShieldCheck aria-hidden="true" className="size-5 text-emerald-300" /> Mefyx</Link><p className="mt-3 text-sm leading-6 text-slate-400">Security for AI apps and agents that touch money and sensitive data.</p></div>
            <nav aria-label="Footer navigation" className="flex flex-wrap items-start gap-x-7 gap-y-4 text-sm text-slate-300">
              {[['/security', 'Security'], ['/docs', 'Docs'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/refunds', 'Refunds']].map(([href, label]) => <Link key={href} to={href} className="hover:text-emerald-300">{label}</Link>)}
            </nav>
          </div>
          <p className="mt-10 border-t border-white/10 pt-6 text-xs text-slate-400">&copy; {new Date().getFullYear()} Mefyx. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
