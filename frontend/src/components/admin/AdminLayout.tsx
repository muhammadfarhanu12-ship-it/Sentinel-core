import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldAlert,
  TerminalSquare,
  Users,
} from 'lucide-react';

import { clearAdminToken } from '@/services/adminAuth';
import { AdminToastProvider } from './AdminToastProvider';

const navigation = [
  { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/metrics', label: 'Metrics', icon: Gauge },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/logs', label: 'Logs', icon: TerminalSquare },
  { to: '/admin/threats', label: 'Threats', icon: ShieldAlert },
  { to: '/admin/api-keys', label: 'API Keys', icon: KeyRound },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <AdminToastProvider>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(239,68,68,0.14),_transparent_30%),linear-gradient(180deg,_#020617_0%,_#081120_52%,_#030712_100%)] text-slate-50">
        <div className="mx-auto flex min-h-screen max-w-[1600px]">
          <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-slate-950/70 px-5 py-6 backdrop-blur-xl lg:block">
            <div className="rounded-2xl border border-red-500/15 bg-red-500/8 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-2 text-red-300">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-[0.18em] text-red-200/90">SENTINEL ADMIN</div>
                  <div className="text-xs text-slate-400">Isolated control plane</div>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-400">
                Dedicated administration surface with separate token handling, audit logging, and backend-only control paths.
              </p>
            </div>

            <nav className="mt-6 space-y-1.5">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }: any) =>
                      `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                        isActive
                          ? 'border border-sky-400/15 bg-sky-500/10 text-white shadow-[0_0_0_1px_rgba(14,165,233,0.1)]'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Activity className="h-4 w-4 text-emerald-300" />
                Control plane online
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Admin routes reject user JWTs and rely only on `admin_token`.
              </p>
            </div>
          </aside>

          <div className="flex min-h-screen flex-1 flex-col">
            <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/55 px-4 py-4 backdrop-blur-xl sm:px-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-sky-300/80">Admin surface</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {navigation.find((item) => location.pathname.startsWith(item.to))?.label || 'Dashboard'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 md:block">
                    Dedicated admin JWT
                  </div>
                  <button
                    onClick={() => {
                      clearAdminToken();
                      navigate('/admin/login', { replace: true });
                    }}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname.startsWith(item.to);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition ${
                        active
                          ? 'border-sky-400/25 bg-sky-500/10 text-white'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </header>

            <main className="flex-1 px-4 py-6 sm:px-6">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </AdminToastProvider>
  );
}
