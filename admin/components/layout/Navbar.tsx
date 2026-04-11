import { LogOut, ShieldAlert } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { clearAdminToken } from '../../lib/auth';

const titleMap: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/users': 'User Management',
  '/admin/logs': 'Security Logs',
  '/admin/api-keys': 'API Key Management',
  '/admin/settings': 'Admin Settings',
};

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();

  const title = titleMap[location.pathname] ?? 'Admin';

  return (
    <header className="admin-navbar">
      <div>
        <p className="admin-navbar__eyebrow">Cybersecurity SaaS control plane</p>
        <h1 className="admin-navbar__title">{title}</h1>
      </div>

      <div className="admin-navbar__actions">
        <div className="admin-navbar__status">
          <ShieldAlert size={16} />
          <span>Protected admin session</span>
        </div>

        <button
          className="admin-button admin-button--ghost"
          onClick={() => {
            clearAdminToken();
            navigate('/admin/login', { replace: true });
          }}
          type="button"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </header>
  );
}
