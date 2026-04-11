import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type AdminToastTone = 'success' | 'error' | 'info';

type AdminToast = {
  id: number;
  title: string;
  description?: string;
  tone: AdminToastTone;
};

type AdminToastContextValue = {
  pushToast: (toast: Omit<AdminToast, 'id'>) => void;
};

const AdminToastContext = createContext<AdminToastContextValue | null>(null);

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<AdminToast[]>([]);

  const value = useMemo<AdminToastContextValue>(
    () => ({
      pushToast(toast) {
        setToasts((current) => [...current, { ...toast, id: Date.now() + Math.floor(Math.random() * 1000) }]);
      },
    }),
    [],
  );

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  return (
    <AdminToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div key={toast.id} className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${
            toast.tone === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-50'
              : toast.tone === 'error'
                ? 'border-red-500/20 bg-red-500/10 text-red-50'
                : 'border-sky-500/20 bg-sky-500/10 text-sky-50'
          }`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {toast.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : toast.tone === 'error' ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{toast.title}</div>
                {toast.description && <div className="mt-1 text-xs text-white/75">{toast.description}</div>}
              </div>
              <button
                className="rounded p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </AdminToastContext.Provider>
  );
}

export function useAdminToast() {
  const context = useContext(AdminToastContext);
  if (!context) throw new Error('useAdminToast must be used inside AdminToastProvider');
  return context;
}
