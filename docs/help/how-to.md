# How-To Articles

## How to price your first print accurately

1. Add your printer (Printers page) with purchase cost, power draw, electricity rate, expected lifetime hours.
2. Add the filament you're using (Filaments page) with cost per kg.
3. Add any labour steps you charge for (Labour Steps page).
4. Go to Costing Templates → New → Printer process.
5. Either type in the weight/print time, or click "Slice STL" and upload your file to get real numbers.
6. Add labour/consumable lines if relevant, set your markup %.
7. Your suggested sell price appears automatically — that's your real cost plus your margin, not a guess.

## How to send a quote and get paid

1. Add the customer (Customers page) if they're not already there.
2. Go to Quotes → New Quote, select the customer.
3. Add line items — pick an existing Costing Template per line, or describe a custom line.
4. Apply a discount if needed, set payment terms, save.
5. Download the PDF or send it however you normally do.
6. Once accepted, open the quote and click "Convert to Invoice" — everything carries over, you don't re-enter anything.

## How to use the STL Slicer to quote from a customer's file

1. Go to Slicer (or click "Slice STL" from a Costing Template / Quote line / Job Card).
2. Upload the customer's `.stl` file.
3. Pick your printer and filament (optional, but gives a more accurate result).
4. Click Slice — this takes real computation time (up to a minute or two for complex models), it's not instant.
5. Once done, you get real weight, support weight, filament length, and print time.
6. Use "Slice a file to build this line" on a Quote, or the Slice button on a Costing Template, to carry those numbers straight into your costing — no manual re-entry.

## How to set up a repair intake ticket

1. Go to Job Cards → New → Repair.
2. Fill in equipment make/model/serial, the reported fault, what the customer brought with it (power cord, filament, build plate, etc.), and current condition.
3. Save — this creates the ticket with an auto-generated job card number.
4. As you diagnose the issue, add your technician findings to the same ticket.
5. Once you know the cost, convert it to a Quote.

## How to invite a team member

1. Go to Team → Invite.
2. Enter their name, email, and role (`admin` or `sales`).
3. They receive an email to set their own password.
4. `sales` role can use the day-to-day tools (customers, quotes, printers, etc.) but can't see Billing, Company/Shop Profile, or Reports. `admin` has full access, same as you.
5. You can deactivate a team member at any time from the Team page — this takes effect immediately, even mid-session.

## How to switch between Light, Dark, and System theme

1. Click the theme control in the top-right header (shows "System," "Light," or "Dark").
2. Each click cycles to the next: System → Light → Dark → System.
3. "System" follows your device's setting automatically and updates live if you change it. Light/Dark stay fixed regardless of your device setting.
4. Your choice is remembered and applies across both the dashboard and the public site when you're on the same device.

## How to recover from a failed payment without losing access

1. If a payment fails, you'll see a banner across the dashboard and (if enabled) get a notification.
2. You keep read-only access — your data is safe, you just can't create/edit until it's resolved.
3. Go to Billing → update your payment method.
4. Once the payment succeeds, full access is restored automatically — no need to contact support.
