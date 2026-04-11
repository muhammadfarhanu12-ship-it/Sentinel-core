import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Shield } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { setTokens } from '../../services/auth';
import { parseOAuthCallbackHash } from '../../services/oauth';

type CallbackState = 'loading' | 'success' | 'error';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallbackState>('loading');
  const [message, setMessage] = useState('Completing sign-in...');

  useEffect(() => {
    const result = parseOAuthCallbackHash(window.location.hash);

    if (result.error) {
      setStatus('error');
      setMessage(result.message || 'OAuth sign-in failed.');
      return;
    }

    if (!result.accessToken) {
      setStatus('error');
      setMessage('OAuth sign-in did not return an access token.');
      return;
    }

    setTokens(result.accessToken, result.refreshToken || undefined);
    setStatus('success');
    setMessage('Sign-in completed successfully. Redirecting...');

    const timeout = window.setTimeout(() => {
      navigate('/app', { replace: true });
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [navigate]);

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
          Social sign-in
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-xl py-8 px-4 shadow-2xl border border-white/10 sm:rounded-2xl sm:px-10 text-center">
          {status === 'loading' && (
            <>
              <div className="mx-auto h-12 w-12 rounded-full border-2 border-indigo-400/30 border-t-indigo-300 animate-spin mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">One moment</h3>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-clean/10 mb-4">
                <CheckCircle2 className="h-6 w-6 text-clean" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Signed in</h3>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-500/10 mb-4">
                <AlertTriangle className="h-6 w-6 text-red-300" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Sign-in failed</h3>
            </>
          )}

          <p className="text-sm text-slate-400 mb-6">{message}</p>

          <Link to="/signin">
            <Button className="w-full bg-slate-800 hover:bg-slate-700 text-white">
              Continue to sign in
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
