import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE, requestPasswordReset } from '../../services/authApi';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [message, setMessage] = useState('We\'ve sent a password reset link to your email address.');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const data = await requestPasswordReset(email.trim());
      setMessage(String(data?.message || 'We\'ve sent a password reset link to your email address.'));
      setIsSubmitted(true);
    } catch (err: any) {
      setError(String(err?.message || AUTH_SERVICE_UNAVAILABLE_MESSAGE));
    } finally {
      setIsSubmitting(false);
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
          Reset your password
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-xl py-8 px-4 shadow-2xl border border-white/10 sm:rounded-2xl sm:px-10">
          {isSubmitted ? (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-clean/10 mb-4">
                <CheckCircle2 className="h-6 w-6 text-clean" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Check your email</h3>
              <p className="text-sm text-slate-400 mb-2">{message}</p>
              <p className="text-sm text-slate-400 mb-6">
                Requested for <span className="font-medium text-slate-300">{email}</span>.
              </p>
              <Link to="/signin">
                <Button className="w-full bg-slate-800 hover:bg-slate-700 text-white">
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="text-sm text-red-300 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
                  {error}
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
                <Button type="submit" disabled={isSubmitting} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                  Send reset link
                </Button>
              </div>

              <div className="text-center mt-4">
                <Link to="/signin" className="inline-flex items-center text-sm font-medium text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
