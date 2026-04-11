import { useState, useRef, useEffect } from 'react';
import { LogOut, Settings, User } from 'lucide-react';
import { useStore } from '../../stores/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { clearTokens, getRefreshToken } from '../../services/auth';
import { logoutFromServer } from '../../services/authApi';

export function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, disconnectRealtime } = useStore();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;
  const handleLogout = async () => {
    try {
      await logoutFromServer(getRefreshToken());
    } catch {
      // Client-side token removal is still sufficient for logout UX.
    } finally {
      disconnectRealtime();
      clearTokens();
      setIsOpen(false);
      navigate('/signin', { replace: true });
    }
  };

  const displayName = user.name || user.email;
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        className="flex items-center px-3 py-2 rounded-md bg-slate-900/50 border border-white/5 cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs mr-3">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{displayName}</p>
          <p className="text-xs text-slate-500 truncate">{user.tier} Tier</p>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-full bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="p-3 border-b border-white/10">
              <p className="text-sm font-medium text-slate-200">{displayName}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
            <div className="p-1">
              <Link to="/app/settings" className="flex items-center px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-md transition-colors" onClick={() => setIsOpen(false)}>
                <User className="w-4 h-4 mr-2" />
                Profile
              </Link>
              <Link to="/app/settings" className="flex items-center px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-md transition-colors" onClick={() => setIsOpen(false)}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Link>
            </div>
            <div className="p-1 border-t border-white/10">
              <button
                type="button"
                className="flex items-center px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
