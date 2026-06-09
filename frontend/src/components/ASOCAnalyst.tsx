import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Terminal, Send, Loader2, ShieldAlert, CheckCircle2, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';
import { useStore } from '../stores/useStore';
import { authedFetchJson } from '../services/authenticatedFetch';

type AnalystMessage = { role: 'user' | 'model' | 'system'; text: string; type?: 'action' | 'text' };

type ASOCAnalystProps = {
  initialSummary?: string;
};

async function brainAnalyze(payload: { prompt: string; image_data?: string | null }) {
  const data = await authedFetchJson<any>('/api/v1/brain/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data?.analysis ?? data;
}

export function ASOCAnalyst({ initialSummary }: ASOCAnalystProps) {
  const [messages, setMessages] = useState<AnalystMessage[]>([
    {
      role: 'model',
      text:
        initialSummary ||
        "I've analyzed your latest gateway activity. No immediate action is required, but keep reviewing repeated high-risk signatures.",
    },
  ]);
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAutoMonitoring, setIsAutoMonitoring] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!initialSummary) return;
    setMessages((current) => {
      if (current.length !== 1 || current[0]?.role !== 'model') {
        return current;
      }
      return [{ role: 'model', text: initialSummary }];
    });
  }, [initialSummary]);

  useEffect(() => {
    let interval: any;
    if (isAutoMonitoring) {
      interval = setInterval(async () => {
        try {
          setIsAnalyzing(true);

          const canvas = await html2canvas(document.body, {
            scale: 1,
            useCORS: true,
            ignoreElements: (element) => element.id === 'asoc-chat-container',
          });
          const base64Image = canvas.toDataURL('image/jpeg', 0.45).split(',')[1];
          const recentLogs = useStore.getState().logs.slice(0, 50);

          const analysis = await brainAnalyze({
            prompt: `Analyze the dashboard screenshot and recent log buffer. Provide a concise security summary and the highest-priority next action.\n\nRecent Logs (most recent first):\n${JSON.stringify(
              recentLogs,
              null,
              2
            )}`,
            image_data: base64Image,
          });

          if (analysis?.reasoning) {
            useStore.getState().addReasoningLog(String(analysis.reasoning), String(analysis.threat_level || 'Safe'));
          }

          const normalizedThreatLevel = String(analysis?.threat_level || '')?.toLowerCase() || '';
          if (analysis?.threat_level && normalizedThreatLevel !== 'safe') {
            setMessages((prev) => [
              ...prev,
              {
                role: 'model',
                text: `[THREAT: ${analysis.threat_level}] ${analysis.summary || 'Anomaly detected.'} (confidence ${analysis.confidence ?? '?' }%)`,
              },
            ]);
          }
        } catch (error) {
          console.error('Auto-monitor error:', error);
        } finally {
          setIsAnalyzing(false);
        }
      }, 12000);
    }
    return () => clearInterval(interval);
  }, [isAutoMonitoring]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userText = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setIsAnalyzing(true);

    try {
      const recentLogs = useStore.getState().logs.slice(0, 30);
      const analysis = await brainAnalyze({
        prompt: `User request:\n${userText}\n\nContext (recent logs):\n${JSON.stringify(recentLogs, null, 2)}`,
      });

      const reply = analysis?.summary || analysis?.reasoning || 'Analysis completed.';
      setMessages((prev) => [...prev, { role: 'model', text: String(reply) }]);
      if (analysis?.reasoning) {
        useStore.getState().addReasoningLog(String(analysis.reasoning), String(analysis.threat_level || 'Safe'));
      }
    } catch (error: any) {
      setMessages((prev) => [...prev, { role: 'system', text: `Analysis failed: ${String(error?.message || error)}` }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Card
      className="flex h-[520px] flex-col overflow-hidden border bg-[#111827] text-[#D1D9EE]"
      id="asoc-chat-container"
      style={{ borderColor: 'rgba(255,255,255,0.07)', borderRadius: 10, boxShadow: 'none' }}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-5 py-4" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center space-x-2">
          <Terminal className="h-4 w-4 text-[#6366F1]" />
          <div>
            <CardTitle className="text-base text-white">ASOC Analyst</CardTitle>
            <p className="mt-1 text-xs text-[#6B7A99]">AI-powered security operations analyst</p>
          </div>
          {isAutoMonitoring && (
            <span className="flex items-center text-xs text-[#10B981]">
              <Activity className="mr-1 h-3 w-3 animate-pulse" /> Auto-monitoring
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setIsAutoMonitoring((v) => !v)}
          className="border px-3 text-[11px] font-semibold text-[#A5B4FC]"
          style={{
            background: 'rgba(99,102,241,0.12)',
            borderColor: 'rgba(99,102,241,0.28)',
          }}
        >
          {isAutoMonitoring ? 'Stop Auto' : 'Start Auto'}
        </Button>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4">
        <div
          className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{
            background: 'rgba(16,185,129,0.12)',
            borderColor: 'rgba(16,185,129,0.28)',
            color: '#A7F3D0',
          }}
        >
          <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
          <span>Sentinel ASOC Analyst online. Awaiting anomalies or manual review requests.</span>
        </div>

        <div ref={messagesContainerRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'border text-slate-100'
                      : msg.role === 'system'
                      ? 'border text-slate-300'
                      : 'border text-slate-200'
                  }`}
                  style={
                    msg.role === 'user'
                      ? {
                          background: 'rgba(99,102,241,0.12)',
                          borderColor: 'rgba(99,102,241,0.28)',
                        }
                      : msg.role === 'system'
                        ? {
                            background: '#161D2E',
                            borderColor: 'rgba(255,255,255,0.07)',
                          }
                        : {
                            background: '#1C253A',
                            borderColor: 'rgba(255,255,255,0.07)',
                          }
                  }
                >
                  {msg.role === 'model' && <ShieldAlert className="mr-2 inline h-4 w-4 text-[#6366F1]" />}
                  <span className="whitespace-pre-wrap">{msg.text}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center space-x-2">
          <input
            value={input}
            onChange={(e: any) => setInput(e.target.value)}
            placeholder="Ask the analyst to review logs / suggest actions..."
            className="flex-1 rounded-md border px-4 py-2 text-sm text-slate-200 focus:outline-none"
            style={{
              background: '#161D2E',
              borderColor: 'rgba(255,255,255,0.13)',
            }}
            onKeyDown={(e: any) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button onClick={handleSend} disabled={isAnalyzing} className="shrink-0 bg-[#6366F1] text-white hover:bg-[#5558E6]">
            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        <div className="mt-3 flex items-center text-[10px] font-mono text-[#6B7A99]">
          <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-[#10B981]" />
          Uses backend `/api/v1/brain/analyze` - no client-side API keys.
        </div>
      </CardContent>
    </Card>
  );
}
