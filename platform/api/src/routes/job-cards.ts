import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';
import { prisma } from '../db/client.js';
import { calculateQuoteTotals } from '../quoting/calculate.js';
import { formatDocumentNumber } from '../lib/numbering.js';
import { serializeQuote } from './quotes.js';

export const jobCardsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

const CARD_TYPES = ['repair', 'print', 'cad'] as const;
type CardType = (typeof CARD_TYPES)[number];
const STATUSES = ['new', 'in_progress', 'done', 'cancelled'] as const;
const PRIORITIES = ['low', 'normal', 'high'] as const;

const dateStringSchema = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date.');

// --- Shared fields, present on every cardType ---

const sharedCreateFields = {
  customerId: z.string().min(1).optional(),
  jobTitle: z.string().min(1),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedTo: z.string().optional(),
  receivedDate: dateStringSchema,
  requiredBy: dateStringSchema.optional(),
  notes: z.string().optional(),
  terms: z.string().optional(),
  receivedBy: z.string().optional(),
};

const sharedUpdateFields = {
  customerId: z.string().min(1).nullable().optional(),
  jobTitle: z.string().min(1).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedTo: z.string().nullable().optional(),
  receivedDate: dateStringSchema.optional(),
  requiredBy: dateStringSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  receivedBy: z.string().nullable().optional(),
};

// --- Type-specific fields, one shape per cardType ---

const repairCreateFields = {
  equipmentMake: z.string().optional(),
  equipmentModel: z.string().optional(),
  equipmentSerial: z.string().optional(),
  reportedFault: z.string().optional(),
  receivedWithPowerCord: z.boolean().optional(),
  receivedWithFilament: z.boolean().optional(),
  receivedWithBuildPlate: z.boolean().optional(),
  receivedWithSdCard: z.boolean().optional(),
  receivedWithTools: z.boolean().optional(),
  receivedWithOther: z.string().optional(),
  conditionPrintHead: z.string().optional(),
  conditionPrintBed: z.string().optional(),
  conditionExistingDamage: z.string().optional(),
  technicianFindings: z.string().optional(),
};

const repairUpdateFields = {
  equipmentMake: z.string().nullable().optional(),
  equipmentModel: z.string().nullable().optional(),
  equipmentSerial: z.string().nullable().optional(),
  reportedFault: z.string().nullable().optional(),
  receivedWithPowerCord: z.boolean().optional(),
  receivedWithFilament: z.boolean().optional(),
  receivedWithBuildPlate: z.boolean().optional(),
  receivedWithSdCard: z.boolean().optional(),
  receivedWithTools: z.boolean().optional(),
  receivedWithOther: z.string().nullable().optional(),
  conditionPrintHead: z.string().nullable().optional(),
  conditionPrintBed: z.string().nullable().optional(),
  conditionExistingDamage: z.string().nullable().optional(),
  technicianFindings: z.string().nullable().optional(),
};

const printCreateFields = {
  printFileName: z.string().optional(),
  printQuantity: z.number().int().positive().optional(),
  printWhatIsPrinted: z.string().optional(),
  printProcess: z.string().optional(),
  printMaterial: z.string().optional(),
  printColour: z.string().optional(),
  printQuality: z.string().optional(),
  finishRemoveSupports: z.boolean().optional(),
  finishDeburrClean: z.boolean().optional(),
  finishSand: z.boolean().optional(),
  finishPrime: z.boolean().optional(),
  finishPaint: z.boolean().optional(),
  finishPostCure: z.boolean().optional(),
  finishInstallInserts: z.boolean().optional(),
  finishAssemble: z.boolean().optional(),
  resultQuantityAccepted: z.number().int().nonnegative().optional(),
  resultQuantityRejected: z.number().int().nonnegative().optional(),
  resultNotes: z.string().optional(),
};

const printUpdateFields = {
  printFileName: z.string().nullable().optional(),
  printQuantity: z.number().int().positive().nullable().optional(),
  printWhatIsPrinted: z.string().nullable().optional(),
  printProcess: z.string().nullable().optional(),
  printMaterial: z.string().nullable().optional(),
  printColour: z.string().nullable().optional(),
  printQuality: z.string().nullable().optional(),
  finishRemoveSupports: z.boolean().optional(),
  finishDeburrClean: z.boolean().optional(),
  finishSand: z.boolean().optional(),
  finishPrime: z.boolean().optional(),
  finishPaint: z.boolean().optional(),
  finishPostCure: z.boolean().optional(),
  finishInstallInserts: z.boolean().optional(),
  finishAssemble: z.boolean().optional(),
  resultQuantityAccepted: z.number().int().nonnegative().nullable().optional(),
  resultQuantityRejected: z.number().int().nonnegative().nullable().optional(),
  resultNotes: z.string().nullable().optional(),
};

const cadCreateFields = {
  cadDesignType: z.string().optional(),
  cadWhatModelMustDo: z.string().optional(),
  cadMaterial: z.string().optional(),
  cadIntendedProcess: z.string().optional(),
  cadTolerances: z.string().optional(),
  cadCriticalDimensions: z.string().optional(),
  deliverableNativeCad: z.boolean().optional(),
  deliverableStep: z.boolean().optional(),
  deliverableStl: z.boolean().optional(),
  deliverable3mf: z.boolean().optional(),
  deliverableDxf: z.boolean().optional(),
  deliverableDrawingPdf: z.boolean().optional(),
  deliverableRenderedImages: z.boolean().optional(),
  cadApprovedRevision: z.string().optional(),
};

const cadUpdateFields = {
  cadDesignType: z.string().nullable().optional(),
  cadWhatModelMustDo: z.string().nullable().optional(),
  cadMaterial: z.string().nullable().optional(),
  cadIntendedProcess: z.string().nullable().optional(),
  cadTolerances: z.string().nullable().optional(),
  cadCriticalDimensions: z.string().nullable().optional(),
  deliverableNativeCad: z.boolean().optional(),
  deliverableStep: z.boolean().optional(),
  deliverableStl: z.boolean().optional(),
  deliverable3mf: z.boolean().optional(),
  deliverableDxf: z.boolean().optional(),
  deliverableDrawingPdf: z.boolean().optional(),
  deliverableRenderedImages: z.boolean().optional(),
  cadApprovedRevision: z.string().nullable().optional(),
};

// A discriminated union on cardType -- each variant is `.strict()`, so a
// `print`-typed request that includes e.g. `cadDesignType` is rejected
// outright rather than silently ignored (per the design spec).
const createJobCardSchema = z.discriminatedUnion('cardType', [
  z.object({ cardType: z.literal('repair'), ...sharedCreateFields, ...repairCreateFields }).strict(),
  z.object({ cardType: z.literal('print'), ...sharedCreateFields, ...printCreateFields }).strict(),
  z.object({ cardType: z.literal('cad'), ...sharedCreateFields, ...cadCreateFields }).strict(),
]);

// PATCH doesn't use a discriminated union directly -- the card's existing
// cardType (not the request body) picks which of these three schemas
// applies, since changing cardType after creation is not supported.
const updateSchemasByType: Record<CardType, z.ZodTypeAny> = {
  repair: z.object({ ...sharedUpdateFields, ...repairUpdateFields }).strict(),
  print: z.object({ ...sharedUpdateFields, ...printUpdateFields }).strict(),
  cad: z.object({ ...sharedUpdateFields, ...cadUpdateFields }).strict(),
};

jobCardsRouter.get('/api/job-cards', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const jobCards = await scoped.jobCards.findMany();
  res.json({ ok: true, jobCards });
});

// Placed before /api/job-cards/:id so that path doesn't shadow this one.
jobCardsRouter.get('/api/job-cards/stats', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const tenantId = req.tenantId!;
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  // "Within the next 3 days" is treated as an upper bound only (requiredBy
  // <= threeDaysFromNow, no lower bound) -- a card whose requiredBy date has
  // already passed still needs attention, so it stays counted as due soon
  // rather than dropping out once it's overdue.
  const dueSoon = await prisma.jobCard.count({
    where: {
      tenantId,
      requiredBy: { not: null, lte: threeDaysFromNow },
      status: { notIn: ['done', 'cancelled'] },
    },
  });

  const awaitingQuote = await prisma.jobCard.count({
    where: { tenantId, quoteId: null, status: { not: 'cancelled' } },
  });

  const quoted = await prisma.jobCard.count({ where: { tenantId, quoteId: { not: null } } });

  const invoiced = await prisma.jobCard.count({
    where: { tenantId, quoteId: { not: null }, quote: { invoice: { isNot: null } } },
  });

  res.json({ ok: true, dueSoon, awaitingQuote, quoted, invoiced });
});

jobCardsRouter.get('/api/job-cards/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const jobCard = await scoped.jobCards.findById(req.params.id);
  if (!jobCard) {
    return res.status(404).json({ ok: false, error: 'Job card not found.' });
  }
  res.json({ ok: true, jobCard });
});

jobCardsRouter.post('/api/job-cards', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createJobCardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid job card fields.' });
  }
  const { cardType, customerId, jobTitle, status, priority, assignedTo, receivedDate, requiredBy, notes, terms, receivedBy, ...typeFields } =
    parsed.data;

  const scoped = tenantScope(req.tenantId!);

  if (customerId) {
    const customer = await scoped.customers.findById(customerId);
    if (!customer) {
      return res.status(400).json({ ok: false, error: 'Customer not found.' });
    }
  }

  const jobCard = await scoped.jobCards.create({
    cardType,
    customerId: customerId ?? null,
    jobTitle,
    status,
    priority,
    assignedTo: assignedTo ?? null,
    receivedDate: new Date(receivedDate),
    requiredBy: requiredBy ? new Date(requiredBy) : null,
    notes: notes ?? null,
    terms: terms ?? null,
    receivedBy: receivedBy ?? null,
    ...typeFields,
  });

  res.status(201).json({ ok: true, jobCard });
});

jobCardsRouter.patch('/api/job-cards/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const existing = await scoped.jobCards.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ ok: false, error: 'Job card not found.' });
  }

  const body: Record<string, unknown> = { ...req.body };
  if ('cardType' in body) {
    if (body.cardType !== existing.cardType) {
      return res.status(400).json({ ok: false, error: "Changing a job card's type is not supported." });
    }
    delete body.cardType;
  }

  const schema = updateSchemasByType[existing.cardType as CardType];
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid job card fields.' });
  }
  const data = parsed.data as Record<string, unknown> & {
    customerId?: string | null;
    receivedDate?: string;
    requiredBy?: string | null;
  };

  if ('customerId' in data && data.customerId) {
    const customer = await scoped.customers.findById(data.customerId);
    if (!customer) {
      return res.status(400).json({ ok: false, error: 'Customer not found.' });
    }
  }

  const jobCard = await scoped.jobCards.update(req.params.id, {
    ...data,
    receivedDate: data.receivedDate ? new Date(data.receivedDate) : undefined,
    requiredBy: 'requiredBy' in data ? (data.requiredBy ? new Date(data.requiredBy) : null) : undefined,
  });
  if (!jobCard) {
    return res.status(404).json({ ok: false, error: 'Job card not found.' });
  }
  res.json({ ok: true, jobCard });
});

jobCardsRouter.post(
  '/api/job-cards/:id/create-quote',
  requireTenantAuth,
  requireActiveSubscription,
  async (req, res) => {
    const scoped = tenantScope(req.tenantId!);
    const jobCard = await scoped.jobCards.findById(req.params.id);
    if (!jobCard) {
      return res.status(404).json({ ok: false, error: 'Job card not found.' });
    }
    if (!jobCard.customerId) {
      return res.status(400).json({ ok: false, error: 'This job card has no customer set.' });
    }
    if (jobCard.quoteId) {
      return res.status(400).json({ ok: false, error: 'This job card already has a quote.' });
    }

    const profile = await scoped.companyProfile.get();
    if (!profile) {
      return res.status(404).json({ ok: false, error: 'Tenant not found.' });
    }

    const totals = calculateQuoteTotals({
      lines: [{ unitPrice: 0, quantity: 1 }],
      vatApplied: profile.vatRegistered,
    });

    const sequenceValue = await scoped.tenantSequences.next('quote');
    const number = formatDocumentNumber(profile.quoteNumberPrefix, sequenceValue);

    const quote = await scoped.quotes.create({
      customerId: jobCard.customerId,
      number,
      validUntil: null,
      vatApplied: profile.vatRegistered,
      subtotal: totals.subtotal.toString(),
      vatAmount: totals.vatAmount.toString(),
      total: totals.total.toString(),
      notes: null,
      lineItems: [
        {
          costingTemplateId: null,
          description: jobCard.jobTitle,
          quantity: 1,
          unitPrice: totals.lineUnitPrices[0].toString(),
          lineTotal: totals.lineTotals[0].toString(),
        },
      ],
    });

    await scoped.jobCards.linkQuote(jobCard.id, quote.id);

    res.status(201).json({ ok: true, quote: await serializeQuote(quote) });
  },
);
