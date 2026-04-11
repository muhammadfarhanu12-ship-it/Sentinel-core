import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Link2, Mail, Shield, Trash2, UserPlus, Users } from 'lucide-react';

import { EmptyState } from '../components/enterprise/EmptyState';
import { LoadingSkeleton } from '../components/enterprise/LoadingSkeleton';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/ToastProvider';
import { getErrorMessage } from '../lib/errors';
import { useStore } from '../stores/useStore';
import type { TeamInvitePayload, TeamMember, TeamRole } from '../types';

const ROLE_PERMISSIONS: Record<TeamRole, string[]> = {
  OWNER: ['View logs', 'Manage billing', 'Delete API keys', 'Manage workspace members'],
  ADMIN: ['View logs', 'Rotate API keys', 'Invite teammates', 'Manage security settings'],
  VIEWER: ['View logs', 'View analytics', 'Review audit trails', 'Cannot delete API keys'],
};

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value);
}

function readValue(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  return event.target.value;
}

export default function TeamManagement() {
  const teamMembers = useStore((state) => state.teamMembers);
  const teamLoading = useStore((state) => state.teamLoading);
  const fetchTeamMembers = useStore((state) => state.fetchTeamMembers);
  const inviteTeamMember = useStore((state) => state.inviteTeamMember);
  const updateTeamMemberRole = useStore((state) => state.updateTeamMemberRole);
  const removeTeamMember = useStore((state) => state.removeTeamMember);
  const { pushToast } = useToast();

  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('VIEWER');
  const [generateInviteLink, setGenerateInviteLink] = useState(true);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    try {
      setError(null);
      await fetchTeamMembers();
    } catch (loadError) {
      const message = getErrorMessage(loadError, 'Unable to load the workspace team.');
      setError(message);
      pushToast({
        title: 'Team management unavailable',
        description: message,
        tone: 'error',
      });
    }
  }, [fetchTeamMembers, pushToast]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  const filteredMembers = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return teamMembers;
    return teamMembers.filter((member) =>
      `${member.name} ${member.email} ${member.role} ${member.status}`.toLowerCase().includes(query),
    );
  }, [deferredSearch, teamMembers]);

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidEmail(inviteEmail)) {
      pushToast({
        title: 'Valid email required',
        description: 'Enter a valid business email before sending an invite.',
        tone: 'error',
      });
      return;
    }

    setSubmittingInvite(true);
    try {
      const payload: TeamInvitePayload = {
        email: inviteEmail.trim(),
        role: inviteRole,
        generateInviteLink,
      };
      const member = await inviteTeamMember(payload);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('VIEWER');
      setGenerateInviteLink(true);
      pushToast({
        title: 'Invitation sent',
        description: member.invite_link
          ? `Temporary invite link generated for ${member.email}.`
          : `Invitation queued for ${member.email}.`,
        tone: 'success',
      });
    } catch (inviteError) {
      pushToast({
        title: 'Invite failed',
        description: getErrorMessage(inviteError, 'Unable to invite teammate right now.'),
        tone: 'error',
      });
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRoleChange = async (member: TeamMember, nextRole: TeamRole) => {
    if (member.role === nextRole) return;
    setChangingRoleId(member.id);
    try {
      await updateTeamMemberRole(member.id, nextRole);
      pushToast({
        title: 'Role updated',
        description: `${member.email} is now ${nextRole}.`,
        tone: 'success',
      });
    } catch (roleError) {
      pushToast({
        title: 'Role update failed',
        description: getErrorMessage(roleError, 'Unable to update teammate role.'),
        tone: 'error',
      });
    } finally {
      setChangingRoleId(null);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.email} from the workspace?`)) return;
    setRemovingId(member.id);
    try {
      await removeTeamMember(member.id);
      pushToast({
        title: 'Team member removed',
        description: `${member.email} no longer has workspace access.`,
        tone: 'success',
      });
    } catch (removeError) {
      pushToast({
        title: 'Remove failed',
        description: getErrorMessage(removeError, 'Unable to remove teammate right now.'),
        tone: 'error',
      });
    } finally {
      setRemovingId(null);
    }
  };

  if (teamLoading && teamMembers.length === 0) {
    return <LoadingSkeleton rows={3} compact />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
          <p className="mt-1 max-w-2xl text-slate-400">
            Manage workspace access with enterprise-ready roles for owners, admins, and read-only viewers.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="text-slate-200" onClick={() => void loadTeam()}>
            Refresh team
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.9fr]">
        <Card className="border-white/5 bg-slate-900/40">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Workspace Members</CardTitle>
              <CardDescription>Owners retain full control, admins operate day-to-day, viewers stay informed.</CardDescription>
            </div>
            <input
              type="text"
              placeholder="Search name, email, role..."
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(readValue(event))}
              className="w-full max-w-xs rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            />
          </CardHeader>
          <CardContent>
            {error ? <div className="mb-4 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-200">{error}</div> : null}

            {filteredMembers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="No teammates found"
                description="Invite security engineers, compliance reviewers, or executive viewers to collaborate in Sentinel."
                action={
                  <Button onClick={() => setInviteOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite Member
                  </Button>
                }
              />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-2xl border border-white/5 lg:block">
                  <div className="grid grid-cols-[1fr_1.1fr_0.8fr_0.7fr_0.95fr] gap-4 bg-slate-950/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Role</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  <div className="divide-y divide-white/5">
                    {filteredMembers.map((member) => (
                      <div key={member.id} className="grid grid-cols-[1fr_1.1fr_0.8fr_0.7fr_0.95fr] gap-4 px-5 py-4">
                        <div>
                          <div className="font-medium text-slate-100">{member.name}</div>
                          {member.invite_link ? (
                            <div className="mt-1 flex items-center gap-1 text-xs text-indigo-300">
                              <Link2 className="h-3 w-3" />
                              Temporary invite link ready
                            </div>
                          ) : null}
                        </div>
                        <div className="text-sm text-slate-300">{member.email}</div>
                        <div>
                          <select
                            value={member.role}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) => void handleRoleChange(member, readValue(event) as TeamRole)}
                            disabled={changingRoleId === member.id}
                            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
                          >
                            <option value="OWNER">Owner</option>
                            <option value="ADMIN">Admin</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                        </div>
                        <div>
                          <Badge variant={member.status === 'ACTIVE' ? 'clean' : 'warning'}>{member.status}</Badge>
                        </div>
                        <div className="flex items-center justify-end">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleRemove(member)}
                            disabled={removingId === member.id}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 lg:hidden">
                  {filteredMembers.map((member) => (
                    <div key={member.id} className="rounded-2xl border border-white/10 bg-slate-900/35 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-50">{member.name}</div>
                          <div className="mt-1 text-sm text-slate-400">{member.email}</div>
                        </div>
                        <Badge variant={member.status === 'ACTIVE' ? 'clean' : 'warning'}>{member.status}</Badge>
                      </div>
                      <div className="mt-4 grid gap-3">
                        <select
                          value={member.role}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) => void handleRoleChange(member, readValue(event) as TeamRole)}
                          disabled={changingRoleId === member.id}
                          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
                        >
                          <option value="OWNER">Owner</option>
                          <option value="ADMIN">Admin</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                        <Button
                          variant="destructive"
                          onClick={() => void handleRemove(member)}
                          disabled={removingId === member.id}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove Member
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-slate-900/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-300" />
              Permission Preview
            </CardTitle>
            <CardDescription>Role scope updates live as you prepare the invite.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
              <div className="text-sm font-semibold text-slate-50">{inviteRole}</div>
              <div className="mt-1 text-sm text-slate-400">
                {inviteRole === 'OWNER'
                  ? 'Full workspace control for executive administrators.'
                  : inviteRole === 'ADMIN'
                    ? 'Operational control for security and platform teams.'
                    : 'Read-only visibility for analysts and auditors.'}
              </div>
            </div>
            <div className="space-y-3">
              {ROLE_PERMISSIONS[inviteRole].map((permission) => (
                <div key={permission} className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-3 py-3 text-sm text-slate-300">
                  <span className={`h-2.5 w-2.5 rounded-full ${permission.includes('Cannot') ? 'bg-red-400' : 'bg-clean'}`} />
                  <span>{permission}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite Team Member"
        description="Grant access to your Sentinel workspace with the minimum role required."
      >
        <form className="space-y-5" onSubmit={handleInvite}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setInviteEmail(readValue(event))}
                placeholder="security.lead@company.com"
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Role</label>
            <select
              value={inviteRole}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setInviteRole(readValue(event) as TeamRole)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            >
              <option value="OWNER">Owner</option>
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setGenerateInviteLink((current) => !current)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-left"
          >
            <div>
              <div className="text-sm font-semibold text-slate-100">Generate Temporary Invite Link</div>
              <div className="mt-1 text-sm text-slate-400">Useful for secure handoff during onboarding.</div>
            </div>
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full ${generateInviteLink ? 'bg-indigo-600' : 'bg-slate-700'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${generateInviteLink ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
          </button>

          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
            <div className="text-sm font-semibold text-slate-50">{inviteRole} permissions</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              {ROLE_PERMISSIONS[inviteRole].map((permission) => (
                <div key={permission}>{permission.includes('Cannot') ? '[No]' : '[Yes]'} {permission}</div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submittingInvite}>
              <UserPlus className="mr-2 h-4 w-4" />
              {submittingInvite ? 'Sending Invite...' : 'Invite User'}
            </Button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}
