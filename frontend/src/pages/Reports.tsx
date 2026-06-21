import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  FileText,
  Gauge,
  Lock,
  Mail,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Trash2,
  XCircle,
} from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { authedFetch, authedFetchJson, HttpError } from '../services/authenticatedFetch';

type Granularity = 'daily' | 'weekly' | 'monthly';
type Lookback = '7d' | '30d' | '90d';
type OutcomeKey = 'blocked' | 'redacted' | 'clean';
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type RemediationStatus = 'ALL' | 'QUARANTINED' | 'ALERTED' | 'RESOLVED';
type ThreatTypeFilter = 'ALL' | 'DATA_EXFILTRATION' | 'PROMPT_INJECTION' | 'DATA_LEAK' | 'ENCODING_OBFUSCATION';
type ScoreRange = 'ALL' | '90-100' | '70-89' | '40-69' | '0-39';
type ExportFormat = 'csv' | 'json';
type TraceLevel = 'info' | 'ok' | 'warn' | 'error';

type CompliancePoint = {
  label: string;
  period: string;
  blocked: number;
  redacted: number;
  clean: number;
  total: number;
  avgRiskScore: number;
  mfaTriggered: number;
};

type ComplianceMetrics = {
  points: CompliancePoint[];
  totals: {
    blocked: number;
    redacted: number;
    clean: number;
    total: number;
    avgRiskScore: number;
    mfaTriggered: number;
  };
};

type EvidenceAction = {
  type: string;
  complete: boolean;
};

type ExecutionTraceItem = {
  time: string;
  level: TraceLevel;
  message: string;
};

type RemediationEvent = {
  id: string;
  logId: string;
  threatType: Exclude<ThreatTypeFilter, 'ALL'>;
  severity: Severity;
  score: number;
  status: Exclude<RemediationStatus, 'ALL'>;
  timestamp: string;
  apiKey: string | null;
  actions: EvidenceAction[];
  actionsComplete: boolean;
  complianceTags: string[];
  executionTrace: ExecutionTraceItem[];
};

type NormalizedRemediations = {
  events: RemediationEvent[];
  total: number;
  serverPaged: boolean;
};

type SeverityDistributionItem = {
  severity: Severity;
  count: number;
};

type FrameworkControl = {
  id: string;
  name: string;
  covered: boolean;
};

type FrameworkCoverage = {
  coveragePct: number;
  controls: FrameworkControl[];
};

type ComplianceCoverage = {
  soc2: FrameworkCoverage;
  gdpr: FrameworkCoverage;
  iso27001: FrameworkCoverage;
};

type ReportSchedule = {
  id: string;
  reportType: string;
  frequency: string;
  deliveryMethod: string;
  recipientEmail: string;
  formats: string[];
};

type ScheduleDraft = Omit<ReportSchedule, 'id'>;

const OUTCOME_COLORS: Record<OutcomeKey, string> = {
  blocked: '#EF4444',
  redacted: '#F59E0B',
  clean: '#10B981',
};

const SEVERITY_COLORS: Record<Severity, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#3B82F6',
  LOW: '#10B981',
};

const STATUS_STYLES: Record<Exclude<RemediationStatus, 'ALL'>, string> = {
  QUARANTINED: 'border-red-500/30 bg-red-500/10 text-red-200',
  ALERTED: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  RESOLVED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
};

const GRANULARITY_OPTIONS: Array<{ value: Granularity; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const LOOKBACK_OPTIONS: Array<{ value: Lookback; label: string; days: number }> = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
];

const STATUS_FILTERS: Array<{ value: RemediationStatus; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'QUARANTINED', label: 'Quarantined' },
  { value: 'ALERTED', label: 'Alerted' },
  { value: 'RESOLVED', label: 'Resolved' },
];

const THREAT_TYPE_FILTERS: Array<{ value: ThreatTypeFilter; label: string }> = [
  { value: 'ALL', label: 'All Types' },
  { value: 'DATA_EXFILTRATION', label: 'Data Exfiltration' },
  { value: 'PROMPT_INJECTION', label: 'Prompt Injection' },
  { value: 'DATA_LEAK', label: 'Data Leak' },
  { value: 'ENCODING_OBFUSCATION', label: 'Encoding Obfuscation' },
];

const SCORE_RANGES: Array<{ value: ScoreRange; label: string; min?: number; max?: number }> = [
  { value: 'ALL', label: 'All Scores' },
  { value: '90-100', label: '90-100', min: 90, max: 100 },
  { value: '70-89', label: '70-89', min: 70, max: 89 },
  { value: '40-69', label: '40-69', min: 40, max: 69 },
  { value: '0-39', label: '0-39', min: 0, max: 39 },
];

const PAGE_SIZE = 10;

const DEFAULT_COVERAGE: ComplianceCoverage = {
  soc2: {
    coveragePct: 75,
    controls: [
      { id: 'CC6.1', name: 'Logical access controls', covered: true },
      { id: 'CC6.6', name: 'Change and event monitoring', covered: true },
      { id: 'CC7.2', name: 'Security event investigation', covered: true },
      { id: 'CC7.4', name: 'Incident response evidence', covered: false },
    ],
  },
  gdpr: {
    coveragePct: 100,
    controls: [
      { id: 'Art.25', name: 'Data protection by design', covered: true },
      { id: 'Art.32', name: 'Processing security controls', covered: true },
      { id: 'Art.33', name: 'Breach notification evidence', covered: true },
    ],
  },
  iso27001: {
    coveragePct: 75,
    controls: [
      { id: 'A.5.15', name: 'Access control policy', covered: true },
      { id: 'A.8.12', name: 'Data leakage prevention', covered: true },
      { id: 'A.8.16', name: 'Monitoring activities', covered: true },
      { id: 'A.8.23', name: 'Web filtering controls', covered: false },
    ],
  },
};

const FRAMEWORKS: Array<{ key: keyof ComplianceCoverage; label: string }> = [
  { key: 'soc2', label: 'SOC 2' },
  { key: 'gdpr', label: 'GDPR' },
  { key: 'iso27001', label: 'ISO 27001' },
];

const emptyMetrics: ComplianceMetrics = {
  points: [],
  totals: {
    blocked: 0,
    redacted: 0,
    clean: 0,
    total: 0,
    avgRiskScore: 0,
    mfaTriggered: 0,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeScore(value: unknown): number {
  const score = toNumber(value);
  if (score > 0 && score <= 1) return Math.round(score * 100);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function lookbackDays(lookback: Lookback): number {
  return LOOKBACK_OPTIONS.find((option) => option.value === lookback)?.days ?? 30;
}

function dateToIso(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPeriodLabel(value: string, granularity: Granularity): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (granularity === 'monthly') {
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function compactLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function buildComplianceQuery(granularity: Granularity, lookback: Lookback, startDate: string, endDate: string): string {
  const q = new URLSearchParams();
  q.set('granularity', granularity);
  q.set('lookback', lookback);
  if (startDate) q.set('start', startDate);
  if (endDate) q.set('end', endDate);
  return q.toString();
}

function buildLegacyThreatCountsQuery(granularity: Granularity, lookback: Lookback, startDate: string, endDate: string): string {
  const q = new URLSearchParams();
  q.set('granularity', granularity === 'weekly' ? 'weekly' : 'daily');
  q.set('days', String(lookbackDays(lookback)));
  const startTime = dateToIso(startDate);
  const endTime = dateToIso(endDate, true);
  if (startTime) q.set('start_time', startTime);
  if (endTime) q.set('end_time', endTime);
  return q.toString();
}

function buildRemediationQuery(input: {
  status: RemediationStatus;
  threatType: ThreatTypeFilter;
  scoreRange: ScoreRange;
  search: string;
  page: number;
  lookback: Lookback;
  startDate: string;
  endDate: string;
}): string {
  const q = new URLSearchParams();
  q.set('status', input.status);
  q.set('type', input.threatType);
  q.set('page', String(input.page));
  q.set('pageSize', String(PAGE_SIZE));
  q.set('limit', '5000');
  q.set('offset', '0');
  q.set('lookback', input.lookback);
  if (input.search.trim()) q.set('search', input.search.trim());
  const range = SCORE_RANGES.find((item) => item.value === input.scoreRange);
  if (range?.min !== undefined) q.set('scoreMin', String(range.min));
  if (range?.max !== undefined) q.set('scoreMax', String(range.max));
  if (input.startDate) q.set('start', input.startDate);
  if (input.endDate) q.set('end', input.endDate);
  return q.toString();
}

function isMissingEndpoint(error: unknown): boolean {
  return error instanceof HttpError && [404, 405].includes(error.status);
}

async function fetchOptionalJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    return await authedFetchJson<T>(url, init);
  } catch (error) {
    if (isMissingEndpoint(error)) return null;
    throw error;
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] || fallback;
}

async function downloadResponse(response: Response, fallbackFilename: string) {
  const filename = filenameFromDisposition(response.headers.get('Content-Disposition'), fallbackFilename);
  const blob = await response.blob();
  downloadBlob(filename, blob);
}

function normalizeComplianceMetrics(raw: unknown, granularity: Granularity): ComplianceMetrics {
  if (!isRecord(raw)) return emptyMetrics;

  const maybeSeries = raw.series;
  let points: CompliancePoint[] = [];

  if (isRecord(maybeSeries) && Array.isArray(maybeSeries.labels)) {
    const labels = maybeSeries.labels.map((label) => asString(label));
    const blocked = Array.isArray(maybeSeries.blocked) ? maybeSeries.blocked : [];
    const redacted = Array.isArray(maybeSeries.redacted) ? maybeSeries.redacted : [];
    const clean = Array.isArray(maybeSeries.clean) ? maybeSeries.clean : [];
    const avgRisk = Array.isArray(maybeSeries.avgRiskScore)
      ? maybeSeries.avgRiskScore
      : Array.isArray(maybeSeries.avg_risk_score)
        ? maybeSeries.avg_risk_score
        : [];
    const mfaTriggered = Array.isArray(maybeSeries.mfaTriggered)
      ? maybeSeries.mfaTriggered
      : Array.isArray(maybeSeries.mfa_triggered)
        ? maybeSeries.mfa_triggered
        : [];

    points = labels.map((label, index) => {
      const rowBlocked = toNumber(blocked[index]);
      const rowRedacted = toNumber(redacted[index]);
      const rowClean = toNumber(clean[index]);
      return {
        label: formatPeriodLabel(label, granularity),
        period: label,
        blocked: rowBlocked,
        redacted: rowRedacted,
        clean: rowClean,
        total: rowBlocked + rowRedacted + rowClean,
        avgRiskScore: normalizeScore(avgRisk[index]),
        mfaTriggered: toNumber(mfaTriggered[index]),
      };
    });
  } else if (Array.isArray(maybeSeries)) {
    points = maybeSeries.map((item) => {
      const record = isRecord(item) ? item : {};
      const period = asString(record.period_start ?? record.period ?? record.label);
      const blocked = toNumber(record.blocked);
      const redacted = toNumber(record.redacted);
      const clean = toNumber(record.clean);
      return {
        label: formatPeriodLabel(period, granularity),
        period,
        blocked,
        redacted,
        clean,
        total: toNumber(record.total, blocked + redacted + clean),
        avgRiskScore: normalizeScore(record.avgRiskScore ?? record.avg_risk_score ?? record.avg_risk),
        mfaTriggered: toNumber(record.mfaTriggered ?? record.mfa_triggered),
      };
    });
  }

  const totalsRecord = isRecord(raw.totals) ? raw.totals : {};
  const totalsFromPoints = points.reduce(
    (acc, point) => {
      acc.blocked += point.blocked;
      acc.redacted += point.redacted;
      acc.clean += point.clean;
      acc.total += point.total;
      acc.mfaTriggered += point.mfaTriggered;
      return acc;
    },
    { blocked: 0, redacted: 0, clean: 0, total: 0, mfaTriggered: 0 },
  );

  const avgRiskFromSeries =
    points.length > 0
      ? Math.round(points.reduce((sum, point) => sum + point.avgRiskScore, 0) / points.length)
      : 0;

  return {
    points,
    totals: {
      blocked: toNumber(totalsRecord.blocked, totalsFromPoints.blocked),
      redacted: toNumber(totalsRecord.redacted, totalsFromPoints.redacted),
      clean: toNumber(totalsRecord.clean, totalsFromPoints.clean),
      total: toNumber(totalsRecord.total, totalsFromPoints.total),
      avgRiskScore: normalizeScore(totalsRecord.avgRiskScore ?? totalsRecord.avg_risk_score ?? avgRiskFromSeries),
      mfaTriggered: toNumber(totalsRecord.mfaTriggered ?? totalsRecord.mfa_triggered, totalsFromPoints.mfaTriggered),
    },
  };
}

function severityFromScore(score: number): Severity {
  if (score >= 90) return 'CRITICAL';
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function normalizeSeverity(value: unknown, score: number): Severity {
  const severity = asString(value).toUpperCase();
  if (severity === 'CRITICAL' || severity === 'HIGH' || severity === 'MEDIUM' || severity === 'LOW') return severity;
  return severityFromScore(score);
}

function normalizeThreatType(value: unknown): Exclude<ThreatTypeFilter, 'ALL'> {
  const type = asString(value).toUpperCase();
  if (type === 'DATA_EXFILTRATION' || type === 'PROMPT_INJECTION' || type === 'DATA_LEAK' || type === 'ENCODING_OBFUSCATION') {
    return type;
  }
  if (type.includes('EXFIL')) return 'DATA_EXFILTRATION';
  if (type.includes('ENCOD')) return 'ENCODING_OBFUSCATION';
  if (type.includes('LEAK') || type.includes('PII')) return 'DATA_LEAK';
  return 'PROMPT_INJECTION';
}

function normalizeStatus(value: unknown, actions: EvidenceAction[], score: number): Exclude<RemediationStatus, 'ALL'> {
  const status = asString(value).toUpperCase();
  if (status === 'QUARANTINED' || status === 'ALERTED' || status === 'RESOLVED') return status;
  if (actions.some((action) => action.type.includes('QUARANTINE') && action.complete)) return 'QUARANTINED';
  if (score < 40 && actions.every((action) => action.complete)) return 'RESOLVED';
  return 'ALERTED';
}

function normalizeActions(value: unknown): EvidenceAction[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return { type: item.toUpperCase(), complete: true };
    if (!isRecord(item)) return { type: 'ACTION_RECORDED', complete: true };
    const type = asString(item.type ?? item.name ?? 'ACTION_RECORDED').toUpperCase();
    const status = asString(item.status ?? item.state ?? 'SUCCESS').toUpperCase();
    return {
      type,
      complete: !['FAILED', 'ERROR', 'SKIPPED'].includes(status),
    };
  });
}

function deriveComplianceTags(threatType: Exclude<ThreatTypeFilter, 'ALL'>): string[] {
  const tags = ['SOC2-CC6.1', 'ISO27001-A.8.16'];
  if (threatType === 'DATA_LEAK' || threatType === 'DATA_EXFILTRATION') tags.push('GDPR-Art.32');
  if (threatType === 'PROMPT_INJECTION') tags.push('SOC2-CC7.2');
  return tags;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function buildTrace(event: Pick<RemediationEvent, 'timestamp' | 'actions' | 'actionsComplete' | 'threatType'>): ExecutionTraceItem[] {
  const startedAt = event.timestamp || new Date().toISOString();
  const actionTrace = event.actions.map((action) => ({
    time: startedAt,
    level: action.complete ? ('ok' as const) : ('warn' as const),
    message: `${actionLabel(action.type)} ${action.complete ? 'completed' : 'requires review'}`,
  }));

  return [
    {
      time: startedAt,
      level: 'info',
      message: `${compactLabel(event.threatType)} evidence captured for reporting`,
    },
    ...actionTrace,
    {
      time: startedAt,
      level: event.actionsComplete ? 'ok' : 'warn',
      message: event.actionsComplete ? 'All automated evidence actions completed' : 'One or more evidence actions need review',
    },
  ];
}

function normalizeTrace(value: unknown, fallback: RemediationEvent): ExecutionTraceItem[] {
  if (!Array.isArray(value)) return buildTrace(fallback);
  const trace = value
    .map((item) => {
      if (!isRecord(item)) return null;
      const level = asString(item.level ?? 'info').toLowerCase();
      const normalizedLevel: TraceLevel = level === 'ok' || level === 'warn' || level === 'error' ? level : 'info';
      return {
        time: asString(item.time ?? item.timestamp ?? fallback.timestamp),
        level: normalizedLevel,
        message: asString(item.message ?? item.detail ?? 'Evidence step recorded'),
      };
    })
    .filter((item): item is ExecutionTraceItem => Boolean(item));
  return trace.length ? trace : buildTrace(fallback);
}

function normalizeRemediationEvent(raw: unknown, index = 0): RemediationEvent {
  const record = isRecord(raw) ? raw : {};
  const rawActions = normalizeActions(record.actions);
  const score = normalizeScore(record.score ?? record.threat_score ?? record.risk_score);
  const severity = normalizeSeverity(record.severity ?? record.risk_level, score);
  const threatType = normalizeThreatType(record.threatType ?? record.threat_type ?? record.type);
  const status = normalizeStatus(record.status, rawActions, score);
  const timestamp = asString(record.timestamp ?? record.created_at ?? record.createdAt ?? new Date().toISOString());
  const apiKeyValue = record.apiKey ?? record.api_key ?? record.api_key_id;
  const event: RemediationEvent = {
    id: asString(record.id ?? record._id ?? `event-${index + 1}`),
    logId: asString(record.logId ?? record.log_id ?? record.security_log_id ?? record.request_id ?? 'unlinked'),
    threatType,
    severity,
    score,
    status,
    timestamp,
    apiKey: apiKeyValue === null || apiKeyValue === undefined || apiKeyValue === '' ? null : String(apiKeyValue),
    actions: rawActions,
    actionsComplete: rawActions.length > 0 ? rawActions.every((action) => action.complete) : Boolean(record.actionsComplete ?? record.actions_complete ?? false),
    complianceTags: normalizeStringList(record.complianceTags ?? record.compliance_tags),
    executionTrace: [],
  };
  event.complianceTags = event.complianceTags.length ? event.complianceTags : deriveComplianceTags(event.threatType);
  event.executionTrace = normalizeTrace(record.executionTrace ?? record.execution_trace, event);
  return event;
}

function normalizeRemediationResponse(raw: unknown): NormalizedRemediations {
  if (isRecord(raw) && Array.isArray(raw.events)) {
    const events = raw.events.map((item, index) => normalizeRemediationEvent(item, index));
    return {
      events,
      total: toNumber(raw.total, events.length),
      serverPaged: true,
    };
  }

  const rows = Array.isArray(raw) ? raw : [];
  const events = rows.map((item, index) => normalizeRemediationEvent(item, index));
  return {
    events,
    total: events.length,
    serverPaged: false,
  };
}

function normalizeSeverityDistribution(raw: unknown): SeverityDistributionItem[] | null {
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .map((item) => {
      if (!isRecord(item)) return null;
      const severity = normalizeSeverity(item.severity, toNumber(item.count));
      return { severity, count: toNumber(item.count) };
    })
    .filter((item): item is SeverityDistributionItem => Boolean(item));

  return rows.length ? orderSeverityDistribution(rows) : null;
}

function orderSeverityDistribution(rows: SeverityDistributionItem[]): SeverityDistributionItem[] {
  const counts = rows.reduce<Record<Severity, number>>(
    (acc, row) => {
      acc[row.severity] += row.count;
      return acc;
    },
    { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
  );
  return (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]).map((severity) => ({ severity, count: counts[severity] }));
}

function buildSeverityDistribution(events: RemediationEvent[]): SeverityDistributionItem[] {
  return orderSeverityDistribution(events.map((event) => ({ severity: event.severity, count: 1 })));
}

function normalizeCoverage(raw: unknown): ComplianceCoverage {
  if (!isRecord(raw)) return DEFAULT_COVERAGE;
  const normalizeFramework = (value: unknown, fallback: FrameworkCoverage): FrameworkCoverage => {
    if (!isRecord(value)) return fallback;
    const controls = Array.isArray(value.controls)
      ? value.controls
          .map((control) => {
            if (!isRecord(control)) return null;
            return {
              id: asString(control.id),
              name: asString(control.name),
              covered: Boolean(control.covered),
            };
          })
          .filter((control): control is FrameworkControl => Boolean(control?.id || control?.name))
      : fallback.controls;
    return {
      coveragePct: Math.max(0, Math.min(100, toNumber(value.coveragePct ?? value.coverage_pct, fallback.coveragePct))),
      controls,
    };
  };

  return {
    soc2: normalizeFramework(raw.soc2, DEFAULT_COVERAGE.soc2),
    gdpr: normalizeFramework(raw.gdpr, DEFAULT_COVERAGE.gdpr),
    iso27001: normalizeFramework(raw.iso27001 ?? raw.iso_27001, DEFAULT_COVERAGE.iso27001),
  };
}

function normalizeSchedule(raw: unknown, index = 0): ReportSchedule {
  const record = isRecord(raw) ? raw : {};
  return {
    id: asString(record.id ?? `local-${Date.now()}-${index}`),
    reportType: asString(record.reportType ?? record.report_type ?? 'Compliance Summary'),
    frequency: asString(record.frequency ?? 'Weekly'),
    deliveryMethod: asString(record.deliveryMethod ?? record.delivery_method ?? 'Email'),
    recipientEmail: asString(record.recipientEmail ?? record.recipient_email ?? ''),
    formats: normalizeStringList(record.formats).length ? normalizeStringList(record.formats).map((format) => format.toUpperCase()) : ['PDF'],
  };
}

function normalizeSchedules(raw: unknown): ReportSchedule[] {
  if (Array.isArray(raw)) return raw.map((item, index) => normalizeSchedule(item, index));
  if (isRecord(raw) && Array.isArray(raw.schedules)) return raw.schedules.map((item, index) => normalizeSchedule(item, index));
  return [];
}

function actionLabel(value: string): string {
  const action = value.toUpperCase();
  if (action.includes('QUARANTINE')) return 'Quarantined';
  if (action.includes('EMAIL')) return 'Email sent';
  if (action.includes('WEBHOOK')) return 'Webhook sent';
  return compactLabel(action);
}

function actionClassName(action: EvidenceAction): string {
  if (!action.complete) return 'border-red-400/30 bg-red-500/10 text-red-200';
  if (action.type.includes('QUARANTINE')) return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
  if (action.type.includes('EMAIL')) return 'border-sky-400/30 bg-sky-500/10 text-sky-200';
  return 'border-indigo-400/30 bg-indigo-500/10 text-indigo-200';
}

function scoreClassName(score: number): string {
  if (score >= 90) return 'text-red-300';
  if (score >= 70) return 'text-amber-300';
  if (score >= 40) return 'text-sky-300';
  return 'text-emerald-300';
}

function severityBadgeClassName(severity: Severity): string {
  if (severity === 'CRITICAL') return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (severity === 'HIGH') return 'border-orange-500/30 bg-orange-500/10 text-orange-200';
  if (severity === 'MEDIUM') return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
}

function isWithinDateRange(event: RemediationEvent, lookback: Lookback, startDate: string, endDate: string): boolean {
  const timestamp = new Date(event.timestamp).getTime();
  if (!Number.isFinite(timestamp)) return true;
  const start = dateToIso(startDate);
  const end = dateToIso(endDate, true);
  if (start && timestamp < new Date(start).getTime()) return false;
  if (end && timestamp > new Date(end).getTime()) return false;
  if (start || end) return true;
  const cutoff = Date.now() - lookbackDays(lookback) * 24 * 60 * 60 * 1000;
  return timestamp >= cutoff;
}

function applyClientRemediationFilters(
  events: RemediationEvent[],
  status: RemediationStatus,
  threatType: ThreatTypeFilter,
  scoreRange: ScoreRange,
  search: string,
  lookback: Lookback,
  startDate: string,
  endDate: string,
): RemediationEvent[] {
  const range = SCORE_RANGES.find((item) => item.value === scoreRange);
  const query = search.trim().toLowerCase();
  return events.filter((event) => {
    if (!isWithinDateRange(event, lookback, startDate, endDate)) return false;
    if (status !== 'ALL' && event.status !== status) return false;
    if (threatType !== 'ALL' && event.threatType !== threatType) return false;
    if (range?.min !== undefined && event.score < range.min) return false;
    if (range?.max !== undefined && event.score > range.max) return false;
    if (!query) return true;
    return [
      event.id,
      event.logId,
      event.threatType,
      event.severity,
      event.status,
      event.apiKey ?? '[anonymous]',
      ...event.complianceTags,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function computeYTicks(points: CompliancePoint[]): number[] {
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.blocked, point.redacted, point.clean]));
  if (maxValue <= 6) return Array.from({ length: maxValue + 1 }, (_, index) => index);
  const step = Math.max(1, Math.ceil(maxValue / 5));
  const ticks: number[] = [];
  for (let tick = 0; tick <= maxValue + step; tick += step) ticks.push(tick);
  return ticks;
}

function buildSparkline(points: CompliancePoint[], key: OutcomeKey | 'avgRiskScore' | 'mfaTriggered'): number[] {
  return points.slice(-7).map((point) => point[key]);
}

function MetricCard(props: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  sparkline: number[];
}) {
  const sparkData = props.sparkline.length
    ? props.sparkline.map((value, index) => ({ index, value }))
    : Array.from({ length: 7 }).map((_, index) => ({ index, value: 0 }));
  const gradientId = `spark-${props.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-slate-900/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{props.title}</div>
          <div className="mt-2 text-2xl font-bold text-white">{props.value}</div>
          <div className="mt-1 truncate text-xs text-slate-400">{props.description}</div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-950/70" style={{ color: props.color }}>
          {props.icon}
        </div>
      </div>
      <div className="mt-3 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={props.color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={props.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke={props.color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FilterButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'h-8 shrink-0 rounded-full border px-3 text-xs font-bold transition-colors',
        props.active
          ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-100'
          : 'border-white/10 bg-slate-950/50 text-slate-400 hover:text-slate-200',
      )}
    >
      {props.label}
    </button>
  );
}

export default function Reports() {
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [lookback, setLookback] = useState<Lookback>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<RemediationStatus>('ALL');
  const [threatTypeFilter, setThreatTypeFilter] = useState<ThreatTypeFilter>('ALL');
  const [scoreRange, setScoreRange] = useState<ScoreRange>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [metrics, setMetrics] = useState<ComplianceMetrics>(emptyMetrics);
  const [remediations, setRemediations] = useState<RemediationEvent[]>([]);
  const [remediationTotal, setRemediationTotal] = useState(0);
  const [severityDistribution, setSeverityDistribution] = useState<SeverityDistributionItem[]>(buildSeverityDistribution([]));
  const [coverage, setCoverage] = useState<ComplianceCoverage>(DEFAULT_COVERAGE);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [detailsCache, setDetailsCache] = useState<Record<string, RemediationEvent>>({});
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCoverageLoading, setIsCoverageLoading] = useState(false);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>({
    reportType: 'Compliance Summary',
    frequency: 'Weekly',
    deliveryMethod: 'Email',
    recipientEmail: '',
    formats: ['PDF', 'CSV'],
  });

  const schedulingRef = useRef<HTMLDivElement>(null);

  const complianceQuery = useMemo(
    () => buildComplianceQuery(granularity, lookback, startDate, endDate),
    [endDate, granularity, lookback, startDate],
  );

  const legacyThreatQuery = useMemo(
    () => buildLegacyThreatCountsQuery(granularity, lookback, startDate, endDate),
    [endDate, granularity, lookback, startDate],
  );

  const remediationQuery = useMemo(
    () =>
      buildRemediationQuery({
        status: statusFilter,
        threatType: threatTypeFilter,
        scoreRange,
        search,
        page,
        lookback,
        startDate,
        endDate,
      }),
    [endDate, lookback, page, scoreRange, search, startDate, statusFilter, threatTypeFilter],
  );

  const chartTicks = useMemo(() => computeYTicks(metrics.points), [metrics.points]);

  const blockRate = metrics.totals.total > 0 ? ((metrics.totals.blocked / metrics.totals.total) * 100).toFixed(1) : '0.0';

  const statCards = [
    {
      title: 'Blocked',
      value: metrics.totals.blocked.toLocaleString(),
      description: 'Requests stopped by controls',
      icon: <ShieldAlert className="h-4 w-4" />,
      color: OUTCOME_COLORS.blocked,
      sparkline: buildSparkline(metrics.points, 'blocked'),
    },
    {
      title: 'Redacted',
      value: metrics.totals.redacted.toLocaleString(),
      description: 'Sensitive data masked',
      icon: <Lock className="h-4 w-4" />,
      color: OUTCOME_COLORS.redacted,
      sparkline: buildSparkline(metrics.points, 'redacted'),
    },
    {
      title: 'Clean',
      value: metrics.totals.clean.toLocaleString(),
      description: 'Requests passed safely',
      icon: <CheckCircle2 className="h-4 w-4" />,
      color: OUTCOME_COLORS.clean,
      sparkline: buildSparkline(metrics.points, 'clean'),
    },
    {
      title: 'Block Rate %',
      value: `${blockRate}%`,
      description: 'Blocked out of all outcomes',
      icon: <Gauge className="h-4 w-4" />,
      color: '#A78BFA',
      sparkline: metrics.points.slice(-7).map((point) => (point.total ? Number(((point.blocked / point.total) * 100).toFixed(1)) : 0)),
    },
    {
      title: 'Avg Risk Score',
      value: metrics.totals.avgRiskScore.toLocaleString(),
      description: 'Average evidence severity',
      icon: <Siren className="h-4 w-4" />,
      color: '#38BDF8',
      sparkline: buildSparkline(metrics.points, 'avgRiskScore'),
    },
    {
      title: 'MFA Triggered',
      value: metrics.totals.mfaTriggered.toLocaleString(),
      description: 'Step-up controls invoked',
      icon: <ShieldCheck className="h-4 w-4" />,
      color: '#F59E0B',
      sparkline: buildSparkline(metrics.points, 'mfaTriggered'),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(remediationTotal / PAGE_SIZE));
  const severityMax = Math.max(1, ...severityDistribution.map((item) => item.count));

  useEffect(() => {
    setPage(1);
  }, [endDate, lookback, scoreRange, search, startDate, statusFilter, threatTypeFilter]);

  useEffect(() => {
    let cancelled = false;

    const loadReports = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [newMetrics, legacyMetrics, remediationPayload, severityPayload] = await Promise.all([
          fetchOptionalJson<unknown>(`/api/v1/reports/compliance-metrics?${complianceQuery}`),
          fetchOptionalJson<unknown>(`/api/v1/reports/threat-counts?${legacyThreatQuery}`),
          authedFetchJson<unknown>(`/api/v1/reports/remediations?${remediationQuery}`),
          fetchOptionalJson<unknown>(`/api/v1/reports/severity-distribution?lookback=${lookback}`),
        ]);

        if (cancelled) return;

        const normalizedMetrics = normalizeComplianceMetrics(newMetrics ?? legacyMetrics, granularity);
        const normalizedRemediations = normalizeRemediationResponse(remediationPayload);
        const filteredRemediations = normalizedRemediations.serverPaged
          ? normalizedRemediations.events
          : applyClientRemediationFilters(
              normalizedRemediations.events,
              statusFilter,
              threatTypeFilter,
              scoreRange,
              search,
              lookback,
              startDate,
              endDate,
            );
        const visibleEvents = normalizedRemediations.serverPaged
          ? filteredRemediations
          : filteredRemediations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

        const riskScores = filteredRemediations.map((event) => event.score).filter((score) => score > 0);
        const avgRiskScore = normalizedMetrics.totals.avgRiskScore || (riskScores.length ? Math.round(riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length) : 0);
        const mfaTriggered = normalizedMetrics.totals.mfaTriggered || filteredRemediations.filter((event) => event.actions.some((action) => action.type.includes('MFA'))).length;

        setMetrics({
          points: normalizedMetrics.points,
          totals: {
            ...normalizedMetrics.totals,
            avgRiskScore,
            mfaTriggered,
          },
        });
        setRemediations(visibleEvents);
        setRemediationTotal(normalizedRemediations.serverPaged ? normalizedRemediations.total : filteredRemediations.length);
        setSeverityDistribution(normalizeSeverityDistribution(severityPayload) ?? buildSeverityDistribution(filteredRemediations));
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load reports.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadReports();
    return () => {
      cancelled = true;
    };
  }, [
    complianceQuery,
    endDate,
    granularity,
    legacyThreatQuery,
    lookback,
    page,
    remediationQuery,
    scoreRange,
    search,
    startDate,
    statusFilter,
    threatTypeFilter,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadCoverageAndSchedules = async () => {
      setIsCoverageLoading(true);
      setIsScheduleLoading(true);
      try {
        const [coveragePayload, schedulesPayload] = await Promise.all([
          fetchOptionalJson<unknown>('/api/v1/reports/compliance-coverage'),
          fetchOptionalJson<unknown>('/api/v1/reports/schedules'),
        ]);

        if (cancelled) return;
        setCoverage(normalizeCoverage(coveragePayload));
        setSchedules(normalizeSchedules(schedulesPayload));
      } catch {
        if (!cancelled) {
          setCoverage(DEFAULT_COVERAGE);
          setSchedules([]);
        }
      } finally {
        if (!cancelled) {
          setIsCoverageLoading(false);
          setIsScheduleLoading(false);
        }
      }
    };

    loadCoverageAndSchedules();
    return () => {
      cancelled = true;
    };
  }, []);

  const exportReport = async (type: 'threats' | 'remediations', format: ExportFormat) => {
    const key = `${type}-${format}`;
    setIsExporting(key);
    setError(null);
    try {
      const exportQuery = new URLSearchParams({
        type,
        format,
        granularity,
        lookback,
      });
      if (startDate) exportQuery.set('start', startDate);
      if (endDate) exportQuery.set('end', endDate);

      let response = await authedFetch(`/api/v1/reports/export?${exportQuery.toString()}`);
      if (!response.ok && [404, 405].includes(response.status)) {
        const fallbackUrl =
          type === 'threats'
            ? `/api/v1/reports/threat-counts/export?${legacyThreatQuery}&format=${format}`
            : `/api/v1/reports/remediations/export?format=${format}&limit=5000`;
        response = await authedFetch(fallbackUrl);
      }
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      await downloadResponse(response, `sentinel-${type}-${lookback}.${format}`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed.');
    } finally {
      setIsExporting(null);
    }
  };

  const toggleExpanded = async (event: RemediationEvent) => {
    const nextExpanded = new Set(expandedRows);
    if (nextExpanded.has(event.id)) {
      nextExpanded.delete(event.id);
      setExpandedRows(nextExpanded);
      return;
    }

    nextExpanded.add(event.id);
    setExpandedRows(nextExpanded);

    if (detailsCache[event.id]) return;

    setDetailsLoadingId(event.id);
    try {
      const payload = await fetchOptionalJson<unknown>(`/api/v1/reports/remediations/${encodeURIComponent(event.id)}`);
      const detail = payload ? normalizeRemediationEvent(payload) : event;
      setDetailsCache((current) => ({ ...current, [event.id]: detail }));
    } catch {
      setDetailsCache((current) => ({ ...current, [event.id]: event }));
    } finally {
      setDetailsLoadingId(null);
    }
  };

  const updateScheduleDraft = (key: keyof ScheduleDraft, value: string | string[]) => {
    setScheduleDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleFormat = (format: string) => {
    setScheduleDraft((current) => {
      const hasFormat = current.formats.includes(format);
      const formats = hasFormat ? current.formats.filter((item) => item !== format) : [...current.formats, format];
      return { ...current, formats: formats.length ? formats : [format] };
    });
  };

  const submitSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsScheduleLoading(true);
    setScheduleNotice(null);
    try {
      const payload = {
        reportType: scheduleDraft.reportType,
        frequency: scheduleDraft.frequency,
        deliveryMethod: scheduleDraft.deliveryMethod,
        recipientEmail: scheduleDraft.recipientEmail,
        formats: scheduleDraft.formats,
      };
      const created = await fetchOptionalJson<unknown>('/api/v1/reports/schedules', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (created) {
        setSchedules((current) => [normalizeSchedule(created), ...current]);
      } else {
        setSchedules((current) => [{ id: `local-${Date.now()}`, ...payload }, ...current]);
        setScheduleNotice('Scheduling API is not available yet; this schedule is shown for this session.');
      }
      setScheduleDraft((current) => ({ ...current, recipientEmail: '' }));
    } catch (submitError) {
      setScheduleNotice(submitError instanceof Error ? submitError.message : 'Failed to save schedule.');
    } finally {
      setIsScheduleLoading(false);
    }
  };

  const deleteSchedule = async (schedule: ReportSchedule) => {
    setIsScheduleLoading(true);
    setScheduleNotice(null);
    try {
      if (!schedule.id.startsWith('local-')) {
        const response = await authedFetch(`/api/v1/reports/schedules/${encodeURIComponent(schedule.id)}`, { method: 'DELETE' });
        if (!response.ok && ![404, 405].includes(response.status)) throw new Error(`Delete failed (${response.status})`);
        if (!response.ok) setScheduleNotice('Scheduling API is not available yet; removed locally.');
      }
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
    } catch (deleteError) {
      setScheduleNotice(deleteError instanceof Error ? deleteError.message : 'Failed to delete schedule.');
    } finally {
      setIsScheduleLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7 text-emerald-300" />
            <h1 className="text-3xl font-bold tracking-tight text-white">Reports & Alerts</h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">Compliance-ready threat metrics and remediation reporting.</p>
        </div>

        <div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          <Button
            className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => exportReport('threats', 'csv')}
            disabled={isExporting === 'threats-csv'}
          >
            <Download className="mr-2 h-4 w-4" /> Export Threats CSV
          </Button>
          <Button
            className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => exportReport('threats', 'json')}
            disabled={isExporting === 'threats-json'}
          >
            <FileJson className="mr-2 h-4 w-4" /> Export Threats JSON
          </Button>
          <Button
            className="shrink-0 bg-sky-600 text-white hover:bg-sky-700"
            onClick={() => exportReport('remediations', 'csv')}
            disabled={isExporting === 'remediations-csv'}
          >
            <Download className="mr-2 h-4 w-4" /> Export Remediations CSV
          </Button>
          <Button
            className="shrink-0 bg-sky-600 text-white hover:bg-sky-700"
            onClick={() => exportReport('remediations', 'json')}
            disabled={isExporting === 'remediations-json'}
          >
            <FileJson className="mr-2 h-4 w-4" /> Export Remediations JSON
          </Button>
          <Button
            className="shrink-0 bg-amber-500 text-slate-950 hover:bg-amber-400"
            onClick={() => schedulingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <CalendarClock className="mr-2 h-4 w-4" /> Schedule Report
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        {statCards.map((card) => (
          <div key={card.title}>
            <MetricCard {...card} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-lg border-white/10 bg-slate-900/45">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-5 w-5 text-emerald-300" /> Compliance Metrics
                </CardTitle>
                <CardDescription>Historical outcome evidence by blocked, redacted, and clean traffic.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                {(['blocked', 'redacted', 'clean'] as OutcomeKey[]).map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OUTCOME_COLORS[key] }} />
                    {compactLabel(key)}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Granularity
                <select
                  value={granularity}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setGranularity(event.target.value as Granularity)}
                  className="mt-1 h-9 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm font-normal normal-case tracking-normal text-slate-200 outline-none focus:border-indigo-400"
                >
                  {GRANULARITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Lookback
                <select
                  value={lookback}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setLookback(event.target.value as Lookback)}
                  className="mt-1 h-9 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm font-normal normal-case tracking-normal text-slate-200 outline-none focus:border-indigo-400"
                >
                  {LOOKBACK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Start
                <input
                  type="date"
                  value={startDate}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setStartDate(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm font-normal normal-case tracking-normal text-slate-200 outline-none focus:border-indigo-400"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                End
                <input
                  type="date"
                  value={endDate}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setEndDate(event.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm font-normal normal-case tracking-normal text-slate-200 outline-none focus:border-indigo-400"
                />
              </label>
              <div className="flex items-end">
                <div className="flex h-9 w-full items-center justify-center rounded-md border border-white/10 bg-slate-950/70 text-xs font-semibold text-slate-400">
                  {isLoading ? 'Refreshing evidence' : `${metrics.totals.total.toLocaleString()} total outcomes`}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80 min-w-0">
              {metrics.points.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.points} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                    <defs>
                      {(['blocked', 'redacted', 'clean'] as OutcomeKey[]).map((key) => (
                        <linearGradient key={key} id={`compliance-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={OUTCOME_COLORS[key]} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={OUTCOME_COLORS[key]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#64748B"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      ticks={chartTicks}
                      tickFormatter={(value) => String(Math.round(Number(value)))}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #1E293B', borderRadius: '8px' }}
                      labelStyle={{ color: '#CBD5E1' }}
                      formatter={(value: unknown, name: unknown) => [Math.round(Number(value)).toLocaleString(), compactLabel(String(name))]}
                    />
                    <Area type="monotone" dataKey="blocked" stroke={OUTCOME_COLORS.blocked} fill="url(#compliance-blocked)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="redacted" stroke={OUTCOME_COLORS.redacted} fill="url(#compliance-redacted)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="clean" stroke={OUTCOME_COLORS.clean} fill="url(#compliance-clean)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-slate-400">
                  No compliance metrics available for this period.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-white/10 bg-slate-900/45">
          <CardHeader>
            <CardTitle className="text-base">Severity Distribution</CardTitle>
            <CardDescription>Remediation evidence grouped by auditor-facing severity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {severityDistribution.map((item) => (
              <div key={item.severity}>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-300">{compactLabel(item.severity)}</span>
                  <span className="font-mono text-slate-500">{item.count.toLocaleString()}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-950">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(item.count ? (item.count / severityMax) * 100 : 0, item.count ? 8 : 0)}%`,
                      backgroundColor: SEVERITY_COLORS[item.severity],
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg border-white/10 bg-slate-900/45">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Siren className="h-5 w-5 text-sky-300" /> Recent Remediation Events
              </CardTitle>
              <CardDescription>Read-only audit evidence for automated controls and remediation activity.</CardDescription>
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                placeholder="Search evidence, tags, keys..."
                className="h-9 w-full rounded-md border border-white/10 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Status</span>
              {STATUS_FILTERS.map((item) => (
                <span key={item.value}>
                  <FilterButton active={statusFilter === item.value} label={item.label} onClick={() => setStatusFilter(item.value)} />
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Threat Type</span>
              {THREAT_TYPE_FILTERS.map((item) => (
                <span key={item.value}>
                  <FilterButton active={threatTypeFilter === item.value} label={item.label} onClick={() => setThreatTypeFilter(item.value)} />
                </span>
              ))}
              <select
                value={scoreRange}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setScoreRange(event.target.value as ScoreRange)}
                className="h-8 rounded-md border border-white/10 bg-slate-950/70 px-3 text-xs font-semibold text-slate-300 outline-none focus:border-indigo-400"
              >
                {SCORE_RANGES.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-280 w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-slate-950/60 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Threat Type</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Action Evidence</th>
                  <th className="px-4 py-3">API Key</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-slate-950/20">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                      Loading remediation evidence...
                    </td>
                  </tr>
                ) : remediations.length ? (
                  remediations.map((event) => {
                    const detail = detailsCache[event.id] ?? event;
                    const isExpanded = expandedRows.has(event.id);
                    return (
                      <tr key={event.id} className="align-top">
                        <td colSpan={9} className="p-0">
                          <div className="grid min-w-280 grid-cols-[1.2fr_140px_170px_120px_90px_220px_170px_150px_90px] items-center gap-0 px-4 py-3">
                            <div className="min-w-0 pr-4">
                              <div className="truncate font-mono text-xs text-slate-400">#{event.id}</div>
                              <div className="mt-1 truncate text-xs text-slate-500">log {event.logId}</div>
                            </div>
                            <div>
                              <Badge className={cn('border', STATUS_STYLES[event.status])}>{event.status}</Badge>
                            </div>
                            <div>
                              <Badge className={cn('border', severityBadgeClassName(event.severity))}>{compactLabel(event.threatType)}</Badge>
                            </div>
                            <div className="font-semibold text-slate-300">{compactLabel(event.severity)}</div>
                            <div className={cn('font-mono font-semibold', scoreClassName(event.score))}>{event.score}</div>
                            <div className="flex flex-wrap gap-2 pr-3">
                              {event.actions.length ? (
                                event.actions.slice(0, 2).map((action, index) => (
                                  <span key={`${event.id}-${action.type}-${index}`} className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', actionClassName(action))}>
                                    {actionLabel(action.type)}
                                  </span>
                                ))
                              ) : (
                                <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-400">Evidence logged</span>
                              )}
                              {event.actions.length > 2 ? <span className="text-xs text-slate-500">+{event.actions.length - 2}</span> : null}
                            </div>
                            <div className="truncate pr-3 font-mono text-xs text-slate-400">{event.apiKey ?? '[anonymous]'}</div>
                            <div className="text-xs text-slate-400">{formatDateTime(event.timestamp)}</div>
                            <div className="flex justify-end">
                              <Button variant="ghost" size="icon" onClick={() => toggleExpanded(event)} aria-label={isExpanded ? 'Collapse evidence' : 'Expand evidence'}>
                                <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
                              </Button>
                            </div>
                          </div>
                          {isExpanded ? (
                            <div className="border-t border-white/10 bg-slate-950/45 px-6 py-4">
                              {detailsLoadingId === event.id ? (
                                <div className="text-sm text-slate-400">Loading evidence details...</div>
                              ) : (
                                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                                  <div>
                                    <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Execution Trace</div>
                                    <div className="space-y-3">
                                      {detail.executionTrace.map((trace, index) => (
                                        <div key={`${event.id}-trace-${index}`} className="flex gap-3 rounded-md border border-white/10 bg-slate-900/50 p-3">
                                          <span
                                            className={cn(
                                              'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                                              trace.level === 'ok' && 'bg-emerald-400',
                                              trace.level === 'warn' && 'bg-amber-400',
                                              trace.level === 'error' && 'bg-red-400',
                                              trace.level === 'info' && 'bg-sky-400',
                                            )}
                                          />
                                          <div className="min-w-0">
                                            <div className="text-sm text-slate-200">{trace.message}</div>
                                            <div className="mt-1 text-xs text-slate-500">{formatDateTime(trace.time)}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Compliance Tags</div>
                                    <div className="flex flex-wrap gap-2">
                                      {detail.complianceTags.map((tag) => (
                                        <Badge key={`${event.id}-${tag}`} variant="outline" className="border-indigo-400/30 bg-indigo-500/10 text-indigo-100">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                      No remediation evidence matches the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-400">
              Showing page {page} of {totalPages} across {remediationTotal.toLocaleString()} evidence events.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg border-white/10 bg-slate-900/45">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-emerald-300" /> Compliance Framework Coverage
          </CardTitle>
          <CardDescription>Controls mapped to evidence available in Reports & Alerts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {FRAMEWORKS.map((framework) => {
              const item = coverage[framework.key];
              return (
                <div key={framework.key} className="rounded-lg border border-white/10 bg-slate-950/35 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-semibold text-white">{framework.label}</div>
                    <div className="font-mono text-sm text-emerald-300">{isCoverageLoading ? '...' : `${item.coveragePct}%`}</div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-900">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${item.coveragePct}%` }} />
                  </div>
                  <div className="mt-4 space-y-3">
                    {item.controls.map((control) => (
                      <div key={control.id} className="flex items-start gap-3 text-sm">
                        {control.covered ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                        <div className="min-w-0">
                          <div className="font-medium text-slate-200">{control.id}</div>
                          <div className="text-xs text-slate-500">{control.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div ref={schedulingRef} id="report-scheduling">
        <Card className="rounded-lg border-white/10 bg-slate-900/45">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-amber-300" /> Report Scheduling
            </CardTitle>
            <CardDescription>Deliver recurring compliance evidence to the right reviewers.</CardDescription>
          </CardHeader>
          <CardContent>
            {scheduleNotice ? (
              <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {scheduleNotice}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
              <form onSubmit={submitSchedule} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Report Type
                  <select
                    value={scheduleDraft.reportType}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => updateScheduleDraft('reportType', event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm font-normal normal-case tracking-normal text-slate-200 outline-none focus:border-indigo-400"
                  >
                    <option>Compliance Summary</option>
                    <option>Threat Outcomes</option>
                    <option>Remediation Evidence</option>
                    <option>Framework Coverage</option>
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Frequency
                  <select
                    value={scheduleDraft.frequency}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => updateScheduleDraft('frequency', event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm font-normal normal-case tracking-normal text-slate-200 outline-none focus:border-indigo-400"
                  >
                    <option>Daily</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                    <option>Quarterly</option>
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Delivery Method
                  <select
                    value={scheduleDraft.deliveryMethod}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) => updateScheduleDraft('deliveryMethod', event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm font-normal normal-case tracking-normal text-slate-200 outline-none focus:border-indigo-400"
                  >
                    <option>Email</option>
                    <option>Webhook</option>
                    <option>Secure Portal</option>
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Recipient Email
                  <input
                    type="email"
                    required
                    value={scheduleDraft.recipientEmail}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => updateScheduleDraft('recipientEmail', event.target.value)}
                    placeholder="audit@example.com"
                    className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm font-normal normal-case tracking-normal text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400"
                  />
                </label>
                <div className="md:col-span-2">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Formats</div>
                  <div className="flex flex-wrap gap-2">
                    {['PDF', 'CSV', 'JSON'].map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => toggleFormat(format)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                          scheduleDraft.formats.includes(format)
                            ? 'border-amber-400/50 bg-amber-500/15 text-amber-100'
                            : 'border-white/10 bg-slate-950/50 text-slate-400 hover:text-slate-200',
                        )}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" className="bg-amber-500 text-slate-950 hover:bg-amber-400" disabled={isScheduleLoading}>
                    <Bell className="mr-2 h-4 w-4" /> Save Schedule
                  </Button>
                </div>
              </form>

              <div className="rounded-lg border border-white/10 bg-slate-950/35">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="font-semibold text-white">Active Schedules</div>
                  <div className="text-xs text-slate-500">{schedules.length.toLocaleString()} configured deliveries</div>
                </div>
                <div className="max-h-90 divide-y divide-white/10 overflow-y-auto">
                  {isScheduleLoading && schedules.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-400">Loading schedules...</div>
                  ) : schedules.length ? (
                    schedules.map((schedule) => (
                      <div key={schedule.id} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-200">{schedule.reportType}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>{schedule.frequency}</span>
                            <span>{schedule.deliveryMethod}</span>
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {schedule.recipientEmail || 'No recipient'}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {schedule.formats.map((format) => (
                              <Badge key={`${schedule.id}-${format}`} variant="outline" className="border-white/10 text-slate-300">
                                {format}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => deleteSchedule(schedule)} aria-label="Delete schedule">
                          <Trash2 className="h-4 w-4 text-slate-400" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-sm text-slate-400">No active report schedules.</div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
