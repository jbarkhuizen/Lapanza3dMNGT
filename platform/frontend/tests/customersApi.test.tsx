import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useCustomerLookup } from '../src/api/customers.js';
import * as client from '../src/api/client.js';
import { createTestQueryClient } from './helpers/queryClient.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useCustomerLookup', () => {
  it('builds a Map of customer id to customer record', async () => {
    vi.spyOn(client, 'apiGet').mockResolvedValue({
      ok: true,
      customers: [{ id: 'c1', name: 'Bob Client', company: null, email: null, phone: null, billingAddress: '1 Oak St', deliveryAddress: null, vatNumber: null, notes: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCustomerLookup(), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lookup.get('c1')?.name).toBe('Bob Client');
  });
});
