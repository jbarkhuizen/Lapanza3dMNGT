import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiGet, apiPost, apiPatch, ApiError } from '../src/api/client.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('apiGet', () => {
  it('returns the response body on success', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, tenant: { id: '1' } }),
    });
    const result = await apiGet<{ tenant: { id: string } }>('/api/auth/me');
    expect(result.tenant.id).toBe('1');
  });

  it('sends credentials: include', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await apiGet('/api/auth/me');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/me'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('throws ApiError with the server error message on { ok: false }', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'Log in to continue.' }),
    });
    await expect(apiGet('/api/auth/me')).rejects.toThrow('Log in to continue.');
    await expect(apiGet('/api/auth/me')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with the http status when json body has no error field', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });
    await expect(apiGet('/api/health')).rejects.toMatchObject({ status: 500 });
  });

  it('passes through fieldErrors on an { ok: false } response when present', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 422,
      json: async () => ({
        ok: false,
        error: 'Validation failed.',
        fieldErrors: { email: 'Email is already in use.' },
      }),
    });
    await expect(apiGet('/api/auth/register')).rejects.toMatchObject({
      fieldErrors: { email: 'Email is already in use.' },
    });
  });

  it('leaves fieldErrors undefined when the response does not include it', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 401,
      json: async () => ({ ok: false, error: 'Log in to continue.' }),
    });
    await expect(apiGet('/api/auth/me')).rejects.toMatchObject({ fieldErrors: undefined });
  });

  it('returns a synthetic ok body for a 204 No Content response without parsing json', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('should not be called for a 204 response');
      },
    });
    await expect(apiGet('/api/some-resource')).resolves.toEqual({ ok: true });
  });
});

describe('apiPost', () => {
  it('sends a JSON body with POST method', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await apiPost('/api/auth/login', { email: 'a@b.com', password: 'x' });
    const [, options] = (fetch as any).mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ email: 'a@b.com', password: 'x' });
  });
});

describe('apiPatch', () => {
  it('sends a JSON body with PATCH method', async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await apiPatch('/api/company-profile', { city: 'Cape Town' });
    const [, options] = (fetch as any).mock.calls[0];
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual({ city: 'Cape Town' });
  });
});
