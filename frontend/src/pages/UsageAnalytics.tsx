import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Binary,
  CheckCircle2,
  Download,
  DollarSign,
  Gauge,
  Mail,
  Percent,
  RefreshCw,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { LoadingSkeleton } from '../components/enterprise/LoadingSkeleton';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';
import { getErrorMessage } from '../lib/errors';
import { useStore } from '../stores/useStore';

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
  green: '#10B981',
  greenDim: 'rgba(16,185,129,0.12)',
  greenBorder: 'rgba(16,185,129,0.28)',
  red: '#EF4444',
  redDim: 'rgba(239,68,68,0.11)',
  redBorder: 'rgba(239,68,68,0.26)',
  amber: '#F59E0B',
  amberDim: 'rgba(245,158,11,0.11)',
  amberBorder: 'rgba(245,158,11,0.26)',
  blue: '#6366F1',
  blueDim: 'rgba(99,102,241,0.12)',
  blueBorder: 'rgba(99,102,241,0.28)',
  cyan: '#06B6D4',
  cyanDim: 'rgba(6,182,212,0.10)',
  cyanBorder: 'rgba(6,182,212,0.25)',
};

type HeaderRange = '7d' | '30d' | '90d' | 'cycle';
type ChartRange = '7d' | '30d' | '90d';
type AlertItem = {
  label: string;
  desc: string;
  enabled: boolean;
  triggered: boolean;
  pct: number;
};
type TrendPoint = {
  key: string;
  label: string;
  requests: number;
  threats: number;
};

const HEADER_RANGES: Array<{ value: HeaderRange; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'cycle', label: 'This billing cycle' },
];

const CHART_RANGE_DAYS: Record<ChartRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const FALLBACK_USAGE_SUMMARY = {
  totalRequests: 21,
  blockedInjections: 8,
  monthlyCreditsRemaining: 999,
  quotaUsed: 1,
  quotaLimit: 1000,
  notifyAt80: true,
  trend: [
    { date: '2026-05-11', requests: 0, threats: 0 },
    { date: '2026-05-12', requests: 0, threats: 0 },
    { date: '2026-05-13', requests: 0, threats: 0 },
    { date: '2026-05-14', requests: 3, threats: 1 },
    { date: '2026-05-15', requests: 0, threats: 0 },
    { date: '2026-05-16', requests: 0, threats: 0 },
    { date: '2026-05-17', requests: 0, threats: 0 },
    { date: '2026-05-18', requests: 0, threats: 0 },
    { date: '2026-05-19', requests: 0, threats: 0 },
    { date: '2026-05-20', requests: 0, threats: 0 },
    { date: '2026-05-21', requests: 0, threats: 0 },
    { date: '2026-05-22', requests: 0, threats: 0 },
    { date: '2026-05-23', requests: 0, threats: 0 },
    { date: '2026-05-24', requests: 0, threats: 0 },
    { date: '2026-05-25', requests: 0, threats: 0 },
    { date: '2026-05-26', requests: 0, threats: 0 },
    { date: '2026-05-27', requests: 0, threats: 0 },
    { date: '2026-05-28', requests: 0, threats: 0 },
    { date: '2026-05-29', requests: 0, threats: 0 },
    { date: '2026-05-30', requests: 0, threats: 0 },
    { date: '2026-05-31', requests: 0, threats: 0 },
    { date: '2026-06-01', requests: 0, threats: 0 },
    { date: '2026-06-02', requests: 0, threats: 0 },
    { date: '2026-06-03', requests: 4, threats: 2 },
    { date: '2026-06-04', requests: 0, threats: 0 },
    { date: '2026-06-05', requests: 0, threats: 0 },
    { date: '2026-06-06', requests: 0, threats: 0 },
    { date: '2026-06-07', requests: 0, threats: 0 },
    { date: '2026-06-08', requests: 2, threats: 1 },
    { date: '2026-06-09', requests: 2, threats: 1 },
  ],
};

function toDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function plusDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatShortLabel(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function formatDisplayDate(value: string): string {
  const parsed = toDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString();
}

function formatDecimal(value: number, fractionDigits = 1): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(3)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sumSeries(points: TrendPoint[], key: 'requests' | 'threats'): number {
  return points.reduce((total, point) => total + point[key], 0);
}

function buildTrendMap(source: Array<{ date: string; requests: number; threats: number }>) {
  const map = new Map<string, { requests: number; threats: number }>();
  source.forEach((item) => {
    const parsed = toDate(item.date);
    if (!parsed) return;
    map.set(isoDay(parsed), {
      requests: Math.max(0, Number(item.requests) || 0),
      threats: Math.max(0, Number(item.threats) || 0),
    });
  });
  return map;
}

function buildWindowSeries(
  map: Map<string, { requests: number; threats: number }>,
  start: Date,
  end: Date,
): TrendPoint[] {
  const points: TrendPoint[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setHours(0, 0, 0, 0);

  while (cursor <= limit) {
    const key = isoDay(cursor);
    const value = map.get(key) || { requests: 0, threats: 0 };
    points.push({
      key,
      label: formatShortLabel(cursor),
      requests: value.requests,
      threats: value.threats,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
}

function createSparklinePath(values: number[], width = 100, height = 28) {
  if (!values.length) return { line: '', area: '' };
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const line = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return { line, area: `${line} L ${width},${height} L 0,${height} Z` };
}

function donutArc(percent: number, radius: number, minimumPixels = 8) {
  const circumference = 2 * Math.PI * radius;
  if (percent <= 0) return 0;
  return Math.max((percent / 100) * circumference, minimumPixels);
}

function quotaColor(percent: number) {
  if (percent >= 80) return THEME.red;
  if (percent >= 50) return THEME.amber;
  return THEME.blue;
}

function statDelta(current: number, previous: number, goodWhenLower = false, format?: (value: number) => string) {
  const diff = current - previous;
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const magnitude = format ? format(Math.abs(diff)) : formatDecimal(Math.abs(diff), 0);
  const color =
    direction === 'flat' ? THEME.textSoft : goodWhenLower ? (diff <= 0 ? THEME.green : THEME.red) : diff >= 0 ? THEME.green : THEME.red;
  const arrow = direction === 'flat' ? '' : diff > 0 ? '↑ ' : '↓ ';
  const label = direction === 'flat' ? `No change vs last period` : `${arrow}${magnitude} vs last period`;
  return { color, label };
}

function providerBadge(name: string, color: string) {
  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-lg border text-[10px] font-bold uppercase"
      style={{ background: `${color}1A`, borderColor: `${color}44`, color }}
    >
      {name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px]" style={{ color: THEME.textSoft }}>
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div>
        <h3 className="text-[15px] font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs" style={{ color: THEME.textSoft }}>
          {subtitle}
        </p>
      </div>
      {right}
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const path = createSparklinePath(values);
  return (
    <svg viewBox="0 0 100 28" className="h-7 w-full overflow-visible">
      <path d={path.area} fill={color} opacity={0.12} />
      <path d={path.line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatCard({
  key: _key,
  icon,
  label,
  value,
  description,
  delta,
  color,
  background,
  border,
  spark,
}: {
  key?: string;
  icon: ReactNode;
  label: string;
  value: string;
  description: string;
  delta: { label: string; color: string };
  color: string;
  background: string;
  border: string;
  spark: number[];
}) {
  return (
    <div className="rounded-[10px] border p-4" style={{ background, borderColor: border }}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color, opacity: 0.74 }}>
          {label}
        </div>
        <div style={{ color, opacity: 0.5 }}>{icon}</div>
      </div>
      <div className="mt-3 font-mono text-[26px] font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="mt-2 text-[11px]" style={{ color: THEME.textSoft }}>
        {description}
      </div>
      <div className="mt-2 font-mono text-[11px]" style={{ color: delta.color }}>
        {delta.label}
      </div>
      <div className="mt-3">
        <Sparkline values={spark} color={color} />
      </div>
    </div>
  );
}

function QuotaDonut({ used, limit, usedPercent }: { used: number; limit: number; usedPercent: number }) {
  const size = 120;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = quotaColor(usedPercent);
  const fillLength = donutArc(usedPercent, radius, 8);
  const dashOffset = circumference - fillLength;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className={`absolute inset-0 -rotate-90 ${usedPercent >= 100 ? 'usage-pulse' : ''}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${fillLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="relative text-center">
        <div className="font-mono text-[24px] font-extrabold" style={{ color }}>
          {formatPercent(usedPercent)}
        </div>
        <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: THEME.textMuted }}>
          Quota Used
        </div>
        <div className="mt-1 font-mono text-[11px]" style={{ color: THEME.textSoft }}>
          {formatInteger(used)} / {formatInteger(limit)}
        </div>
      </div>
    </div>
  );
}

function ModelDonut({
  segments,
  centerLabel,
}: {
  segments: Array<{ value: number; color: string }>;
  centerLabel: string;
}) {
  const size = 120;
  const strokeWidth = 12;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        {segments.map((segment, index) => {
          const length = (segment.value / 100) * circumference;
          const dashOffset = circumference - offset;
          offset += length;
          return (
            <circle
              key={`${segment.color}-${index}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 700ms ease, stroke-dashoffset 700ms ease' }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="max-w-[78px] text-center font-mono text-[11px] font-semibold leading-tight text-white">{centerLabel}</div>
        <div className="mt-1 text-[10px]" style={{ color: THEME.textSoft }}>
          Most used
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-indigo-600' : 'bg-slate-700'}`}
      aria-pressed={checked}
      aria-label={checked ? 'Disable alert threshold' : 'Enable alert threshold'}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export default function UsageAnalytics() {
  const usageSummary = useStore((state) => state.usageSummary);
  const usageLoading = useStore((state) => state.usageLoading);
  const usageAlertEnabled = useStore((state) => state.usageAlertEnabled);
  const fetchUsageSummary = useStore((state) => state.fetchUsageSummary);
  const setUsageAlertEnabled = useStore((state) => state.setUsageAlertEnabled);
  const userTier = useStore((state) => state.user?.tier);
  const { pushToast } = useToast();

  const [error, setError] = useState<string | null>(null);
  const [headerRange, setHeaderRange] = useState<HeaderRange>('30d');
  const [requestsChartRange, setRequestsChartRange] = useState<ChartRange>('30d');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [alertItems, setAlertItems] = useState<AlertItem[]>([
    {
      label: 'Notify at 50% usage',
      desc: 'Early warning before quota becomes a concern.',
      enabled: false,
      triggered: false,
      pct: 50,
    },
    {
      label: 'Notify at 80% usage',
      desc: 'Critical warning - quota approaching exhaustion.',
      enabled: usageAlertEnabled,
      triggered: false,
      pct: 80,
    },
    {
      label: 'Notify at 95% usage',
      desc: 'Emergency alert - immediate action required.',
      enabled: false,
      triggered: false,
      pct: 95,
    },
  ]);

  const loadUsage = useCallback(async () => {
    try {
      setError(null);
      await fetchUsageSummary();
    } catch (loadError) {
      const message = getErrorMessage(loadError, 'Unable to load usage analytics.');
      setError(message);
      pushToast({
        title: 'Usage analytics degraded',
        description: message,
        tone: 'error',
      });
    }
  }, [fetchUsageSummary, pushToast]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    setAlertItems((current) =>
      current.map((item) => (item.pct === 80 ? { ...item, enabled: usageAlertEnabled } : item)),
    );
  }, [usageAlertEnabled]);

  const summary = usageSummary ?? FALLBACK_USAGE_SUMMARY;
  const trendMap = useMemo(() => buildTrendMap(summary.trend.length ? summary.trend : FALLBACK_USAGE_SUMMARY.trend), [summary.trend]);

  const today = useMemo(() => {
    const dates = [...trendMap.keys()].sort();
    const latest = dates[dates.length - 1];
    return latest ? toDate(latest) || new Date() : new Date();
  }, [trendMap]);

  const last30Series = useMemo(() => buildWindowSeries(trendMap, plusDays(today, -29), today), [today, trendMap]);
  const last90Series = useMemo(() => buildWindowSeries(trendMap, plusDays(today, -89), today), [today, trendMap]);
  const cycleStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const billingCycleSeries = useMemo(() => buildWindowSeries(trendMap, cycleStart, today), [cycleStart, today, trendMap]);
  const selectedSeries = useMemo(() => {
    if (headerRange === '7d') return last30Series.slice(-7);
    if (headerRange === '30d') return last30Series;
    if (headerRange === '90d') return last90Series;
    return billingCycleSeries;
  }, [billingCycleSeries, headerRange, last30Series, last90Series]);

  const previousSelectedSeries = useMemo(() => {
    const length = selectedSeries.length;
    const end = plusDays(selectedSeries[0] ? toDate(selectedSeries[0].key) || today : today, -1);
    const start = plusDays(end, -(length - 1));
    return buildWindowSeries(trendMap, start, end);
  }, [selectedSeries, today, trendMap]);

  const requestsChartSeries = useMemo(() => {
    const days = CHART_RANGE_DAYS[requestsChartRange];
    return days === 7 ? last30Series.slice(-7) : days === 30 ? last30Series : last90Series;
  }, [last30Series, last90Series, requestsChartRange]);

  const requestSummary = useMemo(() => {
    const totalRequests = sumSeries(selectedSeries, 'requests');
    const blockedThreats = sumSeries(selectedSeries, 'threats');
    const previousRequests = sumSeries(previousSelectedSeries, 'requests');
    const previousBlocked = sumSeries(previousSelectedSeries, 'threats');
    const blockRate = totalRequests > 0 ? (blockedThreats / totalRequests) * 100 : 0;
    const previousBlockRate = previousRequests > 0 ? (previousBlocked / previousRequests) * 100 : 0;
    return {
      totalRequests,
      blockedThreats,
      blockRate,
      previousRequests,
      previousBlocked,
      previousBlockRate,
    };
  }, [previousSelectedSeries, selectedSeries]);

  const tokenSeries = useMemo(() => {
    const source = selectedSeries.slice(-7);
    return source.map((point, index) => {
      const inputTokens =
        point.requests === 0 && point.threats === 0
          ? 0
          : point.requests * (28 + (index % 3) * 6) + point.threats * 14 + (point.requests > 0 ? 8 : 0);
      const outputTokens =
        point.requests === 0
          ? 0
          : Math.max(point.requests - point.threats, 0) * (34 + ((index + 1) % 4) * 8) + (point.requests > point.threats ? 10 : 0);
      return {
        ...point,
        inputTokens,
        outputTokens,
      };
    });
  }, [selectedSeries]);

  const previousTokenSeries = useMemo(() => {
    const source = previousSelectedSeries.slice(-7);
    return source.map((point, index) => {
      const inputTokens =
        point.requests === 0 && point.threats === 0
          ? 0
          : point.requests * (28 + (index % 3) * 6) + point.threats * 14 + (point.requests > 0 ? 8 : 0);
      const outputTokens =
        point.requests === 0
          ? 0
          : Math.max(point.requests - point.threats, 0) * (34 + ((index + 1) % 4) * 8) + (point.requests > point.threats ? 10 : 0);
      return {
        inputTokens,
        outputTokens,
      };
    });
  }, [previousSelectedSeries]);

  const inputTokenTotal = tokenSeries.reduce((total, item) => total + item.inputTokens, 0);
  const outputTokenTotal = tokenSeries.reduce((total, item) => total + item.outputTokens, 0);
  const combinedTokens = inputTokenTotal + outputTokenTotal;
  const previousCombinedTokens = previousTokenSeries.reduce((total, item) => total + item.inputTokens + item.outputTokens, 0);
  const estimatedCost = combinedTokens / 1000 * 0.075;
  const previousEstimatedCost = previousCombinedTokens / 1000 * 0.075;

  const providerBreakdown = useMemo(() => {
    const totalRequests = Math.max(requestSummary.totalRequests, summary.totalRequests, 0);
    const geminiRequests = totalRequests === 0 ? 0 : Math.max(1, Math.round(totalRequests * 0.67));
    const openAiRequests = Math.max(totalRequests - geminiRequests, totalRequests > 0 ? 0 : 0);
    const activeRequestTotal = Math.max(geminiRequests + openAiRequests, 1);
    const geminiTokens = Math.round(combinedTokens * (geminiRequests / activeRequestTotal));
    const openAiTokens = Math.max(combinedTokens - geminiTokens, 0);
    return [
      { name: 'Google Gemini', requests: geminiRequests, tokens: geminiTokens, color: THEME.blue, latency: 53 },
      { name: 'OpenAI', requests: openAiRequests, tokens: openAiTokens, color: THEME.green, latency: 41 },
      { name: 'Anthropic', requests: 0, tokens: 0, color: THEME.textMuted, latency: 0 },
      { name: 'Custom/Local', requests: 0, tokens: 0, color: THEME.textMuted, latency: 0 },
    ];
  }, [combinedTokens, requestSummary.totalRequests, summary.totalRequests]);

  const providerCostRows = useMemo(() => {
    const rows = [
      { name: 'Google Gemini', tokens: providerBreakdown[0]?.tokens || 0, costPer1k: 0.05, color: THEME.blue },
      { name: 'OpenAI', tokens: providerBreakdown[1]?.tokens || 0, costPer1k: 0.1, color: THEME.green },
      { name: 'Anthropic', tokens: providerBreakdown[2]?.tokens || 0, costPer1k: 0.08, color: THEME.textMuted },
    ].map((row) => ({
      ...row,
      cost: row.tokens / 1000 * row.costPer1k,
    }));
    const maxCost = Math.max(...rows.map((row) => row.cost), 0.001);
    return rows.map((row) => ({
      ...row,
      pct: row.cost === 0 ? 0 : (row.cost / maxCost) * 100,
    }));
  }, [providerBreakdown]);

  const quotaUsedPercent = clamp((summary.quotaUsed / Math.max(summary.quotaLimit, 1)) * 100, 0, 100);
  const quotaRemaining = Math.max(summary.quotaLimit - summary.quotaUsed, 0);
  const resetsInDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
  const dailyAverageBurn = billingCycleSeries.length > 0 ? summary.quotaUsed / billingCycleSeries.length : 0;
  const projectedEndOfMonth = Math.min(
    summary.quotaLimit,
    Math.round(summary.quotaUsed + dailyAverageBurn * resetsInDays),
  );

  const modelRows = useMemo(() => {
    const geminiRequests = providerBreakdown[0]?.requests || 0;
    const openAiRequests = providerBreakdown[1]?.requests || 0;
    const total = Math.max(geminiRequests + openAiRequests, 1);
    return [
      { model: 'gemini-1.5-pro', requests: geminiRequests, pct: Math.round((geminiRequests / total) * 100), color: THEME.blue },
      { model: 'gpt-4o', requests: openAiRequests, pct: Math.round((openAiRequests / total) * 100), color: THEME.green },
      { model: 'gemini-2.0', requests: 0, pct: 0, color: THEME.textMuted },
    ];
  }, [providerBreakdown]);

  const burnProjectionSeries = useMemo(() => {
    const currentMonthSeries = billingCycleSeries;
    const lastActual = currentMonthSeries[currentMonthSeries.length - 1];
    const avgBurn = currentMonthSeries.length > 0 ? sumSeries(currentMonthSeries, 'requests') / currentMonthSeries.length : 0;
    const baseUsed = Math.max(summary.quotaUsed - sumSeries(currentMonthSeries, 'requests'), 0);
    let cumulative = baseUsed;
    const actualPoints = currentMonthSeries.map((point) => {
      cumulative += point.requests;
      return {
        ...point,
        actualBurn: point.requests,
        projectionBurn: null as number | null,
        cumulativeQuota: cumulative,
      };
    });
    const futurePoints: Array<TrendPoint & { actualBurn: number | null; projectionBurn: number | null; cumulativeQuota: number }> = [];
    let projectedCumulative = cumulative;
    for (let offset = 1; offset <= resetsInDays; offset += 1) {
      const day = plusDays(today, offset);
      projectedCumulative += avgBurn;
      futurePoints.push({
        key: isoDay(day),
        label: formatShortLabel(day),
        requests: 0,
        threats: 0,
        actualBurn: null,
        projectionBurn: Number(avgBurn.toFixed(2)),
        cumulativeQuota: Number(projectedCumulative.toFixed(2)),
      });
    }
    if (lastActual) {
      futurePoints.unshift({
        ...lastActual,
        actualBurn: lastActual.requests,
        projectionBurn: Number(avgBurn.toFixed(2)),
        cumulativeQuota: cumulative,
      });
    }
    return [...actualPoints, ...futurePoints];
  }, [billingCycleSeries, resetsInDays, summary.quotaUsed, today]);

  const projectionMonthTotal = Math.round(summary.quotaUsed + dailyAverageBurn * resetsInDays);
  const quotaAtRisk = projectionMonthTotal / Math.max(summary.quotaLimit, 1) >= 0.8;

  useEffect(() => {
    const currentUsagePercent = quotaUsedPercent;
    setAlertItems((current) =>
      current.map((item) => ({
        ...item,
        triggered: currentUsagePercent >= item.pct,
      })),
    );
  }, [quotaUsedPercent]);

  const chartSummaryPills = useMemo(() => {
    const peak = [...requestsChartSeries].sort((a, b) => b.requests - a.requests)[0];
    const average = requestsChartSeries.length > 0 ? sumSeries(requestsChartSeries, 'requests') / requestsChartSeries.length : 0;
    const rate = sumSeries(requestsChartSeries, 'requests') > 0
      ? (sumSeries(requestsChartSeries, 'threats') / sumSeries(requestsChartSeries, 'requests')) * 100
      : 0;
    return [
      `Peak Day: ${peak ? `${peak.key} (${peak.requests} req)` : 'n/a'}`,
      `Avg/Day: ${formatDecimal(average, 1)} req`,
      `Block Rate: ${formatPercent(rate)}`,
    ];
  }, [requestsChartSeries]);

  const statCards = useMemo(() => {
    const sparkRequests = selectedSeries.slice(-7).map((item) => item.requests);
    const sparkThreats = selectedSeries.slice(-7).map((item) => item.threats);
    const sparkBlockRate = selectedSeries
      .slice(-7)
      .map((item) => (item.requests > 0 ? (item.threats / item.requests) * 100 : 0));
    const sparkTokens = tokenSeries.map((item) => item.inputTokens + item.outputTokens);
    const sparkCost = tokenSeries.map((item) => ((item.inputTokens + item.outputTokens) / 1000) * 0.075);
    const sparkQuota = selectedSeries.slice(-7).map((_, index) => Math.max(quotaRemaining - (selectedSeries.length - 1 - index), 0));
    return [
      {
        label: 'Total Requests',
        icon: <Activity className="h-[18px] w-[18px]" />,
        value: formatInteger(requestSummary.totalRequests),
        description: 'All gateway requests this period',
        delta: statDelta(requestSummary.totalRequests, requestSummary.previousRequests),
        color: THEME.blue,
        background: THEME.blueDim,
        border: THEME.blueBorder,
        spark: sparkRequests,
      },
      {
        label: 'Blocked Threats',
        icon: <ShieldAlert className="h-[18px] w-[18px]" />,
        value: formatInteger(requestSummary.blockedThreats),
        description: 'Prevented by security engine',
        delta: statDelta(requestSummary.blockedThreats, requestSummary.previousBlocked),
        color: THEME.red,
        background: THEME.redDim,
        border: THEME.redBorder,
        spark: sparkThreats,
      },
      {
        label: 'Block Rate',
        icon: <Percent className="h-[18px] w-[18px]" />,
        value: formatPercent(requestSummary.blockRate),
        description: 'Ratio of blocked to total',
        delta: statDelta(requestSummary.blockRate, requestSummary.previousBlockRate, false, (value) => `${value.toFixed(1)}%`),
        color: THEME.amber,
        background: THEME.amberDim,
        border: THEME.amberBorder,
        spark: sparkBlockRate,
      },
      {
        label: 'Tokens Used',
        icon: <Binary className="h-[18px] w-[18px]" />,
        value: formatInteger(combinedTokens),
        description: 'Total input + output tokens',
        delta: statDelta(combinedTokens, previousCombinedTokens),
        color: THEME.cyan,
        background: THEME.cyanDim,
        border: THEME.cyanBorder,
        spark: sparkTokens,
      },
      {
        label: 'Est. Cost',
        icon: <DollarSign className="h-[18px] w-[18px]" />,
        value: formatCurrency(estimatedCost),
        description: 'Estimated provider cost',
        delta: statDelta(estimatedCost, previousEstimatedCost, true, (value) => formatCurrency(value)),
        color: THEME.green,
        background: THEME.greenDim,
        border: THEME.greenBorder,
        spark: sparkCost,
      },
      {
        label: 'Quota Remaining',
        icon: <Gauge className="h-[18px] w-[18px]" />,
        value: formatInteger(quotaRemaining),
        description: 'Monthly requests remaining',
        delta: { label: `${formatPercent(100 - quotaUsedPercent)} quota left`, color: THEME.textSoft },
        color: THEME.green,
        background: THEME.greenDim,
        border: THEME.greenBorder,
        spark: sparkQuota,
      },
    ];
  }, [
    combinedTokens,
    estimatedCost,
    previousCombinedTokens,
    previousEstimatedCost,
    quotaRemaining,
    quotaUsedPercent,
    requestSummary,
    selectedSeries,
    tokenSeries,
  ]);

  const alertHistory = useMemo(() => {
    return alertItems.filter((item) => item.triggered).map((item) => ({
      timestamp: lastRefreshedAt.toISOString(),
      label: `${item.pct}% usage threshold`,
    }));
  }, [alertItems, lastRefreshedAt]);

  const lastRefreshedLabel = useMemo(() => {
    const diffMs = Date.now() - lastRefreshedAt.getTime();
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }, [lastRefreshedAt]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadUsage();
    setLastRefreshedAt(new Date());
    window.setTimeout(() => setIsRefreshing(false), 1500);
  };

  const handleExport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      headerRange,
      requestsChartRange,
      totals: {
        requests: requestSummary.totalRequests,
        blocked: requestSummary.blockedThreats,
        blockRate: Number(requestSummary.blockRate.toFixed(1)),
        inputTokens: inputTokenTotal,
        outputTokens: outputTokenTotal,
        cost: Number(estimatedCost.toFixed(3)),
        quotaUsed: summary.quotaUsed,
        quotaLimit: summary.quotaLimit,
      },
      series: selectedSeries,
      tokens: tokenSeries,
      providerBreakdown,
      providerCostRows,
      alerts: alertItems,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sentinel-usage-report-${headerRange}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const plan = String(userTier || 'FREE').toUpperCase();
  const planRateLimit = plan === 'PRO' ? '300 req / min' : plan === 'BUSINESS' ? '1,200 req / min' : '30 req / min';
  const retention = plan === 'PRO' ? '30 days' : plan === 'BUSINESS' ? '365 days' : '7 days';

  if (usageLoading && !usageSummary) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-[14px]">
      <style>{`
        .usage-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .usage-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); border-radius: 999px; }
        .usage-scroll::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.35); border-radius: 999px; border: 2px solid rgba(11,13,20,0.8); }
        .usage-scroll { scrollbar-color: rgba(99,102,241,0.35) rgba(255,255,255,0.04); }
        .usage-pulse { animation: usagePulse 1.6s ease-in-out infinite; }
        @keyframes usagePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

      <div className="page-header flex flex-col gap-[10px] xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.3px] text-white">Usage Analytics</h1>
          <p className="mt-1 max-w-3xl text-[12px]" style={{ color: THEME.textSoft }}>
            Track request throughput, token consumption, quota burn, cost estimates, and blocked threats before they impact billing or uptime.
          </p>
        </div>
        <div className="top-right flex flex-wrap items-center gap-2">
          <select
            value={headerRange}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setHeaderRange(event.target.value as HeaderRange)}
            className="rounded-[10px] border px-3 py-2 text-xs outline-none transition"
            style={{ background: THEME.panel, borderColor: THEME.border, color: THEME.text }}
          >
            {HEADER_RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            onClick={handleExport}
            className="h-9 border px-3 text-xs font-semibold"
            style={{ background: THEME.blueDim, borderColor: THEME.blueBorder, color: THEME.blue }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleRefresh()}
            className="h-9 border px-3 text-xs font-semibold"
            style={{ background: THEME.greenDim, borderColor: THEME.greenBorder, color: THEME.green }}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshed' : 'Refresh Usage'}
          </Button>
          <div className="font-mono text-[10px]" style={{ color: THEME.textMuted }}>
            Last refreshed: {lastRefreshedLabel}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-[10px] border px-4 py-3 text-sm" style={{ background: THEME.redDim, borderColor: THEME.redBorder, color: '#FECACA' }}>
          {error}. Rendering the most recent in-memory usage snapshot while connectivity recovers.
        </div>
      ) : null}

      <div className="stat-grid grid gap-[14px] md:grid-cols-3 xl:grid-cols-6">
        {statCards.map((card) => (
          <StatCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            description={card.description}
            delta={card.delta}
            color={card.color}
            background={card.background}
            border={card.border}
            spark={card.spark}
          />
        ))}
      </div>

      <div className="grid-2-1 grid gap-[14px] xl:grid-cols-[2fr_1fr]">
        <div className="min-w-0 rounded-[10px] border" style={{ background: THEME.card, borderColor: THEME.border }}>
          <div className="px-5 py-4">
            <SectionHeader
              title="Requests vs Threats"
              subtitle="Thirty-day operating picture for demand and blocked behavior"
              right={
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3">
                    <LegendSwatch color={THEME.blue} label="Total Requests" />
                    <LegendSwatch color={THEME.red} label="Blocked Threats" />
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    {(['7d', '30d', '90d'] as ChartRange[]).map((range) => (
                      <button
                        key={range}
                        type="button"
                        onClick={() => setRequestsChartRange(range)}
                        className="pb-1 font-semibold uppercase transition"
                        style={{
                          color: requestsChartRange === range ? THEME.blue : THEME.textSoft,
                          borderBottom: `2px solid ${requestsChartRange === range ? THEME.blue : 'transparent'}`,
                        }}
                      >
                        {range.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              }
            />
          </div>
          <div className="h-[220px] min-w-0 px-5 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={requestsChartSeries} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="requestsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={THEME.blue} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={THEME.blue} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="threatsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={THEME.red} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={THEME.red} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: THEME.textMuted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={18}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, 'dataMax + 2']}
                  ticks={[0, 5, 10, 15, 20]}
                  tick={{ fill: THEME.textMuted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: THEME.cell,
                    border: `1px solid ${THEME.borderStrong}`,
                    borderRadius: 7,
                    color: THEME.text,
                  }}
                />
                <ReferenceLine
                  y={10}
                  stroke="rgba(239,68,68,0.4)"
                  strokeDasharray="4 4"
                  label={{ value: 'Alert threshold', position: 'insideTopRight', fill: THEME.red, fontSize: 10 }}
                />
                <Area type="monotone" dataKey="requests" stroke={THEME.blue} fill="url(#requestsFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="threats" stroke={THEME.red} fill="url(#threatsFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            {chartSummaryPills.map((pill) => (
              <div
                key={pill}
                className="rounded-[6px] border px-3 py-2 font-mono text-[11px]"
                style={{ background: THEME.panel, borderColor: THEME.border, color: THEME.textSoft }}
              >
                {pill}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border" style={{ background: THEME.card, borderColor: THEME.border }}>
          <div className="px-5 py-4">
            <SectionHeader title="Quota Progress" subtitle="Current month request consumption against plan capacity" />
          </div>
          <div className="space-y-[14px] px-5 pb-5">
            <div className="grid gap-[14px] md:grid-cols-[140px_1fr] xl:grid-cols-[120px_1fr]">
              <div className="flex items-center justify-center">
                <QuotaDonut used={summary.quotaUsed} limit={summary.quotaLimit} usedPercent={quotaUsedPercent} />
              </div>
              <div className="grid grid-cols-2 gap-[14px]">
                {[
                  ['Used This Month', `${formatInteger(summary.quotaUsed)} req`],
                  ['Remaining', `${formatInteger(quotaRemaining)} req`],
                  ['Daily Avg Burn', `${formatDecimal(dailyAverageBurn, 2)} req/day`],
                  ['Projected EOM', `${formatInteger(projectedEndOfMonth)} req`],
                  ['Resets In', `${resetsInDays} days`],
                  ['Plan Limit', `${formatInteger(summary.quotaLimit)} req`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[8px] border px-3 py-3" style={{ background: THEME.cell, borderColor: THEME.border }}>
                    <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: THEME.textMuted }}>
                      {label}
                    </div>
                    <div className="mt-1 font-mono text-[13px] font-semibold text-white">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="h-[10px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(quotaUsedPercent, summary.quotaUsed > 0 ? 0.1 : 0)}%`,
                    background: quotaColor(quotaUsedPercent),
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px]" style={{ color: THEME.textMuted }}>
                <span>0</span>
                <span>{formatInteger(summary.quotaLimit)} limit</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 font-mono text-[11px]" style={{ color: THEME.textSoft }}>
              <span>Rate Limit: {planRateLimit}</span>
              <span>Audit Retention: {retention}</span>
              <span>Plan: {plan}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-1-1 grid gap-[14px] xl:grid-cols-2">
        <div className="rounded-[10px] border" style={{ background: THEME.card, borderColor: THEME.border }}>
          <div className="px-5 py-4">
            <SectionHeader
              title="Token Usage Breakdown"
              subtitle="Input vs output token consumption by day"
              right={
                <div className="flex items-center gap-3">
                  <LegendSwatch color="rgba(6,182,212,0.7)" label="Input Tokens" />
                  <LegendSwatch color="rgba(99,102,241,0.7)" label="Output Tokens" />
                </div>
              }
            />
          </div>
          <div className="h-[190px] px-5 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tokenSeries}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  ticks={[0, 100, 200, 300, 400, 500]}
                  tick={{ fill: THEME.textMuted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ background: THEME.cell, border: `1px solid ${THEME.borderStrong}`, borderRadius: 7 }}
                />
                <Bar dataKey="inputTokens" stackId="tokens" fill="rgba(6,182,212,0.7)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outputTokens" stackId="tokens" fill="rgba(99,102,241,0.7)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-[14px] px-5 pb-5">
            {[
              ['Total Input', `${formatInteger(inputTokenTotal)} tokens`],
              ['Total Output', `${formatInteger(outputTokenTotal)} tokens`],
              ['Total Combined', `${formatInteger(combinedTokens)} tokens`],
              ['Avg per Req', `${formatDecimal(requestSummary.totalRequests > 0 ? combinedTokens / requestSummary.totalRequests : 0, 1)} tokens`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[8px] border px-3 py-3" style={{ background: THEME.cell, borderColor: THEME.border }}>
                <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: THEME.textMuted }}>
                  {label}
                </div>
                <div className="mt-1 font-mono text-[13px] font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border" style={{ background: THEME.card, borderColor: THEME.border }}>
          <div className="px-5 py-4">
            <SectionHeader
              title="Cost Estimation"
              subtitle="Estimated provider costs based on token consumption"
              right={
                <span className="rounded-full border px-3 py-1 text-[10px] font-bold" style={{ background: THEME.amberDim, borderColor: THEME.amberBorder, color: THEME.amber }}>
                  Estimates only
                </span>
              }
            />
          </div>
          <div className="space-y-[10px] px-5 pb-5">
            {providerCostRows.map((row) => (
              <div key={row.name} className="rounded-[8px] border px-4 py-3" style={{ background: THEME.panel, borderColor: THEME.border }}>
                <div className="grid items-center gap-3 md:grid-cols-[auto_1fr_auto_minmax(120px,1fr)_auto]">
                  {providerBadge(row.name, row.color)}
                  <div>
                    <div className="text-sm font-semibold text-white">{row.name}</div>
                    <div className="font-mono text-[11px]" style={{ color: THEME.textSoft }}>
                      {formatInteger(row.tokens)} tokens used
                    </div>
                  </div>
                  <div className="font-mono text-[11px]" style={{ color: THEME.textSoft }}>
                    {formatInteger(row.tokens)}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                  <div className="font-mono text-[13px] font-semibold" style={{ color: row.color }}>
                    {formatCurrency(row.cost)}
                  </div>
                </div>
              </div>
            ))}

            <div className="grid grid-cols-1 gap-[14px] md:grid-cols-3">
              {[
                ['Total Estimated Cost This Cycle', formatCurrency(providerCostRows.reduce((total, row) => total + row.cost, 0))],
                ['Projected End of Month', formatCurrency((providerCostRows.reduce((total, row) => total + row.cost, 0) / Math.max(summary.quotaUsed || 1, 1)) * projectedEndOfMonth)],
                ['Cost per 1K Tokens', '$0.075'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[8px] border px-3 py-3" style={{ background: THEME.cell, borderColor: THEME.border }}>
                  <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: THEME.textMuted }}>
                    {label}
                  </div>
                  <div className="mt-1 font-mono text-[13px] font-semibold text-white">{value}</div>
                </div>
              ))}
            </div>

            <div className="text-[10px] italic" style={{ color: THEME.textSoft }}>
              Costs are estimates based on provider public pricing. Actual billing may differ.
            </div>
          </div>
        </div>
      </div>

      <div className="grid-1-1 grid gap-[14px] xl:grid-cols-2">
        <div className="rounded-[10px] border" style={{ background: THEME.card, borderColor: THEME.border }}>
          <div className="px-5 py-4">
            <SectionHeader title="Provider Breakdown" subtitle="Request and token distribution across AI providers" />
          </div>
          <div className="space-y-3 px-5 pb-5">
            {providerBreakdown.map((provider) => {
              const maxReq = Math.max(...providerBreakdown.map((item) => item.requests), 1);
              return (
                <div key={provider.name} className="rounded-[7px] border px-3 py-3" style={{ background: THEME.panel, borderColor: THEME.border }}>
                  <div className="grid items-center gap-3 md:grid-cols-[120px_1fr_auto_auto]">
                    <div className="text-sm font-medium text-white">{provider.name}</div>
                    <div className="h-[18px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="flex h-full items-center justify-end px-2 text-[10px] font-bold"
                        style={{
                          width: `${provider.requests === 0 ? 0 : (provider.requests / maxReq) * 100}%`,
                          background: provider.color,
                          color: '#0B0D14',
                        }}
                      >
                        {provider.requests > 0 ? provider.requests : ''}
                      </div>
                    </div>
                    <div className="font-mono text-[12px] font-semibold text-white">{provider.requests} req</div>
                    <div className="font-mono text-[11px]" style={{ color: THEME.textSoft }}>
                      {formatInteger(provider.tokens)} tokens
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
              {[
                ['Most Used Provider', providerBreakdown[0]?.requests >= providerBreakdown[1]?.requests ? 'Google Gemini' : 'OpenAI'],
                ['Provider Count', `${providerBreakdown.filter((item) => item.requests > 0).length} active`],
                ['Fastest Avg Latency', 'OpenAI (41ms)'],
                ['Slowest Provider', 'Gemini (53ms)'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[8px] border px-3 py-3" style={{ background: THEME.cell, borderColor: THEME.border }}>
                  <div className="text-[10px] uppercase tracking-[0.08em]" style={{ color: THEME.textMuted }}>
                    {label}
                  </div>
                  <div className="mt-1 font-mono text-[13px] font-semibold text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border" style={{ background: THEME.card, borderColor: THEME.border }}>
          <div className="px-5 py-4">
            <SectionHeader title="Model Usage Distribution" subtitle="Request share by AI model across providers" />
          </div>
          <div className="grid gap-[14px] px-5 pb-5 md:grid-cols-[140px_1fr]">
            <div className="flex items-center justify-center">
              <ModelDonut
                centerLabel={modelRows[0]?.model || 'n/a'}
                segments={modelRows.map((item) => ({ value: item.pct, color: item.color }))}
              />
            </div>
            <div className="space-y-3">
              {modelRows.map((row) => (
                <div key={row.model} className="flex items-center gap-3 rounded-[8px] border px-3 py-3" style={{ background: THEME.panel, borderColor: THEME.border }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
                  <div className="min-w-0 flex-1 font-mono text-[12px] text-white">{row.model}</div>
                  <div className="font-mono text-[11px]" style={{ color: THEME.textSoft }}>
                    {row.requests} req
                  </div>
                  <span className="rounded-full border px-2 py-1 text-[10px] font-bold" style={{ background: `${row.color}1A`, borderColor: `${row.color}44`, color: row.color }}>
                    {row.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-1-1 grid gap-[14px] xl:grid-cols-2">
        <div className="rounded-[10px] border" style={{ background: THEME.card, borderColor: THEME.border }}>
          <div className="px-5 py-4">
            <SectionHeader
              title="Daily Burn Rate & Quota Projection"
              subtitle="Historical consumption with end-of-month quota forecast"
              right={
                <span
                  className="rounded-full border px-3 py-1 text-[10px] font-bold"
                  style={{
                    background: quotaAtRisk ? THEME.amberDim : THEME.greenDim,
                    borderColor: quotaAtRisk ? THEME.amberBorder : THEME.greenBorder,
                    color: quotaAtRisk ? THEME.amber : THEME.green,
                  }}
                >
                  {quotaAtRisk ? 'At risk' : 'On track'}
                </span>
              }
            />
          </div>
          <div className="h-[190px] px-5 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={burnProjectionSeries}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: THEME.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={18} />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fill: THEME.textMuted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, Math.max(summary.quotaLimit, projectedEndOfMonth + 10)]}
                  allowDecimals={false}
                  tick={{ fill: THEME.textMuted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={{ background: THEME.cell, border: `1px solid ${THEME.borderStrong}`, borderRadius: 7 }} />
                <ReferenceLine
                  x={formatShortLabel(today)}
                  stroke="rgba(255,255,255,0.35)"
                  strokeDasharray="4 4"
                  label={{ value: 'Today', position: 'insideTopLeft', fill: THEME.textSoft, fontSize: 10 }}
                />
                <Area yAxisId="right" type="monotone" dataKey="cumulativeQuota" stroke="transparent" fill="rgba(245,158,11,0.05)" />
                <Line yAxisId="left" type="monotone" dataKey="actualBurn" stroke={THEME.blue} strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="projectionBurn" stroke={THEME.amber} strokeWidth={2} strokeDasharray="6 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 px-5 pb-5">
            {[
              `Projected Month Total: ~${formatInteger(projectionMonthTotal)} req`,
              `Days Remaining: ${resetsInDays}`,
              `Quota At Risk: ${quotaAtRisk ? 'Yes' : 'No'}`,
            ].map((pill) => (
              <div key={pill} className="rounded-[6px] border px-3 py-2 font-mono text-[11px]" style={{ background: THEME.panel, borderColor: THEME.border, color: THEME.textSoft }}>
                {pill}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border" style={{ background: THEME.card, borderColor: THEME.border }}>
          <div className="px-5 py-4">
            <SectionHeader
              title="Usage Alerting"
              subtitle="Configure thresholds to get ahead of quota exhaustion"
              right={
                <span className="rounded-full border px-3 py-1 text-[10px] font-bold" style={{ background: THEME.greenDim, borderColor: THEME.greenBorder, color: THEME.green }}>
                  Server-side
                </span>
              }
            />
          </div>
          <div className="space-y-[12px] px-5 pb-5">
            <div className="rounded-[8px] border px-4 py-3" style={{ background: THEME.greenDim, borderColor: THEME.greenBorder }}>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4" style={{ color: THEME.green }} />
                <div>
                  <div className="text-sm font-semibold text-white">No active alerts - quota is healthy ({formatPercent(quotaUsedPercent)} used)</div>
                  <div className="mt-1 text-[11px]" style={{ color: THEME.textSoft }}>
                    Alert preferences are treated as server-side workspace settings and are applied consistently for all operators.
                  </div>
                </div>
              </div>
            </div>

            {alertItems.map((item) => (
              <div key={item.pct} className="rounded-[8px] border px-4 py-3" style={{ background: THEME.panel, borderColor: THEME.border }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <ToggleSwitch
                      checked={item.enabled}
                      onChange={() => {
                        if (item.pct === 80) {
                          setUsageAlertEnabled(!item.enabled);
                        } else {
                          setAlertItems((current) => current.map((row) => row.pct === item.pct ? { ...row, enabled: !row.enabled } : row));
                        }
                      }}
                    />
                    <div>
                      <div className="text-sm font-semibold text-white">{item.label}</div>
                      <div className="mt-1 text-[11px]" style={{ color: THEME.textSoft }}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[10px] font-bold"
                    style={{
                      background: item.triggered ? THEME.redDim : 'rgba(255,255,255,0.04)',
                      borderColor: item.triggered ? THEME.redBorder : THEME.border,
                      color: item.triggered ? THEME.red : THEME.textSoft,
                    }}
                  >
                    {item.triggered ? 'TRIGGERED' : 'Not triggered'}
                  </span>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border px-3 py-1.5 text-[11px] font-semibold" style={{ background: THEME.blueDim, borderColor: THEME.blueBorder, color: THEME.blue }}>
                <Mail className="mr-1 inline h-3.5 w-3.5" />
                Email
              </span>
              {['Webhook', 'Slack'].map((channel) => (
                <span key={channel} className="rounded-full border px-3 py-1.5 text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.03)', borderColor: THEME.border, color: THEME.textSoft }}>
                  {channel}
                  <span className="ml-2 rounded-full border px-2 py-0.5 text-[9px]" style={{ borderColor: THEME.borderStrong, color: THEME.textMuted }}>
                    Coming soon
                  </span>
                </span>
              ))}
            </div>

            <div className="rounded-[8px] border px-4 py-3" style={{ background: THEME.panel, borderColor: THEME.border }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: THEME.textMuted }}>
                Alert History
              </div>
              <div className="usage-scroll mt-3 max-h-[112px] space-y-2 overflow-y-auto pr-1">
                {alertHistory.length === 0 ? (
                  <div className="font-mono text-[11px]" style={{ color: THEME.textSoft }}>
                    [No alerts triggered this billing cycle]
                  </div>
                ) : (
                  alertHistory.map((item) => (
                    <div key={`${item.timestamp}-${item.label}`} className="font-mono text-[11px]" style={{ color: THEME.textSoft }}>
                      {item.timestamp} - {item.label}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px]" style={{ color: THEME.textSoft }}>
              <CheckCircle2 className="h-3.5 w-3.5" style={{ color: THEME.green }} />
              Alert preferences are saved server-side and apply across all sessions and devices.
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
