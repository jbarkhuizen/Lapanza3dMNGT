import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { FeatureRequestsPage } from '../src/pages/featureRequests/FeatureRequestsPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <FeatureRequestsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const myRequests = [
  {
    id: 'mine-1',
    category: 'bug' as const,
    title: 'Fix invoice totals',
    description: 'Totals are off by a cent sometimes.',
    status: 'in_progress' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const communityRequests = [
  {
    id: 'community-1',
    category: 'new_feature' as const,
    title: 'Add dark mode',
    description: 'A dark theme for late-night printing sessions.',
    status: 'new' as const,
    createdAt: '2026-01-02T00:00:00.000Z',
    voteCount: 5,
    hasVoted: false,
  },
  {
    id: 'community-2',
    category: 'workflow' as const,
    title: 'Kanban view for jobs',
    description: 'Drag jobs between status columns.',
    status: 'planned' as const,
    createdAt: '2026-01-03T00:00:00.000Z',
    voteCount: 2,
    hasVoted: true,
  },
];

function mockGet() {
  return vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/feature-requests/mine') {
      return Promise.resolve({ ok: true, featureRequests: myRequests });
    }
    if (path.startsWith('/api/feature-requests')) {
      return Promise.resolve({ ok: true, featureRequests: communityRequests });
    }
    return Promise.reject(new client.ApiError('not found', 404));
  });
}

describe('FeatureRequestsPage', () => {
  it('submits a feature request with the selected category, title, and description', async () => {
    mockGet();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({
      ok: true,
      featureRequest: { id: 'new-1', category: 'workflow', title: 'New idea', description: 'Details', status: 'new', createdAt: '2026-01-04T00:00:00.000Z' },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix invoice totals')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'workflow' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New idea' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Details' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [path, body] = postSpy.mock.calls[0];
    expect(path).toBe('/api/feature-requests');
    expect(body).toMatchObject({ category: 'workflow', title: 'New idea', description: 'Details' });
  });

  it('shows the "No requests yet" empty state when the tenant has no submissions', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/feature-requests/mine') {
        return Promise.resolve({ ok: true, featureRequests: [] });
      }
      return Promise.resolve({ ok: true, featureRequests: [] });
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('No requests yet.')).toBeInTheDocument());
  });

  it('lists my requests with a status badge', async () => {
    mockGet();
    renderPage();

    await waitFor(() => expect(screen.getByText('Fix invoice totals')).toBeInTheDocument());
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders the community list with vote counts and never renders a tenantId', async () => {
    mockGet();
    renderPage();

    await waitFor(() => expect(screen.getByText('Add dark mode')).toBeInTheDocument());
    expect(screen.getByText('Kanban view for jobs')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // The community payload the API returns has no tenantId field at all (see
    // the backend test asserting the same on the raw response) -- this just
    // confirms the page never invents or displays one either.
    expect(screen.queryByText(/tenantId/i)).not.toBeInTheDocument();
  });

  it('toggles a vote when the vote button is clicked', async () => {
    mockGet();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, voteCount: 6, hasVoted: true });
    renderPage();

    await waitFor(() => expect(screen.getByText('Add dark mode')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Vote for Add dark mode' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/feature-requests/community-1/vote'));
  });

  it('filters to "Upcoming" (status not new) when that toggle is selected', async () => {
    mockGet();
    renderPage();

    await waitFor(() => expect(screen.getByText('Add dark mode')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Upcoming' }));

    await waitFor(() => expect(screen.queryByText('Add dark mode')).not.toBeInTheDocument());
    expect(screen.getByText('Kanban view for jobs')).toBeInTheDocument();
  });

  it('shows an error message when the community list fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/feature-requests/mine') {
        return Promise.resolve({ ok: true, featureRequests: [] });
      }
      return Promise.reject(new client.ApiError('Something went wrong.', 500));
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Couldn't load community requests. Try refreshing the page.")).toBeInTheDocument(),
    );
  });
});
