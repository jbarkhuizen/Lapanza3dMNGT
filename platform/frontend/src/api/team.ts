import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export type TeamMemberRole = 'admin' | 'sales';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamMemberRole;
  active: boolean;
  hasSetPassword: boolean;
  createdAt: string;
}

export interface InviteTeamMemberInput {
  name: string;
  email: string;
  role: TeamMemberRole;
}

export interface UpdateTeamMemberInput {
  active?: boolean;
  role?: TeamMemberRole;
}

const TEAM_QUERY_KEY = ['team'] as const;

export function useTeamMembers() {
  return useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: () => apiGet<{ teamMembers: TeamMember[] }>('/api/team').then((r) => r.teamMembers),
  });
}

export function useInviteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteTeamMemberInput) =>
      apiPost<{ teamMember: TeamMember }>('/api/team/invite', data).then((r) => r.teamMember),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
    },
  });
}

export function useUpdateTeamMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTeamMemberInput) => apiPatch(`/api/team/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
    },
  });
}

export function useDeleteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/team/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
    },
  });
}
