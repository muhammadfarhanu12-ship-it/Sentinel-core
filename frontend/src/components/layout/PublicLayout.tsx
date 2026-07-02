import { Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type PublicLayoutProps = {
  children: ReactNode;
};

const navLinkClass = 'hover:text-white transition-colors';
const footerLinkClass = 'hover:text-indigo-400 transition-colors';

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-md" aria-label="Public navigation">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2" aria-label="Mefyx home">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="text-xl font-bold tracking-tight">Mefyx</span>
          </Link>
          <div className="hidden md:flex items-center space-x-8 text-sm text-slate-300">
            <Link to="/features" className={navLinkClass}>Features</Link>
            <a href="/#how-it-works" className={navLinkClass}>How it Works</a>
            <Link to="/pricing" className={navLinkClass}>Pricing</Link>
            <Link to="/docs" className={navLinkClass}>Documentation</Link>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/signin" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Sign In</Link>
            <Link to="/signup" className="text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)]">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="bg-slate-950 border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center space-x-2 mb-4">
              <Shield className="w-5 h-5 text-indigo-400" />
              <span className="text-lg font-bold tracking-tight">Mefyx</span>
            </div>
            <p className="text-sm text-slate-500">
              The Firewall for AI Applications. Securing the next generation of software.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-slate-200 mb-4">Product</h2>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link to="/features" className={footerLinkClass}>Features</Link></li>
              <li><Link to="/pricing" className={footerLinkClass}>Pricing</Link></li>
              <li><a href="/#how-it-works" className={footerLinkClass}>How it Works</a></li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-slate-200 mb-4">Resources</h2>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link to="/docs" className={footerLinkClass}>Documentation</Link></li>
              <li><Link to="/docs#api-documentation" className={footerLinkClass}>API Reference</Link></li>
              <li><Link to="/blog" className={footerLinkClass}>Security Blog</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-slate-200 mb-4">Company</h2>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><Link to="/privacy-policy" className={footerLinkClass}>Privacy Policy</Link></li>
              <li><Link to="/terms-of-service" className={footerLinkClass}>Terms of Service</Link></li>
              <li><Link to="/contact" className={footerLinkClass}>Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-12 pt-8 border-t border-white/5 text-sm text-slate-600 flex flex-col md:flex-row justify-between items-center">
          <p>&copy; {new Date().getFullYear()} Mefyx Security Inc. All rights reserved.</p>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-clean" />
              <span>All systems operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
