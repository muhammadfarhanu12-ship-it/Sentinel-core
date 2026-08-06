export type SecurityNoticeTone = 'info' | 'warning' | 'critical';

export type SecurityNotice = {
  code: string;
  tone: SecurityNoticeTone;
  title: string;
  message: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function getSecurityNoticeFromScanResult(payload: unknown): SecurityNotice | null {
  const record = asRecord(payload);
  const securityState = asRecord(record.security_state);
  const status = String(record.status || '').toUpperCase();
  const threatType = String(record.threat_type || 'UNKNOWN').replace(/_/g, ' ');

  if (securityState.mfa_required === true) {
    return {
      code: 'mfa_required',
      tone: 'warning',
      title: 'MFA Required',
      message: 'A second-factor code is required before this sensitive tool action can continue.',
    };
  }

  if (securityState.blocked_request === true || status === 'BLOCKED') {
    return {
      code: 'blocked_request',
      tone: 'critical',
      title: 'Request Blocked',
      message: `Mefyx Gateway blocked this request due to ${threatType.toLowerCase()} risk.`,
    };
  }

  if (securityState.suspicious_activity_detected === true || status === 'REDACTED') {
    return {
      code: 'suspicious_activity',
      tone: 'warning',
      title: 'Suspicious Activity Detected',
      message: 'Mefyx Gateway flagged this request and applied additional safeguards.',
    };
  }

  return null;
}

export function getSecurityNoticeFromError(message: string, status?: number): SecurityNotice | null {
  const normalized = String(message || '').toLowerCase();
  if (!normalized && !status) return null;

  if (
    status === 503 ||
    normalized.includes('server unavailable') ||
    normalized.includes('unable to reach') ||
    normalized.includes('backend connection lost') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('cors')
  ) {
    return {
      code: 'backend_unavailable',
      tone: 'critical',
      title: 'Backend Connection Lost',
      message: 'The backend is unreachable. Your session was blocked until the server is available again.',
    };
  }

  if (status === 401 || normalized.includes('not authenticated') || normalized.includes('session expired')) {
    return {
      code: 'session_expired',
      tone: 'warning',
      title: 'Session Expired',
      message: 'Please sign in again to continue.',
    };
  }

  if (status === 403 || normalized.includes('admin access required') || normalized.includes('insufficient')) {
    return {
      code: 'insufficient_permissions',
      tone: 'warning',
      title: 'Insufficient Permissions',
      message: 'Your account does not have permission for this action.',
    };
  }

  if (normalized.includes('email not verified') || normalized.includes('verify your email')) {
    return {
      code: 'verification_required',
      tone: 'info',
      title: 'Verification Required',
      message: 'Please verify your email before continuing.',
    };
  }

  return null;
}
