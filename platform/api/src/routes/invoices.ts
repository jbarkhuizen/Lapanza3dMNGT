import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Invoice, InvoiceLineItem } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';
import { calculateQuoteTotals } from '../quoting/calculate.js';
import { formatDocumentNumber } from '../lib/numbering.js';
import { generateDocumentPdf } from '../documents/generateDocumentPdf.js';
import { sendDocumentEmail } from '../documents/sendDocumentEmail.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireTenantAuth);

type InvoiceWithOptionalLines = Invoice & { lineItems?: InvoiceLineItem[] };

export function serializeInvoice(invoice: InvoiceWithOptionalLines) {
  return {
    ...invoice,
    subtotal: invoice.subtotal.toFixed(2),
    vatAmount: invoice.vatAmount.toFixed(2),
    total: invoice.total.toFixed(2),
    amountPaid: invoice.amountPaid.toFixed(2),
    balanceDue: invoice.total.minus(invoice.amountPaid).toFixed(2),
    lineItems: invoice.lineItems?.map((line) => ({
      ...line,
      unitPrice: line.unitPrice.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
    })),
  };
}

const lineItemSchema = z
  .object({
    costingTemplateId: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    unitPrice: z.number().nonnegative().max(9999999999.99).optional(),
    quantity: z.number().positive().max(100000).default(1),
  })
  .refine((data) => data.costingTemplateId != null || (data.description != null && data.unitPrice != null), {
    message: 'Each line item needs either a costingTemplateId, or a description and unitPrice.',
  });

const createInvoiceSchema = z.object({
  customerId: z.string().min(1),
  dueDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date.').optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

const DEFAULT_DUE_DAYS = 30;

invoicesRouter.get('/api/invoices', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const invoices = await scoped.invoices.findMany();
  res.json({ ok: true, invoices: invoices.map(serializeInvoice) });
});

invoicesRouter.get('/api/invoices/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const invoice = await scoped.invoices.findById(req.params.id);
  if (!invoice) {
    return res.status(404).json({ ok: false, error: 'Invoice not found.' });
  }
  res.json({ ok: true, invoice: serializeInvoice(invoice) });
});

invoicesRouter.post('/api/invoices', async (req, res) => {
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'A customer and at least one line item are required.',
    });
  }
  const { customerId, dueDate, notes, lineItems } = parsed.data;
  const scoped = tenantScope(req.tenantId!);

  const customer = await scoped.customers.findById(customerId);
  if (!customer) {
    return res.status(400).json({ ok: false, error: 'Customer not found.' });
  }

  const resolvedLines: Array<{
    costingTemplateId: string | null;
    description: string;
    unitPrice: number | import('@prisma/client').Prisma.Decimal;
    quantity: number;
  }> = [];
  for (const line of lineItems) {
    if (line.costingTemplateId) {
      const template = await scoped.costingTemplates.findById(line.costingTemplateId);
      if (!template) {
        return res.status(400).json({ ok: false, error: 'One of the costing templates was not found.' });
      }
      resolvedLines.push({
        costingTemplateId: template.id,
        description: template.name,
        unitPrice: template.suggestedPrice,
        quantity: line.quantity,
      });
    } else {
      resolvedLines.push({
        costingTemplateId: null,
        description: line.description!,
        unitPrice: line.unitPrice!,
        quantity: line.quantity,
      });
    }
  }

  const profile = await scoped.companyProfile.get();
  if (!profile) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }

  const totals = calculateQuoteTotals({
    lines: resolvedLines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    vatApplied: profile.vatRegistered,
  });

  const sequenceValue = await scoped.tenantSequences.next('invoice');
  const number = formatDocumentNumber(profile.invoiceNumberPrefix, sequenceValue);
  const resolvedDueDate = dueDate
    ? new Date(dueDate)
    : new Date(Date.now() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000);

  const invoice = await scoped.invoices.create({
    customerId,
    quoteId: null,
    number,
    dueDate: resolvedDueDate,
    vatApplied: profile.vatRegistered,
    subtotal: totals.subtotal.toString(),
    vatAmount: totals.vatAmount.toString(),
    total: totals.total.toString(),
    notes: notes ?? null,
    lineItems: resolvedLines.map((line, i) => ({
      quoteLineItemId: null,
      costingTemplateId: line.costingTemplateId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: totals.lineUnitPrices[i].toString(),
      lineTotal: totals.lineTotals[i].toString(),
    })),
  });

  res.status(201).json({ ok: true, invoice: serializeInvoice(invoice) });
});

const updateInvoiceStatusSchema = z
  .object({
    status: z.enum(['partially_paid', 'paid', 'overdue']),
    amountPaid: z.number().nonnegative().optional(),
  })
  .refine((data) => data.status !== 'partially_paid' || data.amountPaid !== undefined, {
    message: 'amountPaid is required when status is partially_paid.',
  })
  .refine((data) => data.status !== 'paid' || data.amountPaid !== undefined, {
    message: 'amountPaid is required when status is paid.',
  })
  .refine((data) => data.status !== 'overdue' || data.amountPaid === undefined, {
    message: 'amountPaid must not be provided when status is overdue.',
  });

const VALID_INVOICE_STATUS_TRANSITIONS: Record<string, string[]> = {
  unpaid: ['partially_paid', 'paid', 'overdue'],
  partially_paid: ['partially_paid', 'paid', 'overdue'],
  overdue: ['overdue', 'partially_paid', 'paid'],
  paid: [],
};

invoicesRouter.patch('/api/invoices/:id/status', async (req, res) => {
  const parsed = updateInvoiceStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid status update.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const invoice = await scoped.invoices.findById(req.params.id);
  if (!invoice) {
    return res.status(404).json({ ok: false, error: 'Invoice not found.' });
  }

  const { status, amountPaid } = parsed.data;

  const allowedNextStatuses = VALID_INVOICE_STATUS_TRANSITIONS[invoice.status] ?? [];
  if (!allowedNextStatuses.includes(status)) {
    return res.status(400).json({
      ok: false,
      error: `Cannot move an invoice from "${invoice.status}" to "${status}".`,
    });
  }

  const roundedAmountPaid =
    amountPaid !== undefined ? new Prisma.Decimal(amountPaid).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : undefined;

  if (status === 'partially_paid' && !(roundedAmountPaid!.gt(0) && roundedAmountPaid!.lt(invoice.total))) {
    return res.status(400).json({
      ok: false,
      error: 'amountPaid must be greater than 0 and less than the invoice total for partially_paid.',
    });
  }
  if (status === 'paid' && !roundedAmountPaid!.equals(invoice.total)) {
    return res.status(400).json({ ok: false, error: 'amountPaid must equal the invoice total for paid.' });
  }

  await scoped.invoices.updateStatus(req.params.id, status, roundedAmountPaid?.toString());
  const updated = await scoped.invoices.findById(req.params.id);
  res.json({ ok: true, invoice: serializeInvoice(updated!) });
});

invoicesRouter.post('/api/invoices/:id/send', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const invoice = await scoped.invoices.findById(req.params.id);
  if (!invoice) {
    return res.status(404).json({ ok: false, error: 'Invoice not found.' });
  }
  const customer = await scoped.customers.findById(invoice.customerId);
  if (!customer || !customer.email) {
    return res.status(400).json({ ok: false, error: 'Customer has no email on file.' });
  }
  const profile = await scoped.companyProfile.get();
  if (!profile) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }

  const serialized = serializeInvoice(invoice);
  const pdfBuffer = await generateDocumentPdf({
    documentType: 'Invoice',
    number: serialized.number,
    createdAt: invoice.createdAt,
    dateLabel: 'Due date',
    dateValue: invoice.dueDate,
    companyProfile: profile,
    customer: { name: customer.name, billingAddress: customer.billingAddress, vatNumber: customer.vatNumber },
    lineItems: serialized.lineItems!.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
    subtotal: serialized.subtotal,
    vatAmount: serialized.vatAmount,
    vatApplied: serialized.vatApplied,
    total: serialized.total,
    amountPaid: serialized.amountPaid,
    balanceDue: serialized.balanceDue,
    notes: serialized.notes,
  });

  await sendDocumentEmail(customer.email, 'invoice', invoice.number);

  res.json({ ok: true, pdfBase64: pdfBuffer.toString('base64'), sentTo: customer.email, devMode: true });
});
