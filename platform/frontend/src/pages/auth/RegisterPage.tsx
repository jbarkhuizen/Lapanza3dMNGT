import { useState, type FormEvent } from 'react';
import { apiPost, ApiError } from '../../api/client.js';
import { FormField } from '../../components/FormField.js';

export function RegisterPage() {
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/auth/register', { businessName, contactName, email, password });
      setRegistered(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    } finally {
      setSubmitting(false);
    }
  }

  if (registered) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-96 rounded-lg bg-white p-8 text-center shadow">
          <h1 className="text-xl font-semibold text-slate-900">Almost there</h1>
          <p className="mt-2 text-sm text-slate-600">
            Check your email for a verification link to activate your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
        <FormField
          id="businessName"
          label="Business name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
        />
        <FormField
          id="contactName"
          label="Your name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          required
        />
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
          minLength={10}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Register
        </button>
        <a href="/app/login" className="text-center text-sm text-slate-500 underline">
          Already have an account? Log in
        </a>
      </form>
    </div>
  );
}
