import { Routes, Route } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './context/AuthContext.js';
import { AppShell } from './components/AppShell.js';
import { LoginPage } from './pages/auth/LoginPage.js';
import { RegisterPage } from './pages/auth/RegisterPage.js';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage.js';
import { DashboardHomePage } from './pages/DashboardHomePage.js';
import { CompanyProfilePage } from './pages/CompanyProfilePage.js';
import { CustomersListPage } from './pages/customers/CustomersListPage.js';
import { CustomerFormPage } from './pages/customers/CustomerFormPage.js';
import { FilamentsListPage } from './pages/filaments/FilamentsListPage.js';
import { FilamentFormPage } from './pages/filaments/FilamentFormPage.js';
import { LabourStepsListPage } from './pages/labourSteps/LabourStepsListPage.js';
import { LabourStepFormPage } from './pages/labourSteps/LabourStepFormPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

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
        <Route
          path="/company-profile"
          element={
            <RequireAuth>
              <AppShell>
                <CompanyProfilePage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/customers"
          element={
            <RequireAuth>
              <AppShell>
                <CustomersListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/customers/new"
          element={
            <RequireAuth>
              <AppShell>
                <CustomerFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <RequireAuth>
              <AppShell>
                <CustomerFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/filaments"
          element={
            <RequireAuth>
              <AppShell>
                <FilamentsListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/filaments/new"
          element={
            <RequireAuth>
              <AppShell>
                <FilamentFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/filaments/:id"
          element={
            <RequireAuth>
              <AppShell>
                <FilamentFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/labour-steps"
          element={
            <RequireAuth>
              <AppShell>
                <LabourStepsListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/labour-steps/new"
          element={
            <RequireAuth>
              <AppShell>
                <LabourStepFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/labour-steps/:id"
          element={
            <RequireAuth>
              <AppShell>
                <LabourStepFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
