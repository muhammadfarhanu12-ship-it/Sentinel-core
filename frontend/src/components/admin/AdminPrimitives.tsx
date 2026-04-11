import React from 'react';
import { AlertCircle, Inbox } from 'lucide-react';

import { cn } from '@/lib/utils';

export function AdminPageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.28em] text-sky-300/80">{eyebrow}</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function AdminMetricCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'good' | 'danger' | 'info' | 'warning';
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.8)]">
      <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div
        className={cn(
          'mt-2 text-xs',
          tone === 'good' && 'text-emerald-300',
          tone === 'danger' && 'text-red-300',
          tone === 'info' && 'text-sky-300',
          tone === 'warning' && 'text-amber-300',
          tone === 'neutral' && 'text-slate-400',
        )}
      >
        {hint}
      </div>
    </div>
  );
}

export function AdminPanel({ title, description, actions, children }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/55 shadow-[0_22px_80px_-45px_rgba(15,23,42,0.9)]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function AdminEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="rounded-full border border-white/10 bg-white/5 p-3 text-slate-300">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}

export function AdminErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
      <div>{message}</div>
    </div>
  );
}

export function AdminStatusPill({ label, tone }: { label: string; tone: 'good' | 'danger' | 'warning' | 'info' | 'neutral' }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
        tone === 'good' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
        tone === 'danger' && 'border-red-500/20 bg-red-500/10 text-red-300',
        tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-300',
        tone === 'info' && 'border-sky-500/20 bg-sky-500/10 text-sky-300',
        tone === 'neutral' && 'border-white/10 bg-white/5 text-slate-300',
      )}
    >
      {label}
    </span>
  );
}
