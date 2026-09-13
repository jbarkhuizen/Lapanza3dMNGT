import { useState, type FormEvent } from 'react';
import { FormField } from '../../components/FormField.js';
import { ApiError } from '../../api/client.js';
import {
  useTeamMembers,
  useInviteTeamMember,
  useUpdateTeamMember,
  useDeleteTeamMember,
  type TeamMember,
  type TeamMemberRole,
} from '../../api/team.js';

const MAX_ACTIVE_TEAM_MEMBERS = 3;

function TeamMemberRow({ member }: { member: TeamMember }) {
  const updateMutation = useUpdateTeamMember(member.id);
  const deleteMutation = useDeleteTeamMember();
  const [error, setError] = useState<string | null>(null);

  async function handleToggleActive() {
    setError(null);
    try {
      await updateMutation.mutateAsync({ active: !member.active });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  async function handleRoleChange(role: TeamMemberRole) {
    setError(null);
    try {
      await updateMutation.mutateAsync({ role });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  async function handleDelete() {
    setError(null);
    try {
      await deleteMutation.mutateAsync(member.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <tr className="border-b border-slate-100">
      <td className="py-2">{member.name}</td>
      <td className="py-2">{member.email}</td>
      <td className="py-2">
        <select
          value={member.role}
          onChange={(e) => handleRoleChange(e.target.value as TeamMemberRole)}
          disabled={updateMutation.isPending}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="sales">Sales</option>
          <option value="admin">Admin</option>
        </select>
      </td>
      <td className="py-2">
        {member.active ? (member.hasSetPassword ? 'Active' : 'Invited') : 'Deactivated'}
      </td>
      <td className="py-2 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={updateMutation.isPending}
            className="text-sm text-slate-600 underline disabled:opacity-50"
          >
            {member.active ? 'Deactivate' : 'Reactivate'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="text-sm text-red-600 underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

export function TeamPage() {
  const { data: teamMembers, isLoading, isError } = useTeamMembers();
  const inviteMutation = useInviteTeamMember();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamMemberRole>('sales');
  const [error, setError] = useState<string | null>(null);

  const activeCount = (teamMembers ?? []).filter((member) => member.active).length;
  const atCap = activeCount >= MAX_ACTIVE_TEAM_MEMBERS;

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await inviteMutation.mutateAsync({ name, email, role });
      setName('');
      setEmail('');
      setRole('sales');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Team</h1>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            disabled={atCap}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add member
          </button>
          <span className="text-xs text-slate-500">
            {activeCount} of {MAX_ACTIVE_TEAM_MEMBERS} active members
          </span>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleInvite} className="flex max-w-md flex-col gap-3 rounded border border-slate-200 bg-white p-4">
          <FormField id="team-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <FormField id="team-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="team-role" className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Role
            <select
              id="team-role"
              value={role}
              onChange={(e) => setRole(e.target.value as TeamMemberRole)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="sales">Sales</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={inviteMutation.isPending}
            className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send invite
          </button>
        </form>
      )}

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load team members. Try refreshing the page.</p>}
      {!isLoading && !isError && teamMembers?.length === 0 && <p className="text-slate-500">No team members yet.</p>}
      {!isLoading && !isError && teamMembers && teamMembers.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {teamMembers.map((member) => (
              <TeamMemberRow key={member.id} member={member} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
