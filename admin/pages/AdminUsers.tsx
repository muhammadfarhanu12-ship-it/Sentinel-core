import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Link,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
  UserRoundX,
  Users,
} from 'lucide-react';

import Loader from '../components/ui/Loader';
import { useToast } from '../hooks/useToast';
import { fetchAdminUsers } from '../lib/adminService';
import { getErrorMessage } from '../lib/errors';

type TeamRole = 'OWNER' | 'ADMIN' | 'VIEWER' | 'AUDITOR';
type TeamStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
type SortKey = 'name' | 'email' | 'role' | 'status' | 'lastActive';

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: TeamStatus;
  mfa: boolean;
  lastActive: string;
  initials: string;
  isCurrentUser: boolean;
};

type PendingInvite = {
  id: string;
  email: string;
  role: TeamRole;
  sentDate: string;
  expiresDate: string;
  initials: string;
  daysLeft: number;
};

type ActivityItem = {
  id: string;
  actor: string;
  initials: string;
  action: string;
  resource: string;
  ts: string;
  color: 'blue' | 'amber' | 'green' | 'cyan';
};

type InviteFormState = {
  fullName: string;
  email: string;
  role: TeamRole;
  message: string;
};

type PermissionConfig = {
  description: string;
  color: 'blue' | 'amber' | 'green' | 'cyan';
  permissions: Record<string, string[]>;
  denied: string[];
};

const roleOptions: TeamRole[] = ['OWNER', 'ADMIN', 'VIEWER', 'AUDITOR'];
const statusOptions: Array<'All' | TeamStatus> = ['All', 'ACTIVE', 'INACTIVE', 'SUSPENDED'];
const roleFilterOptions: Array<'All' | TeamRole> = ['All', 'OWNER', 'ADMIN', 'VIEWER', 'AUDITOR'];

const initialMembers: TeamMember[] = [
  {
    id: 'member-fk',
    name: 'Farhan Khan',
    email: 'muhammadfarhanu12@gmail.com',
    role: 'OWNER',
    status: 'ACTIVE',
    mfa: true,
    lastActive: 'Just now',
    initials: 'FK',
    isCurrentUser: true,
  },
  {
    id: 'member-sa',
    name: 'Sarah Ahmed',
    email: 'sarah.ahmed@company.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    mfa: false,
    lastActive: '2h ago',
    initials: 'SA',
    isCurrentUser: false,
  },
  {
    id: 'member-ar',
    name: 'Alex Rivera',
    email: 'alex.rivera@company.com',
    role: 'VIEWER',
    status: 'INACTIVE',
    mfa: false,
    lastActive: '12 days ago',
    initials: 'AR',
    isCurrentUser: false,
  },
];

const initialInvites: PendingInvite[] = [
  {
    id: 'invite-co',
    email: 'compliance@company.com',
    role: 'AUDITOR',
    sentDate: '08/06/2026',
    expiresDate: '15/06/2026',
    initials: 'CO',
    daysLeft: 5,
  },
];

const initialActivities: ActivityItem[] = [
  { id: 'a1', actor: 'Farhan Khan', initials: 'FK', action: 'ran a gateway security scan', resource: 'Playground', ts: 'Just now', color: 'blue' },
  { id: 'a2', actor: 'Farhan Khan', initials: 'FK', action: 'exported threat report (CSV)', resource: 'Reports', ts: '2h ago', color: 'blue' },
  { id: 'a3', actor: 'Sarah Ahmed', initials: 'SA', action: 'viewed audit logs', resource: 'Audit Logs', ts: '3h ago', color: 'amber' },
  { id: 'a4', actor: 'Farhan Khan', initials: 'FK', action: 'rotated API key sk-****a3f2', resource: 'API Keys', ts: '1 day ago', color: 'blue' },
  { id: 'a5', actor: 'Farhan Khan', initials: 'FK', action: 'invited compliance@company.com as AUDITOR', resource: 'Team', ts: '2 days ago', color: 'blue' },
  { id: 'a6', actor: 'Sarah Ahmed', initials: 'SA', action: 'modified security profile to STRICT', resource: 'Gateway', ts: '3 days ago', color: 'amber' },
  { id: 'a7', actor: 'Farhan Khan', initials: 'FK', action: 'changed Alex Rivera role to VIEWER', resource: 'Team', ts: '5 days ago', color: 'blue' },
  { id: 'a8', actor: 'Alex Rivera', initials: 'AR', action: 'reviewed compliance report', resource: 'Reports', ts: '12 days ago', color: 'green' },
];

const rolePermissions: Record<TeamRole, PermissionConfig> = {
  OWNER: {
    description: 'Full workspace control including billing and member management.',
    color: 'blue',
    permissions: {
      'Gateway Access': ['View logs', 'View analytics', 'Review audit trails', 'Run gateway scans', 'Modify security profiles', 'Configure policies'],
      'API & Keys': ['Create API keys', 'Delete API keys', 'View raw API key values', 'Rotate keys'],
      'Team & Billing': ['Invite members', 'Remove members', 'Change roles', 'Manage billing', 'Delete workspace'],
    },
    denied: [],
  },
  ADMIN: {
    description: 'Day-to-day operations without billing or workspace deletion.',
    color: 'amber',
    permissions: {
      'Gateway Access': ['View logs', 'View analytics', 'Review audit trails', 'Run gateway scans', 'Modify security profiles'],
      'API & Keys': ['Create API keys', 'Delete API keys', 'Rotate keys'],
      'Team & Billing': ['Invite members', 'Remove members (non-owners)'],
    },
    denied: ['View raw API key values', 'Change owner role', 'Manage billing', 'Delete workspace'],
  },
  VIEWER: {
    description: 'Read-only visibility for analysts and auditors.',
    color: 'green',
    permissions: {
      'Gateway Access': ['View logs', 'View analytics', 'Review audit trails'],
      'API & Keys': [],
      'Team & Billing': [],
    },
    denied: ['Run gateway scans', 'Modify security profiles', 'Create API keys', 'Delete API keys', 'Invite members', 'Manage billing'],
  },
  AUDITOR: {
    description: 'Compliance-only access to audit trails and reports.',
    color: 'cyan',
    permissions: {
      'Gateway Access': ['View logs', 'Review audit trails'],
      'API & Keys': [],
      'Team & Billing': [],
    },
    denied: ['View analytics', 'Run gateway scans', 'Create API keys', 'Invite members', 'Manage billing'],
  },
};

const matrixRows = [
  {
    category: 'Gateway Access',
    items: [
      { permission: 'View Security Logs', roles: { OWNER: true, ADMIN: true, VIEWER: true, AUDITOR: true } },
      { permission: 'View Analytics', roles: { OWNER: true, ADMIN: true, VIEWER: true, AUDITOR: false } },
      { permission: 'Review Audit Trails', roles: { OWNER: true, ADMIN: true, VIEWER: true, AUDITOR: true } },
      { permission: 'Run Gateway Scans', roles: { OWNER: true, ADMIN: true, VIEWER: false, AUDITOR: false } },
      { permission: 'Modify Security Profiles', roles: { OWNER: true, ADMIN: true, VIEWER: false, AUDITOR: false } },
      { permission: 'Configure Policies', roles: { OWNER: true, ADMIN: false, VIEWER: false, AUDITOR: false } },
    ],
  },
  {
    category: 'API & Key Management',
    items: [
      { permission: 'Create API Keys', roles: { OWNER: true, ADMIN: true, VIEWER: false, AUDITOR: false } },
      { permission: 'Delete API Keys', roles: { OWNER: true, ADMIN: true, VIEWER: false, AUDITOR: false } },
      { permission: 'View Raw Key Values', roles: { OWNER: true, ADMIN: false, VIEWER: false, AUDITOR: false } },
      { permission: 'Rotate API Keys', roles: { OWNER: true, ADMIN: true, VIEWER: false, AUDITOR: false } },
    ],
  },
  {
    category: 'Team Management',
    items: [
      { permission: 'Invite Members', roles: { OWNER: true, ADMIN: true, VIEWER: false, AUDITOR: false } },
      { permission: 'Remove Members', roles: { OWNER: true, ADMIN: true, VIEWER: false, AUDITOR: false } },
      { permission: 'Change Member Roles', roles: { OWNER: true, ADMIN: false, VIEWER: false, AUDITOR: false } },
      { permission: 'View Member List', roles: { OWNER: true, ADMIN: true, VIEWER: true, AUDITOR: true } },
    ],
  },
  {
    category: 'Billing & Workspace',
    items: [
      { permission: 'Manage Billing', roles: { OWNER: true, ADMIN: false, VIEWER: false, AUDITOR: false } },
      { permission: 'Delete Workspace', roles: { OWNER: true, ADMIN: false, VIEWER: false, AUDITOR: false } },
      { permission: 'Export Reports', roles: { OWNER: true, ADMIN: true, VIEWER: true, AUDITOR: true } },
    ],
  },
];

function makeInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function roleTone(role: TeamRole) {
  return role.toLowerCase();
}

function statusTone(status: TeamStatus) {
  if (status === 'ACTIVE') return 'active';
  if (status === 'SUSPENDED') return 'suspended';
  return 'inactive';
}

function sortMembers(items: TeamMember[], key: SortKey, direction: 'asc' | 'desc') {
  const sorted = [...items].sort((a, b) => {
    const normalize = (value: string) => value.toLowerCase();
    if (key === 'name') return normalize(a.name).localeCompare(normalize(b.name));
    if (key === 'email') return normalize(a.email).localeCompare(normalize(b.email));
    if (key === 'role') return normalize(a.role).localeCompare(normalize(b.role));
    if (key === 'status') return normalize(a.status).localeCompare(normalize(b.status));
    return normalize(a.lastActive).localeCompare(normalize(b.lastActive));
  });
  return direction === 'asc' ? sorted : sorted.reverse();
}

export default function AdminUsers() {
  const { notify } = useToast();
  const invitePanelRef = useRef<HTMLElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backendCount, setBackendCount] = useState<number | null>(null);
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>(initialInvites);
  const [activities, setActivities] = useState<ActivityItem[]>(initialActivities);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'All' | TeamRole>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | TeamStatus>('All');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<TeamRole>('OWNER');
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [resendStateId, setResendStateId] = useState<string | null>(null);
  const [inviteState, setInviteState] = useState<InviteFormState>({
    fullName: '',
    email: '',
    role: 'OWNER',
    message: '',
  });
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminUsers({ page: 1, pageSize: 100 });
      setBackendCount(data.length);
    } catch (loadError: unknown) {
      setError(getErrorMessage(loadError, 'Unable to refresh the live team roster. Showing the latest workspace access state.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const subset = members.filter((member) => {
      const matchesQuery =
        !needle ||
        member.name.toLowerCase().includes(needle) ||
        member.email.toLowerCase().includes(needle) ||
        member.role.toLowerCase().includes(needle);
      const matchesRole = roleFilter === 'All' || member.role === roleFilter;
      const matchesStatus = statusFilter === 'All' || member.status === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
    return sortMembers(subset, sortKey, sortDirection);
  }, [members, query, roleFilter, statusFilter, sortKey, sortDirection]);

  const activeMembers = members.filter((member) => member.status === 'ACTIVE').length;
  const mfaEnrolled = members.filter((member) => member.mfa).length;

  const addActivity = useCallback((item: Omit<ActivityItem, 'id' | 'ts'> & { ts?: string }) => {
    setActivities((current) => [
      {
        id: `activity-${Date.now()}-${Math.random()}`,
        ts: item.ts || 'Just now',
        ...item,
      },
      ...current,
    ]);
  }, []);

  function handleSort(key: SortKey) {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
        return currentKey;
      }
      setSortDirection('asc');
      return key;
    });
  }

  function handleRoleSave(memberId: string) {
    const target = members.find((member) => member.id === memberId);
    if (!target || target.role === roleDraft) {
      setEditingRoleId(null);
      return;
    }

    setMembers((current) => current.map((member) => (member.id === memberId ? { ...member, role: roleDraft } : member)));
    setEditingRoleId(null);
    addActivity({
      actor: 'Farhan Khan',
      initials: 'FK',
      action: `changed ${target.name} role to ${roleDraft}`,
      resource: 'Team',
      color: 'blue',
    });
    notify({
      title: 'Role updated',
      message: `${target.name} is now ${roleDraft}`,
      tone: 'success',
    });
  }

  function handleSuspend(memberId: string) {
    const target = members.find((member) => member.id === memberId);
    if (!target) return;
    const nextStatus: TeamStatus = target.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setMembers((current) => current.map((member) => (member.id === memberId ? { ...member, status: nextStatus } : member)));
    addActivity({
      actor: 'Farhan Khan',
      initials: 'FK',
      action: `${nextStatus === 'SUSPENDED' ? 'suspended' : 're-activated'} ${target.name}`,
      resource: 'Team',
      color: 'blue',
    });
    notify({
      title: nextStatus === 'SUSPENDED' ? 'Member suspended' : 'Member activated',
      message: target.email,
      tone: 'success',
    });
  }

  function handleRemoveMember(memberId: string) {
    const target = members.find((member) => member.id === memberId);
    if (!target) return;
    setMembers((current) => current.filter((member) => member.id !== memberId));
    setRemovingMemberId(null);
    addActivity({
      actor: 'Farhan Khan',
      initials: 'FK',
      action: `removed ${target.name} from the workspace`,
      resource: 'Team',
      color: 'blue',
    });
    notify({
      title: 'Member removed',
      message: target.email,
      tone: 'success',
    });
  }

  function handleInviteFieldChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setInviteState((current) => ({ ...current, [name]: value }));
  }

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteState.email.trim()) {
      notify({ title: 'Email required', message: 'Enter an email address before sending the invitation.', tone: 'error' });
      return;
    }
    setSendingInvite(true);
    setInviteSuccess('');
    window.setTimeout(() => {
      const name = inviteState.fullName.trim() || inviteState.email.split('@')[0];
      const invite: PendingInvite = {
        id: `invite-${Date.now()}`,
        email: inviteState.email.trim(),
        role: inviteState.role,
        sentDate: '10/06/2026',
        expiresDate: '17/06/2026',
        initials: makeInitials(name || inviteState.email),
        daysLeft: 7,
      };
      setPendingInvites((current) => [invite, ...current]);
      addActivity({
        actor: 'Farhan Khan',
        initials: 'FK',
        action: `invited ${invite.email} as ${invite.role}`,
        resource: 'Team',
        color: 'blue',
      });
      setInviteState({
        fullName: '',
        email: '',
        role: 'OWNER',
        message: '',
      });
      setInviteSuccess('Invitation sent!');
      setSendingInvite(false);
      notify({ title: 'Invitation sent', message: invite.email, tone: 'success' });
    }, 900);
  }

  function handleResendInvite(inviteId: string) {
    setResendStateId(inviteId);
    window.setTimeout(() => setResendStateId(null), 2000);
  }

  function handleRevokeInvite(inviteId: string) {
    const invite = pendingInvites.find((item) => item.id === inviteId);
    if (!invite) return;
    setPendingInvites((current) => current.filter((item) => item.id !== inviteId));
    setRevokingInviteId(null);
    addActivity({
      actor: 'Farhan Khan',
      initials: 'FK',
      action: `revoked invitation for ${invite.email}`,
      resource: 'Team',
      color: 'blue',
    });
  }

  async function handleCopyInviteLink() {
    const inviteUrl = 'https://sentinel-core.ai/workspace/invite/team-access';
    try {
      await navigator.clipboard.writeText(inviteUrl);
      notify({ title: 'Invite link copied', message: inviteUrl, tone: 'success' });
    } catch {
      notify({ title: 'Copy failed', message: inviteUrl, tone: 'info' });
    }
  }

  function handleImportCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const lines = text.split(/\r?\n/).filter(Boolean);
      const imported = lines.slice(1).map((line, index) => {
        const [name, email, role] = line.split(',').map((part) => part.trim());
        const normalizedRole = roleOptions.includes((role || '').toUpperCase() as TeamRole) ? ((role || '').toUpperCase() as TeamRole) : 'VIEWER';
        return {
          id: `csv-${Date.now()}-${index}`,
          name: name || email || `Imported Member ${index + 1}`,
          email: email || `imported-${index + 1}@company.com`,
          role: normalizedRole,
          status: 'INACTIVE' as TeamStatus,
          mfa: false,
          lastActive: 'Never',
          initials: makeInitials(name || email || 'IM'),
          isCurrentUser: false,
        };
      });
      if (imported.length) {
        setMembers((current) => [...current, ...imported]);
        addActivity({
          actor: 'Farhan Khan',
          initials: 'FK',
          action: `imported ${imported.length} team members from CSV`,
          resource: 'Team',
          color: 'blue',
        });
        notify({ title: 'CSV imported', message: `${imported.length} members added`, tone: 'success' });
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  if (loading) {
    return <Loader label="Loading team management..." />;
  }

  return (
    <div className="admin-page team-page">
      <section className="admin-page__header team-page__header">
        <div>
          <p className="admin-page__eyebrow">Team Management</p>
          <h2>Team Management</h2>
          <p>Manage workspace access with enterprise-ready roles, MFA enforcement, and full audit trails.</p>
        </div>

        <div className="team-header-actions">
          <button className="team-chip team-chip--ghost" onClick={() => void loadUsers()} type="button">
            <RefreshCw size={14} />
            Refresh
          </button>
          <button className="team-chip team-chip--ghost" onClick={() => importInputRef.current?.click()} type="button">
            <Upload size={14} />
            Import CSV
          </button>
          <button className="team-chip team-chip--ghost" onClick={() => void handleCopyInviteLink()} type="button">
            <Link size={14} />
            Copy Link
          </button>
          <button className="team-chip team-chip--primary" onClick={() => invitePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} type="button">
            <UserPlus size={14} />
            Invite Member
          </button>
          <input accept=".csv" className="team-hidden-input" onChange={handleImportCsvChange} ref={importInputRef} type="file" />
        </div>
      </section>

      {error ? (
        <div className="admin-alert admin-alert--error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {backendCount !== null ? (
        <div className="team-inline-note">
          <Users size={16} />
          <span>Live admin API currently reports {backendCount} user records. The workspace grid below keeps the access-managed team state in sync for role and invite operations.</span>
        </div>
      ) : null}

      <section className="team-stat-cards">
        <article className="team-stat team-stat--blue">
          <Users size={18} className="team-stat__icon" />
          <span className="team-stat__label">Total Members</span>
          <strong className="team-stat__value">{members.length}</strong>
          <p className="team-stat__description">Active workspace seats</p>
        </article>
        <article className="team-stat team-stat--green">
          <Check size={18} className="team-stat__icon" />
          <span className="team-stat__label">Active</span>
          <strong className="team-stat__value">{activeMembers}</strong>
          <p className="team-stat__description">Members active in last 30d</p>
        </article>
        <article className="team-stat team-stat--amber">
          <Mail size={18} className="team-stat__icon" />
          <span className="team-stat__label">Pending Invites</span>
          <strong className="team-stat__value">{pendingInvites.length}</strong>
          <p className="team-stat__description">Awaiting acceptance</p>
        </article>
        <article className="team-stat team-stat--cyan">
          <Smartphone size={18} className="team-stat__icon" />
          <span className="team-stat__label">MFA Enrolled</span>
          <strong className="team-stat__value">{mfaEnrolled}</strong>
          <p className="team-stat__description">Members with MFA enabled</p>
        </article>
      </section>

      <section className="team-members-invite">
        <article className="admin-panel team-panel">
          <div className="team-panel__header">
            <div>
              <div className="team-panel__title">
                <Users size={16} className="team-icon-blue" />
                <h3>Workspace Members</h3>
              </div>
              <p>Owners retain full control, admins operate day-to-day, viewers stay informed.</p>
            </div>
            <div className="team-table-tools">
              <label className="team-search">
                <Search size={14} />
                <input placeholder="Search name, email, role..." value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <select className="team-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'All' | TeamRole)}>
                {roleFilterOptions.map((role) => (
                  <option key={role} value={role}>
                    {role === 'All' ? 'All roles' : role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="team-filter-row">
            <div className="team-pill-group">
              <span>Role</span>
              {roleFilterOptions.map((option) => (
                <button key={option} className={`team-filter-pill ${roleFilter === option ? 'is-active' : ''}`} onClick={() => setRoleFilter(option)} type="button">
                  {option}
                </button>
              ))}
            </div>
            <div className="team-pill-group">
              <span>Status</span>
              {statusOptions.map((option) => (
                <button key={option} className={`team-filter-pill ${statusFilter === option ? 'is-active' : ''}`} onClick={() => setStatusFilter(option)} type="button">
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="team-table-wrap">
            <div className="team-table">
              <div className="team-table__head">
                {[
                  ['name', 'Name'],
                  ['email', 'Email'],
                  ['role', 'Role'],
                  ['status', 'Status'],
                  ['mfa', 'MFA'],
                  ['lastActive', 'Last Active'],
                  ['actions', 'Actions'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={`team-table__cell team-table__cell--head ${key === 'actions' || key === 'mfa' ? 'is-static' : ''}`}
                    onClick={() => (key === 'actions' || key === 'mfa' ? undefined : handleSort(key as SortKey))}
                    type="button"
                  >
                    <span>{label}</span>
                    {sortKey === key ? (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : key === 'actions' || key === 'mfa' ? null : <ChevronDown size={12} className="team-sort-idle" />}
                  </button>
                ))}
              </div>

              <div className="team-table__body">
                {filteredMembers.map((member) => (
                  <div key={member.id} className="team-member-row">
                    <div className="team-table__cell team-table__cell--name">
                      <div className={`team-avatar team-avatar--${roleTone(member.role)}`}>{member.initials}</div>
                      <div>
                        <strong>{member.name}</strong>
                        {member.isCurrentUser ? <span className="team-you-tag">YOU</span> : null}
                      </div>
                    </div>
                    <div className="team-table__cell">
                      <code>{member.email}</code>
                    </div>
                    <div className="team-table__cell">
                      {editingRoleId === member.id ? (
                        <div className="team-inline-role-editor">
                          <select className="team-select" value={roleDraft} onChange={(event) => setRoleDraft(event.target.value as TeamRole)}>
                            {roleOptions.map((role) => (
                              <option key={role}>{role}</option>
                            ))}
                          </select>
                          <button className="team-mini-button team-mini-button--save" onClick={() => handleRoleSave(member.id)} type="button">
                            Save
                          </button>
                          <button className="team-mini-button" onClick={() => setEditingRoleId(null)} type="button">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button className={`team-role-badge team-role-badge--${roleTone(member.role)}`} onClick={() => {
                          setEditingRoleId(member.id);
                          setRoleDraft(member.role);
                        }} type="button">
                          {member.role}
                        </button>
                      )}
                    </div>
                    <div className="team-table__cell">
                      <span className={`team-status-badge team-status-badge--${statusTone(member.status)}`}>
                        <i />
                        {member.status}
                      </span>
                    </div>
                    <div className="team-table__cell">
                      <span className={`team-mfa-indicator ${member.mfa ? 'is-on' : 'is-off'}`}>
                        {member.mfa ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
                        {member.mfa ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="team-table__cell">
                      <span className="team-last-active">{member.lastActive}</span>
                    </div>
                    <div className="team-table__cell">
                      <div className="team-actions">
                        <button
                          className="team-icon-button"
                          onClick={() => {
                            setEditingRoleId(member.id);
                            setRoleDraft(member.role);
                          }}
                          type="button"
                        >
                          <Pencil size={14} />
                        </button>
                        <button className="team-icon-button team-icon-button--amber" onClick={() => handleSuspend(member.id)} type="button">
                          <UserRoundX size={14} />
                        </button>
                        <button className="team-icon-button team-icon-button--red" onClick={() => setRemovingMemberId(member.id)} type="button">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {removingMemberId === member.id ? (
                        <div className="team-inline-confirm">
                          <span>Remove {member.name}?</span>
                          <button className="team-mini-button" onClick={() => setRemovingMemberId(null)} type="button">
                            Cancel
                          </button>
                          <button className="team-mini-button team-mini-button--danger" onClick={() => handleRemoveMember(member.id)} type="button">
                            Confirm Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="team-table-footer">
            <span>Showing {filteredMembers.length} of {members.length} members</span>
            <div className="team-pagination">
              <button className="team-mini-button" disabled type="button">{'<- Prev'}</button>
              <button className="team-mini-button team-mini-button--save" type="button">1</button>
              <button className="team-mini-button" disabled type="button">{'Next ->'}</button>
            </div>
          </div>
        </article>

        <article className="admin-panel team-panel" ref={invitePanelRef}>
          <div className="team-panel__header">
            <div>
              <div className="team-panel__title">
                <UserPlus size={16} className="team-icon-blue" />
                <h3>Invite Member</h3>
              </div>
              <p>Send an invitation to join this workspace</p>
            </div>
          </div>

          {inviteSuccess ? <div className="team-success-banner">{inviteSuccess}</div> : null}

          <form className="team-invite-form" onSubmit={handleInviteSubmit}>
            <label>
              <span>Full Name (optional)</span>
              <input name="fullName" value={inviteState.fullName} onChange={handleInviteFieldChange} />
            </label>
            <label>
              <span>Email Address *</span>
              <input name="email" type="email" value={inviteState.email} onChange={handleInviteFieldChange} />
            </label>
            <div className="team-role-picker">
              <span>Role *</span>
              <div className="team-role-picker__pills">
                {roleOptions.map((role) => (
                  <button
                    key={role}
                    className={`team-filter-pill ${inviteState.role === role ? 'is-active' : ''}`}
                    onClick={() => setInviteState((current) => ({ ...current, role }))}
                    type="button"
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span>Message (optional)</span>
              <textarea name="message" value={inviteState.message} onChange={handleInviteFieldChange} />
              <small>Personalize the invitation email.</small>
            </label>
            <button className="team-chip team-chip--primary team-submit-button" disabled={sendingInvite} type="submit">
              <Send size={14} />
              {sendingInvite ? 'Sending...' : 'Send Invitation'}
            </button>
          </form>

          <div className="team-permission-preview">
            <span className="team-permission-preview__eyebrow">Selected Role: {inviteState.role}</span>
            <strong className={`team-preview-role team-preview-role--${rolePermissions[inviteState.role].color}`}>{inviteState.role}</strong>
            <p>{rolePermissions[inviteState.role].description}</p>

            {Object.entries(rolePermissions[inviteState.role].permissions).map(([category, items]) => (
              <div key={category} className="team-preview-group">
                <span>{category}</span>
                {items.map((item) => (
                  <div key={item} className="team-preview-permission is-allowed">
                    <i />
                    {item}
                  </div>
                ))}
                {rolePermissions[inviteState.role].denied
                  .filter((item) => {
                    if (category === 'Gateway Access') return ['Run gateway scans', 'Modify security profiles', 'View analytics'].includes(item);
                    if (category === 'API & Keys') return ['Create API keys', 'Delete API keys', 'View raw API key values'].includes(item);
                    return ['Invite members', 'Remove members', 'Manage billing', 'Change owner role', 'Delete workspace'].includes(item);
                  })
                  .map((item) => (
                    <div key={item} className="team-preview-permission is-denied">
                      <i />
                      {item}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-panel team-panel">
        <div className="team-panel__header team-panel__header--split">
          <div>
            <div className="team-panel__title">
              <Mail size={16} className="team-icon-amber" />
              <h3>Pending Invitations</h3>
            </div>
            <p>Awaiting acceptance - invitations expire after 7 days</p>
          </div>
          <span className="team-muted-note">Invite expires in 7 days</span>
        </div>

        {pendingInvites.length === 0 ? (
          <div className="team-empty-state">
            <Mail size={28} />
            <strong>No pending invitations.</strong>
            <p>All sent invitations have been accepted or revoked.</p>
          </div>
        ) : (
          <div className="team-invites-list">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="team-invite-row">
                <div className={`team-avatar team-avatar--${roleTone(invite.role)}`}>{invite.initials}</div>
                <code>{invite.email}</code>
                <span className={`team-role-badge team-role-badge--${roleTone(invite.role)}`}>{invite.role}</span>
                <span className="team-muted-note">Sent: {invite.sentDate}</span>
                <span className={`team-expiry ${invite.daysLeft <= 0 ? 'is-expired' : invite.daysLeft <= 3 ? 'is-warning' : ''}`}>
                  <i />
                  Expires: {invite.expiresDate}
                </span>
                <button className="team-mini-button team-mini-button--amber" onClick={() => handleResendInvite(invite.id)} type="button">
                  <RefreshCw size={12} />
                  {resendStateId === invite.id ? 'Sent!' : 'Resend'}
                </button>
                {revokingInviteId === invite.id ? (
                  <div className="team-inline-confirm">
                    <span>Revoke invite?</span>
                    <button className="team-mini-button" onClick={() => setRevokingInviteId(null)} type="button">
                      Cancel
                    </button>
                    <button className="team-mini-button team-mini-button--danger" onClick={() => handleRevokeInvite(invite.id)} type="button">
                      Confirm
                    </button>
                  </div>
                ) : (
                  <button className="team-mini-button team-mini-button--danger" onClick={() => setRevokingInviteId(invite.id)} type="button">
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="team-matrix-activity">
        <article className="admin-panel team-panel">
          <div className="team-panel__header">
            <div>
              <div className="team-panel__title">
                <Shield size={16} className="team-icon-blue" />
                <h3>Role Permissions Matrix</h3>
              </div>
              <p>Full comparison of what each role can and cannot do</p>
            </div>
          </div>

          <div className="team-matrix">
            <div className="team-matrix__head">
              <div className="team-matrix__cell is-label">Permission</div>
              {roleOptions.map((role) => (
                <div key={role} className="team-matrix__cell">
                  <span className={`team-role-badge team-role-badge--${roleTone(role)}`}>{role}</span>
                </div>
              ))}
            </div>

            {matrixRows.map((group) => (
              <div key={group.category}>
                <div className="team-matrix__category">{group.category}</div>
                {group.items.map((item, index) => (
                  <div key={item.permission} className={`team-matrix__row ${index % 2 === 0 ? 'is-alt' : ''}`}>
                    <div className="team-matrix__cell is-label">{item.permission}</div>
                    {roleOptions.map((role) => (
                      <div key={`${item.permission}-${role}`} className="team-matrix__cell">
                        <span className={`team-matrix__mark ${item.roles[role] ? 'is-yes' : 'is-no'}`}>
                          {item.roles[role] ? <Check size={14} /> : <Trash2 size={14} />}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </article>

        <article className="admin-panel team-panel">
          <div className="team-panel__header team-panel__header--split">
            <div>
              <div className="team-panel__title">
                <History size={16} className="team-icon-cyan" />
                <h3>Member Activity Log</h3>
              </div>
              <p>Recent actions by workspace members</p>
            </div>
            <span className="team-muted-note">Last 30 days</span>
          </div>

          <div className="team-activity-list">
            {activities.map((activity) => (
              <div key={activity.id} className="team-activity-row">
                <div className={`team-avatar team-avatar--${activity.color}`}>{activity.initials}</div>
                <div className="team-activity-copy">
                  <strong>{activity.actor}</strong>
                  <p>{activity.action}</p>
                </div>
                <span className="team-resource-chip">{activity.resource}</span>
                <span className="team-activity-time">{activity.ts}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
