import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';
import { prisma } from '../db/client.js';
import { overdueInvoiceWhere } from '../notifications/checks.js';

export const customersRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a path this router doesn't define — e.g. a typo, or any
// other genuinely unmatched /api/* route that merely happens to fall
// through to this router in the app.ts mount chain — falls through to the
// next router (and eventually app.ts's final 404 handler) instead of a
// misleading 401 from an auth check that never had a real route to
// protect. See backlog #6.

const createCustomerSchema = z.object({
  name: z.string().min(1),
  billingAddress: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  deliveryAddress: z.string().optional(),
  vatNumber: z.string().optional(),
  notes: z.string().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

customersRouter.get('/api/customers', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const customers = await scoped.customers.findMany();
  res.json({ ok: true, customers });
});

customersRouter.post('/api/customers', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Customer name and billing address are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const customer = await scoped.customers.create(parsed.data);
  res.status(201).json({ ok: true, customer });
});

// Placed before /api/customers/:id so that path doesn't shadow this one.
customersRouter.get('/api/customers/stats', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const tenantId = req.tenantId!;

  const totalClients = await prisma.customer.count({ where: { tenantId } });

  const nonPaidInvoices = await prisma.invoice.findMany({
    where: { tenantId, status: { not: 'paid' } },
    select: { total: true, amountPaid: true },
  });
  const outstanding = nonPaidInvoices
    .reduce((sum, invoice) => sum.plus(invoice.total.minus(invoice.amountPaid)), new Prisma.Decimal(0))
    .toFixed(2);

  const overdueInvoices = await prisma.invoice.findMany({
    where: overdueInvoiceWhere(tenantId),
    select: { customerId: true },
  });
  const withOverdue = new Set(overdueInvoices.map((invoice) => invoice.customerId)).size;

  res.json({ ok: true, totalClients, outstanding, withOverdue });
});

customersRouter.get('/api/customers/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const customer = await scoped.customers.findById(req.params.id);
  if (!customer) {
    return res.status(404).json({ ok: false, error: 'Customer not found.' });
  }
  res.json({ ok: true, customer });
});

customersRouter.patch('/api/customers/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid customer fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const customer = await scoped.customers.update(req.params.id, parsed.data);
  if (!customer) {
    return res.status(404).json({ ok: false, error: 'Customer not found.' });
  }
  res.json({ ok: true, customer });
});
