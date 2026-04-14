import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../stores/useStore';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Search, Filter, ChevronDown, ChevronRight, Copy, Check, Play, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SecurityLog } from '../types';
import { safeFormatDateWithPattern, safeTimeValue, safeToISOString } from '../lib/date';

export default function Logs() {
  const { logs, apiKeys, fetchApiKeys, fetchLogs, isLoading } = useStore();
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLiveStream, setIsLiveStream] = useState(true);
  const [pausedLogs, setPausedLogs] = useState<SecurityLog[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [threatTypeFilter, setThreatTypeFilter] = useState<string>('');
  const [apiKeyFilter, setApiKeyFilter] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // Fetch initial logs
  useEffect(() => {
    fetchApiKeys();
    fetchLogs({ limit: 500 });
  }, [fetchApiKeys, fetchLogs]);

  // Debounced backend fetch for filters/search
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const startTimeIso = safeToISOString(startTime);
      const endTimeIso = safeToISOString(endTime);
      fetchLogs({
        limit: 500,
        status: statusFilter || undefined,
        threat_type: threatTypeFilter || undefined,
        api_key_id: apiKeyFilter || undefined,
        start_time: startTimeIso,
        end_time: endTimeIso,
        q: searchTerm.trim() ? searchTerm.trim() : undefined,
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [apiKeyFilter, endTime, fetchLogs, searchTerm, startTime, statusFilter, threatTypeFilter]);

  // Live updates are delivered via authenticated backend websockets and stored in global state.
  // The UI "Stop Stream" toggle only pauses rendering; it does not stop ingestion.

  useEffect(() => {
    if (!isLiveStream) setPausedLogs([...logs]);
    else setPausedLogs([]);
  }, [isLiveStream, logs]);

  const threatTypeOptions = useMemo(() => {
    const base = new Set<string>(['PROMPT_INJECTION', 'DATA_LEAK', 'MALICIOUS_CODE', 'PII_EXPOSURE', 'NONE']);
    for (const log of logs) {
      if (log.threat_type) base.add(String(log.threat_type));
    }
    return Array.from(base).sort();
  }, [logs]);

  const sourceLogs = isLiveStream ? logs : pausedLogs;
  const displayedLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sourceLogs.filter((log) => {
      const logDateValue = log.timestamp || log.created_at;
      if (statusFilter && String(log.status) !== statusFilter) return false;
      if (threatTypeFilter && String(log.threat_type) !== threatTypeFilter) return false;
      if (apiKeyFilter && String(log.api_key_id ?? '') !== apiKeyFilter) return false;
      if (startTime) {
        const ts = safeTimeValue(logDateValue);
        const start = safeTimeValue(startTime);
        if (start !== null && (ts === null || ts < start)) return false;
      }
      if (endTime) {
        const ts = safeTimeValue(logDateValue);
        const end = safeTimeValue(endTime);
        if (end !== null && (ts === null || ts > end)) return false;
      }
      if (term) {
        const hay = `${log.endpoint ?? ''} ${log.method ?? ''} ${log.threat_type ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [apiKeyFilter, endTime, searchTerm, sourceLogs, startTime, statusFilter, threatTypeFilter]);

  // Auto-scroll to top for new logs (newest first)
  useEffect(() => {
    if (!isLiveStream) return;
    if (!listRef.current) return;
    listRef.current.scrollTop = 0;
  }, [displayedLogs, isLiveStream]);

  const handleCopy = (log: SecurityLog) => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading && logs.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded"></div>
        <div className="h-150 bg-slate-800 rounded-xl"></div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security Logs</h1>
          <p className="text-slate-400 mt-1">Real-time stream of AI gateway requests and threat detections.</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant={isLiveStream ? 'destructive' : 'outline'}
            className={isLiveStream ? 'bg-red-900/50 text-red-400 border-red-800/50 hover:bg-red-900/70' : 'text-slate-300'}
            onClick={() => setIsLiveStream(!isLiveStream)}
          >
            {isLiveStream ? <Square className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {isLiveStream ? 'Stop Stream' : 'Live Stream'}
          </Button>
          <Button variant="outline" className="text-slate-300" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
              className="bg-slate-900/50 border border-white/10 rounded-md pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all w-64"
            />
          </div>
        </div>
      </div>

      {showFilters && (
        <Card className="bg-slate-900/40 border-white/5 p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</label>
              <select
                className="mt-1 w-full bg-slate-900/50 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="CLEAN">CLEAN</option>
                <option value="BLOCKED">BLOCKED</option>
                <option value="REDACTED">REDACTED</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Threat Type</label>
              <select
                className="mt-1 w-full bg-slate-900/50 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={threatTypeFilter}
                onChange={(e: any) => setThreatTypeFilter(e.target.value)}
              >
                <option value="">All</option>
                {threatTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">API Key</label>
              <select
                className="mt-1 w-full bg-slate-900/50 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={apiKeyFilter}
                onChange={(e: any) => setApiKeyFilter(e.target.value)}
              >
                <option value="">All</option>
                {apiKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Start</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e: any) => setStartTime(e.target.value)}
                className="mt-1 w-full bg-slate-900/50 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">End</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e: any) => setEndTime(e.target.value)}
                className="mt-1 w-full bg-slate-900/50 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </Card>
      )}

      <Card className="flex-1 flex flex-col overflow-hidden bg-slate-900/40 border-white/5">
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/10 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/50">
          <div className="col-span-2">Timestamp</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Threat Type</div>
          <div className="col-span-2">API Key</div>
          <div className="col-span-2">Tokens</div>
          <div className="col-span-1 text-right">Details</div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          <AnimatePresence initial={false}>
            {displayedLogs.map((log) => (
              <motion.div
                key={log.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="rounded-lg border border-transparent hover:border-white/5 bg-transparent hover:bg-slate-800/30 transition-colors"
              >
                <div className="grid grid-cols-12 gap-4 p-3 items-center cursor-pointer" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                  <div className="col-span-2 text-sm font-mono text-slate-300">{safeFormatDateWithPattern(log.timestamp || log.created_at, 'HH:mm:ss.SSS')}</div>
                  <div className="col-span-2">
                    <Badge variant={log.status.toLowerCase() as any}>{log.status}</Badge>
                  </div>
                  <div className="col-span-3 text-sm text-slate-300">{log.threat_type !== 'NONE' ? log.threat_type : '-'}</div>
                  <div className="col-span-2 text-sm font-mono text-slate-400">{log.api_key_id ?? '-'}</div>
                  <div className="col-span-2 text-sm text-slate-400">{log.tokens_used}</div>
                  <div className="col-span-1 flex justify-end">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      {expandedLog === log.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedLog === log.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 pt-0 border-t border-white/5 mt-2 bg-slate-950/30 rounded-b-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Raw JSON Payload</span>
                          <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); handleCopy(log); }} className="h-6 text-xs text-slate-400">
                            {copiedId === log.id ? <Check className="h-3 w-3 mr-1 text-clean" /> : <Copy className="h-3 w-3 mr-1" />}
                            {copiedId === log.id ? 'Copied' : 'Copy'}
                          </Button>
                        </div>
                        <pre className="p-4 rounded-md bg-[#0d1117] border border-white/5 text-xs font-mono text-slate-300 overflow-x-auto">
                          {JSON.stringify(log, null, 2)}
                        </pre>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  );
}
