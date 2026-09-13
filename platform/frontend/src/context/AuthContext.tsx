import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiGet, ApiError } from '../api/client.js';

export interface Tenant {
  id: string;
  businessName: string;
  email: string;
  emailVerified: boolean;
  hasSubscription: boolean;
  subscriptionStatus?: string | null;
}

export type ActorRole = 'admin' | 'sales';

interface AuthContextValue {
  tenant: Tenant | null;
  loading: boolean;
  refetch: () => Promise<void>;
  // 'admin' for the tenant owner and for an admin-role team member;
  // 'sales' only for a sales-role team member. Defaults to 'admin' while
  // logged out / loading, so callers don't have to special-case undefined.
  actorRole: ActorRole;
  // Distinct from the tenant's own businessName/email — set only when
  // signed in as a team member (null for the owner).
  actorName: string | null;
  actorEmail: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface MeResponse {
  tenant: Tenant;
  actorRole?: ActorRole;
  actorName?: string | null;
  actorEmail?: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [actorRole, setActorRole] = useState<ActorRole>('admin');
  const [actorName, setActorName] = useState<string | null>(null);
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const result = await apiGet<MeResponse>('/api/auth/me');
      setTenant(result.tenant);
      setActorRole(result.actorRole ?? 'admin');
      setActorName(result.actorName ?? null);
      setActorEmail(result.actorEmail ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setTenant(null);
        setActorRole('admin');
        setActorName(null);
        setActorEmail(null);
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

  const value = useMemo(
    () => ({ tenant, loading, refetch, actorRole, actorName, actorEmail }),
    [tenant, loading, refetch, actorRole, actorName, actorEmail],
  );

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

// Wraps RequireAuth with an additional role check for admin-only pages
// (e.g. /team) — a sales-role team member who somehow navigates there
// (typed URL, stale bookmark) is redirected to the dashboard rather than
// shown a page whose every action would 403 anyway.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { actorRole } = useAuth();
  return (
    <RequireAuth>
      {actorRole === 'admin' ? <>{children}</> : <Navigate to="/" replace />}
    </RequireAuth>
  );
}
