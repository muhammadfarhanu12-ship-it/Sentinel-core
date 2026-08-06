import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CircleCheckBig,
  History,
  Link2,
  Mail,
  PauseCircle,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { LoadingSkeleton } from '../components/enterprise/LoadingSkeleton';
import { useToast } from '../components/ui/ToastProvider';
import { getErrorMessage } from '../lib/errors';
import { HttpError, authedFetchJson } from '../services/authenticatedFetch';

const THEME = {
  bg: '#0B0D14',
  card: '#111827',
  panel: '#161D2E',
  cell: '#1C253A',
  text: '#D1D9EE',
  textSoft: '#6B7A99',
  textMuted: '#3A4560',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.13)',
  green: '#10B981',
  greenDim: 'rgba(16,185,129,0.12)',
  greenBorder: 'rgba(16,185,129,0.28)',
  red: '#EF4444',
  redDim: 'rgba(239,68,68,0.11)',
  redBorder: 'rgba(239,68,68,0.26)',
  amber: '#F59E0B',
  amberDim: 'rgba(245,158,11,0.11)',
  amberBorder: 'rgba(245,158,11,0.26)',
  blue: '#6366F1',
  blueDim: 'rgba(99,102,241,0.12)',
  blueBorder: 'rgba(99,102,241,0.28)',
  cyan: '#06B6D4',
  cyanDim: 'rgba(6,182,212,0.10)',
  cyanBorder: 'rgba(6,182,212,0.25)',
} as const;

type Role = 'OWNER' | 'ADMIN' | 'VIEWER' | 'AUDITOR';
type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
type ActivityTheme = 'blue' | 'amber' | 'green' | 'cyan';
type SortKey = 'name' | 'email' | 'role' | 'lastActive';
type SortDirection = 'asc' | 'desc';

type MemberRecord = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: MemberStatus;
  mfa: boolean;
  lastActive: string;
  lastActiveSort: number;
  initials: string;
  isCurrentUser: boolean;
};

type PendingInvite = {
  id: string;
  email: string;
  role: Role;
  sentDate: string;
  expiresDate: string;
  daysLeft: number;
  initials: string;
};

type ActivityEntry = {
  id: string;
  actor: string;
  initials: string;
  theme: ActivityTheme;
  action: string;
  resource: string;
  ts: string;
};

type PermissionGroup = {
  allowed: string[];
  denied: string[];
};

type RolePermissionConfig = {
  description: string;
  color: ActivityTheme;
  groups: Record<string, PermissionGroup>;
};

type TeamApiRecord = {
  id: number | string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  status?: string | null;
  mfa?: boolean | null;
  mfa_enabled?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_active_at?: string | null;
  expires_at?: string | null;
};

type AuditLogRecord = {
  id: number | string;
  actor?: string | null;
  action?: string | null;
  resource?: string | null;
  timestamp?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ROLE_ORDER: Role[] = ['OWNER', 'ADMIN', 'VIEWER', 'AUDITOR'];
const ROLE_FILTERS = ['All', ...ROLE_ORDER] as const;
const STATUS_FILTERS = ['All', 'Active', 'Inactive', 'Suspended'] as const;

const rolePermissions: Record<Role, RolePermissionConfig> = {
  OWNER: {
    description: 'Full workspace control including billing and member management.',
    color: 'blue',
    groups: {
      'Gateway Access': {
        allowed: ['View logs', 'View analytics', 'Review audit trails', 'Run gateway scans', 'Modify security profiles', 'Configure policies'],
        denied: [],
      },
      'API & Keys': {
        allowed: ['Create API keys', 'Delete API keys', 'View raw key values', 'Rotate keys'],
        denied: [],
      },
      'Team & Billing': {
        allowed: ['Invite members', 'Remove members', 'Change roles', 'Manage billing', 'Delete workspace'],
        denied: [],
      },
    },
  },
  ADMIN: {
    description: 'Day-to-day operations without billing or workspace deletion.',
    color: 'amber',
    groups: {
      'Gateway Access': {
        allowed: ['View logs', 'View analytics', 'Review audit trails', 'Run gateway scans', 'Modify security profiles'],
        denied: ['Configure policies'],
      },
      'API & Keys': {
        allowed: ['Create API keys', 'Delete API keys', 'Rotate keys'],
        denied: ['View raw key values'],
      },
      'Team & Billing': {
        allowed: ['Invite members', 'Remove members (non-owners)'],
        denied: ['Change owner role', 'Manage billing', 'Delete workspace'],
      },
    },
  },
  VIEWER: {
    description: 'Read-only visibility for analysts and auditors.',
    color: 'green',
    groups: {
      'Gateway Access': {
        allowed: ['View logs', 'View analytics', 'Review audit trails'],
        denied: ['Run gateway scans', 'Modify security profiles', 'Configure policies'],
      },
      'API & Keys': {
        allowed: [],
        denied: ['Create API keys', 'Delete API keys', 'View raw key values'],
      },
      'Team & Billing': {
        allowed: [],
        denied: ['Invite members', 'Remove members', 'Manage billing'],
      },
    },
  },
  AUDITOR: {
    description: 'Compliance-only access to audit trails and reports.',
    color: 'cyan',
    groups: {
      'Gateway Access': {
        allowed: ['View logs', 'Review audit trails'],
        denied: ['View analytics', 'Run gateway scans', 'Modify security profiles'],
      },
      'API & Keys': {
        allowed: [],
        denied: ['Create API keys', 'Delete API keys', 'Rotate keys'],
      },
      'Team & Billing': {
        allowed: ['Export reports'],
        denied: ['Invite members', 'Manage billing', 'Delete workspace'],
      },
    },
  },
};

const permissionMatrix = [
  {
    category: 'GATEWAY ACCESS',
    rows: [
      ['View Security Logs', ['OWNER', 'ADMIN', 'VIEWER', 'AUDITOR']],
      ['View Analytics', ['OWNER', 'ADMIN', 'VIEWER']],
      ['Review Audit Trails', ['OWNER', 'ADMIN', 'VIEWER', 'AUDITOR']],
      ['Run Gateway Scans', ['OWNER', 'ADMIN']],
      ['Modify Security Profiles', ['OWNER', 'ADMIN']],
      ['Configure Policies', ['OWNER']],
    ],
  },
  {
    category: 'API & KEY MANAGEMENT',
    rows: [
      ['Create API Keys', ['OWNER', 'ADMIN']],
      ['Delete API Keys', ['OWNER', 'ADMIN']],
      ['View Raw Key Values', ['OWNER']],
      ['Rotate API Keys', ['OWNER', 'ADMIN']],
    ],
  },
  {
    category: 'TEAM MANAGEMENT',
    rows: [
      ['Invite Members', ['OWNER', 'ADMIN']],
      ['Remove Members', ['OWNER', 'ADMIN']],
      ['Change Member Roles', ['OWNER']],
      ['View Member List', ['OWNER', 'ADMIN', 'VIEWER', 'AUDITOR']],
    ],
  },
  {
    category: 'BILLING & WORKSPACE',
    rows: [
      ['Manage Billing', ['OWNER']],
      ['Delete Workspace', ['OWNER']],
      ['Export Reports', ['OWNER', 'ADMIN', 'VIEWER', 'AUDITOR']],
    ],
  },
] as const;

function styleForRole(role: Role): CSSProperties {
  if (role === 'OWNER') return { background: THEME.blueDim, borderColor: THEME.blueBorder, color: '#A5B4FC' };
  if (role === 'ADMIN') return { background: THEME.amberDim, borderColor: THEME.amberBorder, color: THEME.amber };
  if (role === 'AUDITOR') return { background: THEME.cyanDim, borderColor: THEME.cyanBorder, color: THEME.cyan };
  return { background: THEME.greenDim, borderColor: THEME.greenBorder, color: THEME.green };
}

function styleForTheme(theme: ActivityTheme): CSSProperties {
  if (theme === 'blue') return styleForRole('OWNER');
  if (theme === 'amber') return styleForRole('ADMIN');
  if (theme === 'cyan') return styleForRole('AUDITOR');
  return styleForRole('VIEWER');
}

function styleForStatus(status: MemberStatus): CSSProperties {
  if (status === 'ACTIVE') return { background: THEME.greenDim, borderColor: THEME.greenBorder, color: THEME.green };
  if (status === 'SUSPENDED') return { background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red };
  return { background: 'rgba(255,255,255,0.05)', borderColor: THEME.border, color: THEME.textSoft };
}

function roleRank(role: Role): number {
  return ROLE_ORDER.indexOf(role);
}

function statusTheme(member: MemberRecord): ActivityTheme {
  if (member.role === 'OWNER') return 'blue';
  if (member.role === 'ADMIN') return 'amber';
  if (member.role === 'AUDITOR') return 'cyan';
  return 'green';
}

function normalizeRole(value: unknown): Role {
  const role = String(value || '').toUpperCase();
  return ROLE_ORDER.includes(role as Role) ? (role as Role) : 'VIEWER';
}

function normalizeMemberStatus(value: unknown): MemberStatus {
  const status = String(value || '').toUpperCase();
  if (status === 'ACTIVE' || status === 'SUSPENDED') return status;
  return 'INACTIVE';
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeTime(value: unknown, fallback = 'No recent activity'): string {
  const date = parseDate(value);
  if (!date) return fallback;
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function formatDate(value: unknown): string {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat('en-GB').format(date) : 'Not available';
}

function initialsFromName(value: string, email: string): string {
  const source = value.trim();
  if (source) {
    const words = source.split(/\s+/).slice(0, 2);
    return words.map((word) => word[0]?.toUpperCase() || '').join('').slice(0, 2) || 'TM';
  }
  const local = email.split('@')[0] || 'TM';
  return local.slice(0, 2).toUpperCase();
}

function displayNameFromEmail(value: string): string {
  const local = value.split('@')[0] || 'Workspace member';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
    .join(' ') || 'Workspace member';
}

function mapMember(record: TeamApiRecord, currentUserEmail: string): MemberRecord {
  const email = String(record.email || 'unknown@workspace.local').trim().toLowerCase();
  const lastActiveAt = record.last_active_at || record.updated_at || record.created_at;
  const lastActiveDate = parseDate(lastActiveAt);
  const name = String(record.name || '').trim() || displayNameFromEmail(email);
  return {
    id: String(record.id),
    name,
    email,
    role: normalizeRole(record.role),
    status: normalizeMemberStatus(record.status),
    mfa: Boolean(record.mfa ?? record.mfa_enabled ?? false),
    lastActive: formatRelativeTime(lastActiveAt),
    lastActiveSort: lastActiveDate ? Math.max(0, Date.now() - lastActiveDate.getTime()) : Number.MAX_SAFE_INTEGER,
    initials: initialsFromName(name, email),
    isCurrentUser: Boolean(currentUserEmail) && email === currentUserEmail.toLowerCase(),
  };
}

function mapPendingInvite(record: TeamApiRecord): PendingInvite {
  const email = String(record.email || 'unknown@workspace.local').trim().toLowerCase();
  const sentAt = parseDate(record.created_at || record.updated_at) || new Date();
  const expiresAt = parseDate(record.expires_at) || new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: String(record.id),
    email,
    role: normalizeRole(record.role),
    sentDate: formatDate(sentAt),
    expiresDate: formatDate(expiresAt),
    daysLeft: Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    initials: initialsFromName(String(record.name || ''), email),
  };
}

function mapTeamActivity(record: AuditLogRecord): ActivityEntry {
  const action = String(record.action || '').toUpperCase();
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  const email = typeof metadata.email === 'string' ? metadata.email : '';
  const role = typeof metadata.role === 'string' ? metadata.role.toUpperCase() : '';
  const memberLabel = email || 'a team member';
  let actionText = action.replace(/^TEAM_/, '').toLowerCase().replace(/_/g, ' ');
  if (action === 'TEAM_MEMBER_INVITED') actionText = `invited ${memberLabel}${role ? ` as ${role}` : ''}`;
  if (action === 'TEAM_INVITE_RESENT') actionText = `resent the invitation to ${memberLabel}`;
  if (action === 'TEAM_INVITE_REVOKED') actionText = `revoked the invitation for ${memberLabel}`;
  if (action === 'TEAM_MEMBER_REMOVED') actionText = `removed ${memberLabel} from the workspace`;
  if (action === 'TEAM_MEMBER_ROLE_UPDATED') actionText = `changed ${memberLabel} role${role ? ` to ${role}` : ''}`;
  if (action === 'TEAM_MEMBER_STATUS_UPDATED') actionText = `updated ${memberLabel} status`;

  const actor = String(record.actor || 'Workspace member');
  const theme: ActivityTheme = action.includes('INVITED') || action.includes('RESENT')
    ? 'green'
    : action.includes('REMOVED') || action.includes('REVOKED')
      ? 'amber'
      : action.includes('UPDATED')
        ? 'cyan'
        : 'blue';
  return {
    id: String(record.id),
    actor: displayNameFromEmail(actor),
    initials: initialsFromName('', actor),
    theme,
    action: actionText,
    resource: 'Team',
    ts: formatRelativeTime(record.timestamp),
  };
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />;
}

function RoleBadge({
  role,
  active = false,
  onClick,
  caret = false,
}: {
  role: Role;
  active?: boolean;
  onClick?: () => void;
  caret?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 rounded-[7px] border px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em]',
        onClick ? 'transition-colors hover:brightness-110' : 'cursor-default',
        active && 'shadow-[0_0_0_1px_rgba(255,255,255,0.04)]',
      )}
      style={styleForRole(role)}
    >
      <span>{role}</span>
      {caret ? <ChevronDown className="h-3 w-3" /> : null}
    </button>
  );
}

function TeamAvatar({ initials, role }: { initials: string; role: Role }) {
  return (
    <div
      className="flex h-8.5 w-8.5 items-center justify-center rounded-full border text-[12px] font-bold"
      style={styleForRole(role)}
    >
      {initials}
    </div>
  );
}

function SectionCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx('rounded-[10px] border', className)}
      style={{ background: THEME.card, borderColor: THEME.border }}
    >
      {children}
    </section>
  );
}

export default function TeamManagement() {
  const { pushToast } = useToast();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<(typeof ROLE_FILTERS)[number]>('All');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('All');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('VIEWER');
  const [inviteMessage, setInviteMessage] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);
  const [inviteBannerTone, setInviteBannerTone] = useState<'success' | 'error'>('success');
  const [openRoleMenuId, setOpenRoleMenuId] = useState<string | null>(null);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [resentInviteId, setResentInviteId] = useState<string | null>(null);

  useEffect(() => {
    const container = document.querySelector('#app-scroll-container') as HTMLElement | null;
    if (container) {
      container.scrollTop = 0;
      return;
    }
    window.scrollTo(0, 0);
  }, []);

  const loadTeamData = useCallback(async (showSuccessToast = false) => {
    setIsLoading(true);
    try {
      const [teamResponse, auditResponse, profile] = await Promise.all([
        authedFetchJson<TeamApiRecord[]>('/api/v1/team'),
        authedFetchJson<AuditLogRecord[]>('/api/v1/audit-logs?limit=50&q=TEAM_'),
        authedFetchJson<{ email?: string | null }>('/api/v1/auth/me'),
      ]);
      const currentUserEmail = String(profile?.email || '').trim().toLowerCase();
      const records = Array.isArray(teamResponse) ? teamResponse : [];
      const auditEntries = Array.isArray(auditResponse) ? auditResponse : [];
      setMembers(records.filter((record) => String(record.status || '').toUpperCase() !== 'PENDING').map((record) => mapMember(record, currentUserEmail)));
      setPendingInvites(records.filter((record) => String(record.status || '').toUpperCase() === 'PENDING').map(mapPendingInvite));
      setActivities(
        auditEntries
          .filter((record) => String(record.resource || '').toLowerCase() === 'team' || String(record.action || '').toUpperCase().startsWith('TEAM_'))
          .map(mapTeamActivity),
      );
      setLoadError(null);
      if (showSuccessToast) {
        pushToast({
          title: 'Team refreshed',
          description: 'Workspace members, invitations, and activity are up to date.',
          tone: 'success',
        });
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to load team management data.');
      setLoadError(message);
      pushToast({ title: 'Unable to load team', description: message, tone: 'error' });
    } finally {
      setHasLoaded(true);
      setIsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadTeamData();
  }, [loadTeamData]);

  const stats = useMemo(() => {
    const activeCount = members.filter((member) => member.status === 'ACTIVE').length;
    const mfaEnrolled = members.filter((member) => member.mfa).length;
    return [
      {
        label: 'TOTAL MEMBERS',
        value: members.length,
        description: 'Active workspace seats',
        color: THEME.blue,
        bg: THEME.blueDim,
        border: THEME.blueBorder,
        icon: Users,
      },
      {
        label: 'ACTIVE',
        value: activeCount,
        description: 'Active in last 30 days',
        color: THEME.green,
        bg: THEME.greenDim,
        border: THEME.greenBorder,
        icon: CircleCheckBig,
      },
      {
        label: 'PENDING INVITES',
        value: pendingInvites.length,
        description: 'Awaiting acceptance',
        color: THEME.amber,
        bg: THEME.amberDim,
        border: THEME.amberBorder,
        icon: Mail,
      },
      {
        label: 'MFA ENROLLED',
        value: mfaEnrolled,
        description: 'Members with MFA on',
        color: THEME.cyan,
        bg: THEME.cyanDim,
        border: THEME.cyanBorder,
        icon: Smartphone,
      },
    ];
  }, [members, pendingInvites.length]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members
      .filter((member) => {
        const queryMatch =
          !query ||
          `${member.name} ${member.email} ${member.role} ${member.status}`.toLowerCase().includes(query);
        const roleMatch = roleFilter === 'All' || member.role === roleFilter;
        const statusMatch = statusFilter === 'All' || member.status === statusFilter.toUpperCase();
        return queryMatch && roleMatch && statusMatch;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortKey === 'name') comparison = a.name.localeCompare(b.name);
        if (sortKey === 'email') comparison = a.email.localeCompare(b.email);
        if (sortKey === 'role') comparison = roleRank(a.role) - roleRank(b.role);
        if (sortKey === 'lastActive') comparison = a.lastActiveSort - b.lastActiveSort;
        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [members, roleFilter, search, sortDirection, sortKey, statusFilter]);

  const previewConfig = rolePermissions[inviteRole];

  async function resetPageState() {
    setSearch('');
    setRoleFilter('All');
    setStatusFilter('All');
    setSortKey('name');
    setSortDirection('asc');
    setOpenRoleMenuId(null);
    setRemoveConfirmId(null);
    setRevokeConfirmId(null);
    setResentInviteId(null);
    setInviteBanner(null);
    await loadTeamData(true);
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  }

  async function changeMemberRole(member: MemberRecord, nextRole: Role) {
    if (member.role === nextRole) {
      setOpenRoleMenuId(null);
      return;
    }
    setOpenRoleMenuId(null);
    try {
      await authedFetchJson<TeamApiRecord>(`/api/v1/team/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      await loadTeamData();
      pushToast({ title: 'Role updated', description: `${member.name} is now ${nextRole}.`, tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Unable to update role', description: getErrorMessage(error, 'Please try again.'), tone: 'error' });
    }
  }

  async function toggleMemberSuspended(member: MemberRecord) {
    const nextStatus: MemberStatus = member.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    try {
      await authedFetchJson<TeamApiRecord>(`/api/v1/team/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadTeamData();
      pushToast({
        title: nextStatus === 'SUSPENDED' ? 'Member suspended' : 'Member reactivated',
        description: `${member.name} is now ${nextStatus.toLowerCase()}.`,
        tone: 'success',
      });
    } catch (error) {
      pushToast({ title: 'Unable to update member', description: getErrorMessage(error, 'Please try again.'), tone: 'error' });
    }
  }

  async function removeMember(member: MemberRecord) {
    try {
      const result = await authedFetchJson<{ deleted?: boolean }>(`/api/v1/team/${encodeURIComponent(member.id)}`, { method: 'DELETE' });
      if (!result?.deleted) throw new Error('The team member could not be removed.');
      setRemoveConfirmId(null);
      await loadTeamData();
      pushToast({ title: 'Member removed', description: `${member.name} no longer has workspace access.`, tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Unable to remove member', description: getErrorMessage(error, 'Please try again.'), tone: 'error' });
    }
  }

  async function copyPageLink() {
    const value = typeof window !== 'undefined' ? window.location.href : '/app/team';
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      }
      pushToast({
        title: 'Link copied',
        description: 'Team management URL copied to the clipboard.',
        tone: 'success',
      });
    } catch {
      pushToast({
        title: 'Copy unavailable',
        description: value,
        tone: 'warning',
      });
    }
  }

  function handleImportCsv() {
    pushToast({
      title: 'Import CSV ready',
      description: 'Bulk import is available for the next onboarding wave.',
      tone: 'success',
    });
  }

  async function handleResendInvite(invite: PendingInvite) {
    try {
      await authedFetchJson<TeamApiRecord>(`/api/v1/team/${encodeURIComponent(invite.id)}/resend-invite`, { method: 'POST' });
      await loadTeamData();
      setResentInviteId(invite.id);
      window.setTimeout(() => setResentInviteId((current) => (current === invite.id ? null : current)), 2000);
      pushToast({ title: 'Invitation resent', description: `A new invitation was sent to ${invite.email}.`, tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Unable to resend invitation', description: getErrorMessage(error, 'Please try again.'), tone: 'error' });
    }
  }

  async function handleRevokeInvite(invite: PendingInvite) {
    try {
      const result = await authedFetchJson<{ deleted?: boolean }>(`/api/v1/team/${encodeURIComponent(invite.id)}/invite`, { method: 'DELETE' });
      if (!result?.deleted) throw new Error('The invitation could not be revoked.');
      setRevokeConfirmId(null);
      await loadTeamData();
      pushToast({ title: 'Invitation revoked', description: `${invite.email} can no longer use this invitation.`, tone: 'success' });
    } catch (error) {
      pushToast({ title: 'Unable to revoke invitation', description: getErrorMessage(error, 'Please try again.'), tone: 'error' });
    }
  }

  function resetInviteForm() {
    setInviteName('');
    setInviteEmail('');
    setInviteRole('VIEWER');
    setInviteMessage('');
  }

  async function handleSendInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/\S+@\S+\.\S+/.test(inviteEmail)) {
      pushToast({
        title: 'Email required',
        description: 'Enter a valid email address before sending an invitation.',
        tone: 'error',
      });
      return;
    }

    setSendingInvite(true);
    setInviteBanner(null);
    try {
      await authedFetchJson<TeamApiRecord>('/api/v1/team/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, generate_invite_link: true }),
      });
      await loadTeamData();
      setInviteBanner(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteBannerTone('success');
      pushToast({ title: 'Invitation sent', description: `${inviteEmail.trim()} has been added to pending invitations.`, tone: 'success' });
      resetInviteForm();
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to send the invitation.');
      const isPlanRestriction = error instanceof HttpError && error.status === 403;
      setInviteBanner(isPlanRestriction ? 'Team invitations require a Pro or Business plan.' : null);
      setInviteBannerTone('error');
      pushToast({
        title: isPlanRestriction ? 'Upgrade required' : 'Unable to send invitation',
        description: isPlanRestriction ? 'Team invitations require a Pro or Business plan.' : message,
        tone: 'error',
      });
    } finally {
      setSendingInvite(false);
    }
  }

  function renderSortLabel(label: string, key: SortKey) {
    const active = sortKey === key;
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="flex items-center gap-1 text-left transition-colors hover:text-slate-300"
      >
        <span>{label}</span>
        {active ? (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3" />}
      </button>
    );
  }

  if (isLoading && !hasLoaded) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5" style={{ color: THEME.text }}>
      <style>{`
        .team-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .team-scroll::-webkit-scrollbar-track { background: transparent; }
        .team-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.16); border-radius: 999px; }
      `}</style>

      {loadError ? (
        <div className="rounded-[7px] border px-3.5 py-2.5 text-[12px]" style={{ background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red }}>
          {loadError}
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.3px] text-white">Team Management</h1>
          <p className="mt-1 text-[12px]" style={{ color: THEME.textSoft }}>
            Manage workspace access with enterprise-ready roles, MFA enforcement, and full audit trails.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 xl:flex-nowrap">
          <button
            type="button"
            onClick={() => void resetPageState()}
            className="inline-flex whitespace-nowrap rounded-[7px] border px-3.25 py-1.75 text-[12px] font-semibold text-white transition-colors hover:bg-white/5"
            style={{ borderColor: THEME.borderStrong }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleImportCsv}
            className="inline-flex whitespace-nowrap rounded-[7px] border px-3.25 py-1.75 text-[12px] font-semibold text-white transition-colors hover:bg-white/5"
            style={{ borderColor: THEME.borderStrong }}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => void copyPageLink()}
            className="inline-flex whitespace-nowrap rounded-[7px] border px-3.25 py-1.75 text-[12px] font-semibold text-white transition-colors hover:bg-white/5"
            style={{ borderColor: THEME.borderStrong }}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Copy Link
          </button>
          <button
            type="button"
            onClick={() => {
              const form = document.getElementById('invite-member-form');
              form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="inline-flex whitespace-nowrap rounded-[7px] px-3.25 py-1.75 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: THEME.blue }}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </button>
        </div>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-[10px] border p-4" style={{ background: stat.bg, borderColor: stat.border }}>
              <div className="flex items-start justify-between">
                <div className="text-[10px] font-bold tracking-[0.08em]" style={{ color: stat.color, opacity: 0.8 }}>
                  {stat.label}
                </div>
                <Icon className="h-4.5 w-4.5" style={{ color: stat.color, opacity: 0.5 }} />
              </div>
              <div className="mt-3 font-mono text-[26px] font-extrabold" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="mt-1 text-[11px]" style={{ color: THEME.textSoft }}>
                {stat.description}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <SectionCard>
          <div className="border-b px-5 py-4" style={{ borderColor: THEME.border }}>
            <div className="flex flex-col gap-3.5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[15px] font-semibold text-white">
                  <Users className="h-4 w-4" style={{ color: THEME.blue }} />
                  Workspace Members
                </div>
                <p className="mt-1 text-[12px]" style={{ color: THEME.textSoft }}>
                  Structured access control for owners, admins, viewers, and auditors.
                </p>
              </div>
              <label
                className="flex w-full max-w-[320px] items-center gap-2 rounded-[7px] border px-3 py-2"
                style={{ background: THEME.panel, borderColor: THEME.border }}
              >
                <Search className="h-4 w-4" style={{ color: THEME.textSoft }} />
                <input
                  value={search}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                  placeholder="Search name, email, role..."
                  className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-slate-500"
                />
              </label>
            </div>

            <div className="mt-3.5 flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-2">
                {ROLE_FILTERS.map((item) => {
                  const active = roleFilter === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setRoleFilter(item)}
                      className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors"
                      style={
                        active
                          ? { background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.5)', color: '#A5B4FC' }
                          : { background: 'transparent', borderColor: THEME.border, color: THEME.textSoft }
                      }
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((item) => {
                  const active = statusFilter === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setStatusFilter(item)}
                      className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors"
                      style={
                        active
                          ? { background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.5)', color: '#A5B4FC' }
                          : { background: 'transparent', borderColor: THEME.border, color: THEME.textSoft }
                      }
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="hidden xl:block">
            <div
              className="grid grid-cols-[170px_210px_120px_100px_80px_140px_110px] gap-4 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ background: THEME.panel, borderBottom: `1px solid ${THEME.border}`, color: THEME.textSoft }}
            >
              <div>{renderSortLabel('Name', 'name')}</div>
              <div>{renderSortLabel('Email', 'email')}</div>
              <div>{renderSortLabel('Role', 'role')}</div>
              <div>Status</div>
              <div>MFA</div>
              <div>{renderSortLabel('Last Active', 'lastActive')}</div>
              <div>Actions</div>
            </div>

            <div>
              {filteredMembers.length === 0 ? (
                <div className="px-5 py-8 text-center text-[12px]" style={{ color: THEME.textSoft }}>
                  No workspace members match the current filters.
                </div>
              ) : filteredMembers.map((member) => (
                <div key={member.id} className="border-b" style={{ borderColor: THEME.border }}>
                  <div
                    className="grid min-h-14.5 grid-cols-[170px_210px_120px_100px_80px_140px_110px] gap-4 px-5 py-3 transition-colors hover:bg-white/2.5"
                  >
                    <div className="flex items-center gap-3">
                      <TeamAvatar initials={member.initials} role={member.role} />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-white">{member.name}</div>
                        {member.isCurrentUser ? (
                          <span
                            className="mt-1 inline-flex rounded-sm px-1.25 py-px text-[9px] font-semibold"
                            style={{ background: THEME.blueDim, color: '#A5B4FC' }}
                          >
                            YOU
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center font-mono text-[11px]" style={{ color: THEME.textSoft }}>
                      {member.email}
                    </div>

                    <div className="relative flex items-center">
                      <RoleBadge role={member.role} caret onClick={() => setOpenRoleMenuId((current) => (current === member.id ? null : member.id))} />
                      {openRoleMenuId === member.id ? (
                        <div
                          className="absolute left-0 top-9.5 z-20 min-w-42.5 rounded-[7px] border p-1 shadow-2xl"
                          style={{ background: THEME.cell, borderColor: THEME.borderStrong }}
                        >
                          {ROLE_ORDER.map((role) => (
                            <button
                              key={role}
                              type="button"
                              onClick={() => void changeMemberRole(member, role)}
                              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[11px] transition-colors hover:bg-white/5"
                            >
                              <span>{role}</span>
                              {member.role === role ? <Check className="h-3.5 w-3.5" style={{ color: THEME.green }} /> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center">
                      <span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold" style={styleForStatus(member.status)}>
                        <Dot color={member.status === 'ACTIVE' ? THEME.green : member.status === 'SUSPENDED' ? THEME.red : THEME.textSoft} />
                        {member.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[10px] font-semibold">
                      {member.mfa ? <ShieldCheck className="h-4 w-4" style={{ color: THEME.green }} /> : <ShieldAlert className="h-4 w-4" style={{ color: THEME.amber }} />}
                      <span style={{ color: member.mfa ? THEME.green : THEME.amber }}>{member.mfa ? 'ON' : 'OFF'}</span>
                    </div>

                    <div className="flex items-center font-mono text-[11px]" style={{ color: THEME.textSoft }}>
                      {member.lastActive}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenRoleMenuId((current) => (current === member.id ? null : member.id))}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors hover:bg-indigo-500/10 hover:text-indigo-300"
                        style={{ color: THEME.textSoft }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleMemberSuspended(member)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors"
                        style={{ color: THEME.textSoft }}
                        onMouseEnter={(event: MouseEvent<HTMLButtonElement>) => {
                          event.currentTarget.style.background = THEME.amberDim;
                          event.currentTarget.style.borderColor = THEME.amberBorder;
                          event.currentTarget.style.color = THEME.amber;
                        }}
                        onMouseLeave={(event: MouseEvent<HTMLButtonElement>) => {
                          event.currentTarget.style.background = 'transparent';
                          event.currentTarget.style.borderColor = 'transparent';
                          event.currentTarget.style.color = THEME.textSoft;
                        }}
                      >
                        <PauseCircle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoveConfirmId((current) => (current === member.id ? null : member.id))}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors"
                        style={{ color: THEME.textSoft }}
                        onMouseEnter={(event: MouseEvent<HTMLButtonElement>) => {
                          event.currentTarget.style.background = THEME.redDim;
                          event.currentTarget.style.borderColor = THEME.redBorder;
                          event.currentTarget.style.color = THEME.red;
                        }}
                        onMouseLeave={(event: MouseEvent<HTMLButtonElement>) => {
                          event.currentTarget.style.background = 'transparent';
                          event.currentTarget.style.borderColor = 'transparent';
                          event.currentTarget.style.color = THEME.textSoft;
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {removeConfirmId === member.id ? (
                    <div className="flex items-center justify-between gap-3 px-5 pb-3 text-[12px]">
                      <span style={{ color: THEME.textSoft }}>Remove {member.name}?</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRemoveConfirmId(null)}
                          className="rounded-[7px] border px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-white/5"
                          style={{ borderColor: THEME.border, color: THEME.text }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeMember(member)}
                          className="rounded-[7px] border px-3 py-1.5 text-[11px] font-semibold"
                          style={{ background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red }}
                        >
                          Confirm Remove
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3.5 p-3.5 xl:hidden">
            {filteredMembers.length === 0 ? (
              <div className="rounded-[10px] border px-4 py-7 text-center text-[12px]" style={{ background: THEME.panel, borderColor: THEME.border, color: THEME.textSoft }}>
                No workspace members match the current filters.
              </div>
            ) : filteredMembers.map((member) => (
              <div key={member.id} className="rounded-[10px] border p-3.5" style={{ background: THEME.panel, borderColor: THEME.border }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <TeamAvatar initials={member.initials} role={member.role} />
                    <div>
                      <div className="text-[13px] font-semibold text-white">{member.name}</div>
                      {member.isCurrentUser ? (
                        <span className="mt-1 inline-flex rounded-sm px-1.25 py-px text-[9px] font-semibold" style={{ background: THEME.blueDim, color: '#A5B4FC' }}>
                          YOU
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <RoleBadge role={member.role} />
                </div>

                <div className="mt-3 font-mono text-[11px]" style={{ color: THEME.textSoft }}>{member.email}</div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[7px] border px-3 py-2" style={{ background: THEME.cell, borderColor: THEME.border }}>
                    <div className="text-[10px] uppercase" style={{ color: THEME.textMuted }}>Status</div>
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold" style={styleForStatus(member.status)}>
                        <Dot color={member.status === 'ACTIVE' ? THEME.green : member.status === 'SUSPENDED' ? THEME.red : THEME.textSoft} />
                        {member.status}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-[7px] border px-3 py-2" style={{ background: THEME.cell, borderColor: THEME.border }}>
                    <div className="text-[10px] uppercase" style={{ color: THEME.textMuted }}>Last Active</div>
                    <div className="mt-2 font-mono text-[11px]" style={{ color: THEME.textSoft }}>{member.lastActive}</div>
                  </div>
                  <div className="rounded-[7px] border px-3 py-2" style={{ background: THEME.cell, borderColor: THEME.border }}>
                    <div className="text-[10px] uppercase" style={{ color: THEME.textMuted }}>MFA</div>
                    <div className="mt-2 flex items-center gap-2 font-mono text-[10px] font-semibold">
                      {member.mfa ? <ShieldCheck className="h-4 w-4" style={{ color: THEME.green }} /> : <ShieldAlert className="h-4 w-4" style={{ color: THEME.amber }} />}
                      <span style={{ color: member.mfa ? THEME.green : THEME.amber }}>{member.mfa ? 'ON' : 'OFF'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {ROLE_ORDER.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => void changeMemberRole(member, role)}
                      className="rounded-[7px] border px-2.5 py-1 text-[10px] font-semibold"
                      style={member.role === role ? styleForRole(role) : { borderColor: THEME.border, color: THEME.textSoft }}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setOpenRoleMenuId(member.id)} className="flex h-7 w-7 items-center justify-center rounded-md border" style={{ background: THEME.cell, borderColor: THEME.border }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => void toggleMemberSuspended(member)} className="flex h-7 w-7 items-center justify-center rounded-md border" style={{ background: THEME.amberDim, borderColor: THEME.amberBorder, color: THEME.amber }}>
                    <PauseCircle className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setRemoveConfirmId((current) => (current === member.id ? null : member.id))} className="flex h-7 w-7 items-center justify-center rounded-md border" style={{ background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {removeConfirmId === member.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                    <span style={{ color: THEME.textSoft }}>Remove {member.name}?</span>
                    <button type="button" onClick={() => setRemoveConfirmId(null)} className="rounded-[7px] border px-3 py-1.5 text-[11px]" style={{ borderColor: THEME.border, color: THEME.text }}>Cancel</button>
                    <button type="button" onClick={() => void removeMember(member)} className="rounded-[7px] border px-3 py-1.5 text-[11px]" style={{ background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red }}>Confirm Remove</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t px-5 py-3 text-[12px]" style={{ borderColor: THEME.border, color: THEME.textSoft }}>
            <span>Showing {filteredMembers.length} of {members.length} members</span>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-[7px] border px-3 py-1.5" style={{ borderColor: THEME.border }}>← Prev</button>
              <span className="rounded-[7px] border px-3 py-1.5 text-white" style={{ borderColor: THEME.borderStrong, background: THEME.panel }}>1</span>
              <button type="button" className="rounded-[7px] border px-3 py-1.5" style={{ borderColor: THEME.border }}>Next →</button>
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="border-b px-5 py-4" style={{ borderColor: THEME.border }}>
            <div className="flex items-center gap-2 text-[15px] font-semibold text-white">
              <UserPlus className="h-4 w-4" style={{ color: THEME.blue }} />
              Invite Member
            </div>
            <p className="mt-1 text-[12px]" style={{ color: THEME.textSoft }}>
              Send an invitation to join this workspace.
            </p>
          </div>

          <form id="invite-member-form" className="space-y-2.5 p-5" onSubmit={(event: FormEvent<HTMLFormElement>) => void handleSendInvitation(event)}>
            <div>
              <label className="mb-2 block text-[10px] font-semibold tracking-[0.08em]" style={{ color: THEME.textMuted }}>
                FULL NAME (OPTIONAL)
              </label>
              <input
                value={inviteName}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setInviteName(event.target.value)}
                placeholder="John Smith"
                className="w-full rounded-[7px] border px-3 py-2 text-[12px] text-white outline-none placeholder:text-slate-500"
                style={{ background: THEME.panel, borderColor: THEME.border }}
              />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-semibold tracking-[0.08em]" style={{ color: THEME.textMuted }}>
                EMAIL ADDRESS *
              </label>
              <input
                value={inviteEmail}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setInviteEmail(event.target.value)}
                placeholder="john@company.com"
                className="w-full rounded-[7px] border px-3 py-2 text-[12px] text-white outline-none placeholder:text-slate-500"
                style={{ background: THEME.panel, borderColor: THEME.border }}
              />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-semibold tracking-[0.08em]" style={{ color: THEME.textMuted }}>
                ROLE *
              </label>
              <div className="flex flex-wrap gap-2">
                {ROLE_ORDER.map((role) => {
                  const active = inviteRole === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setInviteRole(role)}
                      className="rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors"
                      style={active ? styleForRole(role) : { borderColor: THEME.border, color: THEME.textSoft }}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-semibold tracking-[0.08em]" style={{ color: THEME.textMuted }}>
                MESSAGE (OPTIONAL)
              </label>
              <textarea
                rows={2}
                value={inviteMessage}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setInviteMessage(event.target.value)}
                placeholder="Add a personal note to the invitation..."
                className="w-full resize-none rounded-[7px] border px-3 py-2 text-[12px] text-white outline-none placeholder:text-slate-500"
                style={{ background: THEME.panel, borderColor: THEME.border }}
              />
            </div>

            <button
              type="submit"
              disabled={sendingInvite}
              className="flex w-full items-center justify-center rounded-[7px] px-3 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-70"
              style={{ background: THEME.blue }}
            >
              <Send className="mr-2 h-4 w-4" />
              {sendingInvite ? 'Sending...' : 'Send Invitation'}
            </button>

            {inviteBanner ? (
              <div
                className="rounded-[7px] border px-3 py-2 text-[12px]"
                style={inviteBannerTone === 'success' ? { background: THEME.greenDim, borderColor: THEME.greenBorder, color: THEME.green } : { background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red }}
              >
                {inviteBannerTone === 'success' ? '✓' : '!'} {inviteBanner}
              </div>
            ) : null}

            <div className="rounded-[10px] border p-4" style={{ background: THEME.panel, borderColor: styleForTheme(previewConfig.color).borderColor }}>
              <div className="text-[14px] font-semibold text-white">{inviteRole}</div>
              <div className="mt-1 text-[12px]" style={{ color: THEME.textSoft }}>{previewConfig.description}</div>
              {Object.entries(previewConfig.groups).map(([group, permissions]) => (
                <div key={group} className="mt-2.5">
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em]" style={{ color: THEME.textMuted }}>
                    {group}
                  </div>
                  <div className="space-y-2">
                    {permissions.allowed.map((item) => (
                      <div key={`${group}-${item}-allowed`} className="flex items-center gap-2 text-[12px]" style={{ color: THEME.text }}>
                        <Dot color={THEME.green} />
                        <span>{item}</span>
                      </div>
                    ))}
                    {permissions.denied.map((item) => (
                      <div key={`${group}-${item}-denied`} className="flex items-center gap-2 text-[12px]" style={{ color: THEME.textSoft }}>
                        <Dot color="rgba(239,68,68,0.5)" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </form>
        </SectionCard>
      </div>

      <SectionCard>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: THEME.border }}>
          <div>
            <div className="flex items-center gap-2 text-[15px] font-semibold text-white">
              <Mail className="h-4 w-4" style={{ color: THEME.amber }} />
              Pending Invitations
            </div>
            <p className="mt-1 text-[12px]" style={{ color: THEME.textSoft }}>
              Awaiting acceptance — invitations expire after 7 days.
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-[10px] font-semibold" style={{ borderColor: THEME.border, color: THEME.textSoft }}>
            {pendingInvites.length} pending
          </span>
        </div>

        <div className="p-5">
          {pendingInvites.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[10px] border px-5 py-10 text-center" style={{ background: THEME.panel, borderColor: THEME.border }}>
              <Mail className="h-10 w-10" style={{ color: THEME.textMuted }} />
              <div className="mt-3 text-[14px] font-semibold text-white">No pending invitations.</div>
              <div className="mt-1 text-[12px]" style={{ color: THEME.textSoft }}>
                All sent invitations have been accepted or revoked.
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {pendingInvites.map((invite) => {
                const urgent = invite.daysLeft <= 2;
                const expired = invite.daysLeft < 0;
                return (
                  <div key={invite.id} className="rounded-lg border px-3.5 py-2.75" style={{ background: THEME.panel, borderColor: THEME.border }}>
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex items-center gap-3">
                        <TeamAvatar initials={invite.initials} role={invite.role} />
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[12px] text-white">{invite.email}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <RoleBadge role={invite.role} />
                            <span className="text-[11px]" style={{ color: THEME.textSoft }}>Sent: {invite.sentDate}</span>
                            <span className="text-[11px]" style={{ color: THEME.textSoft }}>Expires: {invite.expiresDate}</span>
                            <span className="inline-flex items-center gap-2 font-mono text-[11px]" style={{ color: expired ? THEME.red : urgent ? THEME.amber : THEME.textSoft }}>
                              <Dot color={expired ? THEME.red : urgent ? THEME.amber : THEME.textSoft} />
                              {expired ? 'Expired' : `${invite.daysLeft} days left`}
                            </span>
                            {expired ? (
                              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red }}>
                                EXPIRED
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleResendInvite(invite)}
                          className="inline-flex items-center rounded-[7px] border px-3 py-1.5 text-[11px] font-semibold transition-colors"
                          style={{ borderColor: THEME.border, color: resentInviteId === invite.id ? THEME.green : THEME.text }}
                        >
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          {resentInviteId === invite.id ? 'Sent!' : 'Resend'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevokeConfirmId((current) => (current === invite.id ? null : invite.id))}
                          className="inline-flex items-center rounded-[7px] border px-3 py-1.5 text-[11px] font-semibold"
                          style={{ borderColor: THEME.redBorder, background: THEME.redDim, color: THEME.red }}
                        >
                          <X className="mr-2 h-3.5 w-3.5" />
                          Revoke
                        </button>
                      </div>
                    </div>

                    {revokeConfirmId === invite.id ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                        <span style={{ color: THEME.textSoft }}>Revoke this invite?</span>
                        <button type="button" onClick={() => setRevokeConfirmId(null)} className="rounded-[7px] border px-3 py-1.5 text-[11px]" style={{ borderColor: THEME.border, color: THEME.text }}>Cancel</button>
                        <button type="button" onClick={() => void handleRevokeInvite(invite)} className="rounded-[7px] border px-3 py-1.5 text-[11px]" style={{ background: THEME.redDim, borderColor: THEME.redBorder, color: THEME.red }}>Confirm</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-3.5 xl:grid-cols-[2fr_1fr]">
        <SectionCard>
          <div className="border-b px-5 py-4" style={{ borderColor: THEME.border }}>
            <div className="flex items-center gap-2 text-[15px] font-semibold text-white">
              <Shield className="h-4 w-4" style={{ color: THEME.blue }} />
              Role Permissions Matrix
            </div>
            <p className="mt-1 text-[12px]" style={{ color: THEME.textSoft }}>
              Full comparison of all role capabilities.
            </p>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-190">
              <div
                className="grid grid-cols-[minmax(260px,1fr)_100px_100px_100px_100px] items-stretch gap-px"
                style={{ background: THEME.border }}
              >
                <div className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ background: THEME.panel, color: THEME.textSoft }}>
                  Permission
                </div>
                {ROLE_ORDER.map((role) => (
                  <div key={role} className="px-4 py-3 text-center" style={{ background: THEME.panel }}>
                    <div className="text-[12px] font-semibold text-white">{role}</div>
                    <div className="mt-2 flex justify-center">
                      <RoleBadge role={role} />
                    </div>
                  </div>
                ))}
              </div>

              {permissionMatrix.map((group, groupIndex) => (
                <div key={group.category}>
                  <div className="border-y px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ background: 'rgba(255,255,255,0.02)', borderColor: THEME.border, color: THEME.textSoft }}>
                    {group.category}
                  </div>
                  {group.rows.map(([label, allowedRoles], rowIndex) => {
                    const even = rowIndex % 2 === 1;
                    return (
                      <div
                        key={`${group.category}-${label}`}
                        className="grid grid-cols-[minmax(260px,1fr)_100px_100px_100px_100px] items-center border-b transition-colors hover:bg-white/3"
                        style={{ background: even ? 'rgba(255,255,255,0.015)' : 'transparent', borderColor: THEME.border }}
                      >
                        <div className="px-4 py-3 text-[12px]" style={{ color: THEME.text }}>{label}</div>
                        {ROLE_ORDER.map((role) => {
                          const allowed = (allowedRoles as readonly string[]).includes(role);
                          return (
                            <div key={`${groupIndex}-${label}-${role}`} className="flex justify-center px-4 py-3">
                              {allowed ? <Check className="h-4 w-4" style={{ color: THEME.green }} /> : <X className="h-4 w-4" style={{ color: 'rgba(239,68,68,0.4)' }} />}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: THEME.border }}>
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold text-white">
                <History className="h-4 w-4" style={{ color: THEME.cyan }} />
                Member Activity Log
              </div>
              <p className="mt-1 text-[12px]" style={{ color: THEME.textSoft }}>
                Recent actions by workspace members.
              </p>
            </div>
            <span className="rounded-full border px-3 py-1 text-[10px] font-semibold" style={{ borderColor: THEME.border, color: THEME.textSoft }}>
              Last 30 days
            </span>
          </div>

          <div className="team-scroll max-h-85 overflow-y-auto">
            {activities.length === 0 ? (
              <div className="px-5 py-8 text-center text-[12px]" style={{ color: THEME.textSoft }}>
                No team activity has been recorded yet.
              </div>
            ) : activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 border-b px-3 py-2.25" style={{ borderColor: THEME.border }}>
                <div
                  className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold"
                  style={styleForTheme(activity.theme)}
                >
                  {activity.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px]">
                    <span className="font-semibold text-white">{activity.actor}</span>{' '}
                    <span style={{ color: THEME.textSoft }}>{activity.action}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-[5px] border px-1.75 py-0.5 text-[10px]" style={{ background: 'rgba(255,255,255,0.05)', borderColor: THEME.border, color: THEME.text }}>
                      {activity.resource}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 font-mono text-[10px]" style={{ color: THEME.textSoft }}>
                  {activity.ts}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </motion.div>
  );
}
