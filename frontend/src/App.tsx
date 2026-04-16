import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LoadingSkeleton } from './components/enterprise/LoadingSkeleton';
import { ScrollToTop } from './components/ScrollToTop';
import { ToastProvider } from './components/ui/ToastProvider';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import ApiKeys from './pages/ApiKeys';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import Documentation from './pages/Documentation';
import Playground from './pages/Playground';
import Reports from './pages/Reports';
import LandingPage from './pages/LandingPage';
import SignIn from './pages/auth/SignIn';
import SignUp from './pages/auth/SignUp';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import OAuthCallback from './pages/auth/OAuthCallback';
import VerifyEmail from './pages/auth/VerifyEmail';
import { ADMIN_APP_ORIGIN } from './services/api';

const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const UsageAnalytics = lazy(() => import('./pages/UsageAnalytics'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));

function RouteFallback() {
  return <LoadingSkeleton rows={2} compact />;
}

function AdminAppRedirect() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname === '/admin' ? '/admin/login' : location.pathname;
    const destination = `${ADMIN_APP_ORIGIN}${pathname}${location.search}${location.hash}`;
    window.location.replace(destination);
  }, [location]);

  return <RouteFallback />;
}

export default function App() {
  return (
    <ToastProvider>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/admin/*" element={<AdminAppRedirect />} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="playground" element={<Playground />} />
            <Route path="threats" element={<Reports />} />
            <Route path="logs" element={<Logs />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit-logs" element={<Suspense fallback={<RouteFallback />}><AuditLogs /></Suspense>} />
            <Route path="usage-analytics" element={<Suspense fallback={<RouteFallback />}><UsageAnalytics /></Suspense>} />
            <Route path="team" element={<Suspense fallback={<RouteFallback />}><TeamManagement /></Suspense>} />
            <Route path="team-management" element={<Navigate to="/app/team" replace />} />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route path="billing" element={<Billing />} />
            <Route path="docs" element={<Documentation />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </ToastProvider>
  );
}
