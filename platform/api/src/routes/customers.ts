import { Router } from 'express';
import { z } from 'zod';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const customersRouter = Router();
customersRouter.use(requireTenantAuth);
customersRouter.use(requireActiveSubscription);

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

customersRouter.get('/api/customers', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const customers = await scoped.customers.findMany();
  res.json({ ok: true, customers });
});

customersRouter.post('/api/customers', async (req, res) => {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Customer name and billing address are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const customer = await scoped.customers.create(parsed.data);
  res.status(201).json({ ok: true, customer });
});

customersRouter.get('/api/customers/:id', async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const customer = await scoped.customers.findById(req.params.id);
  if (!customer) {
    return res.status(404).json({ ok: false, error: 'Customer not found.' });
  }
  res.json({ ok: true, customer });
});

customersRouter.patch('/api/customers/:id', async (req, res) => {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid customer fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.customers.update(req.params.id, parsed.data);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Customer not found.' });
  }
  res.json({ ok: true });
});
