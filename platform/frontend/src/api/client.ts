const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type ApiEnvelope = { ok: boolean; error?: string; [key: string]: unknown };

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  let body: ApiEnvelope;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('Something went wrong. Try again shortly.', response.status);
  }

  if (!body.ok) {
    throw new ApiError(body.error ?? 'Something went wrong. Try again shortly.', response.status);
  }

  return body as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined });
}

export function apiPatch<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined });
}
