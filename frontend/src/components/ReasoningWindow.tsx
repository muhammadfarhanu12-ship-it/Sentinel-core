import { useSpeech } from '../hooks/useSpeech';

interface ReasoningLog {
  timestamp: string;
  message: string;
  threat_level?: string;
}

interface ReasoningWindowProps {
  reasoningLogs: ReasoningLog[];
  initialLogs?: ReasoningLog[];
  modelLabel?: string;
  lastAnalysisLabel?: string;
  anomalies?: number;
  confidence?: number;
}

function threatLevelClass(level?: string): string {
  const normalized = String(level || '').toLowerCase();
  if (normalized.includes('critical') || normalized.includes('blocked') || normalized.includes('high')) return 'text-[#EF4444]';
  if (normalized.includes('warn') || normalized.includes('medium')) return 'text-[#F59E0B]';
  if (normalized.includes('recommend') || normalized.includes('info')) return 'text-[#A5B4FC]';
  return 'text-[#10B981]';
}

export const ReasoningWindow = ({
  reasoningLogs,
  initialLogs = [],
  modelLabel = 'backend-asoc',
  lastAnalysisLabel = 'Awaiting refresh',
  anomalies = 0,
  confidence = 0,
}: ReasoningWindowProps) => {
  const displayedLogs = reasoningLogs.length > 0 ? reasoningLogs : initialLogs;
  // Get the most recent log (assuming they are prepended or the first one is the latest)
  const latestLog = displayedLogs.length > 0 ? displayedLogs[0] : null;
  
  // Use the speech hook for the latest log
  useSpeech(latestLog?.message || null, latestLog?.threat_level || null);

  const statusLabel = reasoningLogs.length > 0 ? 'COMPLETE' : 'IDLE';
  const statusStyle =
    statusLabel === 'COMPLETE'
      ? {
          background: 'rgba(16,185,129,0.12)',
          borderColor: 'rgba(16,185,129,0.28)',
          color: '#10B981',
        }
      : {
          background: 'rgba(255,255,255,0.06)',
          borderColor: 'rgba(255,255,255,0.08)',
          color: '#6B7A99',
        };

  return (
    <div
      className="reasoning-window flex h-[520px] min-h-0 flex-col rounded-xl border bg-[#111827] p-0"
      style={{ borderColor: 'rgba(255,255,255,0.07)', borderRadius: 10, boxShadow: 'none' }}
    >
      <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div>
          <h3 className="text-base font-semibold text-white">Live AI Reasoning</h3>
          <p className="mt-1 text-xs text-[#6B7A99]">Real-time analysis trace from the ASOC engine</p>
        </div>
        <span
          className="rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.08em]"
          style={statusStyle}
        >
          {statusLabel}
        </span>
      </div>

      <div className="log-container flex-1 space-y-3 overflow-y-auto bg-[#0B0D14] p-4 font-mono text-[11px] leading-[1.85]">
        {displayedLogs.map((log, index) => (
          <div key={`${log.timestamp}-${index}`} className="trace-line rounded-lg border px-3 py-2" style={{ borderColor: 'rgba(255,255,255,0.05)', background: '#101522' }}>
            <span className="mb-1 block text-[#06B6D4]">[{log.timestamp}]</span>
            <p className={`whitespace-pre-wrap ${threatLevelClass(log.threat_level)}`}>{log.message}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pb-4 pt-3">
        <div className="rounded-lg border px-3 py-2" style={{ background: '#1C253A', borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="text-[10px] uppercase text-[#6B7A99]">Model</div>
          <div className="mt-1 font-mono text-xs font-semibold text-[#A5B4FC]">{modelLabel}</div>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ background: '#1C253A', borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="text-[10px] uppercase text-[#6B7A99]">Last Analysis</div>
          <div className="mt-1 font-mono text-xs font-semibold text-[#D1D9EE]">{lastAnalysisLabel}</div>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ background: '#1C253A', borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="text-[10px] uppercase text-[#6B7A99]">Anomalies</div>
          <div className="mt-1 font-mono text-xs font-semibold text-[#F59E0B]">{anomalies}</div>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ background: '#1C253A', borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="text-[10px] uppercase text-[#6B7A99]">Confidence</div>
          <div className="mt-1 font-mono text-xs font-semibold text-[#10B981]">{confidence}%</div>
        </div>
      </div>
    </div>
  );
};
