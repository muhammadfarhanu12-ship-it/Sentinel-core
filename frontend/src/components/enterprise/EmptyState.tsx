import type { ReactNode } from 'react';

import { Card, CardContent } from '../ui/Card';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed border-white/10 bg-slate-900/30">
      <CardContent className="flex flex-col items-center justify-center gap-4 py-14 text-center">
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-indigo-300">
          {icon}
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
          <p className="max-w-lg text-sm leading-6 text-slate-400">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
