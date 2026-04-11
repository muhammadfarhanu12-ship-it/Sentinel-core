import type { UserSettings } from '../types';

export const SECURITY_SETTINGS_STORAGE_KEY = 'sentinel.security-suite.v1';

export type LogRetentionPolicy = '30d' | '90d' | '1y' | 'indefinite';

export interface SecuritySettingsDraft {
  promptInjectionSensitivity: number;
  blockOnInjection: boolean;
  autoQuarantine: boolean;
  ipWhitelist: string[];
  webhookUrl: string;
  webhookSecret: string;
  platformSync: {
    slack: boolean;
    discord: boolean;
    pagerDuty: boolean;
  };
  inAppAlerts: boolean;
  logRetentionPolicy: LogRetentionPolicy;
  piiMasking: boolean;
  defaultRateLimit: number;
  usageSoftLimit: number;
  emailAlerts: boolean;
}

type PersistedSecuritySettings = Omit<
  SecuritySettingsDraft,
  'promptInjectionSensitivity' | 'blockOnInjection' | 'inAppAlerts' | 'piiMasking' | 'emailAlerts'
>;

const defaultPersistedSettings: PersistedSecuritySettings = {
  autoQuarantine: true,
  ipWhitelist: [],
  webhookUrl: '',
  webhookSecret: '',
  platformSync: {
    slack: true,
    discord: false,
    pagerDuty: true,
  },
  logRetentionPolicy: '90d',
  defaultRateLimit: 120,
  usageSoftLimit: 80,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getPersistedSecuritySettings(): PersistedSecuritySettings {
  if (typeof window === 'undefined') {
    return defaultPersistedSettings;
  }

  try {
    const raw = window.localStorage.getItem(SECURITY_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaultPersistedSettings;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedSecuritySettings> | null;
    return {
      autoQuarantine: Boolean(parsed?.autoQuarantine ?? defaultPersistedSettings.autoQuarantine),
      ipWhitelist: Array.isArray(parsed?.ipWhitelist)
        ? parsed!.ipWhitelist.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : defaultPersistedSettings.ipWhitelist,
      webhookUrl: typeof parsed?.webhookUrl === 'string' ? parsed.webhookUrl : defaultPersistedSettings.webhookUrl,
      webhookSecret:
        typeof parsed?.webhookSecret === 'string' ? parsed.webhookSecret : defaultPersistedSettings.webhookSecret,
      platformSync: {
        slack: Boolean(parsed?.platformSync?.slack ?? defaultPersistedSettings.platformSync.slack),
        discord: Boolean(parsed?.platformSync?.discord ?? defaultPersistedSettings.platformSync.discord),
        pagerDuty: Boolean(parsed?.platformSync?.pagerDuty ?? defaultPersistedSettings.platformSync.pagerDuty),
      },
      logRetentionPolicy: isRetentionPolicy(parsed?.logRetentionPolicy)
        ? parsed!.logRetentionPolicy
        : defaultPersistedSettings.logRetentionPolicy,
      defaultRateLimit: clamp(Number(parsed?.defaultRateLimit ?? defaultPersistedSettings.defaultRateLimit), 1, 100000),
      usageSoftLimit: clamp(Number(parsed?.usageSoftLimit ?? defaultPersistedSettings.usageSoftLimit), 1, 100),
    };
  } catch {
    return defaultPersistedSettings;
  }
}

export function persistSecuritySettings(draft: SecuritySettingsDraft) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: PersistedSecuritySettings = {
    autoQuarantine: draft.autoQuarantine,
    ipWhitelist: draft.ipWhitelist,
    webhookUrl: draft.webhookUrl,
    webhookSecret: draft.webhookSecret,
    platformSync: draft.platformSync,
    logRetentionPolicy: draft.logRetentionPolicy,
    defaultRateLimit: clamp(draft.defaultRateLimit, 1, 100000),
    usageSoftLimit: clamp(draft.usageSoftLimit, 1, 100),
  };

  window.localStorage.setItem(SECURITY_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

export function createSecuritySettingsDraft(settings: UserSettings | null | undefined): SecuritySettingsDraft {
  const persisted = getPersistedSecuritySettings();
  const threshold = clamp(Number(settings?.alert_threshold ?? 0.75), 0, 1);

  return {
    promptInjectionSensitivity: clamp(Math.round((1 - threshold) * 100), 0, 100),
    blockOnInjection: Boolean(settings?.block_on_injection ?? true),
    autoQuarantine: persisted.autoQuarantine,
    ipWhitelist: persisted.ipWhitelist,
    webhookUrl: persisted.webhookUrl,
    webhookSecret: persisted.webhookSecret,
    platformSync: persisted.platformSync,
    inAppAlerts: Boolean(settings?.in_app_alerts ?? true),
    logRetentionPolicy: persisted.logRetentionPolicy,
    piiMasking: Boolean(settings?.auto_redact_pii ?? true),
    defaultRateLimit: persisted.defaultRateLimit,
    usageSoftLimit: persisted.usageSoftLimit,
    emailAlerts: Boolean(settings?.email_alerts ?? true),
  };
}

export function buildBackendSettingsPatch(
  draft: SecuritySettingsDraft,
  currentSettings: UserSettings | null | undefined,
): Partial<UserSettings> {
  return {
    scan_sensitivity: currentSettings?.scan_sensitivity ?? 'medium',
    auto_redact_pii: draft.piiMasking,
    block_on_injection: draft.blockOnInjection,
    alert_threshold: Number((1 - clamp(draft.promptInjectionSensitivity, 0, 100) / 100).toFixed(2)),
    email_alerts: draft.emailAlerts,
    in_app_alerts: draft.inAppAlerts,
    max_daily_scans: currentSettings?.max_daily_scans ?? 100,
  };
}

export function getSensitivityLabel(value: number) {
  if (value >= 85) return 'Paranoid';
  if (value >= 65) return 'Aggressive';
  if (value >= 40) return 'Balanced';
  if (value >= 15) return 'Guarded';
  return 'Low';
}

function isRetentionPolicy(value: unknown): value is LogRetentionPolicy {
  return value === '30d' || value === '90d' || value === '1y' || value === 'indefinite';
}
