import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import Loader from '../components/ui/Loader';
import { fetchAdminReports } from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';
import type { AdminReportSummary } from '../types';

export default function AdminReports() {
  const [report, setReport] = useState<AdminReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      setError('');
      try {
        setReport(await fetchAdminReports());
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, 'Unable to load reports and alerts.'));
      } finally {
        setLoading(false);
      }
    }

    void loadReports();
  }, []);

  if (loading || !report) {
    return <Loader label="Loading reports and alerts..." />;
  }

  return (
    <div className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">Reports & Alerts</p>
          <h2>Backend-derived reporting summary</h2>
          <p>Blocked attacks, provider failures, financial/tool/PII events, and current alerting limitations.</p>
        </div>
      </section>

      {error ? (
        <div className="admin-alert admin-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="admin-stats-grid">
        {Object.entries(report.summary).map(([label, value]) => (
          <section key={label} className="admin-stat">
            <div className="admin-stat__head">
              <span>{label.replace(/_/g, ' ')}</span>
            </div>
            <strong>{String(value)}</strong>
            <p>Derived from persisted gateway, scan, and audit records.</p>
          </section>
        ))}
      </div>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <h3>Recent alerts</h3>
            <p>Most recent compliance-significant events visible in the audit trail.</p>
          </div>
        </div>
        <div className="admin-list">
          {report.recent_alerts.length === 0 ? (
            <p className="admin-empty-inline">No alerts available.</p>
          ) : (
            report.recent_alerts.slice(0, 25).map((item, index) => (
              <article key={`${String(item.request_id || 'alert')}-${index}`} className="admin-list__item">
                <div>
                  <strong>{String(item.event_type || 'event')}</strong>
                  <p>{String(item.request_id || 'no-request-id')} | {String(item.provider || 'n/a')} / {String(item.model || 'n/a')}</p>
                </div>
                <span className="admin-badge admin-badge--warn">{String(item.severity || 'INFO')}</span>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <h3>Alerting limitation</h3>
            <p>Clear statement of what is backend-ready versus not yet fully real-time.</p>
          </div>
        </div>
        <div className="admin-list__item">
          <div>
            <strong>{report.realtime_limitations.streaming_alert_bus ? 'Real-time alert bus active' : 'Real-time alert bus not yet implemented'}</strong>
            <p>{report.realtime_limitations.note}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
