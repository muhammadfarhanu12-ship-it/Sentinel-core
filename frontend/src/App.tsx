import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LoadingSkeleton } from './components/enterprise/LoadingSkeleton';
import { ScrollToTop } from './components/ScrollToTop';
import { RobotsMeta } from './components/SEO';
import { ToastProvider } from './components/ui/ToastProvider';
import LandingPage from './pages/LandingPage';
import { ADMIN_APP_ORIGIN } from './services/api';

const AppLayout = lazy(() => import('./components/layout/AppLayout').then((module) => ({ default: module.AppLayout })));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Logs = lazy(() => import('./pages/Logs'));
const ApiKeys = lazy(() => import('./pages/ApiKeys'));
const Billing = lazy(() => import('./pages/Billing'));
const Settings = lazy(() => import('./pages/Settings'));
const Documentation = lazy(() => import('./pages/Documentation'));
const Playground = lazy(() => import('./pages/Playground'));
const Reports = lazy(() => import('./pages/Reports'));
const Threats = lazy(() => import('./pages/Threats'));
const Security = lazy(() => import('./pages/Security'));
const Features = lazy(() => import('./pages/Features'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Docs = lazy(() => import('./pages/Docs'));
const Blog = lazy(() => import('./pages/Blog'));
const Contact = lazy(() => import('./pages/Contact'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const SignIn = lazy(() => import('./pages/auth/SignIn'));
const SignUp = lazy(() => import('./pages/auth/SignUp'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const OAuthCallback = lazy(() => import('./pages/auth/OAuthCallback'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const UsageAnalytics = lazy(() => import('./pages/UsageAnalytics'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));

function RouteFallback() {
  return <LoadingSkeleton rows={2} compact />;
}

function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function NoIndexRoute({ children }: { children: ReactNode }) {
  return (
    <>
      <RobotsMeta />
      <RouteSuspense>{children}</RouteSuspense>
    </>
  );
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
        <RouteSuspense>
          <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/security" element={<Security />} />
          <Route path="/features" element={<Features />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy canonicalPath="/privacy-policy" />} />
          <Route path="/refunds" element={<RefundPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/terms-of-service" element={<TermsOfService canonicalPath="/terms-of-service" />} />
          <Route path="/signin" element={<NoIndexRoute><SignIn /></NoIndexRoute>} />
          <Route path="/signup" element={<NoIndexRoute><SignUp /></NoIndexRoute>} />
          <Route path="/forgot-password" element={<NoIndexRoute><ForgotPassword /></NoIndexRoute>} />
          <Route path="/reset-password" element={<NoIndexRoute><ResetPassword /></NoIndexRoute>} />
          <Route path="/reset" element={<NoIndexRoute><ResetPassword /></NoIndexRoute>} />
          <Route path="/oauth/callback" element={<NoIndexRoute><OAuthCallback /></NoIndexRoute>} />
          <Route path="/verify-email" element={<NoIndexRoute><VerifyEmail /></NoIndexRoute>} />
          <Route path="/verify" element={<NoIndexRoute><VerifyEmail /></NoIndexRoute>} />
          <Route path="/admin/*" element={<NoIndexRoute><AdminAppRedirect /></NoIndexRoute>} />
          <Route path="/app" element={<NoIndexRoute><AppLayout /></NoIndexRoute>}>
            <Route index element={<RouteSuspense><Dashboard /></RouteSuspense>} />
            <Route path="playground" element={<RouteSuspense><Playground /></RouteSuspense>} />
            <Route path="threats" element={<RouteSuspense><Threats /></RouteSuspense>} />
            <Route path="logs" element={<RouteSuspense><Logs /></RouteSuspense>} />
            <Route path="reports" element={<RouteSuspense><Reports /></RouteSuspense>} />
            <Route path="audit-logs" element={<RouteSuspense><AuditLogs /></RouteSuspense>} />
            <Route path="usage-analytics" element={<RouteSuspense><UsageAnalytics /></RouteSuspense>} />
            <Route path="team" element={<RouteSuspense><TeamManagement /></RouteSuspense>} />
            <Route path="team-management" element={<Navigate to="/app/team" replace />} />
            <Route path="api-keys" element={<RouteSuspense><ApiKeys /></RouteSuspense>} />
            <Route path="billing" element={<RouteSuspense><Billing /></RouteSuspense>} />
            <Route path="docs" element={<RouteSuspense><Documentation /></RouteSuspense>} />
            <Route path="settings" element={<RouteSuspense><Settings /></RouteSuspense>} />
          </Route>
          </Routes>
        </RouteSuspense>
      </Router>
    </ToastProvider>
  );
}
