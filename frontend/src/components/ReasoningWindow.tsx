import { useSpeech } from '../hooks/useSpeech';

interface ReasoningLog {
  timestamp: string;
  message: string;
  threat_level?: string;
}

interface ReasoningWindowProps {
  reasoningLogs: ReasoningLog[];
}

export const ReasoningWindow = ({ reasoningLogs }: ReasoningWindowProps) => {
  // Get the most recent log (assuming they are prepended or the first one is the latest)
  const latestLog = reasoningLogs.length > 0 ? reasoningLogs[0] : null;
  
  // Use the speech hook for the latest log
  useSpeech(latestLog?.message || null, latestLog?.threat_level || null);

  return (
    <div className="reasoning-window flex h-[500px] min-h-0 flex-col rounded-xl border border-indigo-500/20 bg-slate-900/40 p-4 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
      <h3 className="text-lg font-semibold mb-4 text-slate-100">Live AI Reasoning</h3>
      <div className="log-container flex-1 overflow-y-auto rounded-lg border border-white/5 bg-[#0d1117] p-4 space-y-3">
        {reasoningLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-500">
            Awaiting reasoning data...
          </div>
        ) : (
          reasoningLogs.map((log, index) => (
            <div key={index} className="log-entry bg-slate-800/50 border border-white/5 rounded-lg p-3 text-sm">
              <span className="timestamp text-xs text-indigo-400 font-mono mb-1 block">{log.timestamp}</span>
              <p className="text-slate-300 font-mono text-xs whitespace-pre-wrap">{log.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
