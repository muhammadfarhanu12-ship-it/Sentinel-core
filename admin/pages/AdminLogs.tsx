import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Search } from 'lucide-react';

import DataTable, { type TableColumn } from '../components/tables/DataTable';
import Loader from '../components/ui/Loader';
import { fetchAdminLogs } from '../lib/adminService';
import { safeFormatDate } from '../lib/date';
import { getErrorMessage } from '../lib/errors';
import type { AdminLog } from '../types';

function formatThreat(log: AdminLog) {
  const labels = log.threat_types?.length ? log.threat_types : log.threat_type ? [log.threat_type] : [];
  if (!labels.length) return 'No threat label';
  return labels.join(', ');
}

export default function AdminLogs() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadLogs(search = '') {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminLogs({ page: 1, pageSize: 100, q: search || undefined });
      setLogs(data);
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Unable to load security logs.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLogs();
  }, []);

  const columns = useMemo<TableColumn<AdminLog>[]>(
    () => [
      {
        key: 'timestamp',
        title: 'Timestamp',
        render: (log) => safeFormatDate(log.timestamp || log.created_at),
      },
      {
        key: 'endpoint',
        title: 'Request',
        render: (log) => (
          <div>
            <strong>{log.method || 'REQ'} {log.endpoint || '/unknown'}</strong>
            <span className="admin-muted-row">{log.model || 'Unknown model'}</span>
          </div>
        ),
      },
      {
        key: 'identity',
        title: 'User / IP',
        render: (log) => (
          <div>
            <strong>{log.user_email || 'Anonymous request'}</strong>
            <span className="admin-muted-row">{log.ip_address || 'No IP captured'}</span>
          </div>
        ),
      },
      {
        key: 'status',
        title: 'Status',
        render: (log) => (
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
        ),
      },
      {
        key: 'threat',
        title: 'Threat',
        render: (log) => (
          <div>
            <strong>{formatThreat(log)}</strong>
            <span className="admin-muted-row">
              {log.risk_level || 'Unrated'} | score {log.risk_score ?? 0}
            </span>
          </div>
        ),
      },
    ],
    [],
  );

  if (loading) {
    return <Loader label="Loading security logs..." />;
  }

  return (
    <div className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">Logs</p>
          <h2>System and threat activity logs</h2>
          <p>Review backend events, request metadata, status outcomes, and potential attack indicators.</p>
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
            <h3>Security event stream</h3>
            <p>Filtered directly from the admin backend logs endpoint.</p>
          </div>
          <form
            className="admin-toolbar"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void loadLogs(query);
            }}
          >
            <div className="admin-search">
              <Search size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search email, endpoint, or threat"
                value={query}
              />
            </div>
            <button className="admin-button admin-button--primary" type="submit">
              Search
            </button>
          </form>
        </div>

        <DataTable
          columns={columns}
          emptyMessage="Try broadening the query or generate fresh traffic."
          emptyTitle="No log entries found"
          rows={logs}
        />
      </section>
    </div>
  );
}
