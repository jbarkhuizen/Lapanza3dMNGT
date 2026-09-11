import { useEffect, useState, type FormEvent } from 'react';
import { FormField } from '../components/FormField.js';
import { Checkbox } from '../components/Checkbox.js';
import { TextareaField } from '../components/TextareaField.js';
import { ApiError } from '../api/client.js';
import { useShopProfile, useUpdateShopProfile, type UpdateShopProfileInput } from '../api/shopProfile.js';
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
}

// shopSlug's server schema (`.min(3).regex(...).optional()`) rejects '' outright,
// unlike shopTagline/shopHoursText/shopContactWhatsapp which use plain
// `.trim().optional()` and accept '' fine -- same reasoning as
// CompanyProfilePage's OMIT_WHEN_BLANK list.
const OMIT_WHEN_BLANK: (keyof UpdateShopProfileInput)[] = ['shopSlug'];

function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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
      });
    }
  }, [profile, form]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
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
