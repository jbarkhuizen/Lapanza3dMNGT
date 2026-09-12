import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JobCardFormPage } from '../src/pages/jobCards/JobCardFormPage.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderAt(path: string, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/job-cards/new" element={<JobCardFormPage />} />
          <Route path="/job-cards/:id" element={<JobCardFormPage />} />
          <Route path="/job-cards" element={<div>job cards list</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function mockNoCustomers() {
  vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
    if (path === '/api/customers') {
      return Promise.resolve({ ok: true, customers: [] });
    }
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
}

function existingJobCard(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    number: 'JC-0001',
    cardType: 'repair',
    customerId: null,
    jobTitle: 'Fix extruder',
    status: 'new',
    priority: 'normal',
    assignedTo: null,
    receivedDate: '2026-09-13T00:00:00.000Z',
    requiredBy: null,
    notes: null,
    terms: null,
    receivedBy: null,
    quoteId: null,
    createdAt: '2026-09-13T00:00:00.000Z',
    equipmentMake: null,
    equipmentModel: null,
    equipmentSerial: null,
    reportedFault: null,
    receivedWithPowerCord: false,
    receivedWithFilament: false,
    receivedWithBuildPlate: false,
    receivedWithSdCard: false,
    receivedWithTools: false,
    receivedWithOther: null,
    conditionPrintHead: null,
    conditionPrintBed: null,
    conditionExistingDamage: null,
    technicianFindings: null,
    printFileName: null,
    printQuantity: null,
    printWhatIsPrinted: null,
    printProcess: null,
    printMaterial: null,
    printColour: null,
    printQuality: null,
    finishRemoveSupports: false,
    finishDeburrClean: false,
    finishSand: false,
    finishPrime: false,
    finishPaint: false,
    finishPostCure: false,
    finishInstallInserts: false,
    finishAssemble: false,
    resultQuantityAccepted: null,
    resultQuantityRejected: null,
    resultNotes: null,
    cadDesignType: null,
    cadWhatModelMustDo: null,
    cadMaterial: null,
    cadIntendedProcess: null,
    cadTolerances: null,
    cadCriticalDimensions: null,
    deliverableNativeCad: false,
    deliverableStep: false,
    deliverableStl: false,
    deliverable3mf: false,
    deliverableDxf: false,
    deliverableDrawingPdf: false,
    deliverableRenderedImages: false,
    cadApprovedRevision: null,
    ...overrides,
  };
}

describe('JobCardFormPage — create mode', () => {
  it('renders the repair section for ?type=repair and submits repair fields', async () => {
    mockNoCustomers();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, jobCard: { id: '1' } });
    renderAt('/job-cards/new?type=repair');

    await waitFor(() => expect(screen.getByText('Repair details')).toBeInTheDocument());
    expect(screen.queryByText('Print details')).not.toBeInTheDocument();
    expect(screen.queryByText('CAD details')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Fix extruder' } });
    fireEvent.change(screen.getByLabelText('Reported fault'), { target: { value: 'Clicking noise' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [path, payload] = postSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/api/job-cards');
    expect(payload).toMatchObject({ cardType: 'repair', jobTitle: 'Fix extruder', reportedFault: 'Clicking noise' });
    expect(payload.printFileName).toBeUndefined();
    expect(payload.cadDesignType).toBeUndefined();
    await waitFor(() => expect(screen.getByText('job cards list')).toBeInTheDocument());
  });

  it('renders the print section for ?type=print and submits print fields', async () => {
    mockNoCustomers();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, jobCard: { id: '1' } });
    renderAt('/job-cards/new?type=print');

    await waitFor(() => expect(screen.getByText('Print details')).toBeInTheDocument());
    expect(screen.queryByText('Repair details')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Print bracket set' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, payload] = postSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({ cardType: 'print', jobTitle: 'Print bracket set', printQuantity: 4 });
    expect(payload.equipmentMake).toBeUndefined();
  });

  it('renders the CAD section for ?type=cad and submits CAD fields', async () => {
    mockNoCustomers();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, jobCard: { id: '1' } });
    renderAt('/job-cards/new?type=cad');

    await waitFor(() => expect(screen.getByText('CAD details')).toBeInTheDocument());
    expect(screen.queryByText('Repair details')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Design bracket' } });
    fireEvent.change(screen.getByLabelText('Design type'), { target: { value: 'Mechanical part' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, payload] = postSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({ cardType: 'cad', jobTitle: 'Design bracket', cadDesignType: 'Mechanical part' });
    expect(payload.printFileName).toBeUndefined();
  });

  it('defaults to the repair type when no ?type is given', async () => {
    mockNoCustomers();
    renderAt('/job-cards/new');
    await waitFor(() => expect(screen.getByText('Repair details')).toBeInTheDocument());
  });

  it('omits customerId when left as "No customer"', async () => {
    mockNoCustomers();
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, jobCard: { id: '1' } });
    renderAt('/job-cards/new?type=repair');

    await waitFor(() => expect(screen.getByLabelText('Job title')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Fix extruder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalled());
    const [, payload] = postSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.customerId).toBeUndefined();
  });
});

describe('JobCardFormPage — edit mode', () => {
  it('loads the existing card and saves changes via PATCH, without a cardType key', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/job-cards/1') {
        return Promise.resolve({ ok: true, jobCard: existingJobCard() });
      }
      if (path === '/api/customers') {
        return Promise.resolve({ ok: true, customers: [] });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    const patchSpy = vi.spyOn(client, 'apiPatch').mockResolvedValue({ ok: true });
    renderAt('/job-cards/1');

    await waitFor(() => expect(screen.getByDisplayValue('Fix extruder')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Reported fault'), { target: { value: 'Now grinding' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalled());
    const [path, payload] = patchSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/api/job-cards/1');
    expect(payload.reportedFault).toBe('Now grinding');
    expect(payload.cardType).toBeUndefined();
  });

  it('shows a loading state while the existing card is being fetched', async () => {
    let resolveGet!: (value: unknown) => void;
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/job-cards/1') {
        return new Promise((resolve) => (resolveGet = resolve));
      }
      return Promise.resolve({ ok: true, customers: [] });
    });
    renderAt('/job-cards/1');

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    resolveGet({ ok: true, jobCard: existingJobCard() });
    await waitFor(() => expect(screen.getByDisplayValue('Fix extruder')).toBeInTheDocument());
  });

  it('shows an error instead of a blank form when the card fails to load', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/job-cards/1') {
        return Promise.reject(new client.ApiError('Job card not found.', 404));
      }
      return Promise.resolve({ ok: true, customers: [] });
    });
    renderAt('/job-cards/1');
    await waitFor(() => expect(screen.getByText(/couldn't load this job card/i)).toBeInTheDocument());
  });

  it('shows no Raise a quote button when the card has no customer', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/job-cards/1') {
        return Promise.resolve({ ok: true, jobCard: existingJobCard({ customerId: null }) });
      }
      return Promise.resolve({ ok: true, customers: [] });
    });
    renderAt('/job-cards/1');
    await waitFor(() => expect(screen.getByDisplayValue('Fix extruder')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Raise a quote' })).toBeDisabled();
  });

  it('shows an enabled Raise a quote button once a customer is set, and calls the create-quote endpoint', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/job-cards/1') {
        return Promise.resolve({ ok: true, jobCard: existingJobCard({ customerId: 'cust-1' }) });
      }
      if (path === '/api/customers') {
        return Promise.resolve({
          ok: true,
          customers: [{ id: 'cust-1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
        });
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
    const postSpy = vi.spyOn(client, 'apiPost').mockResolvedValue({ ok: true, quote: { id: 'quote-1' } });
    renderAt('/job-cards/1');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Raise a quote' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Raise a quote' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/api/job-cards/1/create-quote'));
  });

  it('shows a link to the quote instead of the button once the card already has one', async () => {
    vi.spyOn(client, 'apiGet').mockImplementation((path: string) => {
      if (path === '/api/job-cards/1') {
        return Promise.resolve({ ok: true, jobCard: existingJobCard({ customerId: 'cust-1', quoteId: 'quote-1' }) });
      }
      return Promise.resolve({ ok: true, customers: [] });
    });
    renderAt('/job-cards/1');

    await waitFor(() => expect(screen.getByRole('link', { name: 'View quote' })).toHaveAttribute('href', '/quotes/quote-1'));
    expect(screen.queryByRole('button', { name: 'Raise a quote' })).not.toBeInTheDocument();
  });
});
