import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Navigate, Routes, Route } from 'react-router-dom';
import AdminLayout from './components/admin/AdminLayout';
import { AppLayout } from './components/layout/AppLayout';
import ProtectedAdminRoute from './components/auth/ProtectedAdminRoute';
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
import AdminApiKeys from '@admin/AdminApiKeys';
import AdminLogin from '@admin/AdminLogin';
import AdminLogs from '@admin/AdminLogs';
import AdminMetrics from '@admin/AdminMetrics';
import AdminPortal from '@admin/AdminPortal';
import AdminSettings from '@admin/AdminSettings';
import AdminThreats from '@admin/AdminThreats';
import AdminUsers from '@admin/AdminUsers';
import SignIn from './pages/auth/SignIn';
import SignUp from './pages/auth/SignUp';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import OAuthCallback from './pages/auth/OAuthCallback';
import VerifyEmail from './pages/auth/VerifyEmail';
import { getAdminToken } from './services/adminAuth';

const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const UsageAnalytics = lazy(() => import('./pages/UsageAnalytics'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));

function RouteFallback() {
  return <LoadingSkeleton rows={2} compact />;
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
          <Route path="/admin" element={<Navigate to={getAdminToken() ? '/admin/dashboard' : '/admin/login'} replace />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<ProtectedAdminRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="dashboard" element={<AdminPortal />} />
              <Route path="metrics" element={<AdminMetrics />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="logs" element={<AdminLogs />} />
              <Route path="threats" element={<AdminThreats />} />
              <Route path="api-keys" element={<AdminApiKeys />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
          </Route>
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
