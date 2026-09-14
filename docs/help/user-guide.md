# Barkie User Guide

## 1. Getting started

1. **Register** — business name, your name, email, password. You get a 14-day free trial automatically; no charge until it ends, and you can cancel anytime from Billing.
2. **Verify your email** — click the link we send you.
3. **Set up your shop basics** — head to Company Profile and Shop Profile to fill in your business details, VAT info (if registered), bank details for invoices, and your public shop page content (services, trading hours, gallery, social links).

## 2. Set up your costing inputs

Before you can cost a print accurately, tell Barkie what your inputs actually cost:

- **Printers** — add each printer with its purchase cost, power draw (watts), electricity rate, and expected lifetime hours. Barkie uses this to work out a per-hour depreciation + electricity cost automatically. Only the printer name, status, and process (FDM/resin/laser) are required to add one — everything else is optional detail you can fill in via "+ More details."
- **Filaments** — brand, material type, diameter, and what you paid per kg or per spool. Track remaining weight and set a low-stock threshold so Barkie can warn you before you run out mid-job.
- **Labour Steps** — the tasks you charge for (e.g. "Post-processing," "Design consultation") and your hourly rate for each.
- **Consumables** — glue stick, nozzles, build plate tape, packaging — anything you use up per job that isn't filament.
- **Scanners / Laser Materials / Pre-made Items** — if you offer 3D scanning, laser cutting/engraving, or resell pre-made items, set these up the same way so they can feed into costing templates too.

All of these live on their own page, reachable from the left-hand nav. Adding one is always right there at the top of the list — fill in the required fields, hit Add, done. No separate "new item" page to navigate to.

## 3. Build a Costing Template

A Costing Template is where the real math happens. Go to **Costing Templates → New**, pick the process type (Printer / Scanner / Laser sheet / Laser pre-made item), then:

- **Printer jobs**: pick the printer and filament, enter the weight (grams) and print time (hours) — or use the **Slicer** to get these numbers automatically from your actual STL file instead of guessing.
- Add any labour lines and consumable lines the job needs.
- Set your markup percentage.

Barkie computes filament cost, electricity cost, machine depreciation, labour cost, and consumables cost, sums them, applies your markup, and shows you a suggested sell price — the real number, not a guess.

## 4. Use the Slicer

Go to **Slicer** (or click "Slice STL" from inside a Costing Template). Upload your `.stl` file, optionally pick a printer/printer preset/filament, and hit Slice. Barkie runs an actual slicing engine server-side and returns real weight, support weight, filament length, and print time — which you can then use directly in a Costing Template, a Job Card, or a Quote line.

Slicing a complex model can take up to a minute or two — this is a real computation, not a lookup.

## 5. Customers, Quotes, and Invoices

- Add a **Customer** first (name + billing address is all that's required).
- Create a **Quote**, add line items (built from your costing templates), apply a discount if you want (percent, either on the total or per line), set payment terms, and send it.
- When a customer accepts, **convert the Quote to an Invoice** in one click — everything carries over.
- Invoices track payment status and support a payment-link URL if you use an online payment provider.

## 6. Job Cards (customer intake tickets)

Use **Job Cards** when a customer drops off/sends in a job before you've costed it — three types:
- **Repair**: what equipment, what's wrong, what came with it.
- **Print**: what file, material, colour, quantity, finishing needed.
- **CAD**: what needs designing, tolerances, deliverable format.

A Job Card can be converted straight into a Quote once you know what it'll cost.

## 7. Jobs board

Once work is actually underway, track it on the **Jobs** board — queued, in progress, done. This is separate from Job Cards (which is about intake) — Jobs is your shop-floor status tracker.

## 8. Team Accounts

Go to **Team** to invite up to 3 team members. Each gets `admin` (same access as you) or `sales` (day-to-day tools only — blocked from Billing, Company/Shop Profile, and Reports) role. They log in with their own email/password after accepting an invite.

## 9. Notifications

Go to **Notification Settings** to control what you get notified about (trial ending, low stock, overdue invoices, payment events) and through which channel (in-app, email) — each toggle is independent.

## 10. Dark mode

Click the theme control in the header (top right) to cycle System → Light → Dark. "System" follows your device's setting automatically; picking Light or Dark explicitly overrides that and is remembered — including on the public site, if you're logged in on the same device/browser.

## 11. Billing

Go to **Billing** to see your current plan, trial status, and payment history, or to change plans. Barkie supports PayFast and PayPal. If a payment fails, you keep read-only access to your data (nothing is deleted) until it's resolved — you're never locked out cold.
