import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE, verifyEmailToken } from '../../services/authApi';

type VerifyState = 'loading' | 'success' | 'error';

const verificationRequestCache = new Map<string, Promise<{ message?: string }>>();

function verifyEmailTokenOnce(token: string) {
  const cachedRequest = verificationRequestCache.get(token);
  if (cachedRequest) {
    return cachedRequest;
  }

  const request = verifyEmailToken(token);
  verificationRequestCache.set(token, request);
  return request;
}

export default function VerifyEmail() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [status, setStatus] = useState<VerifyState>('loading');
  const [message, setMessage] = useState('Verifying your email address...');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token) {
        if (cancelled) return;
        setStatus('error');
        setMessage('Invalid token');
        return;
      }

      try {
        const data = await verifyEmailTokenOnce(token);
        if (cancelled) return;
        setStatus('success');
        setMessage(String(data?.message || 'Email verified successfully.'));
        window.setTimeout(() => {
          if (!cancelled) navigate('/signin', { replace: true });
        }, 1800);
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setMessage(String(error instanceof Error ? error.message : AUTH_SERVICE_UNAVAILABLE_MESSAGE));
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [navigate, token]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Link to="/" className="flex justify-center items-center space-x-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
            <Shield className="w-6 h-6 text-emerald-300" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">Sentinel</span>
        </Link>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-white">
          Verify email
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-xl py-8 px-4 shadow-2xl border border-white/10 sm:rounded-2xl sm:px-10 text-center">
          {status === 'loading' && (
            <>
              <div className="mx-auto h-12 w-12 rounded-full border-2 border-emerald-400/30 border-t-emerald-300 animate-spin mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">One moment</h3>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-clean/10 mb-4">
                <CheckCircle2 className="h-6 w-6 text-clean" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Email verified</h3>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-500/10 mb-4">
                <AlertTriangle className="h-6 w-6 text-red-300" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Verification failed</h3>
            </>
          )}

          <p className="text-sm text-slate-400 mb-6">{message}</p>
          {status === 'success' && (
            <p className="text-xs text-slate-500 mb-4">Redirecting to sign in…</p>
          )}

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
