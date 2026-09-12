import { useEffect, useState, type FormEvent } from 'react';
import { FormField } from '../components/FormField.js';
import { Checkbox } from '../components/Checkbox.js';
import { TextareaField } from '../components/TextareaField.js';
import { ApiError } from '../api/client.js';
import {
  useShopProfile,
  useUpdateShopProfile,
  DAYS_OF_WEEK,
  type DayOfWeek,
  type TradingHours,
  type UpdateShopProfileInput,
} from '../api/shopProfile.js';
import { omitBlankFields } from '../lib/omitBlankFields.js';

// shopServices/shopGalleryUrls are edited as one textarea each (one entry per
// line) rather than a dynamic add/remove-row UI -- the design spec calls that
// unnecessary complexity for a list this small. They're split into arrays on
// save and joined back into text when the profile loads.
interface FormState {
  shopSlug: string;
  shopTagline: string;
  shopServicesText: string;
  shopHoursText: string;
  shopGalleryUrlsText: string;
  shopContactWhatsapp: string;
  shopIsPublished: boolean;
  shopAboutText: string;
  shopAvailability: string;
  shopGoogleReviewsUrl: string;
  shopTradingHours: TradingHours;
  shopFacebookUrl: string;
  shopInstagramUrl: string;
  shopTwitterUrl: string;
  shopTiktokUrl: string;
  shopYoutubeUrl: string;
  shopLinkedinUrl: string;
  shopDiscordUrl: string;
  shopCults3dUrl: string;
  shopPrintablesUrl: string;
  shopThingiverseUrl: string;
  shopMakerworldUrl: string;
  shopThangsUrl: string;
  shopCrealityCloudUrl: string;
  shopGrabcadUrl: string;
}

// shopSlug's server schema (`.min(3).regex(...).optional()`) rejects '' outright,
// unlike shopTagline/shopHoursText/shopContactWhatsapp which use plain
// `.trim().optional()` and accept '' fine -- same reasoning as
// CompanyProfilePage's OMIT_WHEN_BLANK list. The 14 social/marketplace URL
// fields and shopGoogleReviewsUrl use `.url().optional().or(z.literal(''))`,
// which accepts '' too (that's how a link gets cleared), so none of them need
// to be listed here either.
const OMIT_WHEN_BLANK: (keyof UpdateShopProfileInput)[] = ['shopSlug'];

function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function defaultTradingHours(): TradingHours {
  const result = {} as TradingHours;
  for (const day of DAYS_OF_WEEK) {
    result[day] = { open: false, start: '09:00', end: '17:00' };
  }
  return result;
}

// Fills in any day missing from the loaded profile (e.g. a shop that never
// set trading hours at all, or set only some days) so the form always has a
// complete 7-day object to render and submit.
function normalizeTradingHours(loaded: Partial<TradingHours> | null | undefined): TradingHours {
  const result = defaultTradingHours();
  if (loaded) {
    for (const day of DAYS_OF_WEEK) {
      const value = loaded[day];
      if (value) {
        result[day] = value;
      }
    }
  }
  return result;
}

function dayLabel(day: DayOfWeek): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

export function ShopProfilePage() {
  const { data: profile, isLoading, isError } = useShopProfile();
  const updateMutation = useUpdateShopProfile();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile && !form) {
      setForm({
        shopSlug: profile.shopSlug ?? '',
        shopTagline: profile.shopTagline ?? '',
        shopServicesText: profile.shopServices.join('\n'),
        shopHoursText: profile.shopHoursText ?? '',
        shopGalleryUrlsText: profile.shopGalleryUrls.join('\n'),
        shopContactWhatsapp: profile.shopContactWhatsapp ?? '',
        shopIsPublished: profile.shopIsPublished,
        shopAboutText: profile.shopAboutText ?? '',
        shopAvailability: profile.shopAvailability ?? '',
        shopGoogleReviewsUrl: profile.shopGoogleReviewsUrl ?? '',
        shopTradingHours: normalizeTradingHours(profile.shopTradingHours),
        shopFacebookUrl: profile.shopFacebookUrl ?? '',
        shopInstagramUrl: profile.shopInstagramUrl ?? '',
        shopTwitterUrl: profile.shopTwitterUrl ?? '',
        shopTiktokUrl: profile.shopTiktokUrl ?? '',
        shopYoutubeUrl: profile.shopYoutubeUrl ?? '',
        shopLinkedinUrl: profile.shopLinkedinUrl ?? '',
        shopDiscordUrl: profile.shopDiscordUrl ?? '',
        shopCults3dUrl: profile.shopCults3dUrl ?? '',
        shopPrintablesUrl: profile.shopPrintablesUrl ?? '',
        shopThingiverseUrl: profile.shopThingiverseUrl ?? '',
        shopMakerworldUrl: profile.shopMakerworldUrl ?? '',
        shopThangsUrl: profile.shopThangsUrl ?? '',
        shopCrealityCloudUrl: profile.shopCrealityCloudUrl ?? '',
        shopGrabcadUrl: profile.shopGrabcadUrl ?? '',
      });
    }
  }, [profile, form]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  function setTradingHoursDay(day: DayOfWeek, patch: Partial<TradingHours[DayOfWeek]>) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            shopTradingHours: {
              ...prev.shopTradingHours,
              [day]: { ...prev.shopTradingHours[day], ...patch },
            },
          }
        : prev,
    );
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaved(false);
    const payload: UpdateShopProfileInput = {
      shopSlug: form.shopSlug,
      shopTagline: form.shopTagline,
      shopServices: linesToArray(form.shopServicesText),
      shopHoursText: form.shopHoursText,
      shopGalleryUrls: linesToArray(form.shopGalleryUrlsText),
      shopContactWhatsapp: form.shopContactWhatsapp,
      shopIsPublished: form.shopIsPublished,
      shopAboutText: form.shopAboutText,
      shopAvailability: form.shopAvailability,
      shopGoogleReviewsUrl: form.shopGoogleReviewsUrl,
      shopTradingHours: form.shopTradingHours,
      shopFacebookUrl: form.shopFacebookUrl,
      shopInstagramUrl: form.shopInstagramUrl,
      shopTwitterUrl: form.shopTwitterUrl,
      shopTiktokUrl: form.shopTiktokUrl,
      shopYoutubeUrl: form.shopYoutubeUrl,
      shopLinkedinUrl: form.shopLinkedinUrl,
      shopDiscordUrl: form.shopDiscordUrl,
      shopCults3dUrl: form.shopCults3dUrl,
      shopPrintablesUrl: form.shopPrintablesUrl,
      shopThingiverseUrl: form.shopThingiverseUrl,
      shopMakerworldUrl: form.shopMakerworldUrl,
      shopThangsUrl: form.shopThangsUrl,
      shopCrealityCloudUrl: form.shopCrealityCloudUrl,
      shopGrabcadUrl: form.shopGrabcadUrl,
    };
    try {
      await updateMutation.mutateAsync(omitBlankFields(payload, OMIT_WHEN_BLANK));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isError) {
    return <p className="text-red-600">Couldn't load the shop profile. Try refreshing the page.</p>;
  }

  if (isLoading || !form) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold text-slate-900">Shop Profile</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Public page</h2>
        <Checkbox
          id="shopIsPublished"
          label="Publish this page"
          checked={form.shopIsPublished}
          onChange={(checked) => set('shopIsPublished', checked)}
        />
        <FormField
          id="shopSlug"
          label="URL slug"
          value={form.shopSlug}
          onChange={(e) => set('shopSlug', e.target.value)}
        />
        <p className="text-sm text-slate-500">
          Your public page: barkie.co.za/shop/{form.shopSlug || '…'}
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">About your shop</h2>
        <FormField
          id="shopTagline"
          label="Tagline"
          value={form.shopTagline}
          onChange={(e) => set('shopTagline', e.target.value)}
        />
        <TextareaField
          id="shopAboutText"
          label="About your shop"
          value={form.shopAboutText}
          onChange={(value) => set('shopAboutText', value)}
        />
        <FormField
          id="shopAvailability"
          label="Availability"
          value={form.shopAvailability}
          onChange={(e) => set('shopAvailability', e.target.value)}
        />
        <TextareaField
          id="shopServicesText"
          label="Services (one per line)"
          value={form.shopServicesText}
          onChange={(value) => set('shopServicesText', value)}
        />
        <TextareaField
          id="shopHoursText"
          label="Opening hours"
          value={form.shopHoursText}
          onChange={(value) => set('shopHoursText', value)}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Trading hours</h2>
        {DAYS_OF_WEEK.map((day) => {
          const dayHours = form.shopTradingHours[day];
          return (
            <div key={day} className="flex flex-wrap items-center gap-4">
              <span className="w-24 text-sm font-medium text-slate-700">{dayLabel(day)}</span>
              <Checkbox
                id={`shopTradingHours-${day}-open`}
                label="Open"
                checked={dayHours.open}
                onChange={(checked) => setTradingHoursDay(day, { open: checked })}
              />
              <FormField
                id={`shopTradingHours-${day}-start`}
                label="From"
                type="time"
                value={dayHours.start}
                onChange={(e) => setTradingHoursDay(day, { start: e.target.value })}
              />
              <FormField
                id={`shopTradingHours-${day}-end`}
                label="To"
                type="time"
                value={dayHours.end}
                onChange={(e) => setTradingHoursDay(day, { end: e.target.value })}
              />
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Gallery &amp; contact</h2>
        <TextareaField
          id="shopGalleryUrlsText"
          label="Gallery image URLs (one per line)"
          value={form.shopGalleryUrlsText}
          onChange={(value) => set('shopGalleryUrlsText', value)}
        />
        <FormField
          id="shopContactWhatsapp"
          label="WhatsApp contact"
          value={form.shopContactWhatsapp}
          onChange={(e) => set('shopContactWhatsapp', e.target.value)}
        />
        <FormField
          id="shopGoogleReviewsUrl"
          label="Google reviews link"
          value={form.shopGoogleReviewsUrl}
          onChange={(e) => set('shopGoogleReviewsUrl', e.target.value)}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Social media</h2>
        <FormField
          id="shopFacebookUrl"
          label="Facebook"
          value={form.shopFacebookUrl}
          onChange={(e) => set('shopFacebookUrl', e.target.value)}
        />
        <FormField
          id="shopInstagramUrl"
          label="Instagram"
          value={form.shopInstagramUrl}
          onChange={(e) => set('shopInstagramUrl', e.target.value)}
        />
        <FormField
          id="shopTwitterUrl"
          label="X / Twitter"
          value={form.shopTwitterUrl}
          onChange={(e) => set('shopTwitterUrl', e.target.value)}
        />
        <FormField
          id="shopTiktokUrl"
          label="TikTok"
          value={form.shopTiktokUrl}
          onChange={(e) => set('shopTiktokUrl', e.target.value)}
        />
        <FormField
          id="shopYoutubeUrl"
          label="YouTube"
          value={form.shopYoutubeUrl}
          onChange={(e) => set('shopYoutubeUrl', e.target.value)}
        />
        <FormField
          id="shopLinkedinUrl"
          label="LinkedIn"
          value={form.shopLinkedinUrl}
          onChange={(e) => set('shopLinkedinUrl', e.target.value)}
        />
        <FormField
          id="shopDiscordUrl"
          label="Discord"
          value={form.shopDiscordUrl}
          onChange={(e) => set('shopDiscordUrl', e.target.value)}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Model marketplaces</h2>
        <FormField
          id="shopCults3dUrl"
          label="Cults3D"
          value={form.shopCults3dUrl}
          onChange={(e) => set('shopCults3dUrl', e.target.value)}
        />
        <FormField
          id="shopPrintablesUrl"
          label="Printables"
          value={form.shopPrintablesUrl}
          onChange={(e) => set('shopPrintablesUrl', e.target.value)}
        />
        <FormField
          id="shopThingiverseUrl"
          label="Thingiverse"
          value={form.shopThingiverseUrl}
          onChange={(e) => set('shopThingiverseUrl', e.target.value)}
        />
        <FormField
          id="shopMakerworldUrl"
          label="MakerWorld"
          value={form.shopMakerworldUrl}
          onChange={(e) => set('shopMakerworldUrl', e.target.value)}
        />
        <FormField
          id="shopThangsUrl"
          label="Thangs"
          value={form.shopThangsUrl}
          onChange={(e) => set('shopThangsUrl', e.target.value)}
        />
        <FormField
          id="shopCrealityCloudUrl"
          label="Creality Cloud"
          value={form.shopCrealityCloudUrl}
          onChange={(e) => set('shopCrealityCloudUrl', e.target.value)}
        />
        <FormField
          id="shopGrabcadUrl"
          label="GrabCAD"
          value={form.shopGrabcadUrl}
          onChange={(e) => set('shopGrabcadUrl', e.target.value)}
        />
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={updateMutation.isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
