import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  FileBarChart2,
  Key,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Terminal,
  Users2,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserDropdown } from './UserDropdown';

type SidebarItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  end?: boolean;
};

const primaryItems: SidebarItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/app', end: true },
  { icon: Terminal, label: 'Playground', path: '/app/playground', end: true },
];

const groupedItems: Array<{ title: string; items: SidebarItem[] }> = [
  {
    title: 'Security',
    items: [
      { icon: ShieldAlert, label: 'Threats', path: '/app/threats', end: true },
      { icon: ScrollText, label: 'Live Logs', path: '/app/logs', end: true },
      { icon: ClipboardList, label: 'Audit Logs', path: '/app/audit-logs', end: true },
      { icon: FileBarChart2, label: 'Reports & Alerts', path: '/app/reports', end: true },
    ],
  },
  {
    title: 'Analytics',
    items: [{ icon: BarChart3, label: 'Usage Analytics', path: '/app/usage-analytics', end: true }],
  },
  {
    title: 'Organization',
    items: [
      { icon: Users2, label: 'Team Management', path: '/app/team', end: true },
      { icon: CreditCard, label: 'Billing', path: '/app/billing', end: true },
    ],
  },
];

const utilityItems: SidebarItem[] = [
  { icon: Key, label: 'API Keys', path: '/app/api-keys', end: true },
  { icon: Settings, label: 'Settings', path: '/app/settings', end: true },
];

function renderSidebarLink(item: SidebarItem, onNavigate?: () => void) {
  const Icon = item.icon;

  return (
    <NavLink
      key={item.path}
      end={item.end}
      to={item.path}
      className={({ isActive }: { isActive: boolean }) =>
        cn(
          'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
          isActive
            ? 'bg-indigo-500/10 text-indigo-400'
            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-50',
        )
      }
      onClick={onNavigate}
    >
      <Icon className="mr-3 h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <Shield className="mr-3 h-6 w-6 shrink-0 text-indigo-500" />
        <span className="truncate text-lg font-bold tracking-tight">Mefyx AI</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-6">
          <div className="space-y-1">
            {primaryItems.map((item) => renderSidebarLink(item, onNavigate))}
          </div>

          <div className="mt-8 space-y-5">
            {groupedItems.map((group) => (
              <div key={group.title}>
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  {group.title}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => renderSidebarLink(item, onNavigate))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1 border-t border-white/10 px-3 py-4">
          {utilityItems.map((item) => renderSidebarLink(item, onNavigate))}
        </div>

        <div className="border-t border-white/10 p-4">
          <UserDropdown />
        </div>
      </div>
    </>
  );
}

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm transition-opacity lg:hidden',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onMobileClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] shrink-0 flex-col border-r border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Mobile navigation"
      >
        <button
          type="button"
          onClick={onMobileClose}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-slate-900/80 text-slate-300 transition hover:bg-slate-800 hover:text-white"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
        <SidebarContent onNavigate={onMobileClose} />
      </aside>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 shrink-0 flex-col border-r border-white/10 bg-slate-950/85 backdrop-blur-xl lg:flex">
        <SidebarContent />
      </aside>
    </>
  );
}
