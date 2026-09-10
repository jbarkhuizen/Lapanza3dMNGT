import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const companyProfileRouter = Router();
companyProfileRouter.use(requireTenantAuth);
companyProfileRouter.use(requireActiveSubscription);

const updateCompanyProfileSchema = z
  .object({
    businessName: z.string().min(1).optional(),
    contactName: z.string().min(1).optional(),
    registrationNumber: z.string().optional(),
    vatRegistered: z.boolean().optional(),
    vatNumber: z.string().trim().optional(),
    logoUrl: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountHolder: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankBranchCode: z.string().optional(),
    termsAndConditionsText: z.string().optional(),
    defaultCurrency: z.string().optional(),
    defaultQuoteValidityDays: z.number().int().positive().optional(),
    quoteNumberPrefix: z.string().trim().optional(),
    invoiceNumberPrefix: z.string().trim().optional(),
  })
  .refine((data) => !(data.vatRegistered === true && data.vatNumber === ''), {
    message: 'VAT number is required when VAT-registered.',
  });

companyProfileRouter.get('/api/company-profile', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const profile = await scoped.companyProfile.get();
  res.json({ ok: true, companyProfile: profile });
});

companyProfileRouter.patch('/api/company-profile', async (req, res) => {
  const parsed = updateCompanyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid company profile fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const current = await scoped.companyProfile.get();
  if (current === null) {
    return res.status(404).json({ ok: false, error: 'Tenant not found.' });
  }
  const willBeVatRegistered = parsed.data.vatRegistered ?? current.vatRegistered;
  const willHaveVatNumber = parsed.data.vatNumber ?? current.vatNumber;
  if (willBeVatRegistered && !willHaveVatNumber) {
    return res.status(400).json({ ok: false, error: 'VAT number is required when VAT-registered.' });
  }
  const profile = await scoped.companyProfile.update(parsed.data);
  res.json({ ok: true, companyProfile: profile });
});
