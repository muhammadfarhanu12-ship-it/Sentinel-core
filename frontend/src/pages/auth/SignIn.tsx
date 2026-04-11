import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Mail, Lock, ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { setDisplayName, setTokens } from '../../services/auth';
import {
  AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  isEmailVerificationRequired,
  resendVerificationEmail,
  signInWithEmail,
} from '../../services/authApi';
const SOCIAL_AUTH_ENABLED = import.meta.env.VITE_ENABLE_SOCIAL_AUTH === 'true';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const navigate = useNavigate();
  const canResendVerification = isEmailVerificationRequired(error);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setIsSubmitting(true);
    try {
      const data = await signInWithEmail(email.trim(), password);

      if (data?.user?.name) {
        setDisplayName(String(data.user.name));
      } else if (data?.user?.email) {
        setDisplayName(String(data.user.email).split('@')[0]);
      }
      setTokens(String(data.access_token), data.refresh_token ? String(data.refresh_token) : undefined);
      navigate('/app', { replace: true });
      // Extra safety: reset scroll immediately after redirect (the global ScrollToTop also handles route changes).
      requestAnimationFrame(() => {
        try {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        } catch {
          window.scrollTo(0, 0);
        }
        const container = document.querySelector('#app-scroll-container') as HTMLElement | null;
        if (container) container.scrollTop = 0;
      });
    } catch (err: any) {
      setError(String(err?.message || AUTH_SERVICE_UNAVAILABLE_MESSAGE));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }

    setIsResending(true);
    setError(null);
    setInfo(null);
    try {
      const data = await resendVerificationEmail(email.trim());
      setInfo(String(data?.message || 'A new verification email has been sent.'));
    } catch (err: any) {
      setError(String(err?.message || AUTH_SERVICE_UNAVAILABLE_MESSAGE));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Link to="/" className="flex justify-center items-center space-x-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <Shield className="w-6 h-6 text-indigo-400" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">Sentinel</span>
        </Link>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-white">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Or{' '}
          <Link to="/signup" className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
            create a new account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-xl py-8 px-4 shadow-2xl border border-white/10 sm:rounded-2xl sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="text-sm text-red-300 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {info && (
              <div className="text-sm text-emerald-200 bg-emerald-900/20 border border-emerald-900/40 rounded-lg px-3 py-2">
                {info}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email address
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e: any) => setEmail(e.target.value)}
                  className="block w-full pl-10 bg-slate-950/50 border border-white/10 rounded-lg py-2.5 text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e: any) => setPassword(e.target.value)}
                  className="block w-full pl-10 bg-slate-950/50 border border-white/10 rounded-lg py-2.5 text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/10 bg-slate-950/50 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-400">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <Link to="/forgot-password" className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                  Forgot your password?
                </Link>
              </div>
            </div>

            <div>
              <Button type="submit" disabled={isSubmitting} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                Sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {canResendVerification && (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isResending}
                  onClick={handleResendVerification}
                  className="w-full border-white/10 bg-slate-950/50 hover:bg-slate-800 text-slate-300"
                >
                  Resend verification email
                </Button>
              </div>
            )}
          </form>

          {SOCIAL_AUTH_ENABLED && (
            <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-900 text-slate-500">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                disabled
                className="w-full border-white/10 bg-slate-950/50 hover:bg-slate-800 text-slate-300"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled
                className="w-full border-white/10 bg-slate-950/50 hover:bg-slate-800 text-slate-300"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                  <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 4.64 3.01 8.58 7.18 9.97.52.1.7-.22.7-.5v-1.94c-2.92.64-3.53-1.24-3.53-1.24-.48-1.2-1.16-1.52-1.16-1.52-.95-.65.07-.64.07-.64 1.05.08 1.6 1.08 1.6 1.08.94 1.6 2.46 1.14 3.06.87.09-.68.37-1.14.67-1.4-2.33-.26-4.77-1.16-4.77-5.18 0-1.14.4-2.07 1.08-2.8-.11-.26-.47-1.32.1-2.75 0 0 .88-.28 2.88 1.07a9.9 9.9 0 0 1 5.24 0c2-1.35 2.88-1.07 2.88-1.07.57 1.43.21 2.49.1 2.75.67.73 1.08 1.66 1.08 2.8 0 4.03-2.45 4.92-4.79 5.17.38.33.72.98.72 1.98v2.94c0 .28.18.61.71.5A10.5 10.5 0 0 0 22.5 12c0-5.8-4.7-10.5-10.5-10.5Z" />
                </svg>
                GitHub
              </Button>
            </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
