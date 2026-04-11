import type { ReactNode } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 24, stiffness: 220 }}
            className="fixed top-0 right-0 z-50 h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-slate-950/95 shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-slate-950/90 px-6 py-5 backdrop-blur-xl">
              <div>
                <h2 className="text-xl font-semibold text-slate-50">{title}</h2>
                {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-slate-900/70 p-2 text-slate-400 transition hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-6">{children}</div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
