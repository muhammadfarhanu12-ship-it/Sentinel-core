import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Shield, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  getPasswordPolicyError,
  PASSWORD_POLICY_HINT,
  resetPasswordWithToken,
} from '../../services/authApi';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Your password has been reset successfully. You can sign in with your new password now.');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is missing a token.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await resetPasswordWithToken(token, password);
      setSuccessMessage(String(data?.message || 'Your password has been reset successfully. You can sign in with your new password now.'));
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
          Choose a new password
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Reset your password with the secure link from your email.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-xl py-8 px-4 shadow-2xl border border-white/10 sm:rounded-2xl sm:px-10">
          {isSubmitted ? (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-clean/10 mb-4">
                <CheckCircle2 className="h-6 w-6 text-clean" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Password updated</h3>
              <p className="text-sm text-slate-400 mb-6">{successMessage}</p>
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
                <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                  New password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-500" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e: any) => setPassword(e.target.value)}
                    className="block w-full pl-10 bg-slate-950/50 border border-white/10 rounded-lg py-2.5 text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                    placeholder="At least 12 characters"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">{PASSWORD_POLICY_HINT}</p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">
                  Confirm password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-500" />
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e: any) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-10 bg-slate-950/50 border border-white/10 rounded-lg py-2.5 text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm transition-all"
                    placeholder="Repeat your password"
                  />
                </div>
              </div>

              <div>
                <Button type="submit" disabled={isSubmitting} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                  Save new password
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
