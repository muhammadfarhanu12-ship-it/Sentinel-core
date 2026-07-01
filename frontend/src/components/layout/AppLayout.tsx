import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { LoadingSkeleton } from '../enterprise/LoadingSkeleton';
import { useStore } from '../../stores/useStore';
import { hasStoredSession, onAuthStorageChange } from '../../services/auth';

export function AppLayout() {
  const initSocket = useStore((state) => state.initSocket);
  const disconnectRealtime = useStore((state) => state.disconnectRealtime);
  const loadMe = useStore((state) => state.loadMe);
  const location = useLocation();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
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

  useEffect(() => {
    return onAuthStorageChange(() => {
      if (!hasStoredSession()) {
        disconnectRealtime();
        setAuthState('redirect');
      }
    });
  }, [disconnectRealtime]);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  if (!hasStoredSession() || authState === 'redirect') {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }

  if (authState !== 'ready') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col px-4 py-6 sm:px-6 lg:px-8">
          <LoadingSkeleton rows={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
      <Sidebar mobileOpen={isMobileSidebarOpen} onMobileClose={() => setIsMobileSidebarOpen(false)} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        <Header onMenuClick={() => setIsMobileSidebarOpen(true)} />
        <main
          id="app-scroll-container"
          data-scroll-container="app"
          className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col items-stretch justify-start px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
