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
import { ConsumablesListPage } from './pages/consumables/ConsumablesListPage.js';
import { ConsumableFormPage } from './pages/consumables/ConsumableFormPage.js';
import { PrintersListPage } from './pages/printers/PrintersListPage.js';
import { PrinterFormPage } from './pages/printers/PrinterFormPage.js';
import { CostingTemplatesListPage } from './pages/costingTemplates/CostingTemplatesListPage.js';
import { CostingTemplateCreatePage } from './pages/costingTemplates/CostingTemplateCreatePage.js';
import { CostingTemplateDetailPage } from './pages/costingTemplates/CostingTemplateDetailPage.js';
import { QuotesListPage } from './pages/quotes/QuotesListPage.js';
import { QuoteCreatePage } from './pages/quotes/QuoteCreatePage.js';
import { QuoteDetailPage } from './pages/quotes/QuoteDetailPage.js';
import { InvoicesListPage } from './pages/invoices/InvoicesListPage.js';
import { InvoiceDetailPage } from './pages/invoices/InvoiceDetailPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { PlanSelectionPage } from './pages/billing/PlanSelectionPage.js';
import { BillingCompletePage } from './pages/billing/BillingCompletePage.js';

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
        <Route
          path="/consumables"
          element={
            <RequireAuth>
              <AppShell>
                <ConsumablesListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/consumables/new"
          element={
            <RequireAuth>
              <AppShell>
                <ConsumableFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/consumables/:id"
          element={
            <RequireAuth>
              <AppShell>
                <ConsumableFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/printers"
          element={
            <RequireAuth>
              <AppShell>
                <PrintersListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/printers/new"
          element={
            <RequireAuth>
              <AppShell>
                <PrinterFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/printers/:id"
          element={
            <RequireAuth>
              <AppShell>
                <PrinterFormPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/costing-templates"
          element={
            <RequireAuth>
              <AppShell>
                <CostingTemplatesListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/costing-templates/new"
          element={
            <RequireAuth>
              <AppShell>
                <CostingTemplateCreatePage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/costing-templates/:id"
          element={
            <RequireAuth>
              <AppShell>
                <CostingTemplateDetailPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/quotes"
          element={
            <RequireAuth>
              <AppShell>
                <QuotesListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/quotes/new"
          element={
            <RequireAuth>
              <AppShell>
                <QuoteCreatePage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/quotes/:id"
          element={
            <RequireAuth>
              <AppShell>
                <QuoteDetailPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/invoices"
          element={
            <RequireAuth>
              <AppShell>
                <InvoicesListPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <RequireAuth>
              <AppShell>
                <InvoiceDetailPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/plans"
          element={
            <RequireAuth>
              <PlanSelectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/billing/complete"
          element={
            <RequireAuth>
              <BillingCompletePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
