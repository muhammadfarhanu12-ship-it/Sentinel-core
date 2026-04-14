import { useState, useRef, useEffect } from 'react';
import { Bell, ShieldAlert, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { useStore } from '../../stores/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { safeFormatDate } from '../../lib/date';

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasSeen, setHasSeen] = useState(false);
  const { notifications, markAllNotificationsRead, markNotificationRead } = useStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const alerts = notifications.slice(0, 5);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setHasSeen(true);
    }
  };

  // Reset hasSeen if new alerts come in (simplified: just check if length increases, but for now we'll just show it if there are alerts and not seen)
  useEffect(() => {
    if (unreadCount > 0) {
      setHasSeen(false);
    }
  }, [notifications[0]?.id]); // Trigger when a new notification arrives

  return (
    <div className="relative" ref={dropdownRef}>
      <Button variant="ghost" size="icon" className="relative" onClick={handleOpen}>
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && !hasSeen && (
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="p-4 border-b border-white/10 bg-slate-950/50 flex items-center justify-between">
              <h3 className="font-semibold text-slate-200">Notifications</h3>
              <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                {unreadCount} Unread
              </span>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">
                  No recent alerts.
                </div>
              ) : (
                alerts.map(alert => {
                  const notificationType = String(alert.type || '').toUpperCase();
                  const isRemediation = notificationType === 'REMEDIATION';

                  return (
                    <button
                      key={alert.id}
                      onClick={() => markNotificationRead(alert.id)}
                      className="w-full text-left p-4 border-b border-white/5 hover:bg-slate-800/50 transition-colors flex items-start space-x-3"
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${isRemediation ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                        {isRemediation ? <ShieldAlert className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {alert.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {alert.message}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                          {safeFormatDate(alert.timestamp || alert.created_at)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className="p-2 border-t border-white/10 bg-slate-950/50">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 text-xs text-slate-400 hover:text-slate-200"
                  onClick={() => markAllNotificationsRead()}
                >
                  Mark all read
                </Button>
                <Link to="/app/logs" onClick={() => setIsOpen(false)} className="flex-1">
                <Button variant="ghost" className="w-full text-xs text-slate-400 hover:text-slate-200">
                  View All Logs
                </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
