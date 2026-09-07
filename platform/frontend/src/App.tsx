import { Routes, Route } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './context/AuthContext.js';
import { AppShell } from './components/AppShell.js';
import { LoginPage } from './pages/auth/LoginPage.js';
import { RegisterPage } from './pages/auth/RegisterPage.js';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage.js';
import { DashboardHomePage } from './pages/DashboardHomePage.js';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell>
                <DashboardHomePage />
              </AppShell>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
