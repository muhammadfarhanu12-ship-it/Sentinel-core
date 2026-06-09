import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ShieldAlert } from 'lucide-react';

import Loader from '../components/ui/Loader';
import { fetchAdminMetrics } from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';
import type { AdminMetrics } from '../types';

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="admin-stat">
      <div className="admin-stat__head">
        <span>{label}</span>
        <Activity size={16} />
      </div>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

export default function AdminMetrics() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadMetrics() {
      setLoading(true);
      setError('');
      try {
        setMetrics(await fetchAdminMetrics());
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, 'Unable to load usage analytics.'));
      } finally {
        setLoading(false);
      }
    }

    void loadMetrics();
  }, []);

  if (loading || !metrics) {
    return <Loader label="Loading usage analytics..." />;
  }

  return (
    <div className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">Usage Analytics</p>
          <h2>Gateway and security analytics</h2>
          <p>Backend-generated metrics for request volume, interceptions, leakage prevention, and risk concentration.</p>
        </div>
      </section>

      {error ? (
        <div className="admin-alert admin-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="admin-stats-grid">
        <MetricCard label="Requests" value={String(metrics.total_requests)} helper="Observed gateway and security requests" />
        <MetricCard label="Threats blocked" value={String(metrics.threats_blocked)} helper="Blocked or redacted security events" />
        <MetricCard label="Active keys" value={String(metrics.active_api_keys)} helper="Backend-tracked customer API keys" />
        <MetricCard label="Avg latency" value={`${metrics.avg_latency_ms} ms`} helper="Average request latency from stored logs" />
      </div>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <h3>Backend metric packs</h3>
            <p>Structured analytics from the admin metrics endpoint.</p>
          </div>
        </div>
        <div className="admin-list">
          <article className="admin-list__item">
            <div>
              <strong>Policy triggers</strong>
              <p>{Object.keys(metrics.policy_trigger_counts || {}).length} policy families captured</p>
            </div>
            <ShieldAlert size={16} />
          </article>
          <article className="admin-list__item">
            <div>
              <strong>Tool interception</strong>
              <p>{JSON.stringify(metrics.tool_interception_metrics || {})}</p>
            </div>
          </article>
          <article className="admin-list__item">
            <div>
              <strong>Leak prevention</strong>
              <p>{JSON.stringify(metrics.leak_prevention_metrics || {})}</p>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
