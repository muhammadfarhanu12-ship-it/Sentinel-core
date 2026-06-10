import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheckBig,
  Download,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  Lock,
  Mail,
  Percent,
  Search,
  ShieldAlert,
  ShieldX,
  Smartphone,
  TriangleAlert,
  TrendingUp,
  X,
} from 'lucide-react';

import Loader from '../components/ui/Loader';
import { fetchAdminReports } from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';

type ReportApiState = {
  realtimeLimitations?: {
    streaming_alert_bus: boolean;
    note: string;
  };
  recentAlerts?: Array<Record<string, unknown>>;
};

type StatTone = 'red' | 'amber' | 'green' | 'cyan';
type EventStatus = 'QUARANTINED' | 'ALERTED' | 'RESOLVED' | 'PENDING';
type EventSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

type StatCardData = {
  label: string;
  value: string;
  description: string;
  delta: string;
  deltaTone: 'up' | 'down' | 'neutral';
  tone: StatTone;
  points: number[];
  icon: ReactNode;
};

type ChartPoint = {
  iso: string;
  label: string;
  blocked: number;
  redacted: number;
  clean: number;
};

type RemediationEvent = {
  id: string;
  status: EventStatus;
  threat: 'DATA_LEAK' | 'PROMPT_INJECTION' | 'DATA_EXFILTRATION' | 'ENCODING_OBFUSCATION';
  severity: EventSeverity;
  score: number;
  ts: string;
  apiKey: string | null;
  logId: string;
  actions: Array<'QUARANTINE_REQUEST' | 'ALERT_EMAIL'>;
  actionsComplete: boolean;
};

type FrameworkCard = {
  name: string;
  badge: string;
  coverage: number;
  controls: Array<{ label: string; covered: boolean }>;
};

type ScheduledReport = {
  id: number;
  type: string;
  freq: string;
  method: string;
  next: string;
  recipient: string;
  formats: string[];
};

const statCards: StatCardData[] = [
  {
    label: 'Blocked',
    value: '8',
    description: 'Threats blocked by gateway',
    delta: '+3 vs last period',
    deltaTone: 'up',
    tone: 'red',
    points: [1, 3, 1, 2, 1, 0, 1],
    icon: <ShieldX size={18} />,
  },
  {
    label: 'Redacted',
    value: '0',
    description: 'PII / sensitive data redacted',
    delta: 'No change',
    deltaTone: 'neutral',
    tone: 'amber',
    points: [0, 0, 0, 0, 0, 0, 0],
    icon: <EyeOff size={18} />,
  },
  {
    label: 'Clean',
    value: '13',
    description: 'Requests passed safely',
    delta: '+5 vs last period',
    deltaTone: 'up',
    tone: 'green',
    points: [2, 2, 1, 2, 2, 3, 3],
    icon: <CircleCheckBig size={18} />,
  },
  {
    label: 'Block Rate',
    value: '38.1%',
    description: 'Ratio of blocked to total',
    delta: '+5.2% vs last period',
    deltaTone: 'up',
    tone: 'red',
    points: [33, 60, 50, 50, 33, 0, 50],
    icon: <Percent size={18} />,
  },
  {
    label: 'Avg Risk Score',
    value: '34.2',
    description: 'Mean risk across all events',
    delta: '-8.1 vs last period',
    deltaTone: 'down',
    tone: 'amber',
    points: [42, 55, 38, 44, 31, 0, 34],
    icon: <TrendingUp size={18} />,
  },
  {
    label: 'MFA Triggered',
    value: '1',
    description: 'MFA enforcement events',
    delta: 'No change',
    deltaTone: 'neutral',
    tone: 'cyan',
    points: [0, 1, 0, 0, 1, 0, 0],
    icon: <Smartphone size={18} />,
  },
];

const chartPoints: ChartPoint[] = [
  { iso: '2026-05-13', label: '13 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-14', label: '14 May', blocked: 1, redacted: 0, clean: 0 },
  { iso: '2026-05-15', label: '15 May', blocked: 1, redacted: 0, clean: 0 },
  { iso: '2026-05-16', label: '16 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-17', label: '17 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-18', label: '18 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-19', label: '19 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-20', label: '20 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-21', label: '21 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-22', label: '22 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-23', label: '23 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-24', label: '24 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-25', label: '25 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-26', label: '26 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-27', label: '27 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-28', label: '28 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-29', label: '29 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-30', label: '30 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-05-31', label: '31 May', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-06-01', label: '01 Jun', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-06-02', label: '02 Jun', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-06-03', label: '03 Jun', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-06-04', label: '04 Jun', blocked: 2, redacted: 0, clean: 1 },
  { iso: '2026-06-05', label: '05 Jun', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-06-06', label: '06 Jun', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-06-07', label: '07 Jun', blocked: 0, redacted: 0, clean: 0 },
  { iso: '2026-06-08', label: '08 Jun', blocked: 1, redacted: 0, clean: 1 },
  { iso: '2026-06-09', label: '09 Jun', blocked: 1, redacted: 0, clean: 1 },
  { iso: '2026-06-10', label: '10 Jun', blocked: 0, redacted: 0, clean: 0 },
];

const severityRows = [
  { label: 'CRITICAL', value: 2, maxVal: 14, colorClass: 'is-red' },
  { label: 'HIGH', value: 5, maxVal: 14, colorClass: 'is-red-soft' },
  { label: 'MEDIUM', value: 1, maxVal: 14, colorClass: 'is-amber' },
  { label: 'LOW', value: 6, maxVal: 14, colorClass: 'is-green' },
];

const remediationEvents: RemediationEvent[] = [
  {
    id: '#1780488386057',
    status: 'QUARANTINED',
    threat: 'DATA_LEAK',
    severity: 'HIGH',
    score: 65,
    ts: '03/06/2026, 17:06:25',
    apiKey: '1776150942314',
    logId: '1780488385226',
    actions: ['QUARANTINE_REQUEST', 'ALERT_EMAIL'],
    actionsComplete: true,
  },
  {
    id: '#1778869986121',
    status: 'QUARANTINED',
    threat: 'PROMPT_INJECTION',
    severity: 'CRITICAL',
    score: 90,
    ts: '15/05/2026, 23:33:05',
    apiKey: '1776150942314',
    logId: '1778869985410',
    actions: ['QUARANTINE_REQUEST', 'ALERT_EMAIL'],
    actionsComplete: true,
  },
  {
    id: '#1778237623278',
    status: 'QUARANTINED',
    threat: 'DATA_EXFILTRATION',
    severity: 'HIGH',
    score: 72,
    ts: '08/05/2026, 15:53:42',
    apiKey: '1776150942314',
    logId: '1778237622580',
    actions: ['QUARANTINE_REQUEST', 'ALERT_EMAIL'],
    actionsComplete: true,
  },
  {
    id: '#1778237370113',
    status: 'QUARANTINED',
    threat: 'DATA_EXFILTRATION',
    severity: 'HIGH',
    score: 90,
    ts: '08/05/2026, 15:49:29',
    apiKey: '1776150942314',
    logId: '1778237369427',
    actions: ['QUARANTINE_REQUEST', 'ALERT_EMAIL'],
    actionsComplete: true,
  },
  {
    id: '#1778236920367',
    status: 'ALERTED',
    threat: 'ENCODING_OBFUSCATION',
    severity: 'MEDIUM',
    score: 72,
    ts: '08/05/2026, 15:41:59',
    apiKey: '1776150942314',
    logId: '1778236919671',
    actions: ['ALERT_EMAIL'],
    actionsComplete: true,
  },
  {
    id: '#1778236816374',
    status: 'QUARANTINED',
    threat: 'DATA_EXFILTRATION',
    severity: 'HIGH',
    score: 72,
    ts: '08/05/2026, 15:40:15',
    apiKey: '1776150942314',
    logId: '1778236815688',
    actions: ['QUARANTINE_REQUEST', 'ALERT_EMAIL'],
    actionsComplete: true,
  },
  {
    id: '#1778236765529',
    status: 'QUARANTINED',
    threat: 'DATA_EXFILTRATION',
    severity: 'HIGH',
    score: 72,
    ts: '08/05/2026, 15:39:24',
    apiKey: '1776150942314',
    logId: '1778236764831',
    actions: ['QUARANTINE_REQUEST', 'ALERT_EMAIL'],
    actionsComplete: true,
  },
  {
    id: '#1776150920298',
    status: 'RESOLVED',
    threat: 'DATA_EXFILTRATION',
    severity: 'CRITICAL',
    score: 90,
    ts: '14/04/2026, 12:15:19',
    apiKey: null,
    logId: '1776150919821',
    actions: ['QUARANTINE_REQUEST', 'ALERT_EMAIL'],
    actionsComplete: true,
  },
];

const frameworkCards: FrameworkCard[] = [
  {
    name: 'SOC 2',
    badge: 'Partial',
    coverage: 75,
    controls: [
      { label: 'CC6.1 Logical Access Controls', covered: true },
      { label: 'CC6.6 Threat Detection & Response', covered: true },
      { label: 'CC7.2 System Monitoring', covered: true },
      { label: 'CC9.2 Risk Mitigation', covered: false },
    ],
  },
  {
    name: 'GDPR',
    badge: 'Compliant',
    coverage: 100,
    controls: [
      { label: 'Art. 25 Data Protection by Design', covered: true },
      { label: 'Art. 32 Security of Processing', covered: true },
      { label: 'Art. 33 Breach Notification', covered: true },
      { label: 'Art. 35 Data Impact Assessment', covered: true },
    ],
  },
  {
    name: 'ISO 27001',
    badge: 'Partial',
    coverage: 75,
    controls: [
      { label: 'A.12.6 Technical Vulnerability Mgmt', covered: true },
      { label: 'A.14.2 Security in Dev Processes', covered: true },
      { label: 'A.16.1 Information Security Events', covered: true },
      { label: 'A.18.1 Compliance with Legal Reqs', covered: false },
    ],
  },
];

const initialSchedules: ScheduledReport[] = [
  {
    id: 1,
    type: 'Threat Summary',
    freq: 'Weekly',
    method: 'Email',
    next: 'Next Monday',
    recipient: 'muhammadfarhanu12@gmail.com',
    formats: ['PDF'],
  },
  {
    id: 2,
    type: 'Compliance Audit',
    freq: 'Monthly',
    method: 'Email',
    next: 'Jul 1, 2026',
    recipient: 'muhammadfarhanu12@gmail.com',
    formats: ['PDF', 'CSV'],
  },
];

const scoreOptions = ['Any Score', 'Critical (80-100)', 'High (60-79)', 'Medium (40-59)'] as const;
const formatOptions = ['PDF', 'CSV', 'JSON'] as const;

function toneClass(tone: StatTone) {
  return `reports-stat reports-stat--${tone}`;
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

function formatCsvRow(values: Array<string | number | null>) {
  return values
    .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
    .join(',');
}

function getStatusClass(status: EventStatus) {
  return `reports-badge reports-badge--status-${status.toLowerCase()}`;
}

function getSeverityClass(severity: EventSeverity) {
  return `reports-badge reports-badge--severity-${severity.toLowerCase()}`;
}

function getScoreClass(score: number) {
  if (score >= 90) return 'reports-score reports-score--red';
  if (score >= 50) return 'reports-score reports-score--amber';
  return 'reports-score reports-score--green';
}

function getActionMeta(action: 'QUARANTINE_REQUEST' | 'ALERT_EMAIL', isComplete: boolean) {
  if (action === 'QUARANTINE_REQUEST') {
    return {
      label: 'Quarantined',
      icon: <Lock size={12} />,
      className: isComplete ? 'reports-action-pill--done' : 'reports-action-pill--pending',
    };
  }

  return {
    label: 'Email sent',
    icon: <Mail size={12} />,
    className: isComplete ? 'reports-action-pill--info' : 'reports-action-pill--pending',
  };
}

function getTraceLines(event: RemediationEvent) {
  return [
    `[${event.ts}] ${event.actionsComplete ? '[done]' : '[pending]'} Threat detected - ${event.threat} - risk: ${event.score}`,
    `[${event.ts}] [done] Policy ${event.threat.replaceAll('_', '-')}-001 triggered`,
    `[${event.ts}] ${event.actions.includes('QUARANTINE_REQUEST') ? '[done]' : '[pending]'} Request quarantined`,
    `[${event.ts}] ${event.actions.includes('ALERT_EMAIL') ? '[done]' : '[pending]'} Alert email dispatched`,
    `[${event.ts}] [done] Audit record AUD-${event.logId.slice(-6)} written`,
  ];
}

function formatThreatLabel(value: string) {
  return value.replaceAll('_', ' ');
}

function LineChart({
  points,
}: {
  points: Array<{ label: string; blocked: number; redacted: number; clean: number }>;
}) {
  const width = 900;
  const height = 220;
  const padding = { top: 14, right: 14, bottom: 28, left: 34 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const yMax = Math.max(3, ...points.map((point) => Math.max(point.blocked, point.redacted, point.clean)));
  const xStep = chartWidth / Math.max(points.length - 1, 1);
  const yTicks = Array.from({ length: yMax + 1 }, (_, index) => index);

  const buildCoords = (values: number[]) =>
    values.map((value, index) => ({
      x: padding.left + index * xStep,
      y: padding.top + chartHeight - (value / yMax) * chartHeight,
      value,
    }));

  const blockedCoords = buildCoords(points.map((point) => point.blocked));
  const redactedCoords = buildCoords(points.map((point) => point.redacted));
  const cleanCoords = buildCoords(points.map((point) => point.clean));

  const buildLine = (coords: Array<{ x: number; y: number }>) =>
    coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`).join(' ');

  const buildArea = (coords: Array<{ x: number; y: number }>) =>
    `${buildLine(coords)} L ${coords[coords.length - 1]?.x ?? padding.left} ${padding.top + chartHeight} L ${coords[0]?.x ?? padding.left} ${padding.top + chartHeight} Z`;

  const tickIndexes = points
    .map((_, index) => index)
    .filter((index) => index === 0 || index === points.length - 1 || index % 3 === 0);

  return (
    <div className="reports-linechart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Compliance metrics trend chart">
        {yTicks.map((tick) => {
          const y = padding.top + chartHeight - (tick / yMax) * chartHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="reports-linechart__grid" />
              <text x={8} y={y + 4} className="reports-linechart__label">
                {tick}
              </text>
            </g>
          );
        })}

        {tickIndexes.map((index) => {
          const x = padding.left + index * xStep;
          return (
            <g key={points[index]?.label || index}>
              <line x1={x} y1={padding.top} x2={x} y2={padding.top + chartHeight} className="reports-linechart__grid reports-linechart__grid--vertical" />
              <text x={x} y={height - 8} textAnchor="middle" className="reports-linechart__label">
                {points[index]?.label}
              </text>
            </g>
          );
        })}

        <path d={buildArea(blockedCoords)} fill="rgba(239,68,68,0.08)" />
        <path d={buildArea(redactedCoords)} fill="rgba(245,158,11,0.06)" />
        <path d={buildArea(cleanCoords)} fill="rgba(16,185,129,0.06)" />

        <path d={buildLine(blockedCoords)} className="reports-linechart__path reports-linechart__path--red" />
        <path d={buildLine(redactedCoords)} className="reports-linechart__path reports-linechart__path--amber" />
        <path d={buildLine(cleanCoords)} className="reports-linechart__path reports-linechart__path--green" />

        {[blockedCoords, redactedCoords, cleanCoords].map((coords, groupIndex) =>
          coords.map((coord, index) => (
            <circle
              key={`${groupIndex}-${index}`}
              cx={coord.x}
              cy={coord.y}
              r={groupIndex === 1 ? 2.2 : 3}
              className={`reports-linechart__point ${
                groupIndex === 0 ? 'reports-linechart__point--red' : groupIndex === 1 ? 'reports-linechart__point--amber' : 'reports-linechart__point--green'
              }`}
            />
          )),
        )}
      </svg>
    </div>
  );
}

export default function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiState, setApiState] = useState<ReportApiState | null>(null);
  const [lookback, setLookback] = useState('Last 30 days');
  const [granularity, setGranularity] = useState('Daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [threatFilter, setThreatFilter] = useState('All');
  const [scoreFilter, setScoreFilter] = useState<typeof scoreOptions[number]>('Any Score');
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState('Threat Summary');
  const [scheduleFrequency, setScheduleFrequency] = useState('Weekly');
  const [deliveryMethod, setDeliveryMethod] = useState('Email');
  const [recipientEmail, setRecipientEmail] = useState('farhan@company.com');
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['PDF']);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>(initialSchedules);
  const scheduleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      setError('');
      try {
        const response = await fetchAdminReports();
        setApiState({
          realtimeLimitations: response.realtime_limitations,
          recentAlerts: response.recent_alerts,
        });
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, 'Live report telemetry is temporarily unavailable. Showing the latest persisted audit workspace.'));
      } finally {
        setLoading(false);
      }
    }

    void loadReports();
  }, []);

  const filteredChartBase = chartPoints.filter((point) => {
    if (lookback === 'Custom') {
      if (startDate && point.iso < startDate) return false;
      if (endDate && point.iso > endDate) return false;
      return true;
    }

    const startIndex =
      lookback === 'Last 7 days' ? Math.max(chartPoints.length - 7, 0) : lookback === 'Last 90 days' ? 0 : Math.max(chartPoints.length - 30, 0);
    return chartPoints.indexOf(point) >= startIndex;
  });

  const groupedChartPoints =
    granularity === 'Weekly'
      ? filteredChartBase.reduce<Array<{ label: string; blocked: number; redacted: number; clean: number }>>((acc, point, index) => {
          const bucket = Math.floor(index / 7);
          const existing = acc[bucket];
          if (existing) {
            existing.blocked += point.blocked;
            existing.redacted += point.redacted;
            existing.clean += point.clean;
            existing.label = `${existing.label.split(' - ')[0]} - ${point.label}`;
            return acc;
          }
          acc.push({ label: point.label, blocked: point.blocked, redacted: point.redacted, clean: point.clean });
          return acc;
        }, [])
      : granularity === 'Monthly'
        ? filteredChartBase.reduce<Array<{ label: string; blocked: number; redacted: number; clean: number }>>((acc, point) => {
            const key = point.label.split(' ')[1];
            const existing = acc.find((item) => item.label === key);
            if (existing) {
              existing.blocked += point.blocked;
              existing.redacted += point.redacted;
              existing.clean += point.clean;
            } else {
              acc.push({ label: key, blocked: point.blocked, redacted: point.redacted, clean: point.clean });
            }
            return acc;
          }, [])
        : granularity === 'Hourly'
          ? filteredChartBase.slice(-8).map((point, index) => ({
              label: `${String(index * 3).padStart(2, '0')}:00`,
              blocked: point.blocked,
              redacted: point.redacted,
              clean: point.clean,
            }))
          : filteredChartBase.map((point) => ({
              label: point.label,
              blocked: point.blocked,
              redacted: point.redacted,
              clean: point.clean,
            }));

  const filteredEvents = remediationEvents.filter((event) => {
    const matchesStatus = statusFilter === 'All' || event.status === statusFilter;
    const matchesThreat =
      threatFilter === 'All' ||
      (threatFilter === 'Data Exfiltration' && event.threat === 'DATA_EXFILTRATION') ||
      (threatFilter === 'Prompt Injection' && event.threat === 'PROMPT_INJECTION') ||
      (threatFilter === 'Data Leak' && event.threat === 'DATA_LEAK') ||
      (threatFilter === 'Encoding' && event.threat === 'ENCODING_OBFUSCATION');
    const matchesScore =
      scoreFilter === 'Any Score' ||
      (scoreFilter === 'Critical (80-100)' && event.score >= 80) ||
      (scoreFilter === 'High (60-79)' && event.score >= 60 && event.score <= 79) ||
      (scoreFilter === 'Medium (40-59)' && event.score >= 40 && event.score <= 59);
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      event.id.toLowerCase().includes(query) ||
      event.threat.toLowerCase().includes(query) ||
      String(event.apiKey || '[anonymous]').toLowerCase().includes(query) ||
      event.logId.toLowerCase().includes(query);
    return matchesStatus && matchesThreat && matchesScore && matchesSearch;
  });

  function toggleExpandedRow(eventId: string) {
    setExpandedRows((current) => (current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId]));
  }

  function handleThreatExport(format: 'csv' | 'json') {
    const payload = {
      generatedAt: new Date().toISOString(),
      summary: statCards.map((card) => ({ label: card.label, value: card.value, delta: card.delta })),
      chart: filteredChartBase,
      severity: severityRows,
    };

    if (format === 'json') {
      downloadFile('sentinel-threats.json', JSON.stringify(payload, null, 2), 'application/json');
      return;
    }

    const csv = [
      formatCsvRow(['label', 'value', 'delta']),
      ...statCards.map((card) => formatCsvRow([card.label, card.value, card.delta])),
      '',
      formatCsvRow(['date', 'blocked', 'redacted', 'clean']),
      ...filteredChartBase.map((point) => formatCsvRow([point.iso, point.blocked, point.redacted, point.clean])),
    ].join('\n');
    downloadFile('sentinel-threats.csv', csv, 'text/csv;charset=utf-8');
  }

  function handleRemediationExport(format: 'csv' | 'json') {
    if (format === 'json') {
      downloadFile('sentinel-remediations.json', JSON.stringify(filteredEvents, null, 2), 'application/json');
      return;
    }

    const csv = [
      formatCsvRow(['id', 'status', 'threat', 'severity', 'score', 'timestamp', 'api_key', 'log_id', 'actions']),
      ...filteredEvents.map((event) =>
        formatCsvRow([event.id, event.status, event.threat, event.severity, event.score, event.ts, event.apiKey || '[anonymous]', event.logId, event.actions.join('|')]),
      ),
    ].join('\n');
    downloadFile('sentinel-remediations.csv', csv, 'text/csv;charset=utf-8');
  }

  function toggleFormat(format: string) {
    setSelectedFormats((current) => (current.includes(format) ? current.filter((item) => item !== format) : [...current, format]));
  }

  function addSchedule() {
    setScheduledReports((current) => [
      ...current,
      {
        id: Date.now(),
        type: scheduleType,
        freq: scheduleFrequency,
        method: deliveryMethod,
        next: scheduleFrequency === 'Daily' ? 'Tomorrow' : scheduleFrequency === 'Weekly' ? 'Next Monday' : scheduleFrequency === 'Monthly' ? 'Next month' : 'Next quarter',
        recipient: recipientEmail,
        formats: selectedFormats.length ? selectedFormats : ['PDF'],
      },
    ]);
  }

  if (loading) {
    return <Loader label="Loading reports and alerts..." />;
  }

  return (
    <div className="admin-page reports-page">
      <section className="admin-page__header reports-page__header">
        <div>
          <p className="admin-page__eyebrow">Reports & Alerts</p>
          <h2>Reports & Alerts</h2>
          <p>Compliance-ready threat metrics, remediation audit trails, and automated reporting for SOC 2, GDPR, and ISO 27001.</p>
        </div>

        <div className="reports-export-toolbar">
          <div className="reports-export-group">
            <span className="reports-export-group__label">Threat Exports</span>
            <button className="reports-chip reports-chip--green" onClick={() => handleThreatExport('csv')} type="button">
              <FileSpreadsheet size={14} />
              Export Threats (CSV)
            </button>
            <button className="reports-chip reports-chip--green" onClick={() => handleThreatExport('json')} type="button">
              <FileJson size={14} />
              Export Threats (JSON)
            </button>
          </div>

          <div className="reports-export-separator" />

          <div className="reports-export-group">
            <span className="reports-export-group__label">Remediation Exports</span>
            <button className="reports-chip reports-chip--blue" onClick={() => handleRemediationExport('csv')} type="button">
              <Download size={14} />
              Export Remediations (CSV)
            </button>
            <button className="reports-chip reports-chip--blue" onClick={() => handleRemediationExport('json')} type="button">
              <Download size={14} />
              Export Remediations (JSON)
            </button>
          </div>

          <button
            className="reports-chip reports-chip--amber"
            onClick={() => scheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            type="button"
          >
            <CalendarDays size={14} />
            Schedule Report
          </button>
        </div>
      </section>

      {error ? (
        <div className="admin-alert admin-alert--error reports-inline-alert">
          <TriangleAlert size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {apiState?.realtimeLimitations?.note ? (
        <div className="reports-inline-note">
          <ShieldAlert size={16} />
          <span>
            {apiState.realtimeLimitations.streaming_alert_bus ? 'Realtime audit signal active.' : 'Realtime alert bus pending.'} {apiState.realtimeLimitations.note}
          </span>
        </div>
      ) : null}

      <section className="reports-stat-grid">
        {statCards.map((card) => (
          <article key={card.label} className={toneClass(card.tone)}>
            <div className="reports-stat__icon">{card.icon}</div>
            <span className="reports-stat__label">{card.label}</span>
            <strong className="reports-stat__value">{card.value}</strong>
            <p className="reports-stat__description">{card.description}</p>
            <span className={`reports-stat__delta reports-stat__delta--${card.deltaTone}`}>{card.delta}</span>
            <svg viewBox="0 0 160 28" preserveAspectRatio="none" className="reports-stat__sparkline" aria-hidden="true">
              <path d={sparklinePath(card.points)} className={`reports-stat__sparkline-path reports-stat__sparkline-path--${card.tone}`} />
            </svg>
          </article>
        ))}
      </section>

      <section className="reports-chart-severity-row">
        <article className="admin-panel reports-panel">
          <div className="reports-panel__header">
            <div>
              <div className="reports-panel__title">
                <ShieldX size={16} className="reports-icon-red" />
                <h3>Compliance Metrics</h3>
              </div>
              <p>Filter and trend threat events by granularity and lookback period</p>
            </div>
          </div>

          <div className="reports-controls-grid">
            <label className="reports-control">
              <span>Granularity</span>
              <select value={granularity} onChange={(event) => setGranularity(event.target.value)}>
                <option>Hourly</option>
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
              </select>
            </label>
            <label className="reports-control">
              <span>Lookback</span>
              <select value={lookback} onChange={(event) => setLookback(event.target.value)}>
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Last 90 days</option>
                <option>Custom</option>
              </select>
            </label>
            <label className="reports-control">
              <span>Start (optional)</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="reports-control">
              <span>End (optional)</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>

          <LineChart points={groupedChartPoints} />

          <div className="reports-legend">
            <span><i className="reports-swatch reports-swatch--red" />Blocked</span>
            <span><i className="reports-swatch reports-swatch--amber" />Redacted</span>
            <span><i className="reports-swatch reports-swatch--green" />Clean</span>
          </div>
        </article>

        <article className="admin-panel reports-panel">
          <div className="reports-panel__header">
            <div>
              <h3>Severity Distribution</h3>
              <p>Breakdown of threat events by severity level</p>
            </div>
          </div>

          <div className="reports-severity-list">
            {severityRows.map((row) => (
              <div key={row.label} className="reports-severity-row">
                <span className="reports-severity-row__label">{row.label}</span>
                <div className="reports-severity-row__track">
                  <div className={`reports-severity-row__fill ${row.colorClass}`} style={{ width: `${(row.value / row.maxVal) * 100}%` }}>
                    <span>{row.value}</span>
                  </div>
                </div>
                <strong className="reports-severity-row__count">{row.value}</strong>
              </div>
            ))}
          </div>

          <div className="reports-severity-summary">
            <div><span>Total Events</span><strong>14</strong></div>
            <div><span>Unique Signatures</span><strong>5</strong></div>
            <div><span>Most Common</span><strong>DATA_EXFILTRATION</strong></div>
            <div><span>Highest Risk</span><strong>90/100</strong></div>
          </div>
        </article>
      </section>

      <section className="reports-filter-bar">
        <div className="reports-filter-groups">
          <div className="reports-pill-group">
            <span className="reports-pill-group__label">Status</span>
            {['All', 'QUARANTINED', 'ALERTED', 'RESOLVED'].map((item) => (
              <button
                key={item}
                className={`reports-filter-pill ${statusFilter === item ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(item)}
                type="button"
              >
                {item === 'QUARANTINED' ? 'Blocked' : item === 'RESOLVED' ? 'Clean' : item}
              </button>
            ))}
          </div>

          <div className="reports-pill-group">
            <span className="reports-pill-group__label">Threat Type</span>
            {['All', 'Data Exfiltration', 'Prompt Injection', 'Data Leak', 'Encoding'].map((item) => (
              <button
                key={item}
                className={`reports-filter-pill ${threatFilter === item ? 'is-active' : ''}`}
                onClick={() => setThreatFilter(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>

          <label className="reports-filter-select">
            <span>Score</span>
            <select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value as typeof scoreOptions[number])}>
              {scoreOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="reports-search">
          <Search size={14} />
          <input
            placeholder="Search by ID, threat type, API key, log ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      <p className="reports-result-count">Showing {filteredEvents.length} of {remediationEvents.length} events</p>

      <section className="admin-panel reports-panel">
        <div className="reports-panel__header reports-panel__header--split">
          <div>
            <div className="reports-panel__title">
              <Bell size={16} className="reports-icon-blue" />
              <h3>Recent Remediation Events</h3>
            </div>
            <p>Latest automated actions triggered by detected threats</p>
          </div>

          <button className="reports-chip reports-chip--blue" onClick={() => handleRemediationExport('json')} type="button">
            <Download size={14} />
            Export (JSON)
          </button>
        </div>

        <div className="reports-events-list">
          {filteredEvents.map((event) => {
            const isExpanded = expandedRows.includes(event.id);
            return (
              <article key={event.id} className="reports-event-card">
                <button className="reports-event-card__button" onClick={() => toggleExpandedRow(event.id)} type="button">
                  <div className="reports-event-card__top">
                    <div className="reports-event-card__identity">
                      <code>{event.id}</code>
                      <span className={getStatusClass(event.status)}>{event.status}</span>
                      <span className={getSeverityClass(event.severity)}>{formatThreatLabel(event.threat)}</span>
                      <strong className={getScoreClass(event.score)}>{event.score}/100</strong>
                      <span className="reports-event-card__severity-label">{event.severity}</span>
                    </div>

                    <div className="reports-event-card__actions">
                      <div className="reports-action-pills">
                        {event.actions.map((action) => {
                          const meta = getActionMeta(action, event.actionsComplete);
                          return (
                            <span key={action} className={`reports-action-pill ${meta.className}`}>
                              {meta.icon}
                              {meta.label}
                              <Check size={12} />
                            </span>
                          );
                        })}
                      </div>
                      <span className="reports-event-card__expand">
                        Expand detail {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    </div>
                  </div>

                  <div className="reports-event-card__meta">
                    <span>{event.ts}</span>
                    <span>api_key <em>{event.apiKey || '[anonymous]'}</em></span>
                    <span>log <code>{event.logId}</code></span>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="reports-event-card__detail">
                    <span className="reports-event-card__detail-title">Execution Trace</span>
                    <div className="reports-trace">
                      {getTraceLines(event).map((line) => (
                        <code key={line}>{line}</code>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="reports-pagination">
          <span>Showing {filteredEvents.length} of {remediationEvents.length} events</span>
          <div className="reports-pagination__controls">
            <button className="reports-page-button" disabled type="button">{'<- Prev'}</button>
            <button className="reports-page-button is-active" type="button">1</button>
            <button className="reports-page-button" disabled type="button">{'Next ->'}</button>
          </div>
        </div>
      </section>

      <section className="reports-framework-grid">
        {frameworkCards.map((framework) => (
          <article key={framework.name} className="admin-panel reports-panel reports-framework-card">
            <div className="reports-framework-card__head">
              <strong>{framework.name}</strong>
              <span className={`reports-badge ${framework.coverage === 100 ? 'reports-badge--status-resolved' : framework.coverage >= 75 ? 'reports-badge--status-alerted' : 'reports-badge--status-quarantined'}`}>
                {framework.badge}
              </span>
            </div>

            <div className="reports-framework-card__controls">
              {framework.controls.map((control) => (
                <div key={control.label} className="reports-framework-card__control">
                  <span>{control.label}</span>
                  <strong className={control.covered ? 'is-covered' : 'is-manual'}>{control.covered ? '[covered]' : '[manual required]'}</strong>
                </div>
              ))}
            </div>

            <div className="reports-framework-card__coverage">
              <div className="reports-framework-card__coverage-text">
                <span>Coverage: {framework.coverage}%</span>
              </div>
              <div className="reports-framework-card__bar">
                <div
                  className={`reports-framework-card__bar-fill ${framework.coverage === 100 ? 'is-green' : framework.coverage >= 75 ? 'is-amber' : 'is-red'}`}
                  style={{ width: `${framework.coverage}%` }}
                />
              </div>
            </div>

            <button className="reports-text-button" onClick={() => downloadFile(`${framework.name.toLowerCase().replaceAll(' ', '-')}-evidence.json`, JSON.stringify(framework, null, 2), 'application/json')} type="button">
              Download {framework.name} Evidence {'->'}
            </button>
          </article>
        ))}
      </section>

      <section className="reports-schedule-grid" ref={scheduleRef}>
        <article className="admin-panel reports-panel">
          <div className="reports-panel__header">
            <div>
              <h3>Report Scheduling</h3>
              <p>Automatically generate and deliver compliance reports on a schedule</p>
            </div>
          </div>

          <div className="reports-form-grid">
            <label className="reports-control">
              <span>Report Type</span>
              <select value={scheduleType} onChange={(event) => setScheduleType(event.target.value)}>
                <option>Threat Summary</option>
                <option>Compliance Audit</option>
                <option>Remediation Log</option>
                <option>Full Export</option>
              </select>
            </label>

            <label className="reports-control">
              <span>Frequency</span>
              <select value={scheduleFrequency} onChange={(event) => setScheduleFrequency(event.target.value)}>
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
                <option>Quarterly</option>
              </select>
            </label>

            <label className="reports-control">
              <span>Delivery Method</span>
              <select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value)}>
                <option>Email</option>
                <option>Webhook</option>
                <option>SFTP</option>
                <option>S3 Bucket</option>
              </select>
            </label>

            <label className="reports-control">
              <span>Recipient Email</span>
              <input value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} type="email" />
            </label>
          </div>

          <div className="reports-format-row">
            <span>Format</span>
            <div className="reports-format-pills">
              {formatOptions.map((format) => (
                <button
                  key={format}
                  className={`reports-filter-pill ${selectedFormats.includes(format) ? 'is-active' : ''}`}
                  onClick={() => toggleFormat(format)}
                  type="button"
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          <button className="admin-button admin-button--primary reports-schedule-button" onClick={addSchedule} type="button">
            Schedule Report
          </button>
        </article>

        <article className="admin-panel reports-panel">
          <div className="reports-panel__header">
            <div>
              <h3>Active Schedules</h3>
              <p>Current automated report deliveries</p>
            </div>
          </div>

          <div className="reports-schedule-list">
            {scheduledReports.map((schedule) => (
              <div key={schedule.id} className="reports-schedule-item">
                <div className="reports-schedule-item__top">
                  <strong>{schedule.type}</strong>
                  <span className="reports-badge reports-badge--severity-medium">{schedule.freq.toUpperCase()}</span>
                  <span className="reports-badge reports-badge--status-alerted">{schedule.method}</span>
                </div>
                <div className="reports-schedule-item__bottom">
                  <span>{schedule.next}</span>
                  <span>{schedule.recipient}</span>
                  <button
                    className="reports-delete-button"
                    onClick={() => setScheduledReports((current) => current.filter((item) => item.id !== schedule.id))}
                    type="button"
                  >
                    <X size={12} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button className="reports-add-schedule" onClick={addSchedule} type="button">
            + Add Schedule
          </button>
        </article>
      </section>
    </div>
  );
}
