import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Ban, Search, Trash2 } from 'lucide-react';

import DataTable, { type TableColumn } from '../components/tables/DataTable';
import Loader from '../components/ui/Loader';
import { useToast } from '../hooks/useToast';
import { deleteAdminUser, fetchAdminUsers, updateAdminUserStatus } from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';
import type { AdminUser } from '../types';

export default function AdminUsers() {
  const { notify } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsers = useCallback(async (search = '') => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminUsers({ page: 1, pageSize: 100, q: search || undefined });
      setUsers(data);
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Unable to load admin users.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleStatusToggle = useCallback(async (user: AdminUser) => {
    try {
      const updated = await updateAdminUserStatus(user.id, !user.is_active);
      setUsers((current) => current.map((item) => (item.id === user.id ? updated : item)));
      notify({
        title: updated.is_active ? 'User activated' : 'User suspended',
        message: updated.email,
        tone: 'success',
      });
    } catch (error: unknown) {
      notify({
        title: 'Status update failed',
        message: getErrorMessage(error, 'Unknown error'),
        tone: 'error',
      });
    }
  }, [notify]);

  const handleDelete = useCallback(async (user: AdminUser) => {
    const confirmed = window.confirm(`Delete ${user.email}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteAdminUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      notify({ title: 'User deleted', message: user.email, tone: 'success' });
    } catch (error: unknown) {
      notify({
        title: 'Delete failed',
        message: getErrorMessage(error, 'Unknown error'),
        tone: 'error',
      });
    }
  }, [notify]);

  const columns: TableColumn<AdminUser>[] = [
    {
      key: 'email',
      title: 'Email',
      render: (user) => (
        <div>
          <strong>{user.email}</strong>
          <span className="admin-muted-row">{user.organization_name || 'No organization'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      title: 'Status',
      render: (user) => (
        <span className={`admin-badge ${user.is_active ? 'admin-badge--ok' : 'admin-badge--warn'}`}>
          {user.is_active ? 'ACTIVE' : 'SUSPENDED'}
        </span>
      ),
    },
    {
      key: 'usage',
      title: 'Usage',
      render: (user) => `${user.api_usage} requests`,
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (user) => (
        <div className="admin-row-actions">
          <button className="admin-icon-button" onClick={() => void handleStatusToggle(user)} type="button">
            <Ban size={14} />
            {user.is_active ? 'Suspend' : 'Activate'}
          </button>
          <button className="admin-icon-button admin-icon-button--danger" onClick={() => void handleDelete(user)} type="button">
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      ),
      className: 'admin-table__actions',
    },
  ];

  if (loading) {
    return <Loader label="Loading users..." />;
  }

  return (
    <div className="admin-page">
      <section className="admin-page__header">
        <div>
          <p className="admin-page__eyebrow">Users</p>
          <h2>Manage admin-visible platform users</h2>
          <p>Search, suspend, reactivate, and remove user accounts from the admin panel.</p>
        </div>
      </section>

      {error ? <div className="admin-alert admin-alert--error"><AlertTriangle size={16} /><span>{error}</span></div> : null}

      <section className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <h3>User directory</h3>
            <p>Results are loaded directly from the backend admin API.</p>
          </div>
          <form
            className="admin-toolbar"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void loadUsers(query);
            }}
          >
            <div className="admin-search">
              <Search size={16} />
              <input onChange={(event) => setQuery(event.target.value)} placeholder="Search by email" value={query} />
            </div>
            <button className="admin-button admin-button--primary" type="submit">
              Search
            </button>
          </form>
        </div>

        <DataTable columns={columns} emptyMessage="Try a different search query." emptyTitle="No users found" rows={users} />
      </section>
    </div>
  );
}
