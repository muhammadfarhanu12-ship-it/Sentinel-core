import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Terminal, Send, Loader2, ShieldAlert, CheckCircle2, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';
import { useStore } from '../stores/useStore';
import { authHeaders } from '../services/auth';
import { apiRequest } from '../services/api';

type AnalystMessage = { role: 'user' | 'model' | 'system'; text: string; type?: 'action' | 'text' };

async function brainAnalyze(payload: { prompt: string; image_data?: string | null }) {
  const data = await apiRequest<any>('/api/v1/brain/analyze', {
    method: 'POST',
    headers: { ...authHeaders() },
    body: JSON.stringify(payload),
  });
  return data?.analysis ?? data;
}

export function ASOCAnalyst() {
  const [messages, setMessages] = useState<AnalystMessage[]>([
    { role: 'model', text: 'Sentinel ASOC Analyst online. Awaiting anomalies or manual review requests.' },
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
    <Card className="flex h-[500px] flex-col overflow-hidden bg-slate-900/40 border-white/5" id="asoc-chat-container">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center space-x-2">
          <Terminal className="w-5 h-5 text-indigo-400" />
          <CardTitle className="text-lg">ASOC Analyst</CardTitle>
          {isAutoMonitoring && (
            <span className="text-xs text-clean flex items-center">
              <Activity className="w-3 h-3 mr-1 animate-pulse" /> Auto-monitoring
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAutoMonitoring((v) => !v)}
          className="text-slate-300"
        >
          {isAutoMonitoring ? 'Stop' : 'Start'} Auto
        </Button>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0">
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
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
                      ? 'bg-indigo-500/20 border border-indigo-500/30 text-slate-100'
                      : msg.role === 'system'
                      ? 'bg-slate-950/60 border border-white/10 text-slate-300'
                      : 'bg-slate-950/40 border border-white/10 text-slate-200'
                  }`}
                >
                  {msg.role === 'model' && <ShieldAlert className="w-4 h-4 text-indigo-400 inline mr-2" />}
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
            className="flex-1 bg-slate-950/50 border border-white/10 rounded-md px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            onKeyDown={(e: any) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button onClick={handleSend} disabled={isAnalyzing} className="shrink-0">
            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        <div className="mt-3 text-xs text-slate-500 flex items-center">
          <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-clean" />
          Uses backend `/api/v1/brain/analyze` (no client-side API keys).
        </div>
      </CardContent>
    </Card>
  );
}
