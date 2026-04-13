import { useEffect, useState } from 'react';
import { useStore } from '../stores/useStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ShieldAlert, ShieldCheck, Database, Activity, Lock, Send, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { motion } from 'framer-motion';
import { ASOCAnalyst } from '../components/ASOCAnalyst';
import { ReasoningWindow } from '../components/ReasoningWindow';
import { authHeaders } from '../services/auth';
import { apiRequest } from '../services/api';

export default function Dashboard() {
  const { analytics, fetchAnalytics, isLoading, reasoningLogs } = useStore();
  const [testPrompt, setTestPrompt] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Fallback: ensure dashboard always starts at the top even when a custom scroll container is used.
  useEffect(() => {
    const container = document.querySelector('#app-scroll-container') as HTMLElement | null;
    if (container) {
      container.scrollTop = 0;
      return;
    }
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleTestGateway = async () => {
    if (!testPrompt.trim()) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const data = await apiRequest<any>('/api/v1/scan', {
        method: 'POST',
        headers: {
          ...authHeaders(),
        },
        body: JSON.stringify({ prompt: testPrompt }),
      });
      setTestResult(data);
    } catch (error) {
      console.error('Test failed:', error);
      setTestResult({ error: error instanceof Error ? error.message : 'Failed to connect to Sentinel-Core' });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading || !analytics) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-800 rounded-xl"></div>
          ))}
        </div>
        <div className="h-96 bg-slate-800 rounded-xl"></div>
      </div>
    );
  }

  const stats = [
    { title: 'Total Threats Blocked', value: analytics.totalThreatsBlocked.toLocaleString(), icon: ShieldAlert, color: 'text-blocked' },
    { title: 'Prompt Injections', value: analytics.promptInjectionsDetected.toLocaleString(), icon: Activity, color: 'text-warning' },
    { title: 'Data Leaks Prevented', value: analytics.dataLeaksPrevented.toLocaleString(), icon: Database, color: 'text-indigo-400' },
    { title: 'API Requests Today', value: analytics.apiRequestsToday.toLocaleString(), icon: Lock, color: 'text-clean' },
  ];
  const hasThreatHistory = analytics.threatsOverTime.length > 0;
  const usageLimit = Math.max(analytics.usageVsLimit.limit, 1);
  const usagePercent = ((analytics.usageVsLimit.used / usageLimit) * 100).toFixed(1);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full flex-col items-stretch justify-start gap-8 self-start"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-slate-400 mt-1">Real-time security analytics and threat detection.</p>
        </div>
        <div className="flex items-center gap-4 self-start lg:self-auto">
          <div className="text-right">
            <p className="text-sm text-slate-400">Security Score</p>
            <p className="text-2xl font-bold text-clean">{analytics.securityScore}/100</p>
          </div>
          <ShieldCheck className="w-10 h-10 text-clean" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="bg-slate-900/40 border-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">{stat.title}</CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2 min-w-0 bg-slate-900/40 border-white/5">
          <CardHeader>
            <CardTitle>Threats Over Time</CardTitle>
          </CardHeader>
          <CardContent className="h-80 min-w-0">
            {hasThreatHistory ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={analytics.threatsOverTime} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorClean" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#32FF7E" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#32FF7E" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF4D4D" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#FF4D4D" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Area type="monotone" dataKey="clean" stroke="#32FF7E" fillOpacity={1} fill="url(#colorClean)" />
                  <Area type="monotone" dataKey="blocked" stroke="#FF4D4D" fillOpacity={1} fill="url(#colorBlocked)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Threat history will appear here once requests are processed.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 bg-slate-900/40 border-white/5">
          <CardHeader>
            <CardTitle>Usage vs Limit</CardTitle>
          </CardHeader>
          <CardContent className="h-80 flex flex-col justify-center">
             <div className="mb-4 text-center">
                <p className="text-3xl font-bold text-indigo-400">
                  {usagePercent}%
                </p>
                <p className="text-sm text-slate-400 mt-1">Monthly Quota Used</p>
             </div>
             <div className="h-44 min-w-0">
               <ResponsiveContainer width="100%" height={176}>
                  <BarChart data={[analytics.usageVsLimit]} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide domain={[0, usageLimit]} />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} />
                    <Bar dataKey="used" fill="#818cf8" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
               </ResponsiveContainer>
             </div>
             <div className="flex justify-between text-xs text-slate-500 mt-2">
                <span>{analytics.usageVsLimit.used.toLocaleString()} reqs</span>
                <span>{analytics.usageVsLimit.limit.toLocaleString()} limit</span>
             </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <ASOCAnalyst />
        <ReasoningWindow reasoningLogs={reasoningLogs} />
      </div>
    </motion.div>
  );
}
