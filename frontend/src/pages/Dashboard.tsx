import { useEffect } from 'react';
import { useStore } from '../stores/useStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { ShieldAlert, ShieldCheck, Database, Activity, Lock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { motion } from 'framer-motion';
import { ASOCAnalyst } from '../components/ASOCAnalyst';
import { ReasoningWindow } from '../components/ReasoningWindow';

export default function Dashboard() {
  const { analytics, fetchAnalytics, isLoading, reasoningLogs } = useStore();

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
  const threatFeed = analytics.threatActivityFeed || [];
  const policyTriggerEntries = Object.entries(analytics.policyTriggerCounts || {}).sort((a, b) => b[1] - a[1]);
  const attackSeverityData = analytics.attackSeverityChart || [];
  const toolMetrics = analytics.toolInterceptionMetrics || { totalToolCalls: 0, requires2FA: 0, intercepted: 0, approved: 0 };
  const leakMetrics = analytics.leakPreventionMetrics || { findings: 0, blockedEvents: 0, redactedEvents: 0 };
  const topSignatures = analytics.topAttackSignatures || [];
  const userHeatmap = analytics.userRiskHeatmap || [];

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
        <Card className="min-w-0 bg-slate-900/40 border-white/5">
          <CardHeader>
            <CardTitle>Threat Activity Feed</CardTitle>
            <CardDescription>Most recent blocked/redacted activity with severity tags.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-72 overflow-y-auto">
            {threatFeed.length === 0 ? (
              <p className="text-sm text-slate-400">No high-risk events recorded yet.</p>
            ) : (
              threatFeed.slice(0, 8).map((event, index) => (
                <div key={`${event.request_id}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs text-slate-400">{new Date(event.timestamp).toLocaleString()}</p>
                  <p className="text-sm font-semibold text-slate-100">{event.threat_type}</p>
                  <p className="text-xs text-slate-300">Severity: {event.severity} | Signature: {event.attack_signature}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 bg-slate-900/40 border-white/5">
          <CardHeader>
            <CardTitle>Policy Trigger Counts</CardTitle>
            <CardDescription>Frequency of active policy activations in recent scans.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-72 overflow-y-auto">
            {policyTriggerEntries.length === 0 ? (
              <p className="text-sm text-slate-400">No policy triggers recorded yet.</p>
            ) : (
              policyTriggerEntries.slice(0, 8).map(([policy, count]) => (
                <div key={policy} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <span className="text-sm text-slate-200">{policy}</span>
                  <span className="text-sm font-semibold text-indigo-300">{count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-2 min-w-0 bg-slate-900/40 border-white/5">
          <CardHeader>
            <CardTitle>Attack Severity Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-64 min-w-0">
            {attackSeverityData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Severity distribution will appear after security events are logged.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={attackSeverityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="severity" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                  <Bar dataKey="count" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 bg-slate-900/40 border-white/5">
          <CardHeader>
            <CardTitle>Interception & Leak Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-slate-400">Tool Calls Intercepted</p>
              <p className="text-xl font-semibold text-amber-300">{toolMetrics.intercepted}</p>
              <p className="text-xs text-slate-500">Requires 2FA: {toolMetrics.requires2FA} / {toolMetrics.totalToolCalls}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-slate-400">Leak Findings</p>
              <p className="text-xl font-semibold text-rose-300">{leakMetrics.findings}</p>
              <p className="text-xs text-slate-500">Blocked: {leakMetrics.blockedEvents} | Redacted: {leakMetrics.redactedEvents}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card className="min-w-0 bg-slate-900/40 border-white/5">
          <CardHeader>
            <CardTitle>Top Attack Signatures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topSignatures.length === 0 ? (
              <p className="text-sm text-slate-400">No signatures recorded yet.</p>
            ) : (
              topSignatures.slice(0, 6).map((item) => (
                <div key={item.signature} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <span className="text-sm text-slate-200">{item.signature}</span>
                  <span className="text-sm font-semibold text-cyan-300">{item.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 bg-slate-900/40 border-white/5">
          <CardHeader>
            <CardTitle>User Risk Heatmap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-72 overflow-y-auto">
            {userHeatmap.length === 0 ? (
              <p className="text-sm text-slate-400">Risk heatmap will populate as session history grows.</p>
            ) : (
              userHeatmap.slice(0, 8).map((item) => (
                <div key={item.user} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-sm text-slate-200">{item.user}</p>
                  <p className="text-xs text-slate-400">Avg Risk: {item.average_risk_score} | Events: {item.events}</p>
                </div>
              ))
            )}
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
