import { useAuth } from '../context/AuthContext.js';

export function DashboardHomePage() {
  const { tenant } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Welcome, {tenant?.businessName}</h1>
      <p className="mt-2 text-slate-600">Pick a module from the left to get started.</p>
    </div>
  );
}
