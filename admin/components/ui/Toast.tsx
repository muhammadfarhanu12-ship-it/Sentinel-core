import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

import { useToast } from '../../hooks/useToast';

export function ToastViewport() {
  const { dismiss, toasts } = useToast();

  return (
    <div className="admin-toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`admin-toast admin-toast--${toast.tone}`}>
          <div className="admin-toast__icon">
            {toast.tone === 'success' ? <CheckCircle2 size={18} /> : toast.tone === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
          </div>
          <div className="admin-toast__body">
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>
          <button className="admin-toast__close" onClick={() => dismiss(toast.id)} type="button">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
