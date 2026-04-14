import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, ChevronLeft, ChevronRight, ClipboardList, ShieldAlert } from 'lucide-react';

import { EmptyState } from '../components/enterprise/EmptyState';
import { LoadingSkeleton } from '../components/enterprise/LoadingSkeleton';
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

function severityVariant(severity: string) {
  if (severity === 'CRITICAL') return 'destructive';
  if (severity === 'WARNING') return 'warning';
  return 'clean';
}

function renderJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function readValue(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  return event.target.value;
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
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const loadAuditLogs = useCallback(async () => {
    try {
      setError(null);
      await fetchAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        severity: severity || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
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
  }, [endDate, fetchAuditLogs, page, pushToast, severity, startDate]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  const pageLabel = useMemo(() => `Page ${page}`, [page]);

  if (auditLogsLoading && auditLogs.length === 0) {
    return <LoadingSkeleton rows={3} compact />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="mt-1 max-w-2xl text-slate-400">
            Compliance-grade visibility into user and system actions across the Sentinel workspace.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Severity
            <select
              value={severity}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setPage(1);
                setSeverity(readValue(event) as AuditSeverity | '');
              }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-indigo-500"
            >
              <option value="">All levels</option>
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            From
            <input
              type="date"
              value={startDate}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setPage(1);
                setStartDate(readValue(event));
              }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            To
            <input
              type="date"
              value={endDate}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setPage(1);
                setEndDate(readValue(event));
              }}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            />
          </label>
          <div className="flex items-end">
            <Button variant="outline" className="w-full text-slate-200" onClick={() => void loadAuditLogs()}>
              <CalendarRange className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <Card className="border-white/5 bg-slate-900/40">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-indigo-300" />
              Security & Compliance Events
            </CardTitle>
            <CardDescription>Each record captures the actor, asset touched, and before/after state when available.</CardDescription>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span>{pageLabel}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setPage((current) => current + 1)} disabled={auditLogs.length < PAGE_SIZE}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <div className="mb-4 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-200">{error}</div> : null}

          {auditLogs.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title="No audit events in this range"
              description="Try widening the date filter or removing the severity filter to inspect a broader compliance window."
            />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-white/5 lg:block">
                <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr] gap-4 bg-slate-950/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <span>Timestamp</span>
                  <span>Actor</span>
                  <span>Action</span>
                  <span>Resource</span>
                  <span>IP Address</span>
                </div>
                <div className="divide-y divide-white/5">
                  {auditLogs.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedLog(entry)}
                      className="grid w-full grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr] gap-4 bg-slate-900/10 px-5 py-4 text-left transition hover:bg-slate-800/40"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-100">{safeFormatDate(entry.timestamp)}</div>
                        <Badge variant={severityVariant(String(entry.severity))} className="mt-2">
                          {entry.severity}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="font-medium text-slate-100">{entry.actor}</div>
                        <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{entry.actor_type}</div>
                      </div>
                      <div className="text-sm text-slate-200">{entry.action}</div>
                      <div className="text-sm text-slate-300">{entry.resource}</div>
                      <div className="text-sm font-mono text-slate-400">{entry.ip_address || 'System'}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:hidden">
                {auditLogs.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedLog(entry)}
                    className="rounded-2xl border border-white/10 bg-slate-900/35 p-4 text-left transition hover:border-indigo-500/30 hover:bg-slate-900/55"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium text-slate-50">{entry.action}</div>
                        <div className="mt-1 text-sm text-slate-400">{entry.resource}</div>
                      </div>
                      <Badge variant={severityVariant(String(entry.severity))}>{entry.severity}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-400">
                      <span>{safeFormatDate(entry.timestamp)}</span>
                      <span>{entry.actor} | {entry.actor_type}</span>
                      <span>{entry.ip_address || 'System initiated'}</span>
                    </div>
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
        title={selectedLog?.action || 'Audit event'}
        subtitle={selectedLog ? `${selectedLog.actor} on ${selectedLog.resource}` : undefined}
      >
        {selectedLog ? (
          <div className="space-y-6">
            <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Actor</div>
                <div className="mt-2 text-sm text-slate-100">{selectedLog.actor}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">IP Address</div>
                <div className="mt-2 text-sm font-mono text-slate-100">{selectedLog.ip_address || 'System'}</div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border-white/5 bg-slate-900/40">
                <CardHeader>
                  <CardTitle className="text-base">Old Value</CardTitle>
                  <CardDescription>State before the action was executed.</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-x-auto rounded-xl border border-white/5 bg-[#0d1117] p-4 text-xs leading-6 text-slate-300">
                    {renderJson(selectedLog.old_value)}
                  </pre>
                </CardContent>
              </Card>

              <Card className="border-white/5 bg-slate-900/40">
                <CardHeader>
                  <CardTitle className="text-base">New Value</CardTitle>
                  <CardDescription>State captured after the action completed.</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-x-auto rounded-xl border border-white/5 bg-[#0d1117] p-4 text-xs leading-6 text-slate-300">
                    {renderJson(selectedLog.new_value)}
                  </pre>
                </CardContent>
              </Card>
            </div>

            {selectedLog.metadata ? (
              <Card className="border-white/5 bg-slate-900/40">
                <CardHeader>
                  <CardTitle className="text-base">Metadata</CardTitle>
                  <CardDescription>Supplemental context captured for the audit event.</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-x-auto rounded-xl border border-white/5 bg-[#0d1117] p-4 text-xs leading-6 text-slate-300">
                    {renderJson(selectedLog.metadata)}
                  </pre>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </SlideOver>
    </motion.div>
  );
}
