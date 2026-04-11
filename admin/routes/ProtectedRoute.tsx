import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { isAdminAuthenticated } from '../lib/auth';

export default function ProtectedRoute() {
  const location = useLocation();

  if (!isAdminAuthenticated()) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
