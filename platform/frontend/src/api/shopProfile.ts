import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from './client.js';

export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export interface TradingHoursDay {
  open: boolean;
  start: string;
  end: string;
}

export type TradingHours = Record<DayOfWeek, TradingHoursDay>;

export interface ShopProfile {
  shopSlug: string | null;
  shopTagline: string | null;
  shopServices: string[];
  shopHoursText: string | null;
  shopGalleryUrls: string[];
  shopContactWhatsapp: string | null;
  shopIsPublished: boolean;
  shopAboutText: string | null;
  shopAvailability: string | null;
  shopGoogleReviewsUrl: string | null;
  shopTradingHours: Partial<TradingHours> | null;
  shopFacebookUrl: string | null;
  shopInstagramUrl: string | null;
  shopTwitterUrl: string | null;
  shopTiktokUrl: string | null;
  shopYoutubeUrl: string | null;
  shopLinkedinUrl: string | null;
  shopDiscordUrl: string | null;
  shopCults3dUrl: string | null;
  shopPrintablesUrl: string | null;
  shopThingiverseUrl: string | null;
  shopMakerworldUrl: string | null;
  shopThangsUrl: string | null;
  shopCrealityCloudUrl: string | null;
  shopGrabcadUrl: string | null;
}

export type UpdateShopProfileInput = Partial<Omit<ShopProfile, 'shopTradingHours'>> & {
  shopTradingHours?: Partial<TradingHours>;
};

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
