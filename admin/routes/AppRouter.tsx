import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import AdminLayout from '../components/layout/AdminLayout';
import ProtectedRoute from './ProtectedRoute';
import AdminApiKeys from '../pages/AdminApiKeys';
import AdminAuditLogs from '../pages/AdminAuditLogs';
import AdminDashboard from '../pages/AdminDashboard';
import AdminForgotPassword from '../pages/AdminForgotPassword';
import AdminLogin from '../pages/AdminLogin';
import AdminLogs from '../pages/AdminLogs';
import AdminMetrics from '../pages/AdminMetrics';
import AdminReports from '../pages/AdminReports';
import AdminSettingsPage from '../pages/AdminSettings';
import AdminSignup from '../pages/AdminSignup';
import AdminThreats from '../pages/AdminThreats';
import AdminUsers from '../pages/AdminUsers';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/signup" element={<AdminSignup />} />
        <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />

        <Route path="/admin" element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="metrics" element={<AdminMetrics />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="logs" element={<AdminLogs />} />
            <Route path="threats" element={<AdminThreats />} />
            <Route path="audit-logs" element={<AdminAuditLogs />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="api-keys" element={<AdminApiKeys />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
