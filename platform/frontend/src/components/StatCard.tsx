// Same card markup as ReportsPage.tsx's SummaryCard -- extracted here so the
// Dashboard and the Customers/Invoices/Quotes list-page stat rows share one
// implementation instead of four copies of the same JSX.
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
    </div>
  );
}
