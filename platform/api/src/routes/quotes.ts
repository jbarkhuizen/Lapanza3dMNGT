import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Quote, QuoteLineItem } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { tenantScope } from '../db/scoped.js';
import { calculateQuoteTotals } from '../quoting/calculate.js';
import { formatDocumentNumber } from '../lib/numbering.js';
import { prisma } from '../db/client.js';
import { serializeInvoice } from './invoices.js';
import { generateDocumentPdf } from '../documents/generateDocumentPdf.js';
import { sendDocumentEmail } from '../documents/sendDocumentEmail.js';

export const quotesRouter = Router();
quotesRouter.use(requireTenantAuth);

type QuoteWithOptionalLines = Quote & { lineItems?: QuoteLineItem[] };

function serializeQuote(quote: QuoteWithOptionalLines) {
  return {
    ...quote,
    subtotal: quote.subtotal.toFixed(2),
    vatAmount: quote.vatAmount.toFixed(2),
    total: quote.total.toFixed(2),
    lineItems: quote.lineItems?.map((line) => ({
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

const createQuoteSchema = z.object({
  customerId: z.string().min(1),
  validUntil: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date.').optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
});

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'expired'],
  sent: ['accepted', 'expired'],
};

quotesRouter.get('/api/quotes', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const quotes = await scoped.quotes.findMany();
  res.json({ ok: true, quotes: quotes.map(serializeQuote) });
});

quotesRouter.get('/api/quotes/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const quote = await scoped.quotes.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ ok: false, error: 'Quote not found.' });
  }
  res.json({ ok: true, quote: serializeQuote(quote) });
});

quotesRouter.post('/api/quotes', async (req, res) => {
  const parsed = createQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'A customer and at least one line item are required.',
    });
  }
  const { customerId, validUntil, notes, lineItems } = parsed.data;
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

  const sequenceValue = await scoped.tenantSequences.next('quote');
  const number = formatDocumentNumber(profile.quoteNumberPrefix, sequenceValue);

  let resolvedValidUntil: Date | null = null;
  if (validUntil) {
    resolvedValidUntil = new Date(validUntil);
  } else if (profile.defaultQuoteValidityDays) {
    resolvedValidUntil = new Date(Date.now() + profile.defaultQuoteValidityDays * 24 * 60 * 60 * 1000);
  }

  const quote = await scoped.quotes.create({
    customerId,
    number,
    validUntil: resolvedValidUntil,
    vatApplied: profile.vatRegistered,
    subtotal: totals.subtotal.toString(),
    vatAmount: totals.vatAmount.toString(),
    total: totals.total.toString(),
    notes: notes ?? null,
    lineItems: resolvedLines.map((line, i) => ({
      costingTemplateId: line.costingTemplateId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: totals.lineUnitPrices[i].toString(),
      lineTotal: totals.lineTotals[i].toString(),
    })),
  });

  res.status(201).json({ ok: true, quote: serializeQuote(quote) });
});

quotesRouter.patch('/api/quotes/:id/status', async (req, res) => {
  const parsed = z.object({ status: z.enum(['sent', 'accepted', 'expired']) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'status must be one of: sent, accepted, expired.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const quote = await scoped.quotes.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ ok: false, error: 'Quote not found.' });
  }
  const allowedNextStatuses = VALID_STATUS_TRANSITIONS[quote.status] ?? [];
  if (!allowedNextStatuses.includes(parsed.data.status)) {
    return res.status(400).json({
      ok: false,
      error: `Cannot move a quote from "${quote.status}" to "${parsed.data.status}".`,
    });
  }
  await scoped.quotes.updateStatus(req.params.id, parsed.data.status);
  const updated = await scoped.quotes.findById(req.params.id);
  res.json({ ok: true, quote: serializeQuote(updated!) });
});

quotesRouter.post('/api/quotes/:id/convert-to-invoice', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const quote = await scoped.quotes.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ ok: false, error: 'Quote not found.' });
  }
  if (quote.status !== 'accepted') {
    return res.status(400).json({ ok: false, error: 'Only an accepted quote can be converted to an invoice.' });
  }

  const profile = await scoped.companyProfile.get();
  if (!profile) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }

  const tenantId = req.tenantId!;
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findFirst({ where: { quoteId: quote.id, tenantId } });
      if (existing) {
        throw new Error('QUOTE_ALREADY_CONVERTED');
      }

      await tx.tenantSequence.upsert({
        where: { tenantId_type: { tenantId, type: 'invoice' } },
        create: { tenantId, type: 'invoice', value: 0 },
        update: {},
      });
      const sequence = await tx.tenantSequence.update({
        where: { tenantId_type: { tenantId, type: 'invoice' } },
        data: { value: { increment: 1 } },
      });
      const number = formatDocumentNumber(profile.invoiceNumberPrefix, sequence.value);

      return tx.invoice.create({
        data: {
          tenantId,
          customerId: quote.customerId,
          quoteId: quote.id,
          number,
          dueDate,
          vatApplied: quote.vatApplied,
          subtotal: quote.subtotal,
          vatAmount: quote.vatAmount,
          total: quote.total,
          notes: quote.notes,
          lineItems: {
            create: quote.lineItems.map((line) => ({
              tenantId,
              quoteLineItemId: line.id,
              costingTemplateId: line.costingTemplateId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: { lineItems: true },
      });
    });

    res.status(201).json({
      ok: true,
      invoice: serializeInvoice(invoice),
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'QUOTE_ALREADY_CONVERTED') {
      return res.status(400).json({ ok: false, error: 'This quote has already been converted to an invoice.' });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(400).json({ ok: false, error: 'This quote has already been converted to an invoice.' });
    }
    throw err;
  }
});

quotesRouter.post('/api/quotes/:id/send', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const quote = await scoped.quotes.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ ok: false, error: 'Quote not found.' });
  }
  const customer = await scoped.customers.findById(quote.customerId);
  if (!customer || !customer.email) {
    return res.status(400).json({ ok: false, error: 'Customer has no email on file.' });
  }
  const profile = await scoped.companyProfile.get();
  if (!profile) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }

  const serialized = serializeQuote(quote);
  const pdfBuffer = await generateDocumentPdf({
    documentType: 'Quote',
    number: serialized.number,
    createdAt: quote.createdAt,
    dateLabel: 'Valid until',
    dateValue: quote.validUntil,
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
    notes: serialized.notes,
  });

  await sendDocumentEmail(customer.email, 'quote', quote.number);

  res.json({ ok: true, pdfBase64: pdfBuffer.toString('base64'), sentTo: customer.email, devMode: true });
});
