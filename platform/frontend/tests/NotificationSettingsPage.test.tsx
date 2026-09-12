import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { NotificationSettingsPage } from '../src/pages/notifications/NotificationSettingsPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

const basePreferences = {
  trialEndingInApp: true,
  trialEndingEmail: true,
  lowStockInApp: true,
  lowStockEmail: true,
  invoiceOverdueInApp: true,
  invoiceOverdueEmail: true,
  paymentReceiptInApp: true,
  subscriptionCancelledInApp: true,
  paymentFailedInApp: true,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationSettingsPage />
    </QueryClientProvider>,
  );
}

describe('NotificationSettingsPage', () => {
  it('loads and displays the current preferences as checked toggles', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, preferences: basePreferences });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Trial ending in-app')).toBeInTheDocument());
    expect((screen.getByLabelText('Trial ending in-app') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Trial ending email') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Low stock in-app') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Invoice overdue in-app') as HTMLInputElement).checked).toBe(true);
  });

  it('renders every expected section and row', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, preferences: basePreferences });
    renderPage();

    await waitFor(() => expect(screen.getByText('Trials & Stock')).toBeInTheDocument());
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('Trial ending')).toBeInTheDocument();
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('Invoice overdue')).toBeInTheDocument();
    expect(screen.getByText('Payment receipt')).toBeInTheDocument();
    expect(screen.getByText('Subscription cancelled')).toBeInTheDocument();
    expect(screen.getByText('Payment failed')).toBeInTheDocument();
  });

  it('billing rows show "Always sent" for email instead of a checkbox', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, preferences: basePreferences });
    renderPage();

    await waitFor(() => expect(screen.getByText('Billing')).toBeInTheDocument());
    expect(screen.getAllByText('Always sent')).toHaveLength(3);
    expect(screen.queryByLabelText('Payment receipt email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Subscription cancelled email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Payment failed email')).not.toBeInTheDocument();
    // But billing rows DO still show a real in-app toggle.
    expect(screen.getByLabelText('Payment receipt in-app')).toBeInTheDocument();
  });

  it('toggling a checkbox saves via PATCH with just that field and reflects the response', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, preferences: basePreferences });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({
      ok: true,
      preferences: { ...basePreferences, trialEndingInApp: false },
    });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Trial ending in-app')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Trial ending in-app'));

    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/notification-preferences', { trialEndingInApp: false }),
    );
    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
    expect((screen.getByLabelText('Trial ending in-app') as HTMLInputElement).checked).toBe(false);
  });

  it('reverts the toggle and shows an error message when the save fails', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({ ok: true, preferences: basePreferences });
    vi.spyOn(client, 'apiPatch').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Low stock email')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Low stock email'));

    await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeInTheDocument());
    expect((screen.getByLabelText('Low stock email') as HTMLInputElement).checked).toBe(true);
  });

  it('shows an error instead of loading forever when the initial GET fails', async () => {
    vi.spyOn(client, 'apiGet').mockRejectedValue(new client.ApiError('Something went wrong.', 500));
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't load notification settings/i)).toBeInTheDocument());
  });
});
