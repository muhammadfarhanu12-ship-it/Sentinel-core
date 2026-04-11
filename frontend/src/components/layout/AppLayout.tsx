import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { LoadingSkeleton } from '../enterprise/LoadingSkeleton';
import { useStore } from '../../stores/useStore';
import { hasStoredSession } from '../../services/auth';

export function AppLayout() {
  const initSocket = useStore((state) => state.initSocket);
  const disconnectRealtime = useStore((state) => state.disconnectRealtime);
  const loadMe = useStore((state) => state.loadMe);
  const location = useLocation();
  const [authState, setAuthState] = useState<'checking' | 'ready' | 'redirect'>(() =>
    hasStoredSession() ? 'checking' : 'redirect',
  );

  useEffect(() => {
    if (!hasStoredSession()) {
      disconnectRealtime();
      setAuthState('redirect');
      return;
    }

    let cancelled = false;
    setAuthState('checking');

    void (async () => {
      const isAuthenticated = await loadMe();
      if (cancelled) return;

      if (!isAuthenticated) {
        setAuthState('redirect');
        return;
      }

      initSocket();
      setAuthState('ready');
    })();

    return () => {
      cancelled = true;
      disconnectRealtime();
    };
  }, [disconnectRealtime, initSocket, loadMe]);

  if (!hasStoredSession() || authState === 'redirect') {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }

  if (authState !== 'ready') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col px-4 py-6 sm:px-6 lg:px-8">
          <LoadingSkeleton rows={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        <Header />
        <main
          id="app-scroll-container"
          data-scroll-container="app"
          className="flex-1 overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto flex w-full max-w-[1600px] flex-col items-stretch justify-start px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
