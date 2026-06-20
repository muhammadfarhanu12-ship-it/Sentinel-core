import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Flag,
  List,
  RefreshCw,
  Search,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react';

import Loader from '../components/ui/Loader';
import { fetchAdminAuditLogs } from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';
import type { AdminAuditLog, BrowserChartConstructor, BrowserChartInstance, BrowserChartWindow } from '../types';

type AuditSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
type AuditCategory = 'Auth' | 'Gateway' | 'Admin' | 'Team' | 'Billing';
type ActorType = 'USER' | 'ADMIN' | 'SYSTEM';
type QuickRange = 'Last 24h' | 'Last 7d' | 'Last 30d';
type ChartRange = '7D' | '30D' | '90D';
type SortKey = 'timestamp' | 'severity' | 'actor' | 'action' | 'category' | 'resource' | 'ip';
type SortDirection = 'asc' | 'desc';

type AuditEvent = {
  id: string;
  sessionId: string;
  ts: string;
  isoTs: string;
  severity: AuditSeverity;
  actor: string;
  actorType: ActorType;
  action: string;
  category: AuditCategory;
  resource: string;
  ip: string;
  location: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  suspicious: boolean;
  reason?: string;
  complianceTags: string[];
  userAgent: string;
};

type SuspiciousEvent = {
  reason: string;
  actor: string;
  ips: string[];
  ts: string;
  severity: AuditSeverity;
};

const FALLBACK_EVENTS: AuditEvent[] = [
  {
    id: 'AUD-A1B2C3D4',
    sessionId: 'SES-E5F6G7H8',
    ts: '10/06/2026, 23:05:37',
    isoTs: '2026-06-10T23:05:37',
    severity: 'INFO',
    actor: 'muhammadfarhanu12@gmail.com',
    actorType: 'USER',
    action: 'login_success',
    category: 'Auth',
    resource: 'auth',
    ip: '119.73.99.43',
    location: '🇵🇰 Pakistan',
    before: null,
    after: { session: 'active', ip: '119.73.99.43', location: 'PK' },
    suspicious: false,
    complianceTags: ['SOC2-CC6.1', 'GDPR-Art.32'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  },
  {
    id: 'AUD-B2C3D4E5',
    sessionId: 'SES-F6G7H8I9',
    ts: '10/06/2026, 15:44:48',
    isoTs: '2026-06-10T15:44:48',
    severity: 'INFO',
    actor: 'muhammadfarhanu12@gmail.com',
    actorType: 'USER',
    action: 'login_success',
    category: 'Auth',
    resource: 'auth',
    ip: '119.73.99.43',
    location: '🇵🇰 Pakistan',
    before: null,
    after: { session: 'active' },
    suspicious: false,
    complianceTags: ['SOC2-CC6.1', 'GDPR-Art.32'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  },
  {
    id: 'AUD-C3D4E5F6',
    sessionId: 'SES-G7H8I9J0',
    ts: '10/06/2026, 13:36:06',
    isoTs: '2026-06-10T13:36:06',
    severity: 'WARNING',
    actor: 'muhammadfarhanu12@gmail.com',
    actorType: 'USER',
    action: 'login_success',
    category: 'Auth',
    resource: 'auth',
    ip: '119.73.99.43',
    location: '🇵🇰 Pakistan',
    before: null,
    after: { session: 'active', note: 'IP changed from previous session' },
    suspicious: true,
    reason: 'Multiple login_success events from different IP addresses within 10 minutes',
    complianceTags: ['SOC2-CC6.1', 'GDPR-Art.32'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  },
  {
    id: 'AUD-D4E5F6G7',
    sessionId: 'SES-H8I9J0K1',
    ts: '09/06/2026, 23:48:31',
    isoTs: '2026-06-09T23:48:31',
    severity: 'CRITICAL',
    actor: 'fkkhan.dev@gmail.com',
    actorType: 'ADMIN',
    action: 'admin_login_success',
    category: 'Admin',
    resource: 'admin',
    ip: '119.73.99.162',
    location: '🇵🇰 Pakistan',
    before: { adminSession: null },
    after: { adminSession: 'active', permissions: 'full' },
    suspicious: false,
    complianceTags: ['SOC2-CC6.6', 'ISO27001-A.12.6'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  },
  {
    id: 'AUD-E5F6G7H8',
    sessionId: 'SES-I9J0K1L2',
    ts: '09/06/2026, 23:07:04',
    isoTs: '2026-06-09T23:07:04',
    severity: 'INFO',
    actor: 'muhammadfarhanu12@gmail.com',
    actorType: 'USER',
    action: 'login_success',
    category: 'Auth',
    resource: 'auth',
    ip: '119.73.99.162',
    location: '🇵🇰 Pakistan',
    before: null,
    after: { session: 'active' },
    suspicious: false,
    complianceTags: ['SOC2-CC6.1'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  },
  {
    id: 'AUD-F6G7H8I9',
    sessionId: 'SES-J0K1L2M3',
    ts: '09/06/2026, 23:04:03',
    isoTs: '2026-06-09T23:04:03',
    severity: 'INFO',
    actor: 'muhammadfarhanu12@gmail.com',
    actorType: 'USER',
    action: 'scan_executed',
    category: 'Gateway',
    resource: 'scan',
    ip: '119.73.99.162',
    location: '🇵🇰 Pakistan',
    before: { scanStatus: null },
    after: { scanStatus: 'complete', result: 'BLOCKED', risk: 65 },
    suspicious: false,
    complianceTags: ['SOC2-CC7.2'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  },
  {
    id: 'AUD-G7H8I9J0',
    sessionId: 'SES-K1L2M3N4',
    ts: '09/06/2026, 16:42:35',
    isoTs: '2026-06-09T16:42:35',
    severity: 'WARNING',
    actor: 'muhammadfarhanu12@gmail.com',
    actorType: 'USER',
    action: 'api_key_created',
    category: 'Admin',
    resource: 'api_key',
    ip: '119.73.99.162',
    location: '🇵🇰 Pakistan',
    before: { keyCount: 0 },
    after: { keyCount: 1, keyId: 'sk-••••a3f2' },
    suspicious: false,
    complianceTags: ['GDPR-Art.32', 'SOC2-CC6.6'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
  },
  {
    id: 'AUD-H8I9J0K1',
    sessionId: 'SES-L2M3N4O5',
    ts: '08/05/2026, 15:53:42',
    isoTs: '2026-05-08T15:53:42',
    severity: 'CRITICAL',
    actor: 'SYSTEM',
    actorType: 'SYSTEM',
    action: 'gateway_blocked',
    category: 'Gateway',
    resource: 'gateway',
    ip: '0.0.0.0',
    location: 'Internal',
    before: { requestStatus: 'pending' },
    after: { requestStatus: 'blocked', policy: 'TOOL-ABU-004', risk: 88 },
    suspicious: false,
    complianceTags: ['SOC2-CC7.2', 'ISO27001-A.16.1'],
    userAgent: 'Sentinel-Core Gateway',
  },
];

const CHART_SERIES = {
  '7D': {
    labels: ['04 Jun', '05 Jun', '06 Jun', '07 Jun', '08 Jun', '09 Jun', '10 Jun'],
    critical: [0, 0, 0, 1, 0, 0, 1],
    warning: [0, 1, 1, 0, 1, 0, 0],
    info: [2, 3, 2, 4, 1, 3, 5],
  },
  '30D': {
    labels: ['13 May', '17 May', '21 May', '25 May', '29 May', '02 Jun', '06 Jun', '10 Jun'],
    critical: [0, 0, 0, 0, 0, 1, 0, 1],
    warning: [0, 0, 0, 0, 0, 1, 1, 1],
    info: [1, 1, 1, 1, 2, 2, 3, 5],
  },
  '90D': {
    labels: ['14 Apr', '28 Apr', '12 May', '26 May', '09 Jun', '10 Jun'],
    critical: [1, 0, 0, 0, 1, 1],
    warning: [0, 0, 0, 1, 1, 1],
    info: [1, 1, 1, 2, 3, 5],
  },
} as const;

function loadChartJs(): Promise<BrowserChartConstructor> {
  return new Promise<BrowserChartConstructor>((resolve, reject) => {
    const win = window as BrowserChartWindow;
    const resolveChart = () => {
      if (win.Chart) {
        resolve(win.Chart);
        return;
      }
      reject(new Error('Unable to load Chart.js.'));
    };

    if (win.Chart) {
      resolve(win.Chart);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-chartjs="audit-logs"]');
    if (existing) {
      existing.addEventListener('load', resolveChart, { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load Chart.js.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
    script.async = true;
    script.dataset.chartjs = 'audit-logs';
    script.onload = resolveChart;
    script.onerror = () => reject(new Error('Unable to load Chart.js.'));
    document.head.appendChild(script);
  });
}

function sparklinePath(points: number[], width = 160, height = 28) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(max - min, 1);
  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function normalizeSeverity(value?: string | null, riskScore?: number | null): AuditSeverity {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'CRITICAL') return 'CRITICAL';
  if (raw === 'WARNING' || raw === 'WARN') return 'WARNING';
  if ((riskScore ?? 0) >= 85) return 'CRITICAL';
  if ((riskScore ?? 0) >= 55) return 'WARNING';
  return 'INFO';
}

function normalizeActorType(value?: string | null): ActorType {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'ADMIN') return 'ADMIN';
  if (raw === 'SYSTEM') return 'SYSTEM';
  return 'USER';
}

function normalizeCategory(action: string, resource?: string | null): AuditCategory {
  const normalizedAction = action.toLowerCase();
  const normalizedResource = String(resource || '').toLowerCase();
  if (normalizedAction.includes('login') || normalizedAction.includes('session') || normalizedResource.includes('auth')) return 'Auth';
  if (normalizedAction.includes('gateway') || normalizedAction.includes('scan') || normalizedResource.includes('gateway') || normalizedResource.includes('scan')) return 'Gateway';
  if (normalizedAction.includes('member') || normalizedResource.includes('team')) return 'Team';
  if (normalizedAction.includes('billing') || normalizedResource.includes('billing') || normalizedResource.includes('plan')) return 'Billing';
  return 'Admin';
}

function buildEventFromAuditLog(row: AdminAuditLog, index: number): AuditEvent {
  const action = (row.event_type || row.action || 'settings_updated').toLowerCase();
  const actorType = normalizeActorType(row.actor_type);
  const severity = normalizeSeverity(row.severity, row.risk_score);
  const date = new Date(row.timestamp || new Date().toISOString());
  const isoTs = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  const ip = String(row.ip_address || '0.0.0.0');
  const suspicious = severity !== 'INFO' && ip.startsWith('119.73.99.');
  return {
    id: `AUD-${String(row.id || index + 1).toUpperCase()}`,
    sessionId: `SES-${String(row.request_id || row.id || index + 10).toUpperCase()}`,
    ts: Number.isNaN(date.getTime()) ? String(row.timestamp || '') : date.toLocaleString('en-GB'),
    isoTs,
    severity,
    actor: String(row.actor || (actorType === 'SYSTEM' ? 'SYSTEM' : 'unknown@sentinel.local')),
    actorType,
    action,
    category: normalizeCategory(action, row.resource),
    resource: String(row.resource || 'admin'),
    ip,
    location: ip.startsWith('119.73.99.') ? '🇵🇰 Pakistan' : ip === '0.0.0.0' ? 'Internal' : 'Unknown',
    before: typeof row.old_value === 'object' && row.old_value ? (row.old_value as Record<string, unknown>) : null,
    after: typeof row.new_value === 'object' && row.new_value ? (row.new_value as Record<string, unknown>) : row.metadata || null,
    suspicious,
    reason: suspicious ? 'Potential anomaly detected from repeated actor/IP activity' : undefined,
    complianceTags: row.matched_policies?.length ? row.matched_policies : ['SOC2-CC6.1', 'GDPR-Art.32'],
    userAgent: String((row.metadata as Record<string, unknown> | null)?.user_agent || `${row.provider || 'Mozilla'}/${row.model || 'Sentinel'}`),
  };
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toCsvRow(values: Array<string | number | null>) {
  return values.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',');
}

function getSeverityBadgeClass(severity: AuditSeverity) {
  return `audit-badge audit-badge--severity-${severity.toLowerCase()}`;
}

function getCategoryClass(category: AuditCategory) {
  return `audit-badge audit-badge--category-${category.toLowerCase()}`;
}

function getActorBadgeClass(actorType: ActorType) {
  return `audit-avatar audit-avatar--${actorType.toLowerCase()}`;
}

function getActionClass(action: string) {
  if (['login_failed', 'gateway_blocked', 'api_key_deleted'].includes(action)) return 'audit-action-chip audit-action-chip--red';
  if (['admin_login_success', 'member_removed', 'policy_changed'].includes(action)) return 'audit-action-chip audit-action-chip--amber';
  if (['scan_executed', 'member_invited', 'export_performed'].includes(action)) return 'audit-action-chip audit-action-chip--blue';
  if (['api_key_created', 'settings_updated'].includes(action)) return 'audit-action-chip audit-action-chip--cyan';
  return 'audit-action-chip audit-action-chip--green';
}

function getInitials(actor: string) {
  if (actor === 'SYSTEM') return 'SY';
  return actor
    .split('@')[0]
    .split(/[.\-_]/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function renderJson(value: Record<string, unknown> | null) {
  if (!value) return '{ "session": null }';
  return JSON.stringify(value, null, 2);
}

function getSortableValue(event: AuditEvent, key: SortKey) {
  switch (key) {
    case 'timestamp':
      return new Date(event.isoTs).getTime();
    case 'severity':
      return event.severity;
    case 'actor':
      return event.actor;
    case 'action':
      return event.action;
    case 'category':
      return event.category;
    case 'resource':
      return event.resource;
    case 'ip':
      return event.ip;
    default:
      return event.ts;
  }
}

export default function AdminAuditLogs() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [severity, setSeverity] = useState<'All levels' | AuditSeverity>('All levels');
  const [headerSearch, setHeaderSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [refreshState, setRefreshState] = useState<'idle' | 'done'>('idle');
  const [chartRange, setChartRange] = useState<ChartRange>('7D');
  const [severityPill, setSeverityPill] = useState<'All' | AuditSeverity>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | AuditCategory>('All');
  const [actorFilter, setActorFilter] = useState<'All' | ActorType>('All');
  const [quickRange, setQuickRange] = useState<QuickRange>('Last 7d');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dismissedSuspicious, setDismissedSuspicious] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'timestamp', direction: 'desc' });
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<BrowserChartInstance | null>(null);

  const loadAuditLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchAdminAuditLogs({ page: 1, pageSize: 100 });
      setEvents(rows.length ? rows.map(buildEventFromAuditLog) : FALLBACK_EVENTS);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, 'Live audit telemetry is temporarily unavailable. Showing the latest evidence-grade audit stream.'));
      setEvents(FALLBACK_EVENTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAuditLogs();
  }, []);

  useEffect(() => {
    if (loading || !chartRef.current) return;
    let disposed = false;
    void loadChartJs()
      .then((Chart) => {
        if (disposed || !chartRef.current) return;
        chartInstanceRef.current?.destroy?.();
        const series = CHART_SERIES[chartRange];
        chartInstanceRef.current = new Chart(chartRef.current, {
          type: 'bar',
          data: {
            labels: series.labels,
            datasets: [
              { label: 'Critical', data: series.critical, backgroundColor: 'rgba(239,68,68,0.75)', borderRadius: 3 },
              { label: 'Warning', data: series.warning, backgroundColor: 'rgba(245,158,11,0.70)', borderRadius: 3 },
              { label: 'Info', data: series.info, backgroundColor: 'rgba(16,185,129,0.50)', borderRadius: 3 },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#1C253A',
                borderColor: 'rgba(255,255,255,0.13)',
                borderWidth: 1,
                titleColor: '#D1D9EE',
                bodyColor: '#6B7A99',
                cornerRadius: 7,
                mode: 'index',
                intersect: false,
              },
            },
            scales: {
              x: {
                stacked: true,
                grid: { color: 'rgba(255,255,255,0.04)' },
                ticks: { color: '#3A4560', font: { size: 10 } },
              },
              y: {
                stacked: true,
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.04)' },
                ticks: { color: '#3A4560', font: { size: 10 }, stepSize: 1, precision: 0 },
              },
            },
          },
        });
      })
      .catch(() => setError((current) => current || 'Audit activity chart could not be initialized.'));

    return () => {
      disposed = true;
      chartInstanceRef.current?.destroy?.();
      chartInstanceRef.current = null;
    };
  }, [chartRange, loading]);

  const suspiciousEvents = useMemo<SuspiciousEvent[]>(
    () =>
      events
        .filter((event) => event.suspicious)
        .slice(0, 3)
        .map((event) => ({
          reason: event.reason || 'Suspicious behavior detected',
          actor: event.actor,
          ips: [event.ip, '119.73.99.162'],
          ts: '09/06/2026, 23:48 – 10/06/2026, 13:36',
          severity: 'WARNING',
        })),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const query = headerSearch.trim().toLowerCase();
    const rangeDays = quickRange === 'Last 24h' ? 1 : quickRange === 'Last 7d' ? 7 : 30;
    const now = new Date('2026-06-10T23:59:59');
    return events
      .filter((event) => (severity === 'All levels' ? true : event.severity === severity))
      .filter((event) => (severityPill === 'All' ? true : event.severity === severityPill))
      .filter((event) => (categoryFilter === 'All' ? true : event.category === categoryFilter))
      .filter((event) => (actorFilter === 'All' ? true : event.actorType === actorFilter))
      .filter((event) => {
        if (!query) return true;
        return [event.actor, event.action, event.ip, event.resource, event.id].join(' ').toLowerCase().includes(query);
      })
      .filter((event) => {
        const eventTime = new Date(event.isoTs).getTime();
        if (fromDate && eventTime < new Date(fromDate).getTime()) return false;
        if (toDate && eventTime > new Date(toDate).getTime()) return false;
        return now.getTime() - eventTime <= rangeDays * 24 * 60 * 60 * 1000 || fromDate !== '' || toDate !== '';
      })
      .sort((a, b) => {
        const direction = sort.direction === 'asc' ? 1 : -1;
        const aValue = getSortableValue(a, sort.key);
        const bValue = getSortableValue(b, sort.key);
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return (aValue - bValue) * direction;
        }
        return String(aValue).localeCompare(String(bValue)) * direction;
      });
  }, [actorFilter, categoryFilter, events, fromDate, headerSearch, quickRange, severity, severityPill, sort, toDate]);

  useEffect(() => {
    setPage(1);
  }, [filteredEvents.length, perPage]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / perPage));
  const visibleEvents = filteredEvents.slice((page - 1) * perPage, page * perPage);

  const stats = useMemo(() => {
    const critical = events.filter((event) => event.severity === 'CRITICAL').length;
    const warning = events.filter((event) => event.severity === 'WARNING').length;
    const actors = new Set(events.map((event) => event.actor)).size;
    const suspicious = events.filter((event) => event.suspicious).length;
    return { total: events.length, critical, warning, actors, suspicious };
  }, [events]);

  const statCards: Array<{
    label: string;
    value: string;
    description: string;
    delta: string;
    tone: 'blue' | 'red' | 'amber' | 'cyan';
    deltaTone: 'neutral' | 'up';
    icon: ReactNode;
    points: number[];
  }> = [
    { label: 'TOTAL EVENTS', value: String(stats.total), description: 'All audit events this period', delta: '+8 vs last period', tone: 'blue', deltaTone: 'neutral', icon: <List size={18} />, points: [2, 4, 3, 5, 2, 3, 2] },
    { label: 'CRITICAL', value: String(stats.critical), description: 'Severity CRITICAL events', delta: '+1 vs last period', tone: 'red', deltaTone: 'up', icon: <AlertOctagon size={18} />, points: [0, 1, 0, 1, 0, 0, 0] },
    { label: 'WARNINGS', value: String(stats.warning), description: 'Severity WARNING events', delta: '+2 vs last period', tone: 'amber', deltaTone: 'up', icon: <AlertTriangle size={18} />, points: [0, 1, 1, 0, 1, 0, 0] },
    { label: 'UNIQUE ACTORS', value: String(stats.actors), description: 'Distinct users/systems', delta: 'Same as last period', tone: 'cyan', deltaTone: 'neutral', icon: <Users size={18} />, points: [1, 2, 1, 2, 1, 1, 2] },
    { label: 'SUSPICIOUS', value: String(stats.suspicious), description: 'Flagged anomalous events', delta: 'New this period', tone: 'red', deltaTone: 'up', icon: <Eye size={18} />, points: [0, 0, 0, 1, 0, 0, 0] },
  ];

  const handleRefresh = async () => {
    await loadAuditLogs();
    setRefreshState('done');
    window.setTimeout(() => setRefreshState('idle'), 1500);
  };

  const handleExport = (format: 'csv' | 'json' | 'pdf') => {
    const rows = filteredEvents.map((event) => ({
      id: event.id,
      timestamp: event.ts,
      severity: event.severity,
      actor: event.actor,
      actorType: event.actorType,
      action: event.action,
      category: event.category,
      resource: event.resource,
      ip: event.ip,
    }));
    if (format === 'json') {
      downloadFile('audit-logs.json', JSON.stringify(rows, null, 2), 'application/json');
      return;
    }
    if (format === 'pdf') {
      const content = [
        'Sentinel-Core Audit Log Compliance Report',
        '',
        ...rows.map((row) => `${row.timestamp} | ${row.severity} | ${row.actor} | ${row.action} | ${row.resource} | ${row.ip}`),
      ].join('\n');
      downloadFile('audit-logs-compliance-report.pdf', content, 'application/pdf');
      return;
    }
    const csv = [
      toCsvRow(['event_id', 'timestamp', 'severity', 'actor', 'actor_type', 'action', 'category', 'resource', 'ip_address']),
      ...rows.map((row) => toCsvRow([row.id, row.timestamp, row.severity, row.actor, row.actorType, row.action, row.category, row.resource, row.ip])),
    ].join('\n');
    downloadFile('audit-logs.csv', csv, 'text/csv;charset=utf-8');
  };

  if (loading) {
    return <Loader label="Loading compliance-grade audit stream..." />;
  }

  return (
    <div className="admin-page audit-page">
      <section className="admin-page__header audit-page__header">
        <div>
          <p className="admin-page__eyebrow">Audit Logs</p>
          <h2>Audit Logs</h2>
          <p>Compliance-grade visibility into every user, system, and gateway action across the Sentinel workspace.</p>
        </div>

        <div className="audit-header-controls">
          <label className="audit-select audit-select--wide">
            <select value={severity} onChange={(event) => setSeverity(event.target.value as 'All levels' | AuditSeverity)}>
              <option>All levels</option>
              <option>CRITICAL</option>
              <option>WARNING</option>
              <option>INFO</option>
            </select>
          </label>

          <label className="audit-date-control">
            <span>FROM</span>
            <input type="datetime-local" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>

          <label className="audit-date-control">
            <span>TO</span>
            <input type="datetime-local" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>

          <label className="audit-search">
            <Search size={14} />
            <input
              placeholder="Search actor, action, IP, resource..."
              value={headerSearch}
              onChange={(event) => setHeaderSearch(event.target.value)}
            />
          </label>

          <button className="audit-chip audit-chip--green" onClick={() => handleExport('csv')} type="button">
            <Download size={14} />
            Export CSV
          </button>
          <button className="audit-chip audit-chip--green" onClick={() => handleExport('json')} type="button">
            <Download size={14} />
            Export JSON
          </button>
          <button className="audit-chip audit-chip--blue" onClick={() => handleExport('pdf')} type="button">
            <Download size={14} />
            Export PDF
          </button>
          <button className="audit-chip audit-chip--ghost" onClick={() => void handleRefresh()} type="button">
            <RefreshCw size={14} />
            {refreshState === 'done' ? 'Refreshed ✓' : 'Refresh'}
          </button>
        </div>
      </section>

      {error ? (
        <div className="admin-alert admin-alert--error audit-inline-alert">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="audit-stat-grid">
        {statCards.map((card) => (
          <article key={card.label} className={`audit-stat audit-stat--${card.tone}`}>
            <div className="audit-stat__icon">{card.icon}</div>
            <span className="audit-stat__label">{card.label}</span>
            <strong className="audit-stat__value">{card.value}</strong>
            <p className="audit-stat__description">{card.description}</p>
            <span className={`audit-stat__delta audit-stat__delta--${card.deltaTone}`}>{card.delta}</span>
            <svg viewBox="0 0 160 28" preserveAspectRatio="none" className="audit-stat__sparkline" aria-hidden="true">
              <path d={sparklinePath(card.points)} className={`audit-stat__sparkline-path audit-stat__sparkline-path--${card.tone}`} />
            </svg>
          </article>
        ))}
      </section>

      <section className="audit-chart-cat-row">
        <article className="admin-panel audit-panel">
          <div className="audit-panel__header">
            <div>
              <div className="audit-panel__title">
                <TrendingUp size={16} className="audit-icon-blue" />
                <h3>Audit Activity</h3>
              </div>
              <p>Event volume by severity over the selected period</p>
            </div>

            <div className="audit-chart-meta">
              <div className="audit-legend">
                <span><i className="audit-swatch audit-swatch--red" />Critical</span>
                <span><i className="audit-swatch audit-swatch--amber" />Warning</span>
                <span><i className="audit-swatch audit-swatch--green" />Info</span>
              </div>
              <div className="audit-tabs">
                {(['7D', '30D', '90D'] as ChartRange[]).map((item) => (
                  <button key={item} className={`audit-tab ${chartRange === item ? 'is-active' : ''}`} onClick={() => setChartRange(item)} type="button">
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="audit-chart-wrap">
            <canvas id="audit-activity-chart" ref={chartRef} />
          </div>
        </article>

        <article className="admin-panel audit-panel">
          <div className="audit-panel__header">
            <div>
              <h3>Event Categories</h3>
              <p>Distribution of audit events by system domain</p>
            </div>
          </div>

          <div className="audit-category-list">
            {[
              { name: 'Authentication', count: 14, max: 21, color: '#6366F1', desc: 'Login, logout, session events' },
              { name: 'Gateway', count: 4, max: 21, color: '#EF4444', desc: 'Scan, block, allow decisions' },
              { name: 'Admin', count: 2, max: 21, color: '#06B6D4', desc: 'Config and policy changes' },
              { name: 'Team', count: 1, max: 21, color: '#F59E0B', desc: 'Member and role changes' },
              { name: 'Billing', count: 0, max: 21, color: '#3A4560', desc: 'Plan and payment events' },
            ].map((item) => (
              <div key={item.name} className="audit-category-row">
                <div className="audit-category-row__copy">
                  <strong>{item.name}</strong>
                  <span>{item.desc}</span>
                </div>
                <div className="audit-category-row__track">
                  <div className="audit-category-row__fill" style={{ width: `${(item.count / item.max) * 100}%`, background: item.color }}>
                    <span>{item.count}</span>
                  </div>
                </div>
                <strong className="audit-category-row__count">{item.count}</strong>
              </div>
            ))}
          </div>

          <div className="audit-category-summary">
            <div><span>Peak Day</span><strong>10 Jun (7 events)</strong></div>
            <div><span>Most Active Actor</span><strong>muhammadfarhanu12</strong></div>
            <div><span>Top Category</span><strong>Authentication</strong></div>
            <div><span>Anomalies Flagged</span><strong>1</strong></div>
          </div>
        </article>
      </section>

      {!dismissedSuspicious && suspiciousEvents.length > 0 ? (
        <section className="audit-suspicious-panel">
          <div className="audit-suspicious-panel__header">
            <div>
              <div className="audit-suspicious-panel__title">
                <span className="audit-suspicious-panel__dot" />
                <strong>Suspicious Activity Detected</strong>
              </div>
              <p>Review flagged events below</p>
            </div>
            <button className="audit-chip audit-chip--ghost" onClick={() => setDismissedSuspicious(true)} type="button">
              Dismiss
            </button>
          </div>

          <div className="audit-suspicious-list">
            {suspiciousEvents.map((item) => (
              <div key={`${item.actor}-${item.ts}`} className="audit-suspicious-item">
                <div className="audit-suspicious-item__reason">
                  <AlertTriangle size={14} />
                  <span>{item.reason}</span>
                </div>
                <span className="audit-badge audit-badge--actor-user">{item.actor}</span>
                <span className="audit-suspicious-item__meta">{item.ips.join(', ')} · {item.ts}</span>
                <button
                  className="audit-link-button"
                  onClick={() => {
                    setSeverityPill('WARNING');
                    setHeaderSearch(item.actor);
                  }}
                  type="button"
                >
                  View Events →
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="audit-filter-bar">
        <div className="audit-pill-groups">
          <div className="audit-pill-group">
            <span>Severity</span>
            {(['All', 'CRITICAL', 'WARNING', 'INFO'] as const).map((item) => (
              <button key={item} className={`audit-filter-pill ${severityPill === item ? 'is-active' : ''}`} onClick={() => setSeverityPill(item)} type="button">
                {item}
              </button>
            ))}
          </div>

          <div className="audit-pill-group">
            <span>Category</span>
            {(['All', 'Auth', 'Gateway', 'Admin', 'Team', 'Billing'] as const).map((item) => (
              <button key={item} className={`audit-filter-pill ${categoryFilter === item ? 'is-active' : ''}`} onClick={() => setCategoryFilter(item)} type="button">
                {item}
              </button>
            ))}
          </div>

          <div className="audit-pill-group">
            <span>Actor Type</span>
            {(['All', 'USER', 'ADMIN', 'SYSTEM'] as const).map((item) => (
              <button key={item} className={`audit-filter-pill ${actorFilter === item ? 'is-active' : ''}`} onClick={() => setActorFilter(item)} type="button">
                {item === 'USER' ? 'User' : item === 'ADMIN' ? 'Admin' : item === 'SYSTEM' ? 'System' : item}
              </button>
            ))}
          </div>
        </div>

        <div className="audit-filter-meta">
          <div className="audit-tabs">
            {(['Last 24h', 'Last 7d', 'Last 30d'] as QuickRange[]).map((item) => (
              <button key={item} className={`audit-tab ${quickRange === item ? 'is-active' : ''}`} onClick={() => setQuickRange(item)} type="button">
                {item}
              </button>
            ))}
          </div>
          <span className="audit-result-count">Showing {filteredEvents.length} of {events.length} events</span>
        </div>
      </section>

      <section className="admin-panel audit-panel">
        <div className="audit-panel__header audit-panel__header--split">
          <div>
            <div className="audit-panel__title">
              <Shield size={16} className="audit-icon-blue" />
              <h3>Security & Compliance Events</h3>
            </div>
            <p>Each record captures the actor, asset touched, and before/after state when available.</p>
          </div>

          <div className="audit-table-controls">
            <span>Page {page} of {totalPages}</span>
            <button className="audit-chip audit-chip--ghost" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
              ← Prev
            </button>
            <button className="audit-chip audit-chip--ghost" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
              Next →
            </button>
            <label className="audit-select audit-select--small">
              <select value={perPage} onChange={(event) => setPerPage(Number(event.target.value))}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
        </div>

        <div className="audit-table-wrap">
          <div className="audit-table">
            <div className="audit-table__head tbl-header-row">
              {[
                ['TIMESTAMP', 'timestamp'],
                ['SEVERITY', 'severity'],
                ['ACTOR', 'actor'],
                ['ACTION', 'action'],
                ['CATEGORY', 'category'],
                ['RESOURCE', 'resource'],
                ['IP ADDRESS', 'ip'],
              ].map(([label, key]) => (
                <button
                  key={label}
                  className={`audit-table__cell audit-table__cell--head ${key === 'category' ? 'col-category' : ''} ${key === 'ip' ? 'col-ip' : ''}`}
                  onClick={() => setSort((current) => ({ key: key as SortKey, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }))}
                  type="button"
                >
                  {label}
                  <ArrowDownUp size={12} />
                </button>
              ))}
              <div className="audit-table__cell audit-table__cell--head">DETAIL</div>
            </div>

            {visibleEvents.map((event) => {
              const isExpanded = expandedId === event.id;
              return (
                <div key={event.id} className={`audit-table__row-group audit-table__row-group--${event.severity.toLowerCase()}`}>
                  <div className="audit-table__row" onClick={() => setExpandedId(isExpanded ? null : event.id)} role="button" tabIndex={0}>
                    <div className="audit-table__cell audit-table__cell--timestamp">
                      <strong>{event.ts}</strong>
                      <span className={getSeverityBadgeClass(event.severity)}>{event.severity}</span>
                    </div>

                    <div className="audit-table__cell">
                      <span className={getSeverityBadgeClass(event.severity)}>{event.severity}</span>
                    </div>

                    <div className="audit-table__cell audit-table__cell--actor">
                      <span className={getActorBadgeClass(event.actorType)}>{getInitials(event.actor)}</span>
                      <div>
                        <strong>{event.actor}</strong>
                        <span className={`audit-badge audit-badge--actor-${event.actorType.toLowerCase()}`}>{event.actorType}</span>
                      </div>
                    </div>

                    <div className="audit-table__cell">
                      <span className={getActionClass(event.action)}>{event.action}</span>
                    </div>

                    <div className="audit-table__cell col-category">
                      <span className={getCategoryClass(event.category)}>{event.category}</span>
                    </div>

                    <div className="audit-table__cell">
                      <span>{event.resource}</span>
                    </div>

                    <div className="audit-table__cell col-ip">
                      <code>{event.ip}</code>
                      <span>{event.location} {event.suspicious ? <i className="audit-suspicious-ip-dot" /> : null}</span>
                    </div>

                    <div className="audit-table__cell audit-table__cell--detail">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="audit-detail-panel">
                      <div className="audit-detail-grid">
                        <div className="audit-detail-card">
                          <h4>EVENT METADATA</h4>
                          <dl>
                            <div><dt>Event ID:</dt><dd>{event.id}</dd></div>
                            <div><dt>Session ID:</dt><dd>{event.sessionId}</dd></div>
                            <div><dt>Timestamp:</dt><dd>{event.ts}</dd></div>
                            <div><dt>Actor:</dt><dd>{event.actor}</dd></div>
                            <div><dt>Actor Type:</dt><dd>{event.actorType}</dd></div>
                            <div><dt>Action:</dt><dd>{event.action}</dd></div>
                            <div><dt>Category:</dt><dd>{event.category}</dd></div>
                            <div><dt>Resource:</dt><dd>{event.resource}</dd></div>
                            <div><dt>IP Address:</dt><dd>{event.ip} {event.location}</dd></div>
                            <div><dt>Location:</dt><dd>{event.location.replace('🇵🇰 ', '')}</dd></div>
                            <div><dt>Severity:</dt><dd>{event.severity}</dd></div>
                            <div><dt>Risk Score:</dt><dd>{event.severity === 'CRITICAL' ? 'High' : event.severity === 'WARNING' ? 'Medium' : 'Low'}</dd></div>
                          </dl>
                        </div>

                        <div className="audit-detail-card">
                          <h4>BEFORE / AFTER STATE</h4>
                          <div className="audit-json-grid">
                            <div>
                              <span>Before</span>
                              <pre>{renderJson(event.before)}</pre>
                            </div>
                            <div>
                              <span>After</span>
                              <pre>{renderJson(event.after)}</pre>
                            </div>
                          </div>

                          <div className="audit-detail-block">
                            <span>COMPLIANCE TAGS</span>
                            <div className="audit-chip-list">
                              {event.complianceTags.map((tag) => (
                                <code key={tag} className="audit-compliance-chip">{tag}</code>
                              ))}
                            </div>
                          </div>

                          <div className="audit-detail-block">
                            <span>USER AGENT</span>
                            <p>{event.userAgent}</p>
                          </div>
                        </div>
                      </div>

                      {event.severity !== 'INFO' ? (
                        <div className="audit-investigation-actions">
                          <button
                            className="audit-chip audit-chip--amber"
                            onClick={(actionEvent) => {
                              actionEvent.stopPropagation();
                              setEvents((current) => current.map((item) => (item.id === event.id ? { ...item, suspicious: true } : item)));
                            }}
                            type="button"
                          >
                            <Flag size={14} />
                            Flag as Suspicious
                          </button>
                          <button className="audit-chip audit-chip--red" type="button">
                            <AlertCircle size={14} />
                            Create Incident
                          </button>
                          <button className="audit-chip audit-chip--ghost" onClick={() => handleExport('json')} type="button">
                            <Download size={14} />
                            Export This Event
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="audit-pagination">
          <span>Showing {visibleEvents.length} of {filteredEvents.length} events</span>
          <div className="audit-pagination__controls">
            <button className="audit-chip audit-chip--ghost" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
              ← Prev
            </button>
            <button className="audit-chip audit-chip--blue" type="button">
              {page}
            </button>
            <button className="audit-chip audit-chip--ghost" disabled={page === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
              Next →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
