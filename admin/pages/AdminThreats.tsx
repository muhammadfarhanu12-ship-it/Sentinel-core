import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import DataTable, { type TableColumn } from '../components/tables/DataTable';
import Loader from '../components/ui/Loader';
import { fetchAdminThreats } from '../lib/adminService';
import { safeFormatDate } from '../lib/date';
import { getErrorMessage } from '../lib/errors';
import type { AdminLog } from '../types';

export default function AdminThreats() {
  const [rows, setRows] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadThreats() {
      setLoading(true);
      setError('');
      try {
        setRows(await fetchAdminThreats({ page: 1, pageSize: 100 }));
      } catch (loadError: unknown) {
        setError(getErrorMessage(loadError, 'Unable to load threat events.'));
      } finally {
        setLoading(false);
      }
    }

    void loadThreats();
  }, []);

  const columns: TableColumn<AdminLog>[] = [
    {
      key: 'timestamp',
      title: 'Timestamp',
      render: (row) => safeFormatDate(row.timestamp || row.created_at),
    },
    {
      key: 'type',
      title: 'Threat',
      render: (row) => row.threat_types?.join(', ') || row.threat_type || 'Unclassified',
    },
    {
      key: 'decision',
      title: 'Decision',
      render: (row) => (
        <span className={`admin-badge ${row.status === 'BLOCKED' ? 'admin-badge--danger' : row.status === 'REDACTED' ? 'admin-badge--warn' : 'admin-badge--ok'}`}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'risk',
      title: 'Risk',
      render: (row) => `${row.risk_level || 'unknown'} / ${row.risk_score ?? 0}`,
    },
    {
      key: 'request',
      title: 'Gateway',
      render: (row) => `${row.method || 'POST'} ${row.endpoint || '/unknown'}`,
    },
  ];

  if (loading) {
    return <Loader label="Loading threats..." />;
  }

  return (
    <div className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">Threats</p>
          <h2>Threat detections and intercepted actions</h2>
          <p>Real backend threat entries derived from the live Sentinel-Core logs collection.</p>
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
            <h3>Threat activity</h3>
            <p>Includes blocked requests, redactions, and high-risk detections visible to admins.</p>
          </div>
        </div>
        <DataTable columns={columns} emptyTitle="No threat events found" emptyMessage="Generate activity or widen the time window." rows={rows} />
      </section>
    </div>
  );
}
