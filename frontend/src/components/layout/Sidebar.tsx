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

function renderSidebarLink(item: SidebarItem) {
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
    >
      <Icon className="w-4 h-4 mr-3" />
      {item.label}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 shrink-0 flex-col border-r border-white/10 bg-slate-950/85 backdrop-blur-xl lg:flex">
      <div className="h-16 flex items-center px-6 border-b border-white/10">
        <Shield className="w-6 h-6 text-indigo-500 mr-3" />
        <span className="font-bold text-lg tracking-tight">Sentinel</span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto px-3 py-6">
          <div className="space-y-1">
            {primaryItems.map(renderSidebarLink)}
          </div>

          <div className="mt-8 space-y-5">
            {groupedItems.map((group) => (
              <div key={group.title}>
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  {group.title}
                </div>
                <div className="space-y-1">
                  {group.items.map(renderSidebarLink)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 px-3 py-4 space-y-1">
          {utilityItems.map(renderSidebarLink)}
        </div>

        <div className="p-4 border-t border-white/10">
          <UserDropdown />
        </div>
      </div>
    </aside>
  );
}
