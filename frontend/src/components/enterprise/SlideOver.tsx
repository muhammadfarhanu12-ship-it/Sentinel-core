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
            className="fixed right-0 top-0 z-50 h-full w-full max-w-[calc(100vw-0.75rem)] overflow-y-auto border-l border-white/10 bg-slate-950/95 shadow-2xl sm:max-w-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur-xl sm:px-6 sm:py-5">
              <div className="min-w-0">
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
            <div className="min-w-0 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
