const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(message: string, status: number, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type ApiEnvelope = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  [key: string]: unknown;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return { ok: true } as T;
  }

  let body: ApiEnvelope;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('Something went wrong. Try again shortly.', response.status);
  }

  if (!body.ok) {
    throw new ApiError(body.error ?? 'Something went wrong. Try again shortly.', response.status, body.fieldErrors);
  }

  return body as T;
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  return parseResponse<T>(response);
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

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

// Every other apiPost call above sends JSON. Multipart uploads (currently
// just the slicer's STL upload) need a FormData body instead -- deliberately
// NOT setting Content-Type here, unlike request() above, since the browser
// must set its own multipart boundary for a FormData body; setting it
// manually would omit the boundary and the server couldn't parse the body.
export async function apiPostFormData<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  return parseResponse<T>(response);
}
