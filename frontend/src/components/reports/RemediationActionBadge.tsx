import { CheckCircle2, CircleHelp, SkipForward, XCircle } from 'lucide-react';

import {
  remediationActionDetails,
  remediationActionLabel,
  remediationStatusLabel,
  type RemediationAction,
} from '../../lib/remediationActions';
import { cn } from '../../lib/utils';

const STATUS_PRESENTATION = {
  SUCCESS: { icon: CheckCircle2, className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' },
  FAILED: { icon: XCircle, className: 'border-red-400/30 bg-red-500/10 text-red-200' },
  SKIPPED: { icon: SkipForward, className: 'border-amber-400/30 bg-amber-500/10 text-amber-200' },
  UNKNOWN: { icon: CircleHelp, className: 'border-slate-400/30 bg-slate-500/10 text-slate-300' },
};

export function RemediationActionBadge({ action, showDetails = false }: { action: RemediationAction; showDetails?: boolean }) {
  const { icon: Icon, className } = STATUS_PRESENTATION[action.status];
  const details = remediationActionDetails(action);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <span
        className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', className)}
        title={details || undefined}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{remediationActionLabel(action.type)}: {remediationStatusLabel(action.status)}</span>
      </span>
      {showDetails && details ? <span className="break-words text-xs text-slate-400">{details}</span> : null}
    </span>
  );
}
