import { KeyRound, LayoutDashboard, LockKeyhole, ScrollText, Settings, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/logs', label: 'Logs', icon: ScrollText },
  { to: '/admin/api-keys', label: 'API Keys', icon: KeyRound },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <div className="admin-brand__icon">
          <LockKeyhole size={18} />
        </div>
        <div>
          <div className="admin-brand__eyebrow">Sentinel Core</div>
          <div className="admin-brand__title">Admin Control</div>
        </div>
      </div>

      <nav className="admin-nav">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `admin-nav__link${isActive ? ' is-active' : ''}`}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="admin-sidebar__footer">
        <div className="admin-status-card">
          <span className="admin-status-card__label">Security posture</span>
          <strong>Admin JWT isolated</strong>
          <p>Dedicated token flow for control plane access.</p>
        </div>
      </div>
    </aside>
  );
}
