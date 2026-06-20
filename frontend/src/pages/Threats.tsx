import { Fragment, useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
  Siren,
  XCircle,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { authedFetch, authedFetchJson } from '../services/authenticatedFetch';

type ThreatType =
  | 'DATA_EXFILTRATION'
  | 'PROMPT_INJECTION'
  | 'DATA_LEAK'
  | 'ENCODING_OBFUSCATION'
  | 'AML_VIOLATION'
  | 'CREDENTIAL_THEFT';
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type ThreatStatus = 'NEW' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';
type TimeRange = '24h' | '7d' | '30d' | '90d';
type SortField = 'id' | 'score' | 'ts';
type SortDir = 'asc' | 'desc';
type MetricKey = 'totalThreats' | 'blocked' | 'critical' | 'highSeverity' | 'avgRiskScore' | 'resolved';

type ThreatEvent = {
  id: string;
  logId: string;
  type: ThreatType;
  severity: Severity;
  score: number;
  status: ThreatStatus;
  ts: string;
  apiKey: string | null;
  provider: string;
  model: string;
  latency: string;
  policies: string[];
  actions: Array<'QUARANTINE_REQUEST' | 'ALERT_EMAIL'>;
  actionsComplete: boolean;
  prompt: string;
  executionTrace?: Array<{ time: string; level: 'info' | 'ok' | 'warn' | 'error'; message: string }>;
};

type ThreatListResponse = {
  threats: ThreatEvent[];
  total: number;
  page: number;
  pageSize: number;
};

type ThreatStats = Record<MetricKey, number> & {
  deltas: Partial<Record<MetricKey, number>>;
  sparklines: Partial<Record<MetricKey, number[]>>;
  activeCritical?: number;
  activeCriticalIds?: string[];
};

type ThreatTrend = {
  labels: string[];
  series: Record<string, number[]>;
};

type ThreatDistributionItem = {
  type: string;
  count: number;
};

const TIME_RANGES: Array<{ value: TimeRange; label: string }> = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: '90d', label: 'Last 90d' },
];

const SEVERITIES: Array<'ALL' | Severity> = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUSES: Array<'ALL' | ThreatStatus> = ['ALL', 'NEW', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE'];
const THREAT_TYPES: Array<'ALL' | ThreatType> = [
  'ALL',
  'DATA_EXFILTRATION',
  'PROMPT_INJECTION',
  'DATA_LEAK',
  'ENCODING_OBFUSCATION',
  'AML_VIOLATION',
  'CREDENTIAL_THEFT',
];

const statusBadgeMap: Record<ThreatStatus, { bg: string; border: string; color: string }> = {
  NEW: { bg: 'rgba(239,68,68,0.11)', border: 'rgba(239,68,68,0.26)', color: '#EF4444' },
  INVESTIGATING: { bg: 'rgba(245,158,11,0.11)', border: 'rgba(245,158,11,0.26)', color: '#F59E0B' },
  RESOLVED: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.28)', color: '#10B981' },
  FALSE_POSITIVE: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.13)', color: '#6B7A99' },
};

const severityBadgeMap: Record<Severity, { bg: string; border: string; color: string }> = {
  CRITICAL: { bg: 'rgba(239,68,68,0.11)', border: 'rgba(239,68,68,0.26)', color: '#EF4444' },
  HIGH: { bg: 'rgba(245,158,11,0.11)', border: 'rgba(245,158,11,0.26)', color: '#F59E0B' },
  MEDIUM: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.28)', color: '#60A5FA' },
  LOW: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.28)', color: '#10B981' },
};

const trendColors = ['#EF4444', '#F59E0B', '#60A5FA', '#10B981', '#A78BFA', '#06B6D4'];

function compactLabel(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function scoreClass(score: number): string {
  if (score >= 90) return 'text-red-400';
  if (score >= 70) return 'text-amber-400';
  if (score >= 40) return 'text-blue-400';
  return 'text-emerald-400';
}

function coerceCount(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
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

function BadgePill({ label, colors }: { label: string; colors: { bg: string; border: string; color: string } }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]"
      style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.color }}
    >
      {label}
    </span>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const safeValues = values.length ? values.map(coerceCount) : [0, 0, 0, 0];
  const max = Math.max(...safeValues, 1);
  const points = safeValues
    .map((value, index) => {
      const x = (index / Math.max(safeValues.length - 1, 1)) * 100;
      const y = 30 - (value / max) * 26;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 34" role="img" aria-label="metric sparkline" className="h-9 w-full overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function StatCard({
  title,
  value,
  delta,
  sparkline,
  color,
  icon,
}: {
  title: string;
  value: string | number;
  delta: number;
  sparkline: number[];
  color: string;
  icon: ReactNode;
}) {
  const positive = delta >= 0;
  return (
    <Card className="rounded-lg border-white/10 bg-slate-900/45">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
            <div className="mt-2 text-2xl font-bold text-slate-50">{value}</div>
          </div>
          <div className="rounded-md border border-white/10 bg-slate-950/60 p-2" style={{ color }}>
            {icon}
          </div>
        </div>
        <div className="mt-3">
          <Sparkline values={sparkline} color={color} />
        </div>
        <div className={cn('mt-2 text-xs font-medium', positive ? 'text-slate-400' : 'text-amber-300')}>
          {positive ? '+' : ''}
          {delta} vs previous range
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center text-sm text-slate-400">{children}</div>;
}

export default function Threats() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [severity, setSeverity] = useState<'ALL' | Severity>('ALL');
  const [status, setStatus] = useState<'ALL' | ThreatStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ThreatType>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('ts');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [stats, setStats] = useState<ThreatStats | null>(null);
  const [trend, setTrend] = useState<ThreatTrend | null>(null);
  const [distribution, setDistribution] = useState<ThreatDistributionItem[]>([]);
  const [threatsResponse, setThreatsResponse] = useState<ThreatListResponse | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, ThreatEvent>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, severity, status, timeRange, typeFilter]);

  const listQuery = useMemo(() => {
    const params = new URLSearchParams({
      severity,
      status,
      type: typeFilter,
      timeRange,
      sortField,
      sortDir,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    return params.toString();
  }, [debouncedSearch, page, pageSize, severity, sortDir, sortField, status, timeRange, typeFilter]);

  const loadOverview = useCallback(async () => {
    setIsOverviewLoading(true);
    setError(null);
    try {
      const [statsBody, trendBody, distributionBody] = await Promise.all([
        authedFetchJson<ThreatStats>(`/api/v1/threats/stats?timeRange=${timeRange}`),
        authedFetchJson<ThreatTrend>(`/api/v1/threats/trend?timeRange=${timeRange === '24h' ? '7d' : timeRange}&groupBy=type`),
        authedFetchJson<ThreatDistributionItem[]>(`/api/v1/threats/distribution?timeRange=${timeRange}`),
      ]);
      setStats(statsBody);
      setTrend(trendBody);
      setDistribution(distributionBody);
    } catch (err: any) {
      setError(err?.message || 'Failed to load threat overview.');
    } finally {
      setIsOverviewLoading(false);
    }
  }, [timeRange]);

  const loadThreats = useCallback(async () => {
    setIsTableLoading(true);
    setError(null);
    try {
      const body = await authedFetchJson<ThreatListResponse>(`/api/v1/threats?${listQuery}`);
      setThreatsResponse(body);
      setSelectedIds((current) => new Set([...current].filter((id) => body.threats.some((event) => event.id === id))));
    } catch (err: any) {
      setError(err?.message || 'Failed to load threat events.');
    } finally {
      setIsTableLoading(false);
    }
  }, [listQuery]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    void loadThreats();
  }, [loadThreats]);

  const refreshAll = async () => {
    await Promise.all([loadOverview(), loadThreats()]);
    setRefreshed(true);
    window.setTimeout(() => setRefreshed(false), 1500);
  };

  const fetchThreatDetail = useCallback(
    async (id: string) => {
      if (detailCache[id]) return;
      try {
        const detail = await authedFetchJson<ThreatEvent>(`/api/v1/threats/${encodeURIComponent(id)}`);
        setDetailCache((current) => ({ ...current, [id]: detail }));
      } catch (err: any) {
        setError(err?.message || 'Failed to load threat detail.');
      }
    },
    [detailCache],
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        void fetchThreatDetail(id);
      }
      return next;
    });
  };

  const patchThreatStatus = async (id: string, nextStatus: ThreatStatus) => {
    const previous = threatsResponse;
    setThreatsResponse((current) =>
      current
        ? {
            ...current,
            threats: current.threats.map((event) => (event.id === id ? { ...event, status: nextStatus, actionsComplete: nextStatus !== 'INVESTIGATING' } : event)),
          }
        : current,
    );
    try {
      const updated = await authedFetchJson<ThreatEvent>(`/api/v1/threats/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setThreatsResponse((current) =>
        current ? { ...current, threats: current.threats.map((event) => (event.id === id ? { ...event, ...updated } : event)) } : current,
      );
      setDetailCache((current) => ({ ...current, [id]: updated }));
      void loadOverview();
    } catch (err: any) {
      setThreatsResponse(previous);
      setError(err?.message || 'Failed to update threat status.');
    }
  };

  const runBulkAction = async (action: 'acknowledge' | 'resolve', ids?: string[]) => {
    const targetIds = ids || [...selectedIds];
    const nextStatus: ThreatStatus = action === 'acknowledge' ? 'INVESTIGATING' : 'RESOLVED';
    try {
      await authedFetchJson<{ updated: number }>('/api/v1/threats/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: targetIds, action }),
      });
      setThreatsResponse((current) =>
        current
          ? {
              ...current,
              threats: current.threats.map((event) =>
                targetIds.includes(event.id) ? { ...event, status: nextStatus, actionsComplete: nextStatus === 'RESOLVED' } : event,
              ),
            }
          : current,
      );
      setSelectedIds(new Set());
      await Promise.all([loadOverview(), loadThreats()]);
    } catch (err: any) {
      setError(err?.message || 'Failed to update selected threats.');
    }
  };

  const exportThreats = async (format: 'csv' | 'json') => {
    const params = new URLSearchParams({
      format,
      severity,
      status,
      type: typeFilter,
      timeRange,
      sortField,
      sortDir,
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    const res = await authedFetch(`/api/v1/threats/export?${params.toString()}`);
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    downloadBlob(`sentinel_threats_${timeRange}.${format}`, await res.blob());
  };

  const trendData = useMemo(() => {
    const labels = trend?.labels || [];
    const series = trend?.series || {};
    return labels.map((label, index) => {
      const row: Record<string, string | number> = { label: formatShortDate(label) };
      for (const [key, values] of Object.entries(series)) {
        row[key] = coerceCount(values?.[index]);
      }
      return row;
    });
  }, [trend]);

  const visibleTrendTypes = useMemo(() => {
    const series = trend?.series || {};
    const active = Object.keys(series).filter((key) => (series[key] || []).some((value) => coerceCount(value) > 0));
    return (active.length ? active : Object.keys(series)).slice(0, 6);
  }, [trend]);

  const distributionMax = Math.max(...distribution.map((item) => coerceCount(item.count)), 1);
  const totalPages = Math.max(Math.ceil((threatsResponse?.total || 0) / pageSize), 1);
  const allRowsSelected = Boolean(threatsResponse?.threats.length) && threatsResponse!.threats.every((event) => selectedIds.has(event.id));
  const activeCriticalIds = stats?.activeCriticalIds || [];

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allRowsSelected) {
        threatsResponse?.threats.forEach((event) => next.delete(event.id));
      } else {
        threatsResponse?.threats.forEach((event) => next.add(event.id));
      }
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDir(field === 'score' ? 'desc' : 'asc');
  };

  const statCards = [
    { key: 'totalThreats' as MetricKey, title: 'Total Threats', color: '#60A5FA', icon: <ShieldAlert className="h-4 w-4" /> },
    { key: 'blocked' as MetricKey, title: 'Blocked', color: '#EF4444', icon: <Siren className="h-4 w-4" /> },
    { key: 'critical' as MetricKey, title: 'Critical', color: '#F43F5E', icon: <AlertTriangle className="h-4 w-4" /> },
    { key: 'highSeverity' as MetricKey, title: 'High Severity', color: '#F59E0B', icon: <AlertTriangle className="h-4 w-4" /> },
    { key: 'avgRiskScore' as MetricKey, title: 'Avg Risk Score', color: '#A78BFA', icon: <ShieldAlert className="h-4 w-4" /> },
    { key: 'resolved' as MetricKey, title: 'Resolved', color: '#10B981', icon: <CheckCircle2 className="h-4 w-4" /> },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-7 w-7 text-red-400" />
            <h1 className="text-3xl font-bold tracking-tight">Threats</h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">Live incident response for detected AI security events.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={timeRange}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setTimeRange(event.target.value as TimeRange)}
            className="h-9 rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-indigo-500"
          >
            {TIME_RANGES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <Button variant="outline" className="text-slate-300" onClick={() => exportThreats('csv')}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" className="text-slate-300" onClick={() => exportThreats('json')}>
            <Download className="mr-2 h-4 w-4" /> JSON
          </Button>
          <Button variant="outline" className="text-slate-300" onClick={refreshAll} disabled={isOverviewLoading || isTableLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', (isOverviewLoading || isTableLoading) && 'animate-spin')} />
            {refreshed ? 'Refreshed ✓' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {stats?.activeCritical ? (
        <div className="flex flex-col gap-3 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-400" />
            <div>
              <div className="font-semibold text-red-100">Active critical threats detected</div>
              <div className="text-sm text-red-200/80">
                {stats.activeCritical} critical event{stats.activeCritical === 1 ? '' : 's'} still need investigation.
              </div>
            </div>
          </div>
          <Button variant="destructive" onClick={() => runBulkAction('acknowledge', activeCriticalIds)}>
            Acknowledge All
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        {statCards.map((item) => (
          <div key={item.key}>
            <StatCard
              title={item.title}
              value={item.key === 'avgRiskScore' ? Math.round(stats?.[item.key] || 0) : coerceCount(stats?.[item.key])}
              delta={Number(stats?.deltas?.[item.key] || 0)}
              sparkline={stats?.sparklines?.[item.key] || []}
              color={item.color}
              icon={item.icon}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-lg border-white/10 bg-slate-900/45">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Siren className="h-5 w-5 text-indigo-400" /> Threat Trend Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 10, right: 18, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#64748B"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tickFormatter={(value) => String(coerceCount(value))}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #1E293B', borderRadius: '8px' }}
                      labelStyle={{ color: '#CBD5E1' }}
                      formatter={(value: any, name: any) => [coerceCount(value), compactLabel(String(name))]}
                    />
                    {visibleTrendTypes.map((key, index) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={trendColors[index % trendColors.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState>No threat trend data available.</EmptyState>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {visibleTrendTypes.map((key, index) => (
                <div key={key} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: trendColors[index % trendColors.length] }} />
                  {compactLabel(key)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-white/10 bg-slate-900/45">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Threat Type Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {distribution.length ? (
              distribution.map((item) => {
                const count = coerceCount(item.count);
                return (
                  <div key={item.type}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-slate-300">{compactLabel(item.type)}</span>
                      <span className="font-mono text-slate-500">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.max((count / distributionMax) * 100, count ? 8 : 0)}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState>No distribution data available.</EmptyState>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-lg border-white/10 bg-slate-900/45">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-red-400" /> Threat Events
            </CardTitle>
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                placeholder="Search threats, policies, keys..."
                className="h-9 w-full rounded-md border border-white/10 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Severity</span>
              {SEVERITIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSeverity(item)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                    severity === item ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-slate-950/40 text-slate-400 hover:text-slate-200',
                  )}
                >
                  {compactLabel(item)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Status</span>
              {STATUSES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStatus(item)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                    status === item ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-slate-950/40 text-slate-400 hover:text-slate-200',
                  )}
                >
                  {compactLabel(item)}
                </button>
              ))}
              <select
                value={typeFilter}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setTypeFilter(event.target.value as 'ALL' | ThreatType)}
                className="h-8 rounded-md border border-white/10 bg-slate-950/60 px-3 text-xs font-semibold text-slate-300 outline-none focus:border-indigo-500"
              >
                {THREAT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {compactLabel(item)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>

        {selectedIds.size > 0 && (
          <div className="mx-6 mb-4 flex flex-col gap-3 rounded-lg border border-indigo-400/25 bg-indigo-500/10 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-medium text-indigo-100">
              {selectedIds.size} selected threat{selectedIds.size === 1 ? '' : 's'}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => runBulkAction('acknowledge')}>
                Acknowledge
              </Button>
              <Button variant="outline" size="sm" onClick={() => runBulkAction('resolve')}>
                Resolve
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        )}

        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-[1120px] w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-slate-950/60 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allRowsSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-white/20 bg-slate-900" />
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" onClick={() => setSort('id')} className="font-semibold hover:text-slate-300">
                      Event
                    </button>
                  </th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">
                    <button type="button" onClick={() => setSort('score')} className="font-semibold hover:text-slate-300">
                      Score
                    </button>
                  </th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">API Key</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">
                    <button type="button" onClick={() => setSort('ts')} className="font-semibold hover:text-slate-300">
                      Time
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-slate-950/20">
                {isTableLoading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                      Loading threat events...
                    </td>
                  </tr>
                ) : threatsResponse?.threats.length ? (
                  threatsResponse.threats.map((event) => {
                    const expanded = expandedIds.has(event.id);
                    const detail = detailCache[event.id];
                    return (
                      <Fragment key={event.id}>
                        <tr className="align-top hover:bg-slate-900/60">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(event.id)}
                              onChange={() => toggleSelected(event.id)}
                              className="h-4 w-4 rounded border-white/20 bg-slate-900"
                            />
                          </td>
                          <td className="px-4 py-4">
                            <button type="button" onClick={() => toggleExpanded(event.id)} className="flex items-center gap-2 text-left">
                              {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                              <span>
                                <span className="block font-mono text-xs text-slate-300">{event.id}</span>
                                <span className="block text-xs text-slate-500">log {event.logId}</span>
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            <BadgePill label={compactLabel(event.type)} colors={severityBadgeMap[event.severity]} />
                          </td>
                          <td className="px-4 py-4">
                            <BadgePill label={event.severity} colors={severityBadgeMap[event.severity]} />
                          </td>
                          <td className="px-4 py-4">
                            <span className={cn('font-mono text-sm font-bold', scoreClass(event.score))}>{Math.round(event.score)}</span>
                          </td>
                          <td className="px-4 py-4">
                            <BadgePill label={compactLabel(event.status)} colors={statusBadgeMap[event.status]} />
                          </td>
                          <td className="px-4 py-4 font-mono text-xs text-slate-400">{event.apiKey ?? '[anonymous]'}</td>
                          <td className="px-4 py-4">
                            <div className="text-xs font-semibold text-slate-300">{event.provider}</div>
                            <div className="mt-1 text-xs text-slate-500">{event.model}</div>
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-400">{formatDateTime(event.ts)}</td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => patchThreatStatus(event.id, 'RESOLVED')} disabled={event.status === 'RESOLVED'}>
                                Mark Resolved
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => patchThreatStatus(event.id, 'FALSE_POSITIVE')} disabled={event.status === 'FALSE_POSITIVE'}>
                                False Positive
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => patchThreatStatus(event.id, 'INVESTIGATING')} disabled={event.status === 'INVESTIGATING'}>
                                Escalate
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${event.id}-detail`} className="bg-slate-950/50">
                            <td colSpan={10} className="px-6 py-5">
                              {detail ? (
                                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                                  <div className="min-w-0 space-y-3">
                                    <div>
                                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Prompt Preview</div>
                                      <div className="mt-2 rounded-md border border-white/10 bg-slate-950/70 p-3 font-mono text-xs leading-5 text-slate-300">
                                        {detail.prompt || 'No prompt preview available.'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Policies</div>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {detail.policies.length ? detail.policies.map((policy) => (
                                          <span key={policy}>
                                            <BadgePill label={policy} colors={severityBadgeMap[detail.severity]} />
                                          </span>
                                        )) : <span className="text-xs text-slate-500">No named policies attached.</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Execution Trace</div>
                                    <div className="mt-2 space-y-2">
                                      {(detail.executionTrace || []).map((item, index) => (
                                        <div key={`${detail.id}-trace-${index}`} className="rounded-md border border-white/10 bg-slate-950/70 p-3">
                                          <div className="flex items-center justify-between gap-3">
                                            <span className={cn('text-[11px] font-bold uppercase', item.level === 'error' ? 'text-red-400' : item.level === 'warn' ? 'text-amber-400' : item.level === 'ok' ? 'text-emerald-400' : 'text-slate-400')}>
                                              {item.level === 'ok' ? 'PASS' : item.level}
                                            </span>
                                            <span className="text-[11px] text-slate-500">{formatDateTime(item.time)}</span>
                                          </div>
                                          <div className="mt-1 text-xs text-slate-300">{item.message}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <EmptyState>Loading event detail...</EmptyState>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                      No threat events match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-400">
              Showing page {page} of {totalPages} · {threatsResponse?.total || 0} threat events
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setPageSize(Number(event.target.value))}
                className="h-8 rounded-md border border-white/10 bg-slate-950 px-2 text-xs text-slate-300 outline-none focus:border-indigo-500"
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size} rows
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(current + 1, totalPages))} disabled={page >= totalPages}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
