import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { clearAdminToken, getAdminToken, onAdminAuthStorageChange } from '../lib/auth';
import { verifyAdminSession } from '../lib/adminService';

export default function ProtectedRoute() {
  const location = useLocation();
  const [guardState, setGuardState] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let cancelled = false;

    const runGuard = async () => {
      const token = getAdminToken();
      if (!token) {
        if (!cancelled) setGuardState('denied');
        return;
      }

      try {
        await verifyAdminSession(token);
        if (!cancelled) setGuardState('allowed');
      } catch {
        clearAdminToken();
        if (!cancelled) setGuardState('denied');
      }
    };

    void runGuard();
    const unsubscribe = onAdminAuthStorageChange(() => {
      if (!getAdminToken()) {
        setGuardState('denied');
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (guardState === 'checking') {
    return null;
  }

  if (guardState !== 'allowed') {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
