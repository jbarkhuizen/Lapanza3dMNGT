import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client.js';

export type FeatureRequestCategory = 'new_feature' | 'workflow' | 'bug';
export type FeatureRequestStatus = 'new' | 'planned' | 'in_progress' | 'done' | 'declined';

// This tenant's own submission -- includes everything, since it's their own data.
export interface MyFeatureRequest {
  id: string;
  category: FeatureRequestCategory;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  createdAt: string;
}

// A row from the shared community list. Deliberately has no `tenantId` (or
// anything else identifying who submitted it) -- the backend never sends
// one, see platform/api/src/db/scoped.ts's `featureRequests.findAll`.
export interface CommunityFeatureRequest {
  id: string;
  category: FeatureRequestCategory;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  createdAt: string;
  voteCount: number;
  hasVoted: boolean;
}

export interface SubmitFeatureRequestInput {
  category: FeatureRequestCategory;
  title: string;
  description: string;
}

const MY_FEATURE_REQUESTS_QUERY_KEY = ['featureRequests', 'mine'] as const;
const COMMUNITY_FEATURE_REQUESTS_QUERY_KEY = ['featureRequests', 'community'] as const;

export function useMyFeatureRequests() {
  return useQuery({
    queryKey: MY_FEATURE_REQUESTS_QUERY_KEY,
    queryFn: () =>
      apiGet<{ featureRequests: MyFeatureRequest[] }>('/api/feature-requests/mine').then((r) => r.featureRequests),
  });
}

export function useCommunityFeatureRequests(sort: 'votes' | 'recent') {
  return useQuery({
    queryKey: [...COMMUNITY_FEATURE_REQUESTS_QUERY_KEY, { sort }],
    queryFn: () =>
      apiGet<{ featureRequests: CommunityFeatureRequest[] }>(`/api/feature-requests?sort=${sort}`).then(
        (r) => r.featureRequests,
      ),
  });
}

export function useSubmitFeatureRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SubmitFeatureRequestInput) =>
      apiPost<{ featureRequest: MyFeatureRequest }>('/api/feature-requests', data).then((r) => r.featureRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_FEATURE_REQUESTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: COMMUNITY_FEATURE_REQUESTS_QUERY_KEY });
    },
  });
}

export function useToggleFeatureRequestVote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ voteCount: number; hasVoted: boolean }>(`/api/feature-requests/${id}/vote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMUNITY_FEATURE_REQUESTS_QUERY_KEY });
    },
  });
}
