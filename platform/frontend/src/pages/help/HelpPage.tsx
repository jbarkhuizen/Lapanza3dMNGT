import { useState, type ReactNode } from 'react';

interface HelpSection {
  id: string;
  title: string;
  content: ReactNode;
}

const proseP = 'text-sm text-slate-700 dark:text-slate-300';
const proseOl = 'flex list-decimal flex-col gap-2 pl-5 text-sm text-slate-700 dark:text-slate-300';
const proseUl = 'flex list-disc flex-col gap-1 pl-5 text-sm text-slate-700 dark:text-slate-300';
const proseH3 = 'text-sm font-semibold text-slate-900 dark:text-slate-100';

const GUIDE_SECTIONS: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    content: (
      <ol className={proseOl}>
        <li>
          <strong>Register</strong> — business name, your name, email, password. You get a 14-day free trial
          automatically; no charge until it ends, and you can cancel anytime from Billing.
        </li>
        <li>
          <strong>Verify your email</strong> — click the link we send you.
        </li>
        <li>
          <strong>Set up your shop basics</strong> — head to Company Profile and Shop Profile to fill in your
          business details, VAT info (if registered), bank details for invoices, and your public shop page
          content.
        </li>
      </ol>
    ),
  },
  {
    id: 'costing-inputs',
    title: 'Set up your costing inputs',
    content: (
      <div className="flex flex-col gap-3">
        <p className={proseP}>Before you can cost a print accurately, tell Barkie what your inputs actually cost:</p>
        <ul className={proseUl}>
          <li>
            <strong>Printers</strong> — purchase cost, power draw, electricity rate, expected lifetime hours.
            Barkie works out per-hour depreciation and electricity cost automatically. Only name, status, and
            process are required to add one.
          </li>
          <li>
            <strong>Filaments</strong> — brand, material type, diameter, cost per kg/spool. Track remaining
            weight and set a low-stock threshold.
          </li>
          <li>
            <strong>Labour Steps</strong> — the tasks you charge for and your hourly rate for each.
          </li>
          <li>
            <strong>Consumables</strong> — anything you use up per job that isn't filament.
          </li>
          <li>
            <strong>Scanners / Laser Materials / Pre-made Items</strong> — set these up the same way if you
            offer scanning, laser work, or resell items.
          </li>
        </ul>
        <p className={proseP}>
          Every one of these lists has its add form right at the top, always visible — fill in the required
          fields, hit Add. No separate "new item" page.
        </p>
      </div>
    ),
  },
  {
    id: 'costing-templates',
    title: 'Build a Costing Template',
    content: (
      <div className="flex flex-col gap-3">
        <p className={proseP}>
          Go to <strong>Costing Templates → New</strong>, pick the process type, then:
        </p>
        <ul className={proseUl}>
          <li>
            <strong>Printer jobs</strong>: pick the printer and filament, enter weight and print time — or use
            the Slicer to get real numbers from your actual STL file.
          </li>
          <li>Add labour lines and consumable lines the job needs.</li>
          <li>Set your markup percentage.</li>
        </ul>
        <p className={proseP}>
          Barkie computes filament, electricity, depreciation, labour, and consumables cost, sums them, applies
          your markup, and shows a suggested sell price.
        </p>
      </div>
    ),
  },
  {
    id: 'slicer',
    title: 'Use the Slicer',
    content: (
      <p className={proseP}>
        Go to <strong>Slicer</strong> (or click "Slice STL" from inside a Costing Template). Upload your{' '}
        <code>.stl</code>, optionally pick a printer/preset/filament, and hit Slice. Barkie runs a real slicing
        engine server-side and returns real weight, support weight, filament length, and print time — which
        feeds directly into Costing Templates, Job Cards, and Quotes. Complex models can take up to a minute or
        two — it's a real computation, not a lookup.
      </p>
    ),
  },
  {
    id: 'quotes-invoices',
    title: 'Customers, Quotes, and Invoices',
    content: (
      <ul className={proseUl}>
        <li>Add a Customer first (name + billing address is all that's required).</li>
        <li>
          Create a Quote, add line items built from your costing templates, apply a discount if needed, set
          payment terms, and send it.
        </li>
        <li>When a customer accepts, convert the Quote to an Invoice in one click — everything carries over.</li>
        <li>Invoices track payment status and support a payment-link URL.</li>
      </ul>
    ),
  },
  {
    id: 'job-cards',
    title: 'Job Cards (customer intake tickets)',
    content: (
      <div className="flex flex-col gap-3">
        <p className={proseP}>
          Use Job Cards when a customer drops off/sends in a job before you've costed it — three types:
        </p>
        <ul className={proseUl}>
          <li>
            <strong>Repair</strong>: what equipment, what's wrong, what came with it.
          </li>
          <li>
            <strong>Print</strong>: what file, material, colour, quantity, finishing needed.
          </li>
          <li>
            <strong>CAD</strong>: what needs designing, tolerances, deliverable format.
          </li>
        </ul>
        <p className={proseP}>A Job Card can be converted straight into a Quote once you know what it'll cost.</p>
      </div>
    ),
  },
  {
    id: 'jobs-board',
    title: 'Jobs board',
    content: (
      <p className={proseP}>
        Once work is actually underway, track it on the Jobs board — queued, in progress, done. This is separate
        from Job Cards (which is about intake) — Jobs is your shop-floor status tracker.
      </p>
    ),
  },
  {
    id: 'team',
    title: 'Team Accounts',
    content: (
      <p className={proseP}>
        Go to Team to invite up to 3 team members, each with <code>admin</code> (full access) or{' '}
        <code>sales</code> (day-to-day tools only — no Billing, Company/Shop Profile, or Reports) role. They log
        in with their own email/password after accepting an invite.
      </p>
    ),
  },
  {
    id: 'notifications',
    title: 'Notifications',
    content: (
      <p className={proseP}>
        Go to Notification Settings to control what you get notified about (trial ending, low stock, overdue
        invoices, payment events) and through which channel (in-app, email) — each toggle is independent.
      </p>
    ),
  },
  {
    id: 'dark-mode',
    title: 'Dark mode',
    content: (
      <p className={proseP}>
        Click the theme control in the header to cycle System → Light → Dark. "System" follows your device's
        setting automatically; picking Light or Dark explicitly overrides that and is remembered — including on
        the public site, if you're logged in on the same device.
      </p>
    ),
  },
  {
    id: 'billing',
    title: 'Billing',
    content: (
      <p className={proseP}>
        Go to Billing to see your current plan, trial status, and payment history, or to change plans. If a
        payment fails, you keep read-only access to your data until it's resolved — you're never locked out
        cold.
      </p>
    ),
  },
];

const HOW_TO_SECTIONS: HelpSection[] = [
  {
    id: 'howto-price-first-print',
    title: 'How to price your first print accurately',
    content: (
      <ol className={proseOl}>
        <li>Add your printer with purchase cost, power draw, electricity rate, expected lifetime hours.</li>
        <li>Add the filament you're using with cost per kg.</li>
        <li>Add any labour steps you charge for.</li>
        <li>Go to Costing Templates → New → Printer process.</li>
        <li>Type in the weight/print time, or click "Slice STL" to get real numbers.</li>
        <li>Add labour/consumable lines if relevant, set your markup %.</li>
        <li>Your suggested sell price appears automatically.</li>
      </ol>
    ),
  },
  {
    id: 'howto-quote-to-paid',
    title: 'How to send a quote and get paid',
    content: (
      <ol className={proseOl}>
        <li>Add the customer if they're not already there.</li>
        <li>Go to Quotes → New Quote, select the customer.</li>
        <li>Add line items — pick an existing Costing Template per line, or describe a custom line.</li>
        <li>Apply a discount if needed, set payment terms, save.</li>
        <li>Download the PDF or send it however you normally do.</li>
        <li>Once accepted, click "Convert to Invoice" — everything carries over.</li>
      </ol>
    ),
  },
  {
    id: 'howto-slicer-quote',
    title: "How to use the STL Slicer to quote from a customer's file",
    content: (
      <ol className={proseOl}>
        <li>Go to Slicer, or click "Slice STL" from a Costing Template / Quote line / Job Card.</li>
        <li>Upload the customer's .stl file.</li>
        <li>Pick your printer and filament (optional, but more accurate).</li>
        <li>Click Slice — this can take up to a minute or two for complex models.</li>
        <li>You get real weight, support weight, filament length, and print time back.</li>
        <li>Use "Slice a file to build this line" on a Quote, or the Slice button on a Costing Template, to carry those numbers straight in.</li>
      </ol>
    ),
  },
  {
    id: 'howto-repair-intake',
    title: 'How to set up a repair intake ticket',
    content: (
      <ol className={proseOl}>
        <li>Go to Job Cards → New → Repair.</li>
        <li>Fill in equipment make/model/serial, the reported fault, what the customer brought with it, and current condition.</li>
        <li>Save — this creates the ticket with an auto-generated job card number.</li>
        <li>Add your technician findings as you diagnose.</li>
        <li>Convert to a Quote once you know the cost.</li>
      </ol>
    ),
  },
  {
    id: 'howto-invite-team',
    title: 'How to invite a team member',
    content: (
      <ol className={proseOl}>
        <li>Go to Team → Invite.</li>
        <li>Enter their name, email, and role (admin or sales).</li>
        <li>They receive an email to set their own password.</li>
        <li>You can deactivate a team member at any time — takes effect immediately, even mid-session.</li>
      </ol>
    ),
  },
  {
    id: 'howto-failed-payment',
    title: 'How to recover from a failed payment without losing access',
    content: (
      <ol className={proseOl}>
        <li>If a payment fails, you'll see a banner across the dashboard and (if enabled) a notification.</li>
        <li>You keep read-only access — your data is safe, you just can't create/edit until it's resolved.</li>
        <li>Go to Billing → update your payment method.</li>
        <li>Once the payment succeeds, full access is restored automatically.</li>
      </ol>
    ),
  },
];

const FAQ_ITEMS: { question: string; answer: ReactNode }[] = [
  { question: 'How much does Barkie cost?', answer: <>Three tiers, all with a 14-day free trial (card required upfront, no charge until the trial ends). See current pricing on the Billing page.</> },
  { question: 'What happens if my payment fails?', answer: <>You keep read-only access to your data — view everything, but can't create or edit until it's resolved. Nothing is deleted.</> },
  { question: 'Can I cancel anytime?', answer: <>Yes, from the Billing page. No lock-in contract.</> },
  { question: "How does Barkie work out my printer's cost per hour?", answer: <>Purchase cost ÷ expected lifetime hours gives depreciation per hour, plus power draw × your electricity rate gives running cost per hour. Both feed into every Costing Template using that printer.</> },
  { question: 'Do I need to know my exact print weight and time?', answer: <>No — use the built-in Slicer. Upload your STL and it works out real weight, filament length, and print time.</> },
  { question: 'Can I add team members?', answer: <>Yes, up to 3 active team members, each admin or sales role. Sales can't see Billing, Company/Shop Profile, or Reports.</> },
  { question: 'Is my data visible to other tenants?', answer: <>No — full isolation. The one exception is the Feature Request Board, a shared community list by design.</> },
  { question: "What's the difference between Job Cards and Jobs?", answer: <>Job Cards are customer-facing intake tickets, before costing. Jobs is your shop-floor status board for work underway.</> },
  { question: 'Can customers see my Barkie dashboard?', answer: <>No. They only see what you send them (a quote/invoice PDF, a payment link) or your public Shop Profile page.</> },
  { question: 'What printers/materials does Barkie support?', answer: <>Any — you add your own with real specs and costs, no restricted list. A printer-specs catalog is available to pre-fill common models.</> },
  { question: 'Does dark mode affect my public shop page too?', answer: <>Yes — the theme choice is shared between the dashboard and the public site on the same device/browser.</> },
];

function TocLink({ id, label, onSelect }: { id: string; label: string; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className="rounded px-2 py-1 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
    >
      {label}
    </button>
  );
}

export function HelpPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="flex gap-8">
      <aside className="sticky top-6 hidden w-56 shrink-0 flex-col gap-4 self-start lg:flex">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            User Guide
          </span>
          {GUIDE_SECTIONS.map((s) => (
            <TocLink key={s.id} id={s.id} label={s.title} onSelect={scrollTo} />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            How-To
          </span>
          {HOW_TO_SECTIONS.map((s) => (
            <TocLink key={s.id} id={s.id} label={s.title} onSelect={scrollTo} />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <TocLink id="faq" label="FAQ" onSelect={scrollTo} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-10">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Help Center</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Everything you need to get the most out of Barkie.
          </p>
        </div>

        <section className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">User Guide</h2>
          {GUIDE_SECTIONS.map((s) => (
            <div key={s.id} id={s.id} className="scroll-mt-6 rounded border border-slate-200 p-4 dark:border-slate-700">
              <h3 className={`${proseH3} mb-2`}>{s.title}</h3>
              {s.content}
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">How-To Articles</h2>
          {HOW_TO_SECTIONS.map((s) => (
            <div key={s.id} id={s.id} className="scroll-mt-6 rounded border border-slate-200 p-4 dark:border-slate-700">
              <h3 className={`${proseH3} mb-2`}>{s.title}</h3>
              {s.content}
            </div>
          ))}
        </section>

        <section id="faq" className="scroll-mt-6 flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">FAQ</h2>
          {FAQ_ITEMS.map((item, index) => (
            <div key={item.question} className="rounded border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                {item.question}
                <span className="text-slate-400 dark:text-slate-500">{openFaq === index ? '−' : '+'}</span>
              </button>
              {openFaq === index && (
                <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
                  {item.answer}
                </p>
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
