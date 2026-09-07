import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiGet } from '../api/client.js';

export interface Tenant {
  id: string;
  businessName: string;
  email: string;
  emailVerified: boolean;
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
    } catch {
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return <AuthContext.Provider value={{ tenant, loading, refetch }}>{children}</AuthContext.Provider>;
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
  return <>{children}</>;
}
