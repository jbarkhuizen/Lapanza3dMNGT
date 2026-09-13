import { Router } from 'express';
import { z } from 'zod';
import type { Product } from '@prisma/client';
import { requireTenantAuth } from '../middleware/requireTenantAuth.js';
import { requireActiveSubscription } from '../middleware/requireActiveSubscription.js';
import { tenantScope } from '../db/scoped.js';

export const productsRouter = Router();
// Auth/subscription gating is applied per-route (not via a blanket
// `.use()`) so a genuinely unmatched path that falls through to this
// router doesn't get a misleading 401 — it falls through to the next
// router / app.ts's final 404 handler instead. See backlog #6.

// Products are a simple named price catalog only (name, category, cost,
// selling price) -- no stock columns, no reservation logic. See the design
// spec's "Scope decision" section: Product stock tracking is explicitly out
// of scope for this pass.
function serializeProduct(product: Product) {
  return {
    ...product,
    cost: product.cost.toFixed(2),
    sellingPrice: product.sellingPrice.toFixed(2),
  };
}

const createProductSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  cost: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
});

const updateProductSchema = createProductSchema.partial().extend({
  // Unlike create, PATCH must be able to explicitly clear category back to
  // null -- omitting the key still leaves it untouched (see .partial()
  // above), but an explicit `null` is now accepted rather than rejected.
  category: z.string().nullable().optional(),
});

productsRouter.get('/api/products', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const products = await scoped.products.findMany();
  res.json({ ok: true, products: products.map(serializeProduct) });
});

productsRouter.post('/api/products', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Name, cost, and selling price are required.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const product = await scoped.products.create({
    name: parsed.data.name,
    category: parsed.data.category,
    cost: parsed.data.cost.toString(),
    sellingPrice: parsed.data.sellingPrice.toString(),
  });
  res.status(201).json({ ok: true, product: serializeProduct(product) });
});

productsRouter.get('/api/products/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const product = await scoped.products.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ ok: false, error: 'Product not found.' });
  }
  res.json({ ok: true, product: serializeProduct(product) });
});

productsRouter.patch('/api/products/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Invalid product fields.' });
  }
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.products.update(req.params.id, {
    name: parsed.data.name,
    ...('category' in parsed.data ? { category: parsed.data.category ?? null } : {}),
    cost: parsed.data.cost?.toString(),
    sellingPrice: parsed.data.sellingPrice?.toString(),
  });
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Product not found.' });
  }
  res.json({ ok: true });
});

productsRouter.delete('/api/products/:id', requireTenantAuth, requireActiveSubscription, async (req, res) => {
  const scoped = tenantScope(req.tenantId!);
  const result = await scoped.products.delete(req.params.id);
  if (result.count === 0) {
    return res.status(404).json({ ok: false, error: 'Product not found.' });
  }
  res.json({ ok: true });
});
