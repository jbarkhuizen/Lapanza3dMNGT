import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiGet, ApiError } from '../api/client.js';

export interface Tenant {
  id: string;
  businessName: string;
  email: string;
  emailVerified: boolean;
  hasSubscription: boolean;
}

interface AuthContextValue {
  tenant: Tenant | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const result = await apiGet<{ tenant: Tenant }>('/api/auth/me');
      setTenant(result.tenant);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setTenant(null);
      }
      // A transient failure (network error, 500, etc.) shouldn't silently
      // log the user out mid-session — leave tenant as-is.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const value = useMemo(() => ({ tenant, loading, refetch }), [tenant, loading, refetch]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { tenant, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!tenant) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  // A tenant with no subscription at all must pick a plan before doing
  // anything else — but the plan-selection and billing-complete pages
  // are themselves wrapped in RequireAuth (Task 6), so this check must
  // not redirect a tenant who is ALREADY on one of those two pages,
  // or picking a plan would infinite-loop back to itself.
  if (!tenant.hasSubscription && location.pathname !== '/plans' && location.pathname !== '/billing/complete') {
    return <Navigate to="/plans" replace />;
  }
  return <>{children}</>;
}
