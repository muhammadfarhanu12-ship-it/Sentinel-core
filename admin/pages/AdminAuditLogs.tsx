import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import DataTable, { type TableColumn } from '../components/tables/DataTable';
import Loader from '../components/ui/Loader';
import { fetchAdminAuditLogs } from '../lib/adminService';
import { safeFormatDate } from '../lib/date';
import { getErrorMessage } from '../lib/errors';
import type { AdminAuditLog } from '../types';

export default function AdminAuditLogs() {
  const [rows, setRows] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadAuditLogs() {
      setLoading(true);
      setError('');
      try {
        setRows(await fetchAdminAuditLogs({ page: 1, pageSize: 100 }));
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, 'Unable to load admin audit logs.'));
      } finally {
        setLoading(false);
      }
    }

    void loadAuditLogs();
  }, []);

  const columns: TableColumn<AdminAuditLog>[] = [
    { key: 'timestamp', title: 'Timestamp', render: (row) => safeFormatDate(row.timestamp) },
    { key: 'actor', title: 'Actor', render: (row) => `${row.actor || 'system'} (${row.actor_type || 'unknown'})` },
    { key: 'event', title: 'Event', render: (row) => row.event_type || row.action },
    { key: 'resource', title: 'Resource', render: (row) => row.resource || 'unknown' },
    { key: 'risk', title: 'Risk', render: (row) => `${row.decision || 'n/a'} / ${row.risk_score ?? 0}` },
  ];

  if (loading) {
    return <Loader label="Loading audit logs..." />;
  }

  return (
    <div className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">Audit Logs</p>
          <h2>Compliance-grade audit event stream</h2>
          <p>Redacted audit entries with request IDs, decisions, matched policies, and provider/model context.</p>
        </div>
      </section>

      {error ? (
        <div className="admin-alert admin-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <h3>Audit events</h3>
            <p>Includes gateway, scan, auth, API key, and admin control-plane events.</p>
          </div>
        </div>
        <DataTable columns={columns} emptyTitle="No audit events found" emptyMessage="Audit events will appear here when backend activity is recorded." rows={rows} />
      </section>
    </div>
  );
}
