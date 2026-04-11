import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, KeyRound, Users } from 'lucide-react';

import Loader from '../components/ui/Loader';
import { fetchAdminApiKeys, fetchAdminLogs, fetchAdminMetrics } from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';
import type { AdminApiKey, AdminLog, AdminMetrics } from '../types';

function StatCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <section className="admin-stat">
      <div className="admin-stat__head">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{helper}</p>
    </section>
  );
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [apiKeys, setApiKeys] = useState<AdminApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError('');
      try {
        const [metricsData, logsData, keysData] = await Promise.all([
          fetchAdminMetrics(),
          fetchAdminLogs({ page: 1, pageSize: 5 }),
          fetchAdminApiKeys({ page: 1, pageSize: 5 }),
        ]);
        setMetrics(metricsData);
        setLogs(logsData);
        setApiKeys(keysData);
      } catch (error: unknown) {
        setError(getErrorMessage(error, 'Unable to load admin dashboard data.'));
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  const threatSummary = useMemo(() => {
    const blocked = logs.filter((log) => log.status === 'BLOCKED').length;
    const quarantined = logs.filter((log) => log.is_quarantined).length;
    return { blocked, quarantined };
  }, [logs]);

  if (loading) {
    return <Loader label="Loading admin dashboard..." />;
  }

  return (
    <div className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">Overview</p>
          <h2>Security operations dashboard</h2>
          <p>Monitor platform users, API usage, and current threat signals from the isolated admin application.</p>
        </div>
      </section>

      {error ? (
        <div className="admin-alert admin-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="admin-stats-grid">
        <StatCard
          helper={`${metrics?.active_users ?? 0} active accounts`}
          icon={<Users size={16} />}
          label="Total users"
          value={String(metrics?.total_users ?? 0)}
        />
        <StatCard
          helper={`${metrics?.avg_latency_ms ?? 0} ms average latency`}
          icon={<Activity size={16} />}
          label="API usage"
          value={String(metrics?.total_requests ?? 0)}
        />
        <StatCard
          helper={`${threatSummary.blocked} blocked on current log page`}
          icon={<AlertTriangle size={16} />}
          label="Threat summary"
          value={String(metrics?.threats_blocked ?? 0)}
        />
        <StatCard
          helper={`${metrics?.quarantined_api_keys ?? 0} quarantined keys`}
          icon={<KeyRound size={16} />}
          label="Active API keys"
          value={String(metrics?.active_api_keys ?? 0)}
        />
      </div>

      <div className="admin-grid admin-grid--two">
        <section className="admin-panel">
          <div className="admin-panel__header">
            <div>
              <h3>Recent security logs</h3>
              <p>Latest backend log entries with status and threat context.</p>
            </div>
          </div>
          <div className="admin-list">
            {logs.length === 0 ? (
              <p className="admin-empty-inline">No logs available.</p>
            ) : (
              logs.map((log) => (
                <article className="admin-list__item" key={log.id}>
                  <div>
                    <strong>{log.endpoint || 'Unknown endpoint'}</strong>
                    <p>{log.user_email || 'No user'} | {new Date(log.timestamp).toLocaleString()}</p>
                  </div>
                  <span
                    className={`admin-badge ${
                      log.status === 'BLOCKED'
                        ? 'admin-badge--danger'
                        : log.status === 'REDACTED'
                          ? 'admin-badge--warn'
                          : 'admin-badge--ok'
                    }`}
                  >
                    {log.status}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__header">
            <div>
              <h3>Recent API keys</h3>
              <p>Latest provisioned credentials and usage status.</p>
            </div>
          </div>
          <div className="admin-list">
            {apiKeys.length === 0 ? (
              <p className="admin-empty-inline">No API keys found.</p>
            ) : (
              apiKeys.map((key) => (
                <article className="admin-list__item" key={key.id}>
                  <div>
                    <strong>{key.name}</strong>
                    <p>{key.user_email} | {key.usage_count} requests</p>
                  </div>
                  <span
                    className={`admin-badge ${
                      key.status === 'ACTIVE'
                        ? 'admin-badge--ok'
                        : key.status === 'REVOKED'
                          ? 'admin-badge--danger'
                          : 'admin-badge--warn'
                    }`}
                  >
                    {key.status}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
