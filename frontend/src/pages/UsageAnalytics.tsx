import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, BellRing, CreditCard, ShieldAlert, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { EmptyState } from '../components/enterprise/EmptyState';
import { LoadingSkeleton } from '../components/enterprise/LoadingSkeleton';
import { ProgressRing } from '../components/enterprise/ProgressRing';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { useToast } from '../components/ui/ToastProvider';
import { getErrorMessage } from '../lib/errors';
import { cn } from '../lib/utils';
import { useStore } from '../stores/useStore';

function UsageMetric({
  title,
  value,
  description,
  icon,
  accent,
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <Card className="border-white/5 bg-slate-900/40">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base text-slate-100">{title}</CardTitle>
          <CardDescription className="mt-2">{description}</CardDescription>
        </div>
        <div className={cn('rounded-2xl border p-3', accent)}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight text-slate-50">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function UsageAnalytics() {
  const usageSummary = useStore((state) => state.usageSummary);
  const usageLoading = useStore((state) => state.usageLoading);
  const usageAlertEnabled = useStore((state) => state.usageAlertEnabled);
  const fetchUsageSummary = useStore((state) => state.fetchUsageSummary);
  const setUsageAlertEnabled = useStore((state) => state.setUsageAlertEnabled);
  const { pushToast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    try {
      setError(null);
      await fetchUsageSummary();
    } catch (loadError) {
      const message = getErrorMessage(loadError, 'Unable to load usage analytics.');
      setError(message);
      pushToast({
        title: 'Usage analytics unavailable',
        description: message,
        tone: 'error',
      });
    }
  }, [fetchUsageSummary, pushToast]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  if (usageLoading && !usageSummary) {
    return <LoadingSkeleton rows={3} />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage Analytics</h1>
          <p className="mt-1 max-w-2xl text-slate-400">
            Track request throughput, blocked threats, and quota burn before it impacts billing or uptime.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="text-slate-200" onClick={() => void loadUsage()}>
            Refresh usage
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      {!usageSummary ? (
        <EmptyState
          icon={<Zap className="h-6 w-6" />}
          title="No usage telemetry yet"
          description="Once Sentinel starts processing production traffic, this module will show request velocity, threats, and quota posture."
          action={<Button onClick={() => void loadUsage()}>Retry</Button>}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <UsageMetric
              title="Total Requests"
              value={usageSummary.totalRequests.toLocaleString()}
              description="Aggregate requests processed across the workspace."
              icon={<Zap className="h-5 w-5 text-sky-300" />}
              accent="border-sky-500/20 bg-sky-500/10"
            />
            <UsageMetric
              title="Blocked Injections"
              value={usageSummary.blockedInjections.toLocaleString()}
              description="Requests prevented by the gateway security engine."
              icon={<ShieldAlert className="h-5 w-5 text-red-300" />}
              accent="border-red-500/20 bg-red-500/10"
            />
            <UsageMetric
              title="Monthly Credits Remaining"
              value={usageSummary.monthlyCreditsRemaining.toLocaleString()}
              description="Estimated credits left before the current cycle resets."
              icon={<CreditCard className="h-5 w-5 text-emerald-300" />}
              accent="border-emerald-500/20 bg-emerald-500/10"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.65fr_0.95fr]">
            <Card className="min-w-0 border-white/5 bg-slate-900/40">
              <CardHeader>
                <CardTitle>Requests vs Threats</CardTitle>
                <CardDescription>Thirty-day operating picture for demand and blocked behavior.</CardDescription>
              </CardHeader>
              <CardContent className="h-[380px] min-w-0">
                {usageSummary.trend.length === 0 ? (
                  <EmptyState
                    icon={<AlertTriangle className="h-6 w-6" />}
                    title="No trend data available"
                    description="The usage endpoint returned without a 30-day series. Once the backend provides historical points, this chart will populate automatically."
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={380}>
                    <LineChart data={usageSummary.trend} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                        itemStyle={{ color: '#E2E8F0' }}
                      />
                      <Line type="monotone" dataKey="requests" stroke="#38BDF8" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="threats" stroke="#FF4D4D" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6">
              <Card className="border-white/5 bg-slate-900/40">
                <CardHeader>
                  <CardTitle>Quota Progress</CardTitle>
                  <CardDescription>Current month request consumption against plan capacity.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-4">
                  <ProgressRing value={usageSummary.quotaUsed} max={usageSummary.quotaLimit} label="Quota Used" />
                  <Badge variant={usageSummary.quotaUsed / Math.max(usageSummary.quotaLimit, 1) >= 0.8 ? 'warning' : 'clean'}>
                    {usageSummary.quotaUsed.toLocaleString()} / {usageSummary.quotaLimit.toLocaleString()} requests
                  </Badge>
                </CardContent>
              </Card>

              <Card className="border-white/5 bg-slate-900/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-indigo-300" />
                    Usage Alerting
                  </CardTitle>
                  <CardDescription>Get ahead of quota exhaustion before customer traffic is affected.</CardDescription>
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    onClick={() => {
                      const nextValue = !usageAlertEnabled;
                      setUsageAlertEnabled(nextValue);
                      pushToast({
                        title: nextValue ? 'Usage alerts enabled' : 'Usage alerts disabled',
                        description: nextValue
                          ? 'Sentinel will remind you when workspace usage crosses 80%.'
                          : '80% quota reminders are now muted on this device.',
                        tone: 'success',
                      });
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4 text-left transition hover:border-indigo-500/30"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Notify me at 80% usage</div>
                      <div className="mt-1 text-sm text-slate-400">Preference is saved locally for the current operator session.</div>
                    </div>
                    <div className={`relative inline-flex h-6 w-11 items-center rounded-full ${usageAlertEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${usageAlertEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </div>
                  </button>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
