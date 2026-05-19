import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { clearAdminToken, getAdminToken, verifyAdminSessionToken } from '../../services/adminAuth';

export default function ProtectedAdminRoute() {
  const location = useLocation();
  const [guardState, setGuardState] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = getAdminToken();
      if (!token) {
        if (!cancelled) setGuardState('denied');
        return;
      }

      const isValid = await verifyAdminSessionToken(token);
      if (!isValid) {
        clearAdminToken();
        if (!cancelled) setGuardState('denied');
        return;
      }

      if (!cancelled) setGuardState('allowed');
    })();

    return () => {
      cancelled = true;
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
