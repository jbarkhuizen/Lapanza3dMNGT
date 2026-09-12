import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { Quote, QuoteLineItem } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';
import { calculateQuoteTotals, MAX_MONEY_VALUE } from '../quoting/calculate.js';
import { formatDocumentNumber } from '../lib/numbering.js';
import { prisma } from '../db/client.js';
import { serializeInvoice } from './invoices.js';
import { generateDocumentPdf } from '../documents/generateDocumentPdf.js';
import { sendDocumentEmail } from '../documents/sendDocumentEmail.js';
import { mailer } from '../lib/mailer.js';
import { env } from '../env.js';

export const quotesRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

// POST /api/quotes/:id/send is the first CPU-heavy (pdfkit-rendering),
// otherwise-unthrottled endpoint on this router. Same shape as admin.ts's
// adminLoginLimiter.
//
// quotesRouter is a module-level singleton (like adminRouter, unlike
// auth.ts's per-buildApp() createAuthRouter() factory), so this limiter
// instance — and its hit counter — persists for the entire process, not
// just one app instance. Widening the budget under NODE_ENV=test only —
// production and development keep the real 20/hour — avoids cross-test
// bleed without weakening the actual protection anywhere it matters.
const sendQuoteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.nodeEnv === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
});

type QuoteWithOptionalLines = Quote & { lineItems?: QuoteLineItem[] };

async function serializeQuote(quote: QuoteWithOptionalLines) {
  // A quote carries no direct column pointing at the invoice it was
  // converted into (the pointer lives the other way round, on
  // Invoice.quoteId), so look it up here to give callers a back-reference.
  const invoice = await prisma.invoice.findUnique({ where: { quoteId: quote.id }, select: { id: true } });
  return {
    ...quote,
    subtotal: quote.subtotal.toFixed(2),
    vatAmount: quote.vatAmount.toFixed(2),
    total: quote.total.toFixed(2),
    invoiceId: invoice?.id ?? null,
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

quotesRouter.get('/api/quotes', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const quotes = await scoped.quotes.findMany();
  res.json({ ok: true, quotes: await Promise.all(quotes.map(serializeQuote)) });
});

// Placed before /api/quotes/:id so that path doesn't shadow this one.
quotesRouter.get('/api/quotes/stats', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const tenantId = req.tenantId!;

  const totalAgg = await prisma.quote.aggregate({
    where: { tenantId },
    _sum: { total: true },
    _count: true,
  });
  const totalQuotes = totalAgg._count;
  const totalValue = totalAgg._sum.total ? totalAgg._sum.total.toFixed(2) : '0.00';

  const expiredCount = await prisma.quote.count({ where: { tenantId, status: 'expired' } });
  const convertedCount = await prisma.quote.count({ where: { tenantId, status: 'accepted' } });

  res.json({ ok: true, totalQuotes, totalValue, expiredCount, convertedCount });
});

quotesRouter.get('/api/quotes/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const quote = await scoped.quotes.findById(req.params.id);
  if (!quote) {
    return res.status(404).json({ ok: false, error: 'Quote not found.' });
  }
  res.json({ ok: true, quote: await serializeQuote(quote) });
});

quotesRouter.post('/api/quotes', requireTenantAuth, requireActiveSubscription, async (req, res) => {
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

  // Each line's unitPrice is already capped by the zod schema above, but
  // that only bounds a single line — many valid lines (or a large quantity)
  // can still push the summed subtotal/vatAmount/total past what the
  // Decimal(12,2) columns can hold. Check before burning a quote number.
  if (
    totals.subtotal.greaterThan(MAX_MONEY_VALUE) ||
    totals.vatAmount.greaterThan(MAX_MONEY_VALUE) ||
    totals.total.greaterThan(MAX_MONEY_VALUE)
  ) {
    return res.status(400).json({ ok: false, error: 'The quote total is too large.' });
  }

  const sequenceValue = await scoped.tenantSequences.next('quote');
  const number = formatDocumentNumber(profile.quoteNumberPrefix, sequenceValue);

  let resolvedValidUntil: Date | null = null;
  if (validUntil) {
    resolvedValidUntil = new Date(validUntil);
  } else if (profile.defaultQuoteValidityDays) {
    resolvedValidUntil = new Date(Date.now() + profile.defaultQuoteValidityDays * 24 * 60 * 60 * 1000);
  }

  let quote;
  try {
    quote = await scoped.quotes.create({
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
  } catch (error) {
    // @@unique([tenantId, number]) (backlog #35) — reachable whenever
    // quoteNumberPrefix and invoiceNumberPrefix are set to the same string,
    // since the two TenantSequence counters advance independently and will
    // eventually land on the same formatted number. Not a rare race; a
    // deterministic collision the DB constraint now catches.
    const isNumberCollision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    if (isNumberCollision) {
      return res.status(400).json({
        ok: false,
        error: 'A quote with this number already exists — check your quote number prefix in Company Profile.',
      });
    }
    throw error;
  }

  res.status(201).json({ ok: true, quote: await serializeQuote(quote) });
});

quotesRouter.patch('/api/quotes/:id/status', requireTenantAuth, requireActiveSubscription, async (req, res) => {
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
  res.json({ ok: true, quote: await serializeQuote(updated!) });
});

quotesRouter.post('/api/quotes/:id/convert-to-invoice', requireTenantAuth, requireActiveSubscription, async (req, res) => {
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

quotesRouter.post('/api/quotes/:id/send', sendQuoteLimiter, requireTenantAuth, requireActiveSubscription, async (req: Request<{ id: string }>, res: Response) => {
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

  const serialized = await serializeQuote(quote);
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

  await sendDocumentEmail(customer.email, 'quote', quote.number, pdfBuffer, profile.businessName, profile.email);

  res.json({
    ok: true,
    pdfBase64: pdfBuffer.toString('base64'),
    sentTo: customer.email,
    devMode: !mailer.isConfigured(),
  });
});
