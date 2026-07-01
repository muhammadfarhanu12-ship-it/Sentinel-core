import { Menu, Search, Shield } from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <header className="sticky top-0 z-20 h-16 shrink-0 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-400 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-900/60 text-slate-300 transition hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 items-center gap-2 sm:hidden">
            <Shield className="h-5 w-5 shrink-0 text-indigo-500" />
            <span className="truncate text-sm font-semibold">Mefyx</span>
          </div>
          <div className="relative hidden w-full max-w-xs sm:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search logs, keys..."
              className="w-full rounded-md border border-white/10 bg-slate-900/50 py-2 pl-9 pr-4 text-sm text-slate-200 placeholder:text-slate-500 transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center space-x-3 sm:space-x-4">
          <div className="hidden items-center space-x-2 text-sm text-slate-400 sm:flex">
            <span className="h-2 w-2 rounded-full bg-clean animate-pulse"></span>
            <span>Gateway Active</span>
          </div>
          <div className="hidden h-4 w-px bg-white/10 sm:block"></div>
          <NotificationDropdown />
        </div>
      </div>
    </header>
  );
}
