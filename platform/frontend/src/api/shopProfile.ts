import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from './client.js';

export interface ShopProfile {
  shopSlug: string | null;
  shopTagline: string | null;
  shopServices: string[];
  shopHoursText: string | null;
  shopGalleryUrls: string[];
  shopContactWhatsapp: string | null;
  shopIsPublished: boolean;
}

export type UpdateShopProfileInput = Partial<ShopProfile>;

const SHOP_PROFILE_QUERY_KEY = ['shopProfile'] as const;

export function useShopProfile() {
  return useQuery({
    queryKey: SHOP_PROFILE_QUERY_KEY,
    queryFn: () => apiGet<{ shopProfile: ShopProfile }>('/api/shop-profile').then((r) => r.shopProfile),
  });
}

export function useUpdateShopProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateShopProfileInput) =>
      apiPatch<{ shopProfile: ShopProfile }>('/api/shop-profile', data).then((r) => r.shopProfile),
    onSuccess: (shopProfile) => {
      queryClient.setQueryData(SHOP_PROFILE_QUERY_KEY, shopProfile);
    },
  });
}
