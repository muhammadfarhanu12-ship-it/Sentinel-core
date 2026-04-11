import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, KeyRound, Search, ShieldX } from 'lucide-react';

import DataTable, { type TableColumn } from '../components/tables/DataTable';
import Loader from '../components/ui/Loader';
import { useToast } from '../hooks/useToast';
import {
  createAdminApiKey,
  fetchAdminApiKeys,
  fetchAdminUsers,
  revokeAdminApiKey,
} from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';
import type { AdminApiKey, AdminUser } from '../types';

export default function AdminApiKeys() {
  const { notify } = useToast();
  const [apiKeys, setApiKeys] = useState<AdminApiKey[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [keyName, setKeyName] = useState('');
  const [query, setQuery] = useState('');
  const [rawKey, setRawKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadPage = useCallback(async (search = '') => {
    setLoading(true);
    setError('');
    try {
      const [keysData, usersData] = await Promise.all([
        fetchAdminApiKeys({ page: 1, pageSize: 100, q: search || undefined }),
        fetchAdminUsers({ page: 1, pageSize: 100 }),
      ]);
      setApiKeys(keysData);
      setUsers(usersData);
      setSelectedUserId((current) => current || (usersData[0] ? String(usersData[0].id) : ''));
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Unable to load API keys.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const handleCreate = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedUserId) {
      notify({ title: 'Select a user', message: 'Choose a target user before creating a key.', tone: 'error' });
      return;
    }

    if (!keyName.trim()) {
      notify({ title: 'Key name required', message: 'Provide a descriptive API key label.', tone: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const created = await createAdminApiKey(Number(selectedUserId), keyName.trim());
      setApiKeys((current) => [created, ...current]);
      setRawKey(created.key || '');
      setKeyName('');
      notify({
        title: 'API key created',
        message: created.user_email,
        tone: 'success',
      });
    } catch (error: unknown) {
      notify({
        title: 'Key creation failed',
        message: getErrorMessage(error, 'Unknown error'),
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }, [keyName, notify, selectedUserId]);

  const handleRevoke = useCallback(async (apiKey: AdminApiKey) => {
    const confirmed = window.confirm(`Revoke ${apiKey.name} for ${apiKey.user_email}?`);
    if (!confirmed) return;

    try {
      const revoked = await revokeAdminApiKey(apiKey.id);
      setApiKeys((current) => current.map((item) => (item.id === apiKey.id ? revoked : item)));
      notify({ title: 'API key revoked', message: apiKey.name, tone: 'success' });
    } catch (error: unknown) {
      notify({
        title: 'Revoke failed',
        message: getErrorMessage(error, 'Unknown error'),
        tone: 'error',
      });
    }
  }, [notify]);

  const columns: TableColumn<AdminApiKey>[] = [
    {
      key: 'name',
      title: 'Key',
      render: (item) => (
        <div>
          <strong>{item.name}</strong>
          <span className="admin-muted-row">{item.prefix || 'No prefix returned'}</span>
        </div>
      ),
    },
    {
      key: 'owner',
      title: 'Owner',
      render: (item) => item.user_email,
    },
    {
      key: 'usage',
      title: 'Usage',
      render: (item) => (
        <div>
          <strong>{item.usage_count} requests</strong>
          <span className="admin-muted-row">{item.last_ip || 'No IP observed'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      render: (item) => (
        <span
          className={`admin-badge ${
            item.status === 'ACTIVE'
              ? 'admin-badge--ok'
              : item.status === 'REVOKED'
                ? 'admin-badge--danger'
                : 'admin-badge--warn'
          }`}
        >
          {item.status}
        </span>
      ),
    },
    {
      key: 'actions',
      title: 'Actions',
      className: 'admin-table__actions',
      render: (item) => (
        <button
          className="admin-icon-button admin-icon-button--danger"
          disabled={item.status === 'REVOKED'}
          onClick={() => void handleRevoke(item)}
          type="button"
        >
          <ShieldX size={14} />
          Revoke
        </button>
      ),
    },
  ];

  if (loading) {
    return <Loader label="Loading API keys..." />;
  }

  return (
    <div className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">API Keys</p>
          <h2>Provision and revoke gateway credentials</h2>
          <p>Create scoped keys for customer accounts and immediately review usage posture.</p>
        </div>
      </section>

      {error ? (
        <div className="admin-alert admin-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="admin-grid admin-grid--two">
        <section className="admin-panel">
          <div className="admin-panel__header">
            <div>
              <h3>Create API key</h3>
              <p>Generate a new backend-backed key for an existing user account.</p>
            </div>
          </div>

          <form className="admin-form" onSubmit={handleCreate}>
            <label className="admin-field">
              <span>User</span>
              <div className="admin-select-wrap">
                <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  <option value="">Select a user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="admin-field">
              <span>Key name</span>
              <div className="admin-input-wrap">
                <KeyRound size={16} />
                <input
                  onChange={(event) => setKeyName(event.target.value)}
                  placeholder="Production integration"
                  value={keyName}
                />
              </div>
            </label>

            <button className="admin-button admin-button--primary" disabled={submitting} type="submit">
              {submitting ? 'Creating...' : 'Create API key'}
            </button>
          </form>

          {rawKey ? (
            <div className="admin-secret-box">
              <span>Raw key</span>
              <code>{rawKey}</code>
            </div>
          ) : null}
        </section>

        <section className="admin-panel">
          <div className="admin-panel__header">
            <div>
              <h3>Key inventory</h3>
              <p>Active and revoked credentials loaded from the admin backend.</p>
            </div>
            <form
              className="admin-toolbar"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void loadPage(query);
              }}
            >
              <div className="admin-search">
                <Search size={16} />
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by key name or owner"
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
            emptyMessage="Create a key above or broaden the search."
            emptyTitle="No API keys found"
            rows={apiKeys}
          />
        </section>
      </div>
    </div>
  );
}
