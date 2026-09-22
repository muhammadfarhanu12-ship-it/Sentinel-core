import type { RemediationAction, RemediationActionStatus } from '../types';

export type { RemediationAction, RemediationActionStatus } from '../types';

export function normalizeRemediationActions(value: unknown): RemediationAction[] {
  if (!Array.isArray(value)) return [];
  return value.map((item): RemediationAction => {
    if (typeof item === 'string') {
      return { type: item.toUpperCase(), status: 'UNKNOWN', details: 'The action outcome was not recorded.' };
    }
    const record = item && typeof item === 'object' && !Array.isArray(item)
      ? item as Record<string, unknown>
      : {};
    const rawStatus = String(record.status ?? record.state ?? '').trim().toUpperCase();
    const details = record.details ?? record.detail;
    const status: RemediationActionStatus = rawStatus === 'SUCCESS' || rawStatus === 'SKIPPED'
      ? rawStatus
      : rawStatus === 'FAILED' || rawStatus === 'ERROR'
        ? 'FAILED'
        : 'UNKNOWN';
    return {
      type: String(record.type ?? record.action_type ?? record.name ?? 'ACTION_RECORDED').toUpperCase(),
      status,
      details: typeof details === 'string' && details.trim()
        ? details
        : status === 'UNKNOWN' ? 'The action outcome could not be verified.' : undefined,
      reason: typeof record.reason === 'string' ? record.reason : undefined,
    };
  });
}

export function remediationActionLabel(type: string): string {
  if (type === 'QUARANTINE_REQUEST') return 'Quarantine request';
  if (type === 'ALERT_EMAIL') return 'Email alert';
  if (type === 'ALERT_WEBHOOK') return 'Webhook alert';
  if (type === 'FORCE_2FA_VERIFICATION') return '2FA verification';
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function remediationStatusLabel(status: RemediationActionStatus): string {
  return status === 'UNKNOWN' ? 'Unverified' : status.charAt(0) + status.slice(1).toLowerCase();
}

export function remediationActionDetails(action: RemediationAction): string {
  return action.details || action.reason?.replace(/_/g, ' ').toLowerCase() || '';
}

export function remediationActionTrace(action: RemediationAction) {
  const details = remediationActionDetails(action);
  return {
    level: action.status === 'SUCCESS' ? 'ok' as const
      : action.status === 'FAILED' ? 'error' as const
        : action.status === 'SKIPPED' ? 'info' as const : 'warn' as const,
    message: `${remediationActionLabel(action.type)}: ${remediationStatusLabel(action.status)}${details ? ` — ${details}` : ''}`,
  };
}
