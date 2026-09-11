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
});
