import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ChevronLeft, ChevronRight, ChevronsUpDown, Clock, Download,
  KeyRound, LoaderCircle, Pause, Play, RefreshCw, Search, ShieldCheck, X,
} from "lucide-react";
import { useSecurityLogs } from "../hooks/useSecurityLogs";
import {
  MAX_LOGS, STATUS_FILTERS, THREAT_FILTERS, TIME_RANGES, matchesSecurityLog,
  type LogEvent, type StatusFilter, type ThreatFilter, type TimeRange,
} from "../lib/securityLogs";

type SortKey = "timestamp" | "risk";
type SortDir = "asc" | "desc";
type ValueEvent = { target: { value: string } };
const PAGE_SIZE = 10;

function riskColor(score: number | null) {
  if (score === null) return "#6B7A99";
  if (score > 70) return "#EF4444";
  if (score > 40) return "#F59E0B";
  return "#10B981";
}

function statusTheme(status: string) {
  if (status === "BLOCKED") return "border-[#EF4444]/30 bg-[#EF4444]/[0.11] text-[#EF4444]";
  if (["MFA", "REDACTED", "REVIEW"].includes(status)) return "border-[#F59E0B]/30 bg-[#F59E0B]/[0.11] text-[#F59E0B]";
  if (["CLEAN", "ALLOWED"].includes(status)) return "border-[#10B981]/30 bg-[#10B981]/[0.12] text-[#10B981]";
  return "border-white/15 bg-white/5 text-[#6B7A99]";
}

function StatCard({ label, value, delta, theme }: { label: string; value: string | number; delta: string; theme: "red" | "amber" | "green" | "blue" }) {
  const styles = {
    red: "border-[#EF4444]/30 bg-[#EF4444]/[0.11] text-[#EF4444]",
    amber: "border-[#F59E0B]/30 bg-[#F59E0B]/[0.11] text-[#F59E0B]",
    green: "border-[#10B981]/30 bg-[#10B981]/[0.12] text-[#10B981]",
    blue: "border-[#6366F1]/30 bg-[#6366F1]/[0.12] text-[#6366F1]",
  }[theme];
  return (
    <div className={`rounded-[10px] border p-4 ${styles}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-70">{label}</div>
      <div className="mt-2 font-mono text-[22px] font-extrabold">{value}</div>
      <div className="mt-1 font-mono text-[10px] opacity-80">{delta}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTheme(status)}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function RiskMini({ risk }: { risk: number | null }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px]">
      <span style={{ color: riskColor(risk) }}>Risk {risk ?? "N/A"}</span>
      {risk !== null ? <>
        <span className="h-1 w-17.5 rounded-full bg-[#0B0D14]">
          <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, risk))}%`, background: riskColor(risk) }} />
        </span>
        <span className="text-[#3A4560]">/100</span>
      </> : null}
    </div>
  );
}

function MetaCell({ label, value, color }: { label: string; value: string | number | null; color?: string }) {
  return (
    <div className="min-w-0 rounded-[7px] border border-white/[0.07] bg-[#1C253A] px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-[#6B7A99]">{label}</div>
      <div className="mt-1 wrap-break-word font-mono text-xs font-semibold" style={{ color: color || "#D1D9EE" }}>{value ?? "Not recorded"}</div>
    </div>
  );
}

function DetailPanel({ log, onClose }: { log: LogEvent; onClose: () => void }) {
  return (
    <section aria-label="Log details" className="detail-panel fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-white/[0.07] bg-[#161D2E] p-4 md:static md:max-h-none md:rounded-[10px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#D1D9EE]">{log.threat || log.threatTypes[0] || "No threat recorded"} - {log.status}</h2>
          <p className="mt-1 font-mono text-xs text-[#6B7A99]">{log.id}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-[7px] border border-white/[0.07] bg-[#111827] p-2 text-[#6B7A99] hover:text-[#D1D9EE]" title="Close detail" aria-label="Close detail">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B7A99]">Decision Summary</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <MetaCell label="Decision" value={log.status} />
              <MetaCell label="Risk Score" value={log.risk} color={riskColor(log.risk)} />
              <MetaCell label="Policy Triggered" value={log.policies[0] || "None recorded"} color={log.policies.length ? "#EF4444" : "#10B981"} />
              <MetaCell label="Latency" value={log.latency} />
              <MetaCell label="Provider" value={log.provider} />
              <MetaCell label="Model" value={log.model} />
            </div>
          </div>
          <MetaCell label="Detected Threats" value={log.threatTypes.join(", ") || "None recorded"} />
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B7A99]">Matched Policies</div>
            <div className="flex flex-wrap gap-2">
              {log.policies.length ? log.policies.map((policy) => (
                <span key={policy} className="rounded-full border border-[#EF4444]/30 bg-[#EF4444]/11 px-2.5 py-1 font-mono text-[11px] text-[#EF4444]">{policy}</span>
              )) : <span className="rounded-full border border-[#10B981]/30 bg-[#10B981]/12 px-2.5 py-1 font-mono text-[11px] text-[#6B7A99]">No matched policies recorded</span>}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B7A99]">Redacted Prompt Preview</div>
            <div className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-[7px] border border-white/[0.07] bg-[#1C253A] p-3 font-mono text-[11px] leading-6 text-[#D1D9EE]">
              {log.prompt}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B7A99]">Request Details</div>
            <div className="grid grid-cols-2 gap-2">
              <MetaCell label="Request ID" value={log.requestId} />
              <MetaCell label="Timestamp" value={log.timestamp} />
              <MetaCell label="Endpoint" value={log.endpoint} />
              <MetaCell label="Method" value={log.method} />
              <MetaCell label="API Key ID" value={log.apiKey} />
              <MetaCell label="MFA Required" value={log.requires2fa === null ? null : log.requires2fa ? "Yes" : "No"} />
              <MetaCell label="Review Required" value={log.reviewRequired === null ? null : log.reviewRequired ? "Yes" : "No"} />
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6B7A99]">Recorded Token Usage</div>
            <div className="grid grid-cols-2 gap-2">
              <MetaCell label="Tokens Used" value={log.tokens ?? "N/A"} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Logs() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [threatFilter, setThreatFilter] = useState<ThreatFilter>("All");
  const [timeRange, setTimeRange] = useState<TimeRange>("Last 24 hours");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const { logs, loading, error, streamError, connection, streaming, toggleStreaming, retry } = useSecurityLogs(timeRange);

  // Expire old rows even when the stream only receives heartbeat messages.
  useEffect(() => {
    if (!streaming) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, [streaming]);

  const filtered = useMemo(() => {
    const filterTime = streaming ? Date.now() : now;
    return logs.filter((log) => matchesSecurityLog(log, { search, statusFilter, threatFilter, timeRange }, filterTime))
      .sort((a, b) => {
        if (sortKey === "risk") {
          if (a.risk === null) return b.risk === null ? 0 : 1;
          if (b.risk === null) return -1;
        }
        const diff = sortKey === "timestamp" ? a.epoch - b.epoch : (a.risk ?? 0) - (b.risk ?? 0);
        return sortDir === "asc" ? diff : -diff;
      });
  }, [logs, search, statusFilter, threatFilter, timeRange, now, streaming, sortKey, sortDir]);

  const stats = useMemo(() => {
    const threatLogs = filtered.filter((log) => log.threatTypes.length > 0);
    const scoredThreats = threatLogs.filter((log) => log.risk !== null);
    return {
      blocked: filtered.filter((log) => log.status === "BLOCKED").length,
      allowed: filtered.filter((log) => log.status === "ALLOWED" || log.status === "CLEAN").length,
      threats: threatLogs.length,
      total: filtered.length,
      tokens: filtered.reduce((sum, log) => sum + (log.tokens ?? 0), 0),
      avgRisk: scoredThreats.length ? Math.round(scoredThreats.reduce((sum, log) => sum + (log.risk ?? 0), 0) / scoredThreats.length) : "N/A",
      critical: filtered.filter((log) => log.risk !== null && log.risk > 80).length,
    };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedLog = selectedId ? logs.find((log) => log.id === selectedId) || null : null;
  const firstPageButton = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const live = streaming && connection === "live";
  const streamLabel = !streaming ? "Stream paused" : loading ? "Loading logs" : connection === "live" ? "Live streaming" : connection === "reconnecting" ? "Reconnecting" : connection === "connecting" ? "Connecting" : "Stream offline";

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [search, statusFilter, threatFilter, timeRange]);

  function sortBy(key: SortKey) {
    setSortKey(key);
    setSortDir((current) => sortKey === key ? (current === "asc" ? "desc" : "asc") : "desc");
    setPage(1);
  }

  function exportCsv() {
    const headers = ["id", "timestamp", "status", "threat_type", "threat_types", "api_key_id", "tokens_used", "risk_score", "provider", "model", "latency", "request_id", "requires_2fa", "matched_policies"];
    const rows = filtered.map((log) => [log.id, log.timestamp, log.status, log.threat, log.threatTypes.join(" | "), log.apiKey, log.tokens, log.risk, log.provider, log.model, log.latency, log.requestId, log.requires2fa, log.policies.join(" | ")]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => {
      const raw = String(cell ?? "");
      // Quoting alone does not prevent spreadsheet formula execution.
      const safe = /^[=+\-@\t\r\n]/.test(raw) ? "'" + raw : raw;
      return '"' + safe.replace(/"/g, '""') + '"';
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinel-security-logs-${Date.now()}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="min-h-screen bg-[#0B0D14] p-4 text-[#D1D9EE] md:p-6">
      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
      `}</style>
      <div className="mx-auto max-w-375 space-y-5">
        <header className="rounded-[10px] border border-white/[0.07] bg-[#111827] p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-[22px] font-bold text-white">Security Logs</h1>
              <p className="mt-1 text-xs text-[#6B7A99]">Real-time stream of AI gateway requests, threat detections, and policy decisions.</p>
            </div>
            <div className="top-right flex flex-wrap items-center gap-2">
              <div role="status" className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-[#161D2E] px-3 py-2 text-xs text-[#D1D9EE]">
                <span className={`h-2 w-2 rounded-full ${live ? "bg-[#10B981]" : "bg-[#F59E0B]"}`} style={{ animation: live ? "livePulse 1.5s infinite" : "none" }} />
                <span>{streamLabel}</span>
              </div>
              <button type="button" onClick={() => { setNow(Date.now()); toggleStreaming(); }} className={`btn rounded-[7px] border px-3 py-2 text-xs font-bold ${streaming ? "border-[#EF4444]/30 bg-[#EF4444]/11 text-[#EF4444]" : "border-[#10B981]/30 bg-[#10B981]/12 text-[#10B981]"}`} title={streaming ? "Pause Stream" : "Resume Stream"} aria-label={streaming ? "Pause Stream" : "Resume Stream"}>
                {streaming ? <Pause className="inline h-4 w-4 md:mr-0 xl:mr-2" /> : <Play className="inline h-4 w-4 md:mr-0 xl:mr-2" />}
                <span className="hidden xl:inline">{streaming ? "Pause Stream" : "Resume Stream"}</span>
              </button>
              <button type="button" onClick={retry} disabled={loading} className="btn rounded-[7px] border border-white/[0.07] bg-transparent px-3 py-2 text-xs font-bold text-[#6B7A99] hover:text-[#D1D9EE]" title="Refresh logs" aria-label="Refresh logs">
                <RefreshCw className="inline h-4 w-4 md:mr-0 xl:mr-2" /><span className="hidden xl:inline">Refresh</span>
              </button>
              <button type="button" onClick={exportCsv} disabled={loading || filtered.length === 0} className="btn rounded-[7px] border border-[#6366F1]/30 bg-[#6366F1]/12 px-3 py-2 text-xs font-bold text-[#A5B4FC]" title="Export filtered, loaded logs" aria-label="Export CSV">
                <Download className="inline h-4 w-4 md:mr-0 xl:mr-2" /><span className="hidden xl:inline">Export CSV</span>
              </button>
              <div className="search-inp relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#3A4560]" />
                <input value={search} onChange={(event: ValueEvent) => setSearch(event.target.value)} aria-label="Search logs" placeholder="Search requests, key IDs, threats..." className="w-full rounded-[7px] border border-white/13 bg-[#161D2E] py-2 pl-9 pr-3 text-sm text-[#D1D9EE] outline-none focus:border-[#6366F1]/50" />
              </div>
            </div>
          </div>
        </header>

        {error || streamError ? (
          <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4 text-sm text-[#F59E0B]">
            <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div>{error ? <p>Could not load logs: {error}</p> : null}{streamError ? <p>{streamError}</p> : null}</div></div>
            <button type="button" onClick={retry} disabled={loading} className="rounded border border-[#F59E0B]/40 px-3 py-1.5 font-semibold disabled:opacity-50">Retry</button>
          </section>
        ) : null}

        <section className="stat-strip grid grid-cols-2 gap-3 xl:grid-cols-5">
          <StatCard label="Blocked" value={loading ? "—" : stats.blocked} delta="In filtered logs" theme="red" />
          <StatCard label="Threats Detected" value={loading ? "—" : stats.threats} delta="In filtered logs" theme="amber" />
          <StatCard label="Allowed / Clean" value={loading ? "—" : stats.allowed} delta="In filtered logs" theme="green" />
          <StatCard label="Requests" value={loading ? "—" : stats.total} delta={`${stats.tokens.toLocaleString()} recorded tokens`} theme="blue" />
          <StatCard label="Avg Threat Risk" value={loading ? "—" : stats.avgRisk} delta={`${stats.critical} critical in filtered logs`} theme="amber" />
        </section>

        <section className="filter-bar flex flex-col gap-3 rounded-[9px] border border-white/[0.07] bg-[#111827] px-4 py-3 xl:flex-row xl:items-center">
          <div className="filter-pills flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#3A4560]">Status</span>
            {STATUS_FILTERS.map((item) => (
              <button key={item} type="button" aria-pressed={statusFilter === item} onClick={() => setStatusFilter(item)} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusFilter === item ? "border-[#6366F1]/50 bg-[#6366F1]/15 text-[#A5B4FC]" : "border-white/[0.07] bg-[#161D2E] text-[#6B7A99]"}`}>{item}</button>
            ))}
          </div>
          <div className="hidden h-7 w-px bg-white/[0.07] xl:block" />
          <div className="filter-pills flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#3A4560]">Threat</span>
            {THREAT_FILTERS.map((item) => (
              <button key={item} type="button" aria-pressed={threatFilter === item} onClick={() => setThreatFilter(item)} className={`rounded-full border px-2.5 py-1 text-xs font-bold ${threatFilter === item ? "border-[#6366F1]/50 bg-[#6366F1]/15 text-[#A5B4FC]" : "border-white/[0.07] bg-[#161D2E] text-[#6B7A99]"}`}>{item}</button>
            ))}
          </div>
          <div className="hidden h-7 w-px bg-white/[0.07] xl:block" />
          <select aria-label="Time range" value={timeRange} onChange={(event: ValueEvent) => setTimeRange(event.target.value as TimeRange)} className="rounded-[7px] border border-white/13 bg-[#161D2E] px-3 py-2 text-sm text-[#D1D9EE] outline-none focus:border-[#6366F1]/50">
            {Object.keys(TIME_RANGES).map((item) => <option key={item}>{item}</option>)}
          </select>
        </section>

        <p className="text-xs text-[#6B7A99]">Filters, sorting, statistics, and CSV use up to the latest {MAX_LOGS.toLocaleString()} loaded events in this time range. Allowed includes Clean. Times are local.</p>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-[#6B7A99]"><LoaderCircle className="h-5 w-5 animate-spin" />Loading security logs…</div> : null}

        <section aria-label="Security log events" aria-busy={loading} className="log-table hidden overflow-hidden rounded-[10px] border border-white/[0.07] bg-[#111827] md:block">
          <div className="grid grid-cols-[148px_120px_190px_80px_minmax(90px,1fr)_44px] gap-4 border-b border-white/[0.07] bg-[#161D2E] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.09em] text-[#3A4560] xl:grid-cols-[148px_120px_190px_160px_80px_minmax(90px,1fr)_44px]">
            <button type="button" onClick={() => sortBy("timestamp")} className="flex items-center gap-2 text-left"><Clock className="h-3.5 w-3.5" />Timestamp <ChevronsUpDown className="h-3 w-3" /></button>
            <div>Status</div>
            <div>Threat Type</div>
            <div className="col-ak hidden xl:flex">API Key ID</div>
            <div className="text-right">Tokens</div>
            <button type="button" onClick={() => sortBy("risk")} className="flex items-center justify-end gap-2 text-right">Risk <ChevronsUpDown className="h-3 w-3" /></button>
            <div />
          </div>
          <div className="max-h-155 overflow-auto">
            {pageRows.map((log) => (
              <div key={log.id}>
                <button type="button" aria-label={`View log ${log.id}`} onClick={() => setSelectedId(log.id)} className={`grid min-h-13 w-full grid-cols-[148px_120px_190px_80px_minmax(90px,1fr)_44px] items-center gap-4 border-b border-white/[0.07] px-4 py-3 text-left transition hover:bg-white/2.5 xl:grid-cols-[148px_120px_190px_160px_80px_minmax(90px,1fr)_44px] ${log.isNew ? "bg-[#6366F1]/5" : ""}`}>
                  <div className="font-mono"><div className="text-xs font-semibold text-[#D1D9EE]">{log.ts}</div><div className="text-[10px] text-[#3A4560]">{log.date}</div></div>
                  <div><StatusBadge status={log.status} />{log.requires2fa ? <div className="mt-1 text-[10px] text-[#F59E0B]">MFA required</div> : null}</div>
                  <div className="min-w-0"><div title={log.threatTypes.join(", ")} className={`wrap-break-word text-xs font-semibold ${log.threatTypes.length ? "text-[#D1D9EE]" : "text-[#3A4560]"}`}>{log.threat || log.threatTypes[0] || "-"}{log.threatTypes.length > 1 ? ` +${log.threatTypes.length - 1}` : ""}</div><div className="mt-1"><RiskMini risk={log.risk} /></div></div>
                  <div className="col-ak hidden break-all font-mono text-[11px] text-[#6B7A99] xl:block"><KeyRound className="mr-1 inline h-3.5 w-3.5" />{log.apiKey ?? "Not recorded"}</div>
                  <div className="text-right font-mono text-xs font-semibold text-[#D1D9EE]">{log.tokens ?? "N/A"}</div>
                  <div className="flex items-center justify-end gap-2 font-mono text-xs font-bold" style={{ color: riskColor(log.risk) }}>{log.risk ?? "N/A"}{log.isNew ? <span className="rounded border border-[#6366F1]/30 bg-[#6366F1]/15 px-1.5 py-0.5 text-[9px] text-[#A5B4FC]">NEW</span> : null}</div>
                  <ChevronRight className="h-4 w-4 text-[#3A4560]" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 bg-[#161D2E] px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="font-mono text-[11px] text-[#6B7A99]">Showing {pageRows.length} of {filtered.length} matching events ({logs.length} loaded)</div>
            <div className="flex flex-wrap gap-1">
              <button type="button" disabled={loading || currentPage === 1} aria-label="Previous page" onClick={() => setPage(currentPage - 1)} className="rounded border border-white/[0.07] bg-[#111827] p-2 text-[#6B7A99]"><ChevronLeft className="h-3.5 w-3.5" /></button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, index) => firstPageButton + index).map((item) => (
                <button key={item} type="button" aria-current={currentPage === item ? "page" : undefined} onClick={() => setPage(item)} className={`rounded border px-3 py-1.5 font-mono text-xs ${currentPage === item ? "border-[#6366F1]/50 bg-[#6366F1]/15 text-[#A5B4FC]" : "border-white/[0.07] bg-[#111827] text-[#6B7A99]"}`}>{item}</button>
              ))}
              <button type="button" disabled={loading || currentPage === totalPages} aria-label="Next page" onClick={() => setPage(currentPage + 1)} className="rounded border border-white/[0.07] bg-[#111827] p-2 text-[#6B7A99]"><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </section>

        <section className="log-cards flex flex-col gap-2 md:hidden">
          {pageRows.map((log) => (
            <button key={log.id} type="button" aria-label={`View log ${log.id}`} onClick={() => setSelectedId(log.id)} className={`rounded-[9px] border border-white/[0.07] bg-[#111827] px-3 py-3 text-left ${log.isNew ? "bg-[#6366F1]/5" : ""}`}>
              <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-[#D1D9EE]">{log.ts} <span className="text-[#3A4560]">{log.date}</span></span><div><StatusBadge status={log.status} />{log.requires2fa ? <div className="mt-1 text-[10px] text-[#F59E0B]">MFA required</div> : null}</div></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="break-all text-xs font-bold text-[#D1D9EE]">{log.threatTypes.join(", ") || "-"}</span><RiskMini risk={log.risk} /></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 break-all font-mono text-[11px] text-[#6B7A99]"><span>Key ID: {log.apiKey ?? "Not recorded"}</span><span>{log.tokens ?? "N/A"} tokens {log.isNew ? <span className="text-[#A5B4FC]">NEW</span> : null}</span></div>
            </button>
          ))}
          <div className="rounded-[9px] border border-white/[0.07] bg-[#161D2E] p-3 font-mono text-[11px] text-[#6B7A99]">Showing {pageRows.length} of {filtered.length} matching events ({logs.length} loaded)</div>
        </section>

        <nav aria-label="Mobile log pagination" className="flex items-center justify-between rounded-[9px] border border-white/[0.07] bg-[#161D2E] p-3 text-xs md:hidden">
          <button type="button" disabled={loading || currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded border border-white/10 px-3 py-2 disabled:opacity-30">Previous</button>
          <span>Page {currentPage} of {totalPages}</span>
          <button type="button" disabled={loading || currentPage === totalPages} onClick={() => setPage(currentPage + 1)} className="rounded border border-white/10 px-3 py-2 disabled:opacity-30">Next</button>
        </nav>

        {selectedLog ? <DetailPanel log={selectedLog} onClose={() => setSelectedId(null)} /> : null}

        {!loading && !error && filtered.length === 0 ? (
          <section className="rounded-[10px] border border-white/[0.07] bg-[#111827] p-8 text-center text-sm text-[#6B7A99]">
            <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-[#3A4560]" />
            No events match the current filters.
          </section>
        ) : null}
      </div>
    </div>
  );
}