import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Archive,
  BellRing,
  Database,
  Download,
  Eye,
  EyeOff,
  Globe,
  LockKeyhole,
  Mail,
  Plus,
  Radar,
  Save,
  Shield,
  SlidersHorizontal,
  User,
  Webhook,
  Workflow,
  X,
} from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { useToast } from '../components/ui/ToastProvider';
import { getErrorMessage } from '../lib/errors';
import {
  buildBackendSettingsPatch,
  createSecuritySettingsDraft,
  getSensitivityLabel,
  persistSecuritySettings,
  type LogRetentionPolicy,
  type SecuritySettingsDraft,
} from '../lib/securitySettings';
import { cn } from '../lib/utils';
import { authedFetch } from '../services/authenticatedFetch';
import { getDisplayName, setDisplayName } from '../services/auth';
import { useStore } from '../stores/useStore';

const cidrV4Pattern =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\/(?:3[0-2]|[12]?\d)$/;
const cidrV6Pattern = /^[0-9a-fA-F:]+\/(?:12[0-8]|1[01]\d|\d?\d)$/;

const cardClassName =
  'overflow-hidden border-white/8 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] shadow-[0_0_0_1px_rgba(148,163,184,0.03),0_24px_70px_rgba(2,6,23,0.45)]';
const inputClassName =
  'w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-500/20 placeholder:text-slate-500';
const mutedLabelClassName = 'text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500';

type ExportFormat = 'csv' | 'json';

function downloadFile(filename: string, contentType: string, body: string) {
  const blob = new Blob([body], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function isValidCidr(value: string) {
  return cidrV4Pattern.test(value) || cidrV6Pattern.test(value);
}

function normalizeDraft(draft: SecuritySettingsDraft): SecuritySettingsDraft {
  const ipWhitelist = Array.from(
    new Set(
      draft.ipWhitelist
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  return {
    ...draft,
    promptInjectionSensitivity: Math.min(100, Math.max(0, Math.round(draft.promptInjectionSensitivity))),
    autoQuarantine: Boolean(draft.autoQuarantine),
    ipWhitelist,
    webhookUrl: draft.webhookUrl.trim(),
    webhookSecret: draft.webhookSecret.trim(),
    platformSync: {
      slack: Boolean(draft.platformSync.slack),
      discord: Boolean(draft.platformSync.discord),
      pagerDuty: Boolean(draft.platformSync.pagerDuty),
    },
    logRetentionPolicy: draft.logRetentionPolicy,
    piiMasking: Boolean(draft.piiMasking),
    defaultRateLimit: Math.min(100000, Math.max(1, Math.round(draft.defaultRateLimit || 1))),
    usageSoftLimit: Math.min(100, Math.max(1, Math.round(draft.usageSoftLimit || 1))),
    emailAlerts: Boolean(draft.emailAlerts),
    inAppAlerts: Boolean(draft.inAppAlerts),
    blockOnInjection: Boolean(draft.blockOnInjection),
  };
}

function fingerprintDraft(draft: SecuritySettingsDraft) {
  const normalized = normalizeDraft(draft);
  return JSON.stringify({
    ...normalized,
    ipWhitelist: [...normalized.ipWhitelist].sort(),
  });
}

function formatLastSaved(date: Date | null) {
  if (!date) return 'Not yet saved in this session';
  return `Last synced ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="rounded-3xl border border-white/8 bg-slate-900/60 p-8">
        <div className="h-4 w-28 rounded bg-slate-800" />
        <div className="mt-4 h-10 w-72 rounded bg-slate-800" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-800" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="h-28 rounded-2xl bg-slate-950/70" />
          <div className="h-28 rounded-2xl bg-slate-950/70" />
        </div>
      </div>

      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-3xl border border-white/8 bg-slate-900/60 p-6">
          <div className="h-4 w-40 rounded bg-slate-800" />
          <div className="mt-3 h-3 w-72 rounded bg-slate-800" />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="h-28 rounded-2xl bg-slate-950/70" />
            <div className="h-28 rounded-2xl bg-slate-950/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">Security Module</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">{description}</p>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  enabled,
  onToggle,
  accent = 'sky',
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  accent?: 'sky' | 'emerald';
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <div className="mt-1 text-sm text-slate-400">{description}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition',
          enabled
            ? accent === 'emerald'
              ? 'border-emerald-400/30 bg-emerald-500/80'
              : 'border-sky-400/30 bg-sky-500/80'
            : 'border-white/10 bg-slate-800',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white transition',
            enabled ? 'translate-x-6' : 'translate-x-1',
          )}
        />
        <span className="sr-only">{title}</span>
      </button>
    </div>
  );
}

function IntegrationToggle({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
}: {
  icon: any;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'rounded-2xl border px-4 py-4 text-left transition',
        enabled
          ? 'border-sky-500/30 bg-sky-500/10 shadow-[0_0_0_1px_rgba(56,189,248,0.12)]'
          : 'border-white/8 bg-slate-950/60 hover:border-white/14',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'rounded-2xl border p-3',
              enabled ? 'border-sky-400/30 bg-sky-500/10 text-sky-300' : 'border-white/8 bg-slate-900 text-slate-400',
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">{title}</div>
            <div className="mt-1 text-sm text-slate-400">{description}</div>
          </div>
        </div>
        <Badge variant={enabled ? 'clean' : 'outline'}>{enabled ? 'Live' : 'Off'}</Badge>
      </div>
    </button>
  );
}

export default function Settings() {
  const user = useStore((state) => state.user);
  const settings = useStore((state) => state.settings);
  const fetchSettings = useStore((state) => state.fetchSettings);
  const updateSettings = useStore((state) => state.updateSettings);
  const { pushToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [displayName, setDisplayNameState] = useState(getDisplayName() || '');
  const [baselineDisplayName, setBaselineDisplayName] = useState(getDisplayName() || '');
  const [draft, setDraft] = useState<SecuritySettingsDraft>(() => createSecuritySettingsDraft(null));
  const [baselineDraft, setBaselineDraft] = useState<SecuritySettingsDraft>(() => createSecuritySettingsDraft(null));
  const [cidrInput, setCidrInput] = useState('');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        await fetchSettings();
      } catch (error) {
        const message = getErrorMessage(error, 'Unable to load workspace settings.');
        if (!active) return;
        setLoadError(message);
        pushToast({
          title: 'Settings fallback mode',
          description: `${message} Frontend-only controls remain available locally.`,
          tone: 'error',
        });
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [fetchSettings, pushToast]);

  useEffect(() => {
    const nextDraft = createSecuritySettingsDraft(settings);
    const nextDisplayName = getDisplayName() || '';
    setDraft(nextDraft);
    setBaselineDraft(nextDraft);
    setDisplayNameState(nextDisplayName);
    setBaselineDisplayName(nextDisplayName);
  }, [settings]);

  const dirty = useMemo(() => {
    const nameChanged = displayName.trim() !== baselineDisplayName.trim();
    return nameChanged || fingerprintDraft(draft) !== fingerprintDraft(baselineDraft);
  }, [baselineDisplayName, baselineDraft, displayName, draft]);

  useEffect(() => {
    if (!dirty) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  const sensitivityLabel = useMemo(
    () => getSensitivityLabel(draft.promptInjectionSensitivity),
    [draft.promptInjectionSensitivity],
  );

  const activeIntegrations = useMemo(
    () => Object.values(draft.platformSync).filter(Boolean).length,
    [draft.platformSync],
  );

  const handleAddCidr = () => {
    const value = cidrInput.trim();
    if (!value) return;

    if (!isValidCidr(value)) {
      pushToast({
        title: 'Invalid CIDR block',
        description: 'Use CIDR notation like 203.0.113.0/24 or 2001:db8::/48.',
        tone: 'error',
      });
      return;
    }

    if (draft.ipWhitelist.includes(value)) {
      setCidrInput('');
      return;
    }

    setDraft((current) => ({ ...current, ipWhitelist: [...current.ipWhitelist, value] }));
    setCidrInput('');
  };

  const handleCidrKeyDown = (event: any) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      handleAddCidr();
    }
  };

  const handleSave = async () => {
    const normalized = normalizeDraft(draft);
    const trimmedName = displayName.trim();

    setIsSaving(true);
    try {
      await updateSettings(buildBackendSettingsPatch(normalized, settings));
      persistSecuritySettings(normalized);
      setDisplayName(trimmedName);

      setDraft(normalized);
      setBaselineDraft(normalized);
      setDisplayNameState(trimmedName);
      setBaselineDisplayName(trimmedName);
      setLastSavedAt(new Date());

      pushToast({
        title: 'Security configuration saved',
        description: 'Backend-backed controls are synced and local integration settings were persisted for this operator.',
        tone: 'success',
      });
    } catch (error) {
      pushToast({
        title: 'Save failed',
        description: getErrorMessage(error, 'Unable to persist the new security configuration.'),
        tone: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(baselineDraft);
    setDisplayNameState(baselineDisplayName);
    setCidrInput('');
  };

  const handleExport = async (format: ExportFormat) => {
    setExportingFormat(format);
    try {
      const [threatsResponse, remediationsResponse] = await Promise.all([
        authedFetch(`/api/v1/reports/threat-counts/export?granularity=daily&days=365&format=${format}`),
        authedFetch(`/api/v1/reports/remediations/export?format=${format}&limit=5000`),
      ]);

      if (!threatsResponse.ok || !remediationsResponse.ok) {
        throw new Error(`Export failed (${threatsResponse.status}/${remediationsResponse.status})`);
      }

      if (format === 'csv') {
        downloadFile('sentinel_threat_history_365d.csv', 'text/csv', await threatsResponse.text());
        downloadFile('sentinel_remediation_history.csv', 'text/csv', await remediationsResponse.text());
      } else {
        downloadFile(
          'sentinel_threat_history_365d.json',
          'application/json',
          JSON.stringify(await threatsResponse.json(), null, 2),
        );
        downloadFile(
          'sentinel_remediation_history.json',
          'application/json',
          JSON.stringify(await remediationsResponse.json(), null, 2),
        );
      }

      pushToast({
        title: `Security history exported (${format.toUpperCase()})`,
        description: 'Downloaded the available 12-month threat series plus the remediation archive.',
        tone: 'success',
      });
    } catch (error) {
      pushToast({
        title: 'Export failed',
        description: getErrorMessage(error, 'Unable to export workspace security history.'),
        tone: 'error',
      });
    } finally {
      setExportingFormat(null);
    }
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl space-y-6 pb-32">
        <Card className={cn(cardClassName, 'relative')}>
          <CardContent className="relative p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(56,189,248,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.07) 1px, transparent 1px)',
                backgroundSize: '36px 36px',
                maskImage: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.05))',
              }}
            />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <Badge variant="outline" className="border-sky-500/20 bg-sky-500/5 text-sky-200">
                  Workspace Security Control Plane
                </Badge>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-50">Sentinel security configuration</h1>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Tune detection posture, delivery paths, data handling, and API safeguards from one hardened workspace.
                  Backend-supported controls sync through the gateway, and forward-looking options remain persisted locally
                  in the user app until backend support lands.
                </p>
                {loadError ? (
                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-200">
                    {loadError}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
                <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
                  <div className={mutedLabelClassName}>Threat posture</div>
                  <div className="mt-2 text-lg font-semibold text-slate-100">{sensitivityLabel}</div>
                  <div className="mt-1 text-sm text-slate-400">{draft.promptInjectionSensitivity}% injection sensitivity</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
                  <div className={mutedLabelClassName}>Alert routes</div>
                  <div className="mt-2 text-lg font-semibold text-slate-100">{activeIntegrations}</div>
                  <div className="mt-1 text-sm text-slate-400">External channels armed</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
                  <div className={mutedLabelClassName}>Save state</div>
                  <div className="mt-2 text-lg font-semibold text-slate-100">{dirty ? 'Unsaved changes' : 'Clean'}</div>
                  <div className="mt-1 text-sm text-slate-400">{formatLastSaved(lastSavedAt)}</div>
                </div>
              </div>
            </div>

            <div className="relative mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-white/8 bg-slate-950/70 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3 text-sky-300">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <div className={mutedLabelClassName}>Operator identity</div>
                    <div className="mt-1 text-sm text-slate-400">Who receives surfaced alerts and export acknowledgements.</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={mutedLabelClassName}>Full name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(event: any) => setDisplayNameState(event.target.value)}
                      className={cn(inputClassName, 'mt-2')}
                      placeholder="Primary security operator"
                    />
                  </div>
                  <div>
                    <label className={mutedLabelClassName}>Workspace email</label>
                    <div className={cn(inputClassName, 'mt-2 flex items-center gap-3 text-slate-300')}>
                      <Mail className="h-4 w-4 text-slate-500" />
                      <span>{user?.email || 'No signed-in email detected'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/8 bg-slate-950/70 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-300">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <div className={mutedLabelClassName}>Policy status</div>
                    <div className="mt-1 text-sm text-slate-400">High-signal controls currently active in this workspace.</div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge variant={draft.blockOnInjection ? 'clean' : 'outline'}>
                    {draft.blockOnInjection ? 'Inline blocking enabled' : 'Inline blocking idle'}
                  </Badge>
                  <Badge variant={draft.autoQuarantine ? 'clean' : 'outline'}>
                    {draft.autoQuarantine ? 'Auto-quarantine ready' : 'Manual quarantine'}
                  </Badge>
                  <Badge variant={draft.piiMasking ? 'clean' : 'warning'}>
                    {draft.piiMasking ? 'PII masking active' : 'Raw PII may persist'}
                  </Badge>
                  <Badge variant={draft.emailAlerts ? 'clean' : 'outline'}>
                    {draft.emailAlerts ? 'Email alerts live' : 'Email alerts muted'}
                  </Badge>
                  <Badge variant={draft.inAppAlerts ? 'clean' : 'outline'}>
                    {draft.inAppAlerts ? 'Console alerts live' : 'Console alerts muted'}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cardClassName}>
          <CardContent className="p-8">
            <SectionHeading
              icon={SlidersHorizontal}
              title="Advanced Security Configuration"
              description="Dial how aggressively Sentinel reacts to prompt abuse and which operator guardrails get enforced automatically."
            />

            <div className="mt-8 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-white/8 bg-slate-950/60 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className={mutedLabelClassName}>Prompt injection sensitivity</div>
                    <div className="mt-2 text-lg font-semibold text-slate-100">{sensitivityLabel}</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Lower values are conservative. Higher values push the gateway toward faster containment.
                    </div>
                  </div>
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-right">
                    <div className="text-2xl font-semibold text-sky-300">{draft.promptInjectionSensitivity}%</div>
                    <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Detection threshold</div>
                  </div>
                </div>

                <div className="mt-6">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={draft.promptInjectionSensitivity}
                    onChange={(event: any) =>
                      setDraft((current) => ({
                        ...current,
                        promptInjectionSensitivity: Number(event.target.value),
                      }))
                    }
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-sky-400"
                  />
                  <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                    <span>Low</span>
                    <span>Balanced</span>
                    <span>Paranoid</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <ToggleRow
                  title="Block high-confidence injections"
                  description="Backend-enforced hard blocking for requests that cross the configured injection threshold."
                  enabled={draft.blockOnInjection}
                  onToggle={() =>
                    setDraft((current) => ({
                      ...current,
                      blockOnInjection: !current.blockOnInjection,
                    }))
                  }
                />
                <ToggleRow
                  title="Auto-quarantine"
                  description="Automatically isolate API keys or users when Sentinel scores a threat as severe."
                  enabled={draft.autoQuarantine}
                  onToggle={() =>
                    setDraft((current) => ({
                      ...current,
                      autoQuarantine: !current.autoQuarantine,
                    }))
                  }
                  accent="emerald"
                />
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-white/8 bg-slate-950/60 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className={mutedLabelClassName}>IP whitelisting</div>
                  <div className="mt-2 text-sm text-slate-400">
                    Restrict dashboard sessions or API requests to approved CIDR blocks.
                  </div>
                </div>
                <Badge variant={draft.ipWhitelist.length ? 'clean' : 'outline'}>
                  {draft.ipWhitelist.length} CIDR block{draft.ipWhitelist.length === 1 ? '' : 's'}
                </Badge>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={cidrInput}
                  onChange={(event: any) => setCidrInput(event.target.value)}
                  onKeyDown={handleCidrKeyDown}
                  className={inputClassName}
                  placeholder="203.0.113.0/24"
                />
                <Button type="button" onClick={handleAddCidr} className="sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Add block
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {draft.ipWhitelist.length ? (
                  draft.ipWhitelist.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          ipWhitelist: current.ipWhitelist.filter((value) => value !== entry),
                        }))
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/8 px-3 py-1.5 text-sm text-sky-100 transition hover:border-sky-400/40 hover:bg-sky-500/12"
                    >
                      <span className="font-mono text-xs">{entry}</span>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-500">
                    No CIDR blocks pinned yet. Add one or more ranges to narrow trusted ingress paths.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cardClassName}>
          <CardContent className="p-8">
            <SectionHeading
              icon={Webhook}
              title="Integration & Webhooks"
              description="Route threat events into downstream responders and operator channels without leaving the workspace."
            />

            <div className="mt-8 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/8 bg-slate-950/60 p-5">
                  <label className={mutedLabelClassName}>Webhook URL</label>
                  <input
                    type="url"
                    value={draft.webhookUrl}
                    onChange={(event: any) =>
                      setDraft((current) => ({
                        ...current,
                        webhookUrl: event.target.value,
                      }))
                    }
                    className={cn(inputClassName, 'mt-2')}
                    placeholder="https://soc.example.com/sentinel/hooks"
                  />
                  <div className="mt-3 text-sm text-slate-400">Threat payloads are forwarded as JSON for downstream SOAR or SIEM workflows.</div>
                </div>

                <div className="rounded-3xl border border-white/8 bg-slate-950/60 p-5">
                  <label className={mutedLabelClassName}>Secret key</label>
                  <div className="mt-2 flex gap-3">
                    <input
                      type={showWebhookSecret ? 'text' : 'password'}
                      value={draft.webhookSecret}
                      onChange={(event: any) =>
                        setDraft((current) => ({
                          ...current,
                          webhookSecret: event.target.value,
                        }))
                      }
                      className={cn(inputClassName, 'flex-1')}
                      placeholder="whsec_live_xxxxxxxxx"
                    />
                    <Button type="button" variant="outline" onClick={() => setShowWebhookSecret((current) => !current)}>
                      {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="ml-2">{showWebhookSecret ? 'Hide' : 'Reveal'}</span>
                    </Button>
                  </div>
                  <div className="mt-3 text-sm text-slate-400">Used to sign outgoing webhook deliveries for receiver-side verification.</div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/8 bg-slate-950/60 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className={mutedLabelClassName}>Platform sync</div>
                    <div className="mt-2 text-sm text-slate-400">Instant alert fan-out for your on-call stack.</div>
                  </div>
                  <Badge variant={activeIntegrations ? 'clean' : 'outline'}>
                    {activeIntegrations} route{activeIntegrations === 1 ? '' : 's'} armed
                  </Badge>
                </div>

                <div className="mt-5 grid gap-3">
                  <IntegrationToggle
                    icon={Workflow}
                    title="Slack"
                    description="Ship high-priority threat notifications into workspace incident channels."
                    enabled={draft.platformSync.slack}
                    onToggle={() =>
                      setDraft((current) => ({
                        ...current,
                        platformSync: { ...current.platformSync, slack: !current.platformSync.slack },
                      }))
                    }
                  />
                  <IntegrationToggle
                    icon={Globe}
                    title="Discord"
                    description="Mirror detections into private response rooms for fast triage coordination."
                    enabled={draft.platformSync.discord}
                    onToggle={() =>
                      setDraft((current) => ({
                        ...current,
                        platformSync: { ...current.platformSync, discord: !current.platformSync.discord },
                      }))
                    }
                  />
                  <IntegrationToggle
                    icon={BellRing}
                    title="PagerDuty"
                    description="Escalate severe incidents to paging workflows when the gateway flips into containment."
                    enabled={draft.platformSync.pagerDuty}
                    onToggle={() =>
                      setDraft((current) => ({
                        ...current,
                        platformSync: { ...current.platformSync, pagerDuty: !current.platformSync.pagerDuty },
                      }))
                    }
                  />
                </div>

                <div className="mt-4">
                  <ToggleRow
                    title="In-app operator alerts"
                    description="Backend-backed notifications directly inside the Sentinel console."
                    enabled={draft.inAppAlerts}
                    onToggle={() =>
                      setDraft((current) => ({
                        ...current,
                        inAppAlerts: !current.inAppAlerts,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cardClassName}>
          <CardContent className="p-8">
            <SectionHeading
              icon={Database}
              title="Data Retention & Privacy"
              description="Control how long event history lives, what gets redacted, and how operators can extract the audit trail."
            />

            <div className="mt-8 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/8 bg-slate-950/60 p-5">
                  <label className={mutedLabelClassName}>Log retention policy</label>
                  <select
                    value={draft.logRetentionPolicy}
                    onChange={(event: any) =>
                      setDraft((current) => ({
                        ...current,
                        logRetentionPolicy: event.target.value as LogRetentionPolicy,
                      }))
                    }
                    className={cn(inputClassName, 'mt-2 appearance-none')}
                  >
                    <option value="30d">30 days</option>
                    <option value="90d">90 days</option>
                    <option value="1y">1 year</option>
                    <option value="indefinite">Indefinite</option>
                  </select>
                  <div className="mt-3 text-sm text-slate-400">Retention policy is stored locally in the current frontend build until backend archival controls are exposed.</div>
                </div>

                <ToggleRow
                  title="PII masking"
                  description="Automatically redact personally identifiable information before logs are committed to storage."
                  enabled={draft.piiMasking}
                  onToggle={() =>
                    setDraft((current) => ({
                      ...current,
                      piiMasking: !current.piiMasking,
                    }))
                  }
                  accent="emerald"
                />
              </div>

              <div className="rounded-3xl border border-white/8 bg-slate-950/60 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={mutedLabelClassName}>Export data</div>
                    <div className="mt-2 text-sm text-slate-400">
                      Request the available security history archive. Current export coverage includes 12 months of threat counts
                      and up to 5,000 remediation records.
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-900/70 p-3 text-slate-400">
                    <Download className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-center border-sky-500/20 bg-sky-500/5 text-sky-100 hover:bg-sky-500/10"
                    onClick={() => void handleExport('csv')}
                    disabled={exportingFormat !== null}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    {exportingFormat === 'csv' ? 'Preparing CSV...' : 'Export CSV'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-center border-sky-500/20 bg-sky-500/5 text-sky-100 hover:bg-sky-500/10"
                    onClick={() => void handleExport('json')}
                    disabled={exportingFormat !== null}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {exportingFormat === 'json' ? 'Preparing JSON...' : 'Export JSON'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cardClassName}>
          <CardContent className="p-8">
            <SectionHeading
              icon={Radar}
              title="API Management"
              description="Set default throughput controls and pre-breach alerts so security operations stay ahead of customer demand."
            />

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-white/8 bg-slate-950/60 p-5">
                <label className={mutedLabelClassName}>Default rate limiting</label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={draft.defaultRateLimit}
                    onChange={(event: any) =>
                      setDraft((current) => ({
                        ...current,
                        defaultRateLimit: Number(event.target.value),
                      }))
                    }
                    className={cn(inputClassName, 'flex-1')}
                  />
                  <div className="rounded-2xl border border-white/8 bg-slate-900/70 px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    RPM
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-400">
                  Stored locally in the user app until workspace-level per-key rate policies are exposed in the public API.
                </div>
              </div>

              <div className="rounded-3xl border border-white/8 bg-slate-950/60 p-5">
                <label className={mutedLabelClassName}>Usage soft-limit</label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={draft.usageSoftLimit}
                    onChange={(event: any) =>
                      setDraft((current) => ({
                        ...current,
                        usageSoftLimit: Number(event.target.value),
                      }))
                    }
                    className={cn(inputClassName, 'flex-1')}
                  />
                  <div className="rounded-2xl border border-white/8 bg-slate-900/70 px-3 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    %
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-400">Trigger email attention when monthly API consumption reaches this percentage.</div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ToggleRow
                title="Email alert delivery"
                description="Backend-backed email summaries and threshold notifications for the current workspace operator."
                enabled={draft.emailAlerts}
                onToggle={() =>
                  setDraft((current) => ({
                    ...current,
                    emailAlerts: !current.emailAlerts,
                  }))
                }
                accent="emerald"
              />

              <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/10 bg-slate-900 p-3 text-slate-300">
                    <LockKeyhole className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Soft-limit behavior</div>
                    <div className="mt-1 text-sm text-slate-400">
                      When the workspace reaches {draft.usageSoftLimit}% monthly usage, Sentinel can escalate through the enabled channels above.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-5 z-40 px-4">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 rounded-3xl border border-sky-500/20 bg-slate-950/95 px-5 py-4 shadow-[0_20px_60px_rgba(2,6,23,0.6)] backdrop-blur-xl">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100">Unsaved security changes</div>
              <div className="mt-1 text-sm text-slate-400">
                Save to sync backend-supported controls now and persist the extended workspace suite locally in the frontend app.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Button type="button" variant="ghost" className="text-slate-300" onClick={handleReset} disabled={isSaving}>
                Discard
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? (
                  'Saving...'
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
