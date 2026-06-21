import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Copy,
  DatabaseZap,
  Download,
  Eye,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { SlideOver } from '../components/enterprise/SlideOver';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { useToast } from '../components/ui/ToastProvider';
import { safeFormatDate } from '../lib/date';
import { getErrorMessage } from '../lib/errors';
import { useStore } from '../stores/useStore';
import type { AuditLogEntry, AuditSeverity } from '../types';

const PAGE_SIZE = 12;

const inputClass =
  'mt-2 h-10 w-full min-w-0 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/70 focus:ring-1 focus:ring-cyan-400/30';

function severityVariant(severity: string) {
  const normalized = severity.toUpperCase();
  if (normalized === 'CRITICAL') return 'destructive';
  if (normalized === 'WARNING') return 'warning';
  return 'clean';
}

function decisionVariant(decision: string | null | undefined) {
  const normalized = String(decision || '').toUpperCase();
  if (['BLOCK', 'BLOCKED', 'DENY', 'DENIED', 'REDACTED'].includes(normalized)) return 'destructive';
  if (['WARN', 'WARNING', 'REVIEW'].includes(normalized)) return 'warning';
  if (['ALLOW', 'ALLOWED', 'CLEAN', 'APPROVED'].includes(normalized)) return 'clean';
  return 'secondary';
}

function humanizeToken(value: string | null | undefined, fallback = 'Unknown') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function readValue(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  return event.target.value;
}

function toDateParam(value: string, endOfDay = false) {
  if (!value) return undefined;
  return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

function formatRiskScore(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${Math.round(value)}%`;
}

function escapeCsvCell(value: unknown) {
  const raw = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function auditLogToCsv(rows: AuditLogEntry[]) {
  const headers = [
    'id',
    'timestamp',
    'severity',
    'actor',
    'actor_type',
    'action',
    'resource',
    'ip_address',
    'request_id',
    'decision',
    'risk_score',
    'provider',
    'model',
    'matched_policies',
  ];
  const body = rows.map((entry) =>
    [
      entry.id,
      entry.timestamp,
      entry.severity,
      entry.actor,
      entry.actor_type,
      entry.action,
      entry.resource,
      entry.ip_address,
      entry.request_id,
      entry.decision,
      entry.risk_score,
      entry.provider,
      entry.model,
      (entry.matched_policies || []).join('|'),
    ]
      .map(escapeCsvCell)
      .join(','),
  );
  return [headers.join(','), ...body].join('\n');
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function hasEvidence(value: unknown) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-slate-900/35 p-3">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className={`mt-2 truncate text-sm text-slate-100 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function EvidencePanel({ title, description, value }: { title: string; description: string; value: unknown }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900/35">
      <div className="border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <pre className="max-h-72 overflow-auto p-4 text-xs leading-6 text-slate-300">{renderJson(value)}</pre>
    </section>
  );
}

export default function AuditLogs() {
  const auditLogs = useStore((state) => state.auditLogs);
  const auditLogsLoading = useStore((state) => state.auditLogsLoading);
  const fetchAuditLogs = useStore((state) => state.fetchAuditLogs);
  const { pushToast } = useToast();

  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState<AuditSeverity | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const dateRangeError = useMemo(() => {
    if (!startDate || !endDate) return null;
    return startDate > endDate ? 'Start date must be on or before end date.' : null;
  }, [endDate, startDate]);

  const loadAuditLogs = useCallback(async () => {
    if (dateRangeError) {
      setError(dateRangeError);
      return;
    }

    try {
      setError(null);
      await fetchAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        severity: severity || undefined,
        startDate: toDateParam(startDate),
        endDate: toDateParam(endDate, true),
        q: appliedSearch || undefined,
      });
    } catch (loadError) {
      const message = getErrorMessage(loadError, 'Unable to load audit logs right now.');
      setError(message);
      pushToast({
        title: 'Audit log request failed',
        description: message,
        tone: 'error',
      });
    }
  }, [appliedSearch, dateRangeError, endDate, fetchAuditLogs, page, pushToast, severity, startDate]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  const summary = useMemo(() => {
    const severityCounts = auditLogs.reduce(
      (counts, entry) => {
        const normalized = String(entry.severity || 'INFO').toUpperCase();
        if (normalized === 'CRITICAL') counts.critical += 1;
        else if (normalized === 'WARNING') counts.warning += 1;
        else counts.info += 1;
        return counts;
      },
      { critical: 0, warning: 0, info: 0 },
    );
    const actors = new Set(auditLogs.map((entry) => entry.actor).filter(Boolean));
    const policyHits = auditLogs.reduce((total, entry) => total + (entry.matched_policies?.length || 0), 0);
    const highestRisk = auditLogs.reduce((max, entry) => {
      const score = typeof entry.risk_score === 'number' && Number.isFinite(entry.risk_score) ? entry.risk_score : 0;
      return Math.max(max, score);
    }, 0);

    return {
      ...severityCounts,
      actors: actors.size,
      policyHits,
      highestRisk,
      total: auditLogs.length,
    };
  }, [auditLogs]);

  const activeFilters = useMemo(() => {
    const filters: string[] = [];
    if (severity) filters.push(humanizeToken(severity));
    if (appliedSearch) filters.push(`Search: ${appliedSearch}`);
    if (startDate || endDate) filters.push(`${startDate || 'Any'} to ${endDate || 'Now'}`);
    return filters;
  }, [appliedSearch, endDate, severity, startDate]);

  const applySearch = useCallback(() => {
    setPage(1);
    setAppliedSearch(searchDraft.trim());
  }, [searchDraft]);

  const clearFilters = useCallback(() => {
    setPage(1);
    setSeverity('');
    setStartDate('');
    setEndDate('');
    setSearchDraft('');
    setAppliedSearch('');
    setError(null);
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: any) => {
      if (event.key === 'Enter') {
        applySearch();
      }
    },
    [applySearch],
  );

  const exportCurrentPage = useCallback(() => {
    if (auditLogs.length === 0) return;
    downloadTextFile(`sentinel-audit-logs-page-${page}.csv`, auditLogToCsv(auditLogs), 'text/csv;charset=utf-8');
    pushToast({
      title: 'Audit export ready',
      description: `${auditLogs.length} backend audit events exported from the current page.`,
      tone: 'success',
    });
  }, [auditLogs, page, pushToast]);

  const copySelectedEvent = useCallback(async () => {
    if (!selectedLog) return;
    try {
      await navigator.clipboard.writeText(renderJson(selectedLog));
      pushToast({
        title: 'Audit event copied',
        description: 'Audit-safe event JSON is on your clipboard.',
        tone: 'success',
      });
    } catch (copyError) {
      pushToast({
        title: 'Copy failed',
        description: getErrorMessage(copyError, 'Clipboard access was not available.'),
        tone: 'error',
      });
    }
  }, [pushToast, selectedLog]);

  const hasNextPage = auditLogs.length === PAGE_SIZE;
  const showInitialLoading = auditLogsLoading && auditLogs.length === 0 && !error;

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-cyan-300">
            <DatabaseZap className="h-4 w-4" />
            <span>Backend audit stream</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold text-slate-50">Audit Logs</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Workspace-scoped audit evidence from `/api/v1/audit-logs`, filtered by retention policy and redacted at write time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2 text-slate-200" onClick={() => void loadAuditLogs()} disabled={auditLogsLoading}>
            <RefreshCw className={`h-4 w-4 ${auditLogsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" className="gap-2 text-slate-200" onClick={exportCurrentPage} disabled={auditLogs.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-white/10 bg-slate-900/35 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Loaded</div>
          <div className="mt-3 text-2xl font-semibold text-slate-50">{summary.total}</div>
          <div className="mt-1 text-xs text-slate-500">Page {page}</div>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-950/15 p-4">
          <div className="text-xs font-semibold uppercase text-red-300/80">Critical</div>
          <div className="mt-3 text-2xl font-semibold text-red-200">{summary.critical}</div>
          <div className="mt-1 text-xs text-red-200/60">Escalation events</div>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/15 p-4">
          <div className="text-xs font-semibold uppercase text-amber-300/80">Warnings</div>
          <div className="mt-3 text-2xl font-semibold text-amber-200">{summary.warning}</div>
          <div className="mt-1 text-xs text-amber-200/60">Reviewable actions</div>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-4">
          <div className="text-xs font-semibold uppercase text-emerald-300/80">Actors</div>
          <div className="mt-3 text-2xl font-semibold text-emerald-200">{summary.actors}</div>
          <div className="mt-1 text-xs text-emerald-200/60">Unique identities</div>
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/15 p-4">
          <div className="text-xs font-semibold uppercase text-cyan-300/80">Max Risk</div>
          <div className="mt-3 text-2xl font-semibold text-cyan-200">{formatRiskScore(summary.highestRisk)}</div>
          <div className="mt-1 text-xs text-cyan-200/60">{summary.policyHits} policy hits</div>
        </div>
      </div>

      <section className="rounded-lg border border-white/10 bg-slate-900/45 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <label className="min-w-0 flex-1 text-xs font-semibold uppercase text-slate-500">
            Search
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-[1.1rem] h-4 w-4 text-slate-500" />
              <input
                value={searchDraft}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchDraft(readValue(event))}
                onKeyDown={handleSearchKeyDown}
                placeholder="Actor, request ID, resource, provider, policy"
                className={`${inputClass} pl-9`}
              />
            </div>
          </label>
          <label className="min-w-0 text-xs font-semibold uppercase text-slate-500 xl:w-48">
            Severity
            <select
              value={severity}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setPage(1);
                setSeverity(readValue(event) as AuditSeverity | '');
              }}
              className={inputClass}
            >
              <option value="">All levels</option>
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </label>
          <label className="min-w-0 text-xs font-semibold uppercase text-slate-500 xl:w-44">
            From
            <input
              type="date"
              value={startDate}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setPage(1);
                setStartDate(readValue(event));
              }}
              className={inputClass}
            />
          </label>
          <label className="min-w-0 text-xs font-semibold uppercase text-slate-500 xl:w-44">
            To
            <input
              type="date"
              value={endDate}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setPage(1);
                setEndDate(readValue(event));
              }}
              className={inputClass}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row xl:pb-0">
            <Button className="gap-2" onClick={applySearch}>
              <SlidersHorizontal className="h-4 w-4" />
              Apply
            </Button>
            <Button variant="outline" className="gap-2 text-slate-200" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
        {activeFilters.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <Badge key={filter} variant="outline" className="border-cyan-500/30 text-cyan-200">
                {filter}
              </Badge>
            ))}
          </div>
        ) : null}
      </section>

      <Card className="overflow-hidden rounded-lg border-white/10 bg-slate-900/35">
        <CardHeader className="gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="h-5 w-5 text-cyan-300" />
              Security And Compliance Events
            </CardTitle>
            <CardDescription className="mt-2">
              Limit {PAGE_SIZE}, offset {(page - 1) * PAGE_SIZE}, retention enforced by plan tier.
            </CardDescription>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-sm text-slate-400">Page {page}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                title="Previous page"
                aria-label="Previous page"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1 || auditLogsLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Next page"
                aria-label="Next page"
                onClick={() => setPage((current) => current + 1)}
                disabled={!hasNextPage || auditLogsLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="m-5 flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
              <span>{error}</span>
            </div>
          ) : null}

          {showInitialLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-lg border border-white/5 bg-slate-800/45" />
              ))}
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-4 px-5 py-14 text-center">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-4 text-cyan-300">
                <ClipboardList className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-50">No Audit Events Matched</h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">
                  The backend returned zero rows for the current workspace, severity, search, and date window.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto xl:block">
                <table className="min-w-[1180px] table-fixed divide-y divide-white/10">
                  <thead className="bg-slate-950/70">
                    <tr className="text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="w-[23%] px-5 py-3">Event</th>
                      <th className="w-[14%] px-5 py-3">Severity</th>
                      <th className="w-[18%] px-5 py-3">Actor</th>
                      <th className="w-[17%] px-5 py-3">Resource</th>
                      <th className="w-[14%] px-5 py-3">Risk</th>
                      <th className="w-[14%] px-5 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {auditLogs.map((entry) => (
                      <tr key={entry.id} className="bg-slate-900/10 transition hover:bg-slate-800/35">
                        <td className="px-5 py-4 align-top">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-100">{humanizeToken(entry.action)}</div>
                            <div className="mt-2 truncate font-mono text-xs text-slate-500">{entry.request_id || entry.id}</div>
                            {entry.prompt_preview ? <div className="mt-2 line-clamp-2 text-xs text-slate-400">{entry.prompt_preview}</div> : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={severityVariant(String(entry.severity))}>{entry.severity}</Badge>
                            {entry.decision ? <Badge variant={decisionVariant(entry.decision)}>{humanizeToken(entry.decision)}</Badge> : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="truncate text-sm font-medium text-slate-100">{entry.actor}</div>
                          <div className="mt-2 text-xs uppercase text-slate-500">{entry.actor_type}</div>
                          <div className="mt-1 truncate font-mono text-xs text-slate-500">{entry.ip_address || 'system'}</div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="truncate text-sm text-slate-200">{humanizeToken(entry.resource)}</div>
                          <div className="mt-2 truncate text-xs text-slate-500">{[entry.provider, entry.model].filter(Boolean).join(' / ') || 'No provider context'}</div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="text-sm font-semibold text-slate-100">{formatRiskScore(entry.risk_score)}</div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(entry.matched_policies || []).slice(0, 2).map((policy) => (
                              <Badge key={policy} variant="outline" className="border-cyan-500/30 text-cyan-200">
                                {policy}
                              </Badge>
                            ))}
                            {(entry.matched_policies || []).length > 2 ? (
                              <Badge variant="secondary">+{(entry.matched_policies || []).length - 2}</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="text-sm text-slate-300">{safeFormatDate(entry.timestamp)}</div>
                          <Button variant="ghost" size="sm" className="mt-2 gap-2 px-0 text-cyan-300" onClick={() => setSelectedLog(entry)}>
                            <Eye className="h-4 w-4" />
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-4 xl:hidden">
                {auditLogs.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedLog(entry)}
                    className="rounded-lg border border-white/10 bg-slate-900/35 p-4 text-left transition hover:border-cyan-500/30 hover:bg-slate-900/55"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-50">{humanizeToken(entry.action)}</div>
                        <div className="mt-1 truncate text-sm text-slate-400">{humanizeToken(entry.resource)}</div>
                      </div>
                      <Badge variant={severityVariant(String(entry.severity))}>{entry.severity}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                      <span className="truncate">{safeFormatDate(entry.timestamp)}</span>
                      <span className="truncate">{entry.actor}</span>
                      <span className="truncate font-mono">{entry.request_id || entry.id}</span>
                      <span>{formatRiskScore(entry.risk_score)} risk</span>
                    </div>
                    {entry.decision || entry.provider || entry.model ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.decision ? <Badge variant={decisionVariant(entry.decision)}>{humanizeToken(entry.decision)}</Badge> : null}
                        {[entry.provider, entry.model].filter(Boolean).map((item) => (
                          <Badge key={item} variant="outline" className="border-white/15 text-slate-300">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SlideOver
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={selectedLog ? humanizeToken(selectedLog.action, 'Audit event') : 'Audit event'}
        subtitle={selectedLog ? `${selectedLog.actor} on ${humanizeToken(selectedLog.resource)}` : undefined}
      >
        {selectedLog ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant={severityVariant(String(selectedLog.severity))}>{selectedLog.severity}</Badge>
                {selectedLog.decision ? <Badge variant={decisionVariant(selectedLog.decision)}>{humanizeToken(selectedLog.decision)}</Badge> : null}
              </div>
              <Button variant="outline" className="gap-2 text-slate-200" onClick={() => void copySelectedEvent()}>
                <Copy className="h-4 w-4" />
                Copy JSON
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label="Timestamp" value={safeFormatDate(selectedLog.timestamp)} />
              <DetailItem label="Request ID" value={selectedLog.request_id || selectedLog.id} mono />
              <DetailItem label="Actor" value={selectedLog.actor} />
              <DetailItem label="Actor Type" value={selectedLog.actor_type} />
              <DetailItem label="Source IP" value={selectedLog.ip_address || 'system'} mono />
              <DetailItem label="Risk Score" value={formatRiskScore(selectedLog.risk_score)} />
              <DetailItem label="Provider" value={selectedLog.provider || 'n/a'} />
              <DetailItem label="Model" value={selectedLog.model || 'n/a'} />
            </div>

            {selectedLog.matched_policies?.length ? (
              <section className="rounded-lg border border-cyan-500/20 bg-cyan-950/15 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-cyan-100">
                  <ClipboardCheck className="h-4 w-4" />
                  Matched Policies
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedLog.matched_policies.map((policy) => (
                    <Badge key={policy} variant="outline" className="border-cyan-500/30 text-cyan-200">
                      {policy}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}

            {selectedLog.prompt_preview ? (
              <section className="rounded-lg border border-white/10 bg-slate-900/35 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <CalendarRange className="h-4 w-4 text-amber-300" />
                  Prompt Preview
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{selectedLog.prompt_preview}</p>
              </section>
            ) : null}

            <div className="grid gap-4">
              {hasEvidence(selectedLog.old_value) ? (
                <EvidencePanel title="Old Value" description="State captured before the audited change." value={selectedLog.old_value} />
              ) : null}
              {hasEvidence(selectedLog.new_value) ? (
                <EvidencePanel title="New Value" description="State captured after the audited change." value={selectedLog.new_value} />
              ) : null}
              {hasEvidence(selectedLog.metadata) ? (
                <EvidencePanel title="Metadata" description="Audit-safe context captured by the backend." value={selectedLog.metadata} />
              ) : null}
              {!hasEvidence(selectedLog.old_value) && !hasEvidence(selectedLog.new_value) && !hasEvidence(selectedLog.metadata) ? (
                <section className="rounded-lg border border-white/10 bg-slate-900/35 p-5 text-sm text-slate-400">
                  No additional evidence fields were attached to this audit event.
                </section>
              ) : null}
            </div>
          </div>
        ) : null}
      </SlideOver>
    </motion.div>
  );
}
