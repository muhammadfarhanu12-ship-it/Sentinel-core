import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, ShieldAlert, Siren } from 'lucide-react';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import type { RemediationLog } from '../types';
import {
  buildReportsQuery,
  formatPeriodLabel,
  summarizeThreatCounts,
  type Granularity,
  type ThreatCountsResponse,
  type ThreatCountsPoint,
} from '../lib/reports';
import { safeFormatDate } from '../lib/date';
import { ReportStatCard } from '../components/reports/ReportStatCard';
import { authedFetch, authedFetchJson } from '../services/authenticatedFetch';

function downloadFile(filename: string, contentType: string, body: string) {
  const blob = new Blob([body], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [days, setDays] = useState<number>(30);
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [threatCounts, setThreatCounts] = useState<ThreatCountsResponse | null>(null);
  const [remediations, setRemediations] = useState<RemediationLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(
    () => buildReportsQuery({ granularity, days, startTime, endTime }),
    [days, endTime, granularity, startTime],
  );

  useEffect(() => {
    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [counts, remediationRows] = await Promise.all([
          authedFetchJson<ThreatCountsResponse>(`/api/v1/reports/threat-counts?${queryString}`),
          authedFetchJson<any[]>(`/api/v1/reports/remediations?limit=50&offset=0`),
        ]);

        setThreatCounts(counts);
        setRemediations(
          (Array.isArray(remediationRows) ? remediationRows : []).map((r: any) => ({
            ...r,
            id: String(r.id),
            timestamp: r.timestamp == null ? (r.created_at == null ? null : String(r.created_at)) : String(r.timestamp),
            created_at: String(r.created_at ?? r.timestamp ?? ''),
            api_key_id: r.api_key_id == null ? null : String(r.api_key_id),
            security_log_id: r.security_log_id == null ? null : String(r.security_log_id),
            user_id: r.user_id == null ? null : String(r.user_id),
          })) as RemediationLog[],
        );
      } catch (e: any) {
        setError(e?.message || 'Failed to load reports');
      } finally {
        setIsLoading(false);
      }
    };
    run();
  }, [queryString]);

  const chartData = useMemo(() => {
    const series = threatCounts?.series || [];
    return series.map((p) => ({
      ...p,
      label: formatPeriodLabel(p.period_start, granularity),
    }));
  }, [granularity, threatCounts?.series]);

  const totals = useMemo(() => {
    return summarizeThreatCounts(threatCounts?.series || []);
  }, [threatCounts?.series]);

  const hasChartData = chartData.length > 0;

  const exportThreatCounts = async (format: 'csv' | 'json') => {
    const res = await authedFetch(`/api/v1/reports/threat-counts/export?${queryString}&format=${format}`);
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    if (format === 'csv') {
      const text = await res.text();
      downloadFile(`sentinel_threat_counts_${granularity}.csv`, 'text/csv', text);
      return;
    }
    const jsonBody = JSON.stringify(await res.json(), null, 2);
    downloadFile(`sentinel_threat_counts_${granularity}.json`, 'application/json', jsonBody);
  };

  const exportRemediations = async (format: 'csv' | 'json') => {
    const res = await authedFetch(`/api/v1/reports/remediations/export?format=${format}&limit=5000`);
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    if (format === 'csv') {
      const text = await res.text();
      downloadFile('sentinel_remediations.csv', 'text/csv', text);
      return;
    }
    const jsonBody = JSON.stringify(await res.json(), null, 2);
    downloadFile('sentinel_remediations.json', 'application/json', jsonBody);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex items-start justify-between gap-6 flex-col lg:flex-row">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Alerts</h1>
          <p className="text-slate-400 mt-1">Compliance-ready threat metrics and remediation reporting.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button variant="outline" className="text-slate-300" onClick={() => exportThreatCounts('csv')}>
            <Download className="w-4 h-4 mr-2" /> Export Threats (CSV)
          </Button>
          <Button variant="outline" className="text-slate-300" onClick={() => exportThreatCounts('json')}>
            <Download className="w-4 h-4 mr-2" /> Export Threats (JSON)
          </Button>
          <Button variant="outline" className="text-slate-300" onClick={() => exportRemediations('csv')}>
            <Download className="w-4 h-4 mr-2" /> Export Remediations (CSV)
          </Button>
        </div>
      </div>

      <Card className="min-w-0 bg-slate-900/40 border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-blocked" /> Compliance Metrics
          </CardTitle>
          <CardDescription>Filter and trend threat events by day/week.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Granularity</label>
              <select
                className="mt-1 w-full bg-slate-900/50 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={granularity}
                onChange={(e: any) => setGranularity(e.target.value as Granularity)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lookback</label>
              <select
                className="mt-1 w-full bg-slate-900/50 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={days}
                onChange={(e: any) => setDays(Number(e.target.value))}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Start (optional)</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e: any) => setStartTime(e.target.value)}
                className="mt-1 w-full bg-slate-900/50 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">End (optional)</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e: any) => setEndTime(e.target.value)}
                className="mt-1 w-full bg-slate-900/50 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {error && <div className="text-sm text-red-300">{error}</div>}
          {isLoading && <div className="text-sm text-slate-400">Loading reports…</div>}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <ReportStatCard title="Blocked" value={totals.blocked} valueClassName="text-blocked" />
            <ReportStatCard title="Redacted" value={totals.redacted} valueClassName="text-warning" />
            <ReportStatCard title="Clean" value={totals.clean} valueClassName="text-clean" />
            <ReportStatCard title="Total" value={totals.total} />
          </div>

          <div className="h-80 min-w-0">
            {hasChartData ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="blocked" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF4D4D" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#FF4D4D" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="redacted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFC857" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#FFC857" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Area type="monotone" dataKey="blocked" stroke="#FF4D4D" fill="url(#blocked)" />
                  <Area type="monotone" dataKey="redacted" stroke="#FFC857" fill="url(#redacted)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No threat data available for the selected range.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/40 border-white/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Siren className="w-5 h-5 text-indigo-400" /> Recent Remediation Events
            </CardTitle>
            <CardDescription>Latest automated actions triggered by detected threats.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="text-slate-300" onClick={() => exportRemediations('json')}>
              <Download className="w-4 h-4 mr-2" /> Export (JSON)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {remediations.length === 0 && <div className="text-sm text-slate-400">No remediation events found.</div>}
            {remediations.slice(0, 20).map((r) => {
              const types = (r.actions || []).map((a) => a.type).filter(Boolean);
              const hasFailure = (r.actions || []).some((a) => String(a.status).toUpperCase() === 'FAILED');
              return (
                <div key={r.id} className="p-4 rounded-lg border border-white/10 bg-slate-950/40">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-400">#{r.id}</span>
                        <Badge variant={hasFailure ? 'blocked' : 'clean'}>{hasFailure ? 'ATTENTION' : 'OK'}</Badge>
                        {r.threat_type ? <Badge variant="warning">{r.threat_type}</Badge> : <Badge variant="outline">UNKNOWN</Badge>}
                        {typeof r.threat_score === 'number' && (
                          <span className="text-xs text-slate-400">score {r.threat_score.toFixed(2)}</span>
                        )}
                      </div>
                      <div className="text-sm text-slate-300 mt-1 truncate">
                        {safeFormatDate(r.timestamp || r.created_at)} · api_key {r.api_key_id ?? '—'} · log {r.security_log_id ?? '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {types.slice(0, 4).map((t, idx) => (
                        <span key={`${r.id}-${idx}`}>
                          <Badge variant="outline">{String(t)}</Badge>
                        </span>
                      ))}
                      {types.length > 4 && <span className="text-xs text-slate-400">+{types.length - 4} more</span>}
                    </div>
                  </div>
                  {r.error && <div className="text-xs text-red-300 mt-2">Error: {r.error}</div>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
