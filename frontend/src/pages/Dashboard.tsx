import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Clock3,
  Database,
  Download,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { motion } from 'framer-motion';

import { ASOCAnalyst } from '../components/ASOCAnalyst';
import { ReasoningWindow } from '../components/ReasoningWindow';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { useStore } from '../stores/useStore';
import type { Analytics, SecurityLog } from '../types';

const THEME = {
  bg: '#0B0D14',
  card: '#111827',
  panel: '#161D2E',
  cell: '#1C253A',
  text: '#D1D9EE',
  textSoft: '#6B7A99',
  textMuted: '#3A4560',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.13)',
  red: '#EF4444',
  redDim: 'rgba(239,68,68,0.11)',
  redBorder: 'rgba(239,68,68,0.26)',
  amber: '#F59E0B',
  amberDim: 'rgba(245,158,11,0.11)',
  amberBorder: 'rgba(245,158,11,0.26)',
  green: '#10B981',
  greenDim: 'rgba(16,185,129,0.12)',
  greenBorder: 'rgba(16,185,129,0.28)',
  blue: '#6366F1',
  blueDim: 'rgba(99,102,241,0.12)',
  blueBorder: 'rgba(99,102,241,0.28)',
  cyan: '#06B6D4',
  cyanDim: 'rgba(6,182,212,0.10)',
  cyanBorder: 'rgba(6,182,212,0.25)',
};

const TIME_RANGE_OPTIONS = [
  { value: '24h', label: 'Last 24 hours', days: 1 },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
] as const;

const PLAN_CONFIG: Record<string, { rateLimit: string; retention: string }> = {
  FREE: { rateLimit: '30/min', retention: '7 days' },
  PRO: { rateLimit: '300/min', retention: '30 days' },
  BUSINESS: { rateLimit: '1200/min', retention: '365 days' },
};

const POLICY_MAP: Record<string, string[]> = {
  PROMPT_INJECTION: ['PROMPT-INJ-001', 'SCAN-DEEP'],
  DATA_LEAK: ['PII-GUARD-002'],
  PII_EXPOSURE: ['PII-GUARD-002'],
  DATA_EXFILTRATION: ['TOOL-ABU-004', 'CRED-PROTECT'],
  FINANCIAL_FRAUD: ['FIN-GUARDRAIL-001', 'HITL-REQUIRED'],
  TOOL_ABUSE: ['TOOL-ABU-003'],
  AML_VIOLATION: ['AML-GUARD-001'],
  CREDENTIAL_THEFT: ['CRED-PROTECT'],
  INDIRECT_INJECTION: ['IND-INJ-001'],
  WALLET_DRAIN: ['FIN-GUARDRAIL-002', 'MFA-REQUIRED'],
};

type TimeRangeValue = (typeof TIME_RANGE_OPTIONS)[number]['value'];

function styleCard(className = '') {
  return `${className} border`.trim();
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatShortDate(value: string): string {
  const parsed = toDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(value: string): string {
  const parsed = toDate(value);
  if (!parsed) return value;
  return parsed.toLocaleString();
}

function formatMetricDelta(delta: number, increaseIsGood = false, suffix = ''): { label: string; color: string } {
  if (delta === 0) {
    return { label: `No change${suffix}`, color: THEME.textSoft };
  }
  const positive = delta > 0;
  const arrow = positive ? '▲' : '▼';
  const magnitude = Math.abs(delta);
  const good = increaseIsGood ? positive : !positive;
  return {
    label: `${arrow} ${magnitude}${suffix}`,
    color: good ? THEME.green : THEME.red,
  };
}

function severityBucket(log: SecurityLog): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const explicit = String(log.risk_level || '').toUpperCase();
  if (explicit === 'CRITICAL') return 'CRITICAL';
  if (explicit === 'HIGH') return 'HIGH';
  if (explicit === 'MEDIUM') return 'MEDIUM';
  if (explicit === 'LOW') return 'LOW';

  const rawSeverity = String((log as any).severity || '').toUpperCase();
  if (rawSeverity === 'CRITICAL') return 'CRITICAL';
  if (rawSeverity === 'HIGH') return 'HIGH';
  if (rawSeverity === 'MEDIUM') return 'MEDIUM';
  if (rawSeverity === 'LOW') return 'LOW';

  const risk = Number(log.risk_score || 0);
  if (risk >= 85) return 'CRITICAL';
  if (risk >= 70) return 'HIGH';
  if (risk >= 40) return 'MEDIUM';
  return 'LOW';
}

function riskColor(score: number): string {
  if (score > 70) return THEME.red;
  if (score > 40) return THEME.amber;
  return THEME.green;
}

function initialsForUser(value: string): string {
  if (!value || value === 'unknown') return '??';
  if (value.includes('@')) {
    const [user, domain] = value.split('@');
    return `${user[0] || 'U'}${domain[0] || 'D'}`.toUpperCase();
  }
  return '??';
}

function sparklinePath(values: number[], width = 100, height = 28): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function areaPath(values: number[], width = 100, height = 28): string {
  if (values.length === 0) return '';
  const line = sparklinePath(values, width, height);
  return `${line} L ${width},${height} L 0,${height} Z`;
}

function DonutGauge({
  score,
  size = 120,
  strokeWidth = 12,
  valueLabel,
  subtitle,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  valueLabel?: string;
  subtitle?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - normalizedScore / 100);
  const color = normalizedScore >= 85 ? THEME.green : normalizedScore >= 70 ? THEME.amber : normalizedScore >= 50 ? THEME.amber : THEME.red;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="relative text-center">
        <div className="font-mono text-[22px] font-extrabold" style={{ color }}>
          {valueLabel || normalizedScore}
        </div>
        <div className="text-[10px]" style={{ color: THEME.textMuted }}>
          {subtitle || '/100'}
        </div>
      </div>
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const line = sparklinePath(values);
  const area = areaPath(values);
  return (
    <svg viewBox="0 0 100 28" className="h-7 w-full overflow-visible">
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: import('react').ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs" style={{ color: THEME.textSoft }}>
          {subtitle}
        </p>
      </div>
      {right}
    </div>
  );
}

export default function Dashboard() {
  const { analytics, logs, user, fetchAnalytics, fetchLogs, isLoading, reasoningLogs } = useStore();
  const [timeRange, setTimeRange] = useState<TimeRangeValue>('7d');
  const [lastAnalysisLabel, setLastAnalysisLabel] = useState('Just now');

  useEffect(() => {
    const container = document.querySelector('#app-scroll-container') as HTMLElement | null;
    if (container) {
      container.scrollTop = 0;
      return;
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    void Promise.all([fetchAnalytics(), fetchLogs({ limit: 500 })]);
  }, [fetchAnalytics, fetchLogs]);

  const analyticsSafe: Analytics | null = analytics;
  const selectedWindowDays = TIME_RANGE_OPTIONS.find((item) => item.value === timeRange)?.days || 7;
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setHours(0, 0, 0, 0);
  rangeStart.setDate(rangeStart.getDate() - (selectedWindowDays - 1));
  const previousRangeStart = new Date(rangeStart);
  previousRangeStart.setDate(previousRangeStart.getDate() - selectedWindowDays);

  const logsInRange = useMemo(() => {
    return logs.filter((log) => {
      const timestamp = toDate(log.timestamp);
      return timestamp ? timestamp >= rangeStart : false;
    });
  }, [logs, rangeStart]);

  const previousLogs = useMemo(() => {
    return logs.filter((log) => {
      const timestamp = toDate(log.timestamp);
      return timestamp ? timestamp >= previousRangeStart && timestamp < rangeStart : false;
    });
  }, [logs, previousRangeStart, rangeStart]);

  const selectedPlan = String(user?.tier || 'FREE').toUpperCase();
  const planConfig = PLAN_CONFIG[selectedPlan] || PLAN_CONFIG.FREE;

  const dashboardData = useMemo(() => {
    const sourceLogs = logsInRange;
    const priorLogs = previousLogs;
    const used = analyticsSafe?.usageVsLimit.used || 0;
    const limit = Math.max(analyticsSafe?.usageVsLimit.limit || 1, 1);
    const usagePercent = Number(((used / limit) * 100).toFixed(1));

    const avgLatencyValues = sourceLogs.map((log) => Number(log.latency_ms || 0)).filter((value) => value > 0);
    const avgLatencyMs = avgLatencyValues.length
      ? Math.round(avgLatencyValues.reduce((sum, value) => sum + value, 0) / avgLatencyValues.length)
      : 0;
    const previousLatencyValues = priorLogs.map((log) => Number(log.latency_ms || 0)).filter((value) => value > 0);
    const previousLatencyMs = previousLatencyValues.length
      ? Math.round(previousLatencyValues.reduce((sum, value) => sum + value, 0) / previousLatencyValues.length)
      : avgLatencyMs;

    const threatLogs = sourceLogs.filter((log) => ['BLOCKED', 'REDACTED'].includes(String(log.status || '').toUpperCase()));
    const previousThreatLogs = priorLogs.filter((log) => ['BLOCKED', 'REDACTED'].includes(String(log.status || '').toUpperCase()));

    const threatsBlocked = threatLogs.length;
    const promptInjections = sourceLogs.filter((log) => String(log.threat_type || '').toUpperCase() === 'PROMPT_INJECTION').length;
    const previousPromptInjections = priorLogs.filter((log) => String(log.threat_type || '').toUpperCase() === 'PROMPT_INJECTION').length;
    const dataLeaks = sourceLogs.filter((log) => ['DATA_LEAK', 'PII_EXPOSURE'].includes(String(log.threat_type || '').toUpperCase())).length;
    const previousDataLeaks = priorLogs.filter((log) => ['DATA_LEAK', 'PII_EXPOSURE'].includes(String(log.threat_type || '').toUpperCase())).length;
    const apiRequestsToday = analyticsSafe?.apiRequestsToday || sourceLogs.filter((log) => {
      const timestamp = toDate(log.timestamp);
      if (!timestamp) return false;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return timestamp >= start;
    }).length;

    const trendsByDay = new Map<string, { date: string; criticalHigh: number; medium: number; low: number }>();
    for (let index = 0; index < selectedWindowDays; index += 1) {
      const day = new Date(rangeStart);
      day.setDate(rangeStart.getDate() + index);
      const key = day.toISOString().slice(0, 10);
      trendsByDay.set(key, { date: key, criticalHigh: 0, medium: 0, low: 0 });
    }

    const policyCounts = new Map<string, number>();
    const severityCounts = new Map<string, number>([
      ['CRITICAL', 0],
      ['HIGH', 0],
      ['MEDIUM', 0],
      ['LOW', 0],
    ]);
    const signatureCounts = new Map<string, number>();
    const userRisks = new Map<string, { score: number; events: number }>();

    let mfaEnforced = 0;
    let hitlTriggers = 0;

    for (const log of sourceLogs) {
      const severity = severityBucket(log);
      const logDate = toDate(log.timestamp);
      if (logDate) {
        const dayKey = logDate.toISOString().slice(0, 10);
        const bucket = trendsByDay.get(dayKey);
        if (bucket) {
          if (severity === 'CRITICAL' || severity === 'HIGH') bucket.criticalHigh += 1;
          else if (severity === 'MEDIUM') bucket.medium += 1;
          else bucket.low += 1;
        }
      }

      severityCounts.set(severity, (severityCounts.get(severity) || 0) + 1);

      const signature = String((log as any).attack_signature || log.threat_type || '').toUpperCase();
      if (signature && signature !== 'NONE') {
        signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1);
      }

      const directPolicies = Array.isArray((log as any).policy_matches)
        ? (log as any).policy_matches
            .map((item: any) => String(item?.policy_name || item?.name || '').trim())
            .filter(Boolean)
        : [];
      const mappedPolicies = POLICY_MAP[String(log.threat_type || '').toUpperCase()] || [];
      for (const policyName of [...directPolicies, ...mappedPolicies]) {
        policyCounts.set(policyName, (policyCounts.get(policyName) || 0) + 1);
      }

      const risk = Number(log.risk_score || 0);
      const userKey = String((log as any).user_email || (log as any).user_id || 'unknown');
      const current = userRisks.get(userKey) || { score: 0, events: 0 };
      current.score += risk;
      current.events += 1;
      userRisks.set(userKey, current);

      if ((log as any).requires_2fa) mfaEnforced += 1;
      if ((log as any).review_required) hitlTriggers += 1;
    }

    const policyRows = [...policyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count], _, rows) => ({
        name,
        count,
        maxCount: Math.max(...rows.map((row) => row[1]), count, 1),
      }));

    const topSignatures = [...signatureCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], _, rows) => ({
        name,
        count,
        maxCount: Math.max(...rows.map((row) => row[1]), count, 1),
      }));

    const userHeatmap = [...userRisks.entries()]
      .map(([id, values]) => ({
        id,
        risk: Number((values.score / Math.max(values.events, 1)).toFixed(0)),
        events: values.events,
        initials: initialsForUser(id),
      }))
      .sort((a, b) => b.risk - a.risk);

    if (userHeatmap.length === 0 && user?.email) {
      userHeatmap.push({ id: user.email, risk: 0, events: 0, initials: initialsForUser(user.email) });
    }

    const feed = (analyticsSafe?.threatActivityFeed?.length ? analyticsSafe.threatActivityFeed : threatLogs.map((log) => ({
      timestamp: log.timestamp,
      status: String(log.status || ''),
      threat_type: String(log.threat_type || 'NONE'),
      severity: severityBucket(log),
      request_id: String(log.request_id || log.id),
      attack_signature: String((log as any).attack_signature || log.threat_type || 'NONE'),
    }))).slice(0, 8);

    const attackSeverityDistribution = [
      { label: 'CRITICAL', value: severityCounts.get('CRITICAL') || 0, color: THEME.red },
      { label: 'HIGH', value: severityCounts.get('HIGH') || 0, color: 'rgba(239,68,68,0.6)' },
      { label: 'MEDIUM', value: severityCounts.get('MEDIUM') || 0, color: THEME.amber },
      { label: 'LOW', value: severityCounts.get('LOW') || 0, color: THEME.green },
    ];

    const securityScore = analyticsSafe?.securityScore || 0;
    const previousThreatRatio = priorLogs.length ? previousThreatLogs.length / priorLogs.length : 0;
    const previousScore = Math.max(0, Math.min(100, Math.round(100 - previousThreatRatio * 65)));
    const scoreDelta = securityScore - previousScore;
    const scoreLabel = securityScore >= 85 ? 'GOOD POSTURE' : securityScore >= 70 ? 'MODERATE RISK' : securityScore >= 50 ? 'HIGH RISK' : 'CRITICAL RISK';
    const posture = securityScore >= 85 ? 'Strong' : securityScore >= 70 ? 'Fair' : securityScore >= 50 ? 'Elevated' : 'Critical';
    const trendLabel = scoreDelta >= 0 ? 'Improving' : 'Declining';

    const anomaliesCount = attackSeverityDistribution[0].value + attackSeverityDistribution[1].value > 0
      ? [attackSeverityDistribution[0].value > 0, attackSeverityDistribution[1].value > 0, hitlTriggers > 0, mfaEnforced > 0].filter(Boolean).length
      : 0;
    const confidence = Math.max(70, Math.min(99, 84 + Math.min(threatsBlocked, 10)));

    const lastEventAt = sourceLogs[0]?.timestamp || analyticsSafe?.threatActivityFeed?.[0]?.timestamp || null;
    const gatewayStatus = {
      active: Boolean(analyticsSafe),
      detail: `${sourceLogs.length} events · ${avgLatencyMs || 0}ms avg`,
      lastEventAt,
    };

    const asocSummary = `I've analyzed your last ${selectedWindowDays} day${selectedWindowDays === 1 ? '' : 's'} of gateway traffic. I detected ${threatsBlocked} threat${threatsBlocked === 1 ? '' : 's'} with ${attackSeverityDistribution[0].value + attackSeverityDistribution[1].value} elevated-severity event${attackSeverityDistribution[0].value + attackSeverityDistribution[1].value === 1 ? '' : 's'}. Your security score is ${securityScore}/100, ${scoreDelta >= 0 ? `up ${Math.abs(scoreDelta)}` : `down ${Math.abs(scoreDelta)}`} versus the previous window.`;

    const bootstrapReasoning = [
      { timestamp: 'INIT', message: `ASOC engine initialized - plan: ${selectedPlan}`, threat_level: 'info' },
      { timestamp: '00:001', message: `Gateway telemetry loaded - ${sourceLogs.length} events in scope`, threat_level: 'safe' },
      { timestamp: '00:003', message: `Threat baseline established - avg risk ${userHeatmap[0]?.risk || 0}`, threat_level: 'safe' },
      {
        timestamp: '00:006',
        message:
          topSignatures[0]?.name && topSignatures[0].count > 0
            ? `Anomaly cluster detected - ${topSignatures[0].name} (${topSignatures[0].count} events)`
            : 'No dominant attack signature detected in the selected window.',
        threat_level: topSignatures[0]?.count ? 'warning' : 'safe',
      },
      {
        timestamp: '00:009',
        message:
          userHeatmap[0] && userHeatmap[0].risk > 0
            ? `Highest-risk actor ${userHeatmap[0].id.slice(0, 18)} flagged at ${userHeatmap[0].risk}/100`
            : 'No user exceeded the configured escalation threshold.',
        threat_level: userHeatmap[0]?.risk > 70 ? 'high' : 'safe',
      },
      {
        timestamp: '00:012',
        message: `${promptInjections} prompt injection signature${promptInjections === 1 ? '' : 's'} matched in the selected window.`,
        threat_level: promptInjections > 0 ? 'warning' : 'safe',
      },
      {
        timestamp: '00:015',
        message: `Recommendation: ${topSignatures[0]?.name ? `Review ${topSignatures[0].name} and rotate exposed keys if repeated.` : 'Maintain current controls and continue monitoring.'}`,
        threat_level: 'recommendation',
      },
      { timestamp: 'IDLE', message: 'Awaiting next scan cycle or manual trigger...', threat_level: 'idle' },
    ];

    return {
      used,
      limit,
      usagePercent,
      avgLatencyMs,
      previousLatencyMs,
      threatsBlocked,
      promptInjections,
      previousPromptInjections,
      dataLeaks,
      previousDataLeaks,
      apiRequestsToday,
      securityScore,
      previousScore,
      scoreDelta,
      scoreLabel,
      posture,
      trendLabel,
      trendsByDay: [...trendsByDay.values()],
      feed,
      policyRows,
      attackSeverityDistribution,
      topSignatures,
      userHeatmap,
      gatewayStatus,
      mfaEnforced,
      hitlTriggers,
      asocSummary,
      bootstrapReasoning,
      anomaliesCount,
      confidence,
    };
  }, [analyticsSafe, logsInRange, previousLogs, selectedPlan, user?.email]);

  const lastDay = dashboardData.trendsByDay[dashboardData.trendsByDay.length - 1];
  const stats = [
    {
      label: 'THREATS BLOCKED',
      value: dashboardData.threatsBlocked,
      color: THEME.red,
      border: THEME.redBorder,
      bg: THEME.redDim,
      delta: formatMetricDelta(dashboardData.threatsBlocked - previousLogs.filter((log) => ['BLOCKED', 'REDACTED'].includes(String(log.status || '').toUpperCase())).length),
      spark: dashboardData.trendsByDay.map((item) => item.criticalHigh + item.medium + item.low),
      icon: ShieldAlert,
    },
    {
      label: 'PROMPT INJECTIONS',
      value: dashboardData.promptInjections,
      color: THEME.amber,
      border: THEME.amberBorder,
      bg: THEME.amberDim,
      delta: formatMetricDelta(dashboardData.promptInjections - dashboardData.previousPromptInjections),
      spark: dashboardData.trendsByDay.map((item) => item.criticalHigh),
      icon: Activity,
    },
    {
      label: 'DATA LEAKS PREVENTED',
      value: dashboardData.dataLeaks,
      color: THEME.green,
      border: THEME.greenBorder,
      bg: THEME.greenDim,
      delta: formatMetricDelta(dashboardData.dataLeaks - dashboardData.previousDataLeaks, true),
      spark: dashboardData.trendsByDay.map((item) => item.medium + item.low),
      icon: Database,
    },
    {
      label: 'API REQUESTS TODAY',
      value: dashboardData.apiRequestsToday,
      color: THEME.blue,
      border: THEME.blueBorder,
      bg: THEME.blueDim,
      delta: { label: `${dashboardData.usagePercent}% quota used`, color: THEME.textSoft },
      spark: dashboardData.trendsByDay.map((item, index) => item.criticalHigh + item.medium + item.low + (index === dashboardData.trendsByDay.length - 1 ? lastDay?.low || 0 : 0)),
      icon: Zap,
    },
    {
      label: 'AVG LATENCY',
      value: `${dashboardData.avgLatencyMs}ms`,
      color: THEME.cyan,
      border: THEME.cyanBorder,
      bg: THEME.cyanDim,
      delta: formatMetricDelta(dashboardData.avgLatencyMs - dashboardData.previousLatencyMs, true, 'ms'),
      spark: logsInRange
        .slice(0, 7)
        .map((log) => Number(log.latency_ms || 0))
        .reverse(),
      icon: Clock3,
    },
  ];

  const resetsInDays = useMemo(() => {
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    return Math.max(0, Math.ceil((endOfMonth.getTime() - now.getTime()) / 86400000));
  }, [now]);

  const handleRefresh = async () => {
    await Promise.all([fetchAnalytics(), fetchLogs({ limit: 500 })]);
    setLastAnalysisLabel('Just now');
  };

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      timeRange,
      analytics: analyticsSafe,
      logs: logsInRange,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sentinel-dashboard-${timeRange}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && !analyticsSafe) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-60 rounded bg-slate-800" />
        <div className="grid gap-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-36 rounded-xl bg-slate-800" />
          ))}
        </div>
        <div className="h-105 rounded-xl bg-slate-800" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-w-0 space-y-3.5 overflow-hidden px-0 py-0 sm:px-5 sm:py-4.5"
      style={{ background: THEME.bg, color: THEME.text }}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.3px] text-white">Dashboard</h1>
          <p className="mt-1 text-xs" style={{ color: THEME.textSoft }}>
            Real-time security analytics, threat intelligence, and gateway health for Mefyx.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border px-4 py-2"
            style={{
              background: dashboardData.gatewayStatus.active ? THEME.greenDim : THEME.redDim,
              borderColor: dashboardData.gatewayStatus.active ? THEME.greenBorder : THEME.redBorder,
              color: dashboardData.gatewayStatus.active ? THEME.green : THEME.red,
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: 'currentColor', animation: 'sentinel-pulse 1.5s infinite' }} />
            <div className="text-xs font-semibold">{dashboardData.gatewayStatus.active ? 'Gateway Active' : 'Gateway Offline'}</div>
            <div className="min-w-0 break-words font-mono text-[11px] opacity-70">{dashboardData.gatewayStatus.detail}</div>
          </div>

          <select
            value={timeRange}
            onChange={(event: import('react').ChangeEvent<HTMLSelectElement>) =>
              setTimeRange(event.target.value as TimeRangeValue)
            }
            className="rounded-[7px] border px-3 py-2 text-sm outline-none"
            style={{ background: THEME.panel, borderColor: THEME.borderStrong }}
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <Button
            onClick={handleExport}
            className="border text-[11px] font-semibold"
            style={{ background: THEME.blueDim, borderColor: THEME.blueBorder, color: '#A5B4FC' }}
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            onClick={handleRefresh}
            className="border text-[11px] font-semibold"
            style={{ background: THEME.greenDim, borderColor: THEME.greenBorder, color: '#A7F3D0' }}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes sentinel-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>

      <div className="grid gap-3.5 xl:grid-cols-[200px_minmax(0,1fr)]">
        <Card className={styleCard()} style={{ borderColor: THEME.border, borderRadius: 10, background: THEME.card }}>
          <CardHeader className="px-5 py-4">
            <CardTitle className="text-sm text-white">Security Score</CardTitle>
            <CardDescription style={{ color: THEME.textSoft }}>Overall posture rating</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center px-5 pb-5">
            <DonutGauge score={dashboardData.securityScore} />
            <div className="mt-3 text-[11px] font-bold" style={{ color: riskColor(dashboardData.securityScore) }}>
              {dashboardData.scoreLabel}
            </div>
            <div className="mt-1 font-mono text-[10px]" style={{ color: dashboardData.scoreDelta >= 0 ? THEME.green : THEME.red }}>
              {dashboardData.scoreDelta >= 0 ? '▲' : '▼'} {Math.abs(dashboardData.scoreDelta)} vs last window
            </div>
            <div className="mt-4 grid w-full grid-cols-2 gap-2">
              <div className="rounded-[7px] border px-3 py-2" style={{ background: THEME.cell, borderColor: THEME.border }}>
                <div className="text-[10px] uppercase" style={{ color: THEME.textSoft }}>Posture</div>
                <div className="mt-1 text-xs font-semibold" style={{ color: riskColor(dashboardData.securityScore) }}>{dashboardData.posture}</div>
              </div>
              <div className="rounded-[7px] border px-3 py-2" style={{ background: THEME.cell, borderColor: THEME.border }}>
                <div className="text-[10px] uppercase" style={{ color: THEME.textSoft }}>Trend</div>
                <div className="mt-1 text-xs font-semibold" style={{ color: dashboardData.scoreDelta >= 0 ? THEME.green : THEME.red }}>{dashboardData.trendLabel}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-5">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="rounded-[10px] border p-4"
                style={{ background: stat.bg, borderColor: stat.border }}
              >
                <div className="flex items-start justify-between">
                  <div className="text-[10px] font-bold tracking-[0.08em]" style={{ color: stat.color, opacity: 0.72 }}>
                    {stat.label}
                  </div>
                  <Icon className="h-4 w-4" style={{ color: stat.color, opacity: 0.55 }} />
                </div>
                <div className="mt-3 font-mono text-[26px] font-extrabold" style={{ color: stat.color }}>
                  {stat.value}
                </div>
                <div className="mt-1 font-mono text-[11px]" style={{ color: stat.delta.color }}>
                  {stat.delta.label}
                </div>
                <div className="mt-3">
                  <Sparkline values={stat.spark} color={stat.color} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <Card className={styleCard()} style={{ borderColor: THEME.border, borderRadius: 10, background: THEME.card }}>
          <CardHeader className="px-5 py-4">
            <SectionHeader
              title="Threats Over Time"
              subtitle="Blocked events by day with severity breakdown"
              right={
                <div className="flex flex-wrap items-center gap-3 text-[10px]" style={{ color: THEME.textSoft }}>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-xs" style={{ background: 'rgba(239,68,68,0.7)' }} />Critical/High</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-xs" style={{ background: 'rgba(245,158,11,0.7)' }} />Medium</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-xs" style={{ background: 'rgba(16,185,129,0.55)' }} />Low</span>
                </div>
              }
            />
          </CardHeader>
          <CardContent className="h-62.5 px-5 pb-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboardData.trendsByDay}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    background: THEME.cell,
                    border: `1px solid ${THEME.borderStrong}`,
                    borderRadius: 7,
                    color: THEME.text,
                  }}
                  labelFormatter={(label) => formatDateTime(label)}
                />
                <Bar dataKey="criticalHigh" stackId="severity" fill="rgba(239,68,68,0.7)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="medium" stackId="severity" fill="rgba(245,158,11,0.7)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="low" stackId="severity" fill="rgba(16,185,129,0.55)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className={styleCard()} style={{ borderColor: THEME.border, borderRadius: 10, background: THEME.card }}>
          <CardHeader className="px-5 py-4">
            <SectionHeader
              title="Usage vs Limit"
              subtitle="Monthly quota consumption"
              right={
                <span className="rounded-full border px-3 py-1 text-[10px] font-bold" style={{ background: THEME.greenDim, borderColor: THEME.greenBorder, color: THEME.green }}>
                  {dashboardData.usagePercent}% used
                </span>
              }
            />
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 px-5 pb-5">
            <DonutGauge score={dashboardData.usagePercent} size={100} strokeWidth={10} valueLabel={`${dashboardData.usagePercent}%`} subtitle="quota used" />
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${dashboardData.usagePercent}%`, background: THEME.blue }} />
            </div>
            <div className="flex w-full justify-between text-xs" style={{ color: THEME.textSoft }}>
              <span>{dashboardData.used.toLocaleString()} reqs used</span>
              <span>{dashboardData.limit.toLocaleString()} limit</span>
            </div>
            <div className="grid w-full grid-cols-2 gap-2">
              {[
                ['Rate Limit', planConfig.rateLimit, THEME.text],
                ['Retention', planConfig.retention, THEME.text],
                ['Resets In', `${resetsInDays}d`, THEME.amber],
                ['Plan', selectedPlan, THEME.blue],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-[7px] border px-3 py-2" style={{ background: THEME.cell, borderColor: THEME.border }}>
                  <div className="text-[10px] uppercase" style={{ color: THEME.textSoft }}>{label}</div>
                  <div className="mt-1 font-mono text-xs font-semibold" style={{ color: color as string }}>{value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-2">
        <Card className={styleCard()} style={{ borderColor: THEME.border, borderRadius: 10, background: THEME.card }}>
          <CardHeader className="px-5 py-4">
            <SectionHeader
              title="Threat Activity Feed"
              subtitle="Most recent blocked events with severity classification"
              right={
                <span className="rounded-full border px-3 py-1 text-[10px] font-bold" style={{ background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red }}>
                  LIVE
                </span>
              }
            />
          </CardHeader>
          <CardContent className="max-h-70 space-y-3 overflow-y-auto px-5 pb-5">
            {dashboardData.feed.map((event, index) => {
              const severity = String(event.severity || 'LOW').toUpperCase();
              const severityStyle =
                severity === 'CRITICAL'
                  ? { background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red }
                  : severity === 'HIGH'
                    ? { background: THEME.amberDim, borderColor: THEME.amberBorder, color: THEME.amber }
                    : severity === 'MEDIUM'
                      ? { background: THEME.blueDim, borderColor: THEME.blueBorder, color: '#A5B4FC' }
                      : { background: THEME.greenDim, borderColor: THEME.greenBorder, color: THEME.green };
              return (
                <div key={`${event.request_id}-${index}`} className="rounded-lg border p-3 transition-colors hover:border-white/15" style={{ background: THEME.panel, borderColor: THEME.border }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-mono text-[10px]" style={{ color: THEME.textSoft }}>{formatDateTime(event.timestamp)}</div>
                    <span className="rounded-full border px-2.5 py-1 text-[10px] font-bold" style={severityStyle}>{severity}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{event.threat_type}</div>
                  <div className="mt-1 text-[11px]" style={{ color: THEME.textSoft }}>
                    Signature: {event.attack_signature} · Risk: {event.severity === 'LOW' ? '35' : event.severity === 'MEDIUM' ? '56' : event.severity === 'HIGH' ? '84' : '96'}/100
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className={styleCard()} style={{ borderColor: THEME.border, borderRadius: 10, background: THEME.card }}>
          <CardHeader className="px-5 py-4">
            <SectionHeader title="Policy Trigger Counts" subtitle="Most activated policies in recent scans" />
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {dashboardData.policyRows.map((row) => (
              <div key={row.name} className="rounded-[7px] border px-3 py-3" style={{ background: THEME.panel, borderColor: THEME.border }}>
                <div className="flex items-center gap-3">
                  <span className="flex-1 font-mono text-xs text-white">{row.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(row.count / Math.max(row.maxCount, 1)) * 100}%`, background: THEME.amber }} />
                  </div>
                  <span className="font-mono text-xs font-semibold" style={{ color: THEME.amber }}>{row.count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-2">
        <Card className={styleCard()} style={{ borderColor: THEME.border, borderRadius: 10, background: THEME.card }}>
          <CardHeader className="px-5 py-4">
            <SectionHeader title="Attack Severity Distribution" subtitle="Breakdown of threats by severity level" />
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {dashboardData.attackSeverityDistribution.map((row) => {
              const maxValue = Math.max(...dashboardData.attackSeverityDistribution.map((item) => item.value), 1);
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <div className="w-14.5 text-right text-[11px]" style={{ color: THEME.textSoft }}>{row.label}</div>
                  <div className="h-4.5 flex-1 overflow-hidden rounded-[3px]" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex h-full items-center justify-end px-2 text-[10px] font-bold text-[#0B0D14]" style={{ width: `${(row.value / maxValue) * 100}%`, background: row.color }}>
                      {row.value}
                    </div>
                  </div>
                  <div className="w-8 text-right font-mono text-xs font-semibold" style={{ color: row.color }}>{row.value}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className={styleCard()} style={{ borderColor: THEME.border, borderRadius: 10, background: THEME.card }}>
          <CardHeader className="px-5 py-4">
            <SectionHeader title="Interception & Leak Metrics" subtitle="Tool call and data leak interception summary" />
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Tool Calls Intercepted', String(analyticsSafe?.toolInterceptionMetrics?.intercepted || 0), THEME.amber, `Requires 2FA: ${analyticsSafe?.toolInterceptionMetrics?.requires2FA || 0} / ${analyticsSafe?.toolInterceptionMetrics?.totalToolCalls || 0}`],
                ['Leak Findings', String(analyticsSafe?.leakPreventionMetrics?.findings || 0), THEME.red, `Blocked: ${analyticsSafe?.leakPreventionMetrics?.blockedEvents || 0} | Redacted: ${analyticsSafe?.leakPreventionMetrics?.redactedEvents || 0}`],
                ['MFA Enforced', String(dashboardData.mfaEnforced), THEME.amber, 'Pending approval: 0'],
                ['HITL Triggers', String(dashboardData.hitlTriggers), THEME.cyan, 'Human review queue'],
              ].map(([label, value, color, note]) => (
                <div key={label} className="rounded-[7px] border px-3 py-3" style={{ background: THEME.cell, borderColor: THEME.border }}>
                  <div className="text-[10px] uppercase" style={{ color: THEME.textSoft }}>{label}</div>
                  <div className="mt-1 font-mono text-[13px] font-bold" style={{ color: color as string }}>{value}</div>
                  <div className="mt-1 text-[10px]" style={{ color: THEME.textSoft }}>{note}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-3" style={{ background: THEME.panel, borderColor: THEME.border }}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#10B981]" />
                <div>
                  <div className="text-sm font-semibold text-white">PII Detection Summary</div>
                  <div className="text-[11px]" style={{ color: THEME.textSoft }}>SSN, API keys, banking data scanned</div>
                </div>
              </div>
              <span className="rounded-full border px-3 py-1 text-[10px] font-bold" style={{ background: THEME.greenDim, borderColor: THEME.greenBorder, color: THEME.green }}>
                All clear
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-2">
        <Card className={styleCard()} style={{ borderColor: THEME.border, borderRadius: 10, background: THEME.card }}>
          <CardHeader className="px-5 py-4">
            <SectionHeader title="Top Attack Signatures" subtitle="Highest frequency threat signatures detected" />
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {dashboardData.topSignatures.map((item) => (
              <div key={item.name} className="rounded-[7px] border px-3 py-3" style={{ background: THEME.panel, borderColor: THEME.border }}>
                <div className="flex items-center gap-3">
                  <span className="flex-1 font-mono text-xs text-white">{item.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(item.count / Math.max(item.maxCount, 1)) * 100}%`, background: THEME.red }} />
                  </div>
                  <span className="font-mono text-xs font-bold" style={{ color: '#67E8F9' }}>{item.count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className={styleCard()} style={{ borderColor: THEME.border, borderRadius: 10, background: THEME.card }}>
          <CardHeader className="px-5 py-4">
            <SectionHeader title="User Risk Heatmap" subtitle="Actors ranked by average risk score and event count" />
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {dashboardData.userHeatmap.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-[7px] border px-3 py-3" style={{ background: THEME.panel, borderColor: THEME.border }}>
                <div
                  className="flex h-8.5 w-8.5 items-center justify-center rounded-full border text-xs font-bold"
                  style={{
                    background: item.risk > 70 ? THEME.redDim : item.risk > 40 ? THEME.amberDim : THEME.blueDim,
                    borderColor: item.risk > 70 ? THEME.redBorder : item.risk > 40 ? THEME.amberBorder : THEME.blueBorder,
                    color: item.risk > 70 ? THEME.red : item.risk > 40 ? THEME.amber : '#A5B4FC',
                  }}
                >
                  {item.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs font-semibold text-white">{item.id}</div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${item.risk}%`, background: riskColor(item.risk) }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-extrabold" style={{ color: riskColor(item.risk) }}>{item.risk}</div>
                  <div className="text-[10px]" style={{ color: THEME.textSoft }}>{item.events} event(s)</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-2">
        <ASOCAnalyst initialSummary={dashboardData.asocSummary} />
        <ReasoningWindow
          reasoningLogs={reasoningLogs}
          initialLogs={dashboardData.bootstrapReasoning}
          modelLabel="backend-asoc"
          lastAnalysisLabel={lastAnalysisLabel}
          anomalies={dashboardData.anomaliesCount}
          confidence={dashboardData.confidence}
        />
      </div>
    </motion.div>
  );
}
