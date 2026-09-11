import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export interface Notification {
  id: string;
  tenantId: string;
  type: string;
  message: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  createdAt: string;
}

const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

export function useNotifications(unreadOnly?: boolean) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, { unreadOnly: unreadOnly ?? false }],
    queryFn: () =>
      apiGet<{ notifications: Notification[] }>(
        unreadOnly ? '/api/notifications?unreadOnly=true' : '/api/notifications',
      ).then((r) => r.notifications),
  });
}

export function useMarkNotificationRead(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPatch<{ notification: Notification }>(`/api/notifications/${id}/read`).then((r) => r.notification),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ count: number }>('/api/notifications/mark-all-read').then((r) => r.count),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}
