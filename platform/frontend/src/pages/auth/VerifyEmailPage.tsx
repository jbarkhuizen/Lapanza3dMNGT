import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiPost, ApiError } from '../../api/client.js';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'verified' | 'error'>('verifying');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No verification token was found in this link.');
      return;
    }
    apiPost('/api/auth/verify-email', { token })
      .then(() => setStatus('verified'))
      .catch((err) => {
        setStatus('error');
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-96 rounded-lg bg-white p-8 text-center shadow">
        {status === 'verifying' && <p className="text-slate-600">Verifying your email…</p>}
        {status === 'verified' && (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Email verified</h1>
            <a href="/app/login" className="mt-2 inline-block text-sm text-slate-500 underline">
              Log in to continue
            </a>
          </>
        )}
        {status === 'error' && <p className="text-red-600">{error}</p>}
      </div>
    </div>
  );
}
