import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiPost, ApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import { FormField } from '../../components/FormField.js';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { refetch } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/auth/login', { email, password });
      await refetch();
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-900">Log in to Barkie</h1>
        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Log in
        </button>
        <Link to="/register" className="text-center text-sm text-slate-500 underline">
          Need an account? Register
        </Link>
      </form>
    </div>
  );
}
