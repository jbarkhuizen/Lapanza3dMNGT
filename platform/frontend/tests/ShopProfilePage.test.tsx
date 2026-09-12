import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ShopProfilePage } from '../src/pages/ShopProfilePage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

const baseProfile = {
  shopSlug: null,
  shopTagline: null,
  shopServices: [],
  shopHoursText: null,
  shopGalleryUrls: [],
  shopContactWhatsapp: null,
  shopIsPublished: false,
  shopAboutText: null,
  shopAvailability: null,
  shopGoogleReviewsUrl: null,
  shopTradingHours: null,
  shopFacebookUrl: null,
  shopInstagramUrl: null,
  shopTwitterUrl: null,
  shopTiktokUrl: null,
  shopYoutubeUrl: null,
  shopLinkedinUrl: null,
  shopDiscordUrl: null,
  shopCults3dUrl: null,
  shopPrintablesUrl: null,
  shopThingiverseUrl: null,
  shopMakerworldUrl: null,
  shopThangsUrl: null,
  shopCrealityCloudUrl: null,
  shopGrabcadUrl: null,
};

const defaultDayHours = { open: false, start: '09:00', end: '17:00' };
const closedWeek = {
  monday: defaultDayHours,
  tuesday: defaultDayHours,
  wednesday: defaultDayHours,
  thursday: defaultDayHours,
  friday: defaultDayHours,
  saturday: defaultDayHours,
  sunday: defaultDayHours,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ShopProfilePage />
    </QueryClientProvider>,
  );
}

describe('ShopProfilePage', () => {
  it('loads and populates the form from the current shop profile', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      shopProfile: {
        ...baseProfile,
        shopSlug: 'acme-prints',
        shopTagline: 'Fast, affordable 3D printing',
        shopServices: ['Custom prints', 'Prototyping'],
        shopHoursText: 'Mon-Fri 9am-5pm',
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue('acme-prints')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Fast, affordable 3D printing')).toBeInTheDocument();
    expect(screen.getByLabelText('Services (one per line)')).toHaveValue('Custom prints\nPrototyping');
    expect(screen.getByDisplayValue('Mon-Fri 9am-5pm')).toBeInTheDocument();
  });

  it('saves changes via PATCH, splitting the services textarea into an array', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({
      ok: true,
      shopProfile: { ...baseProfile, shopServices: ['Custom prints', 'Prototyping'] },
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('URL slug')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Services (one per line)'), {
      target: { value: 'Custom prints\nPrototyping' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith(
        '/api/shop-profile',
        expect.objectContaining({ shopServices: ['Custom prints', 'Prototyping'] }),
      ),
    );
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
  });

  it('updates the slug preview text as the user types', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('URL slug')).toBeInTheDocument());

    expect(screen.getByText('Your public page: barkie.co.za/shop/…')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('URL slug'), { target: { value: 'acme-prints' } });

    expect(screen.getByText('Your public page: barkie.co.za/shop/acme-prints')).toBeInTheDocument();
  });

  it('does not send a blank slug as an empty string (the server schema rejects it)', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('URL slug')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    const [, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect('shopSlug' in payload).toBe(false);
  });

  it('shows the publish-blocked error surfaced from the API', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    vi.spyOn(client, 'apiPatch').mockRejectedValue(
      new client.ApiError('Set a URL slug before publishing your shop page.', 400),
    );
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('URL slug')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Publish this page'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByText('Set a URL slug before publishing your shop page.')).toBeInTheDocument(),
    );
  });

  it('shows an error instead of loading forever when the initial GET fails', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load the shop profile/i)).toBeInTheDocument());
  });

  it('initializes trading hours to a full closed 7-day week when the profile has none set, and saves toggles/time edits', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('URL slug')).toBeInTheDocument());

    // 7 identical "Open" checkboxes/"From"/"To" inputs render in Monday->Sunday
    // order (DAYS_OF_WEEK), all starting closed since the profile has no
    // shopTradingHours set at all.
    const openCheckboxes = screen.getAllByLabelText('Open') as HTMLInputElement[];
    expect(openCheckboxes).toHaveLength(7);
    expect(openCheckboxes.every((cb) => !cb.checked)).toBe(true);

    const startInputs = screen.getAllByLabelText('From') as HTMLInputElement[];
    const endInputs = screen.getAllByLabelText('To') as HTMLInputElement[];
    expect(startInputs[0]).toHaveValue('09:00');
    expect(endInputs[0]).toHaveValue('17:00');

    // Toggle Monday (index 0) open and set its hours.
    fireEvent.click(openCheckboxes[0]);
    fireEvent.change(startInputs[0], { target: { value: '08:00' } });
    fireEvent.change(endInputs[0], { target: { value: '16:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith(
        '/api/shop-profile',
        expect.objectContaining({
          shopTradingHours: {
            ...closedWeek,
            monday: { open: true, start: '08:00', end: '16:00' },
          },
        }),
      ),
    );
  });

  it('loads existing trading hours, leaving unspecified days closed', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      shopProfile: {
        ...baseProfile,
        shopTradingHours: { friday: { open: true, start: '08:00', end: '15:00' } },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('URL slug')).toBeInTheDocument());

    const openCheckboxes = screen.getAllByLabelText('Open') as HTMLInputElement[];
    const startInputs = screen.getAllByLabelText('From') as HTMLInputElement[];
    const endInputs = screen.getAllByLabelText('To') as HTMLInputElement[];

    // Friday is index 4 in Monday->Sunday order.
    expect(openCheckboxes[4].checked).toBe(true);
    expect(startInputs[4]).toHaveValue('08:00');
    expect(endInputs[4]).toHaveValue('15:00');
    // Every other day stays closed with the default placeholder hours.
    expect(openCheckboxes[0].checked).toBe(false);
    expect(startInputs[0]).toHaveValue('09:00');
  });

  it('saves social media and marketplace links', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('URL slug')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Facebook'), {
      target: { value: 'https://facebook.com/acmeprints' },
    });
    fireEvent.change(screen.getByLabelText('Instagram'), {
      target: { value: 'https://instagram.com/acmeprints' },
    });
    fireEvent.change(screen.getByLabelText('Cults3D'), {
      target: { value: 'https://cults3d.com/en/users/acmeprints' },
    });
    fireEvent.change(screen.getByLabelText('GrabCAD'), {
      target: { value: 'https://grabcad.com/acmeprints' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith(
        '/api/shop-profile',
        expect.objectContaining({
          shopFacebookUrl: 'https://facebook.com/acmeprints',
          shopInstagramUrl: 'https://instagram.com/acmeprints',
          shopCults3dUrl: 'https://cults3d.com/en/users/acmeprints',
          shopGrabcadUrl: 'https://grabcad.com/acmeprints',
        }),
      ),
    );
  });

  it('saves the about text, availability and Google reviews link', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true, shopProfile: baseProfile });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('URL slug')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('About your shop'), {
      target: { value: 'We print things.' },
    });
    fireEvent.change(screen.getByLabelText('Availability'), {
      target: { value: 'Accepting new orders' },
    });
    fireEvent.change(screen.getByLabelText('Google reviews link'), {
      target: { value: 'https://g.page/r/acme-prints/review' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith(
        '/api/shop-profile',
        expect.objectContaining({
          shopAboutText: 'We print things.',
          shopAvailability: 'Accepting new orders',
          shopGoogleReviewsUrl: 'https://g.page/r/acme-prints/review',
        }),
      ),
    );
  });
});
