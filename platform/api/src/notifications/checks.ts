import { prisma } from '../db/client.js';
import { mailer } from '../lib/mailer.js';

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const TRIAL_ENDING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Same "overdue" condition the reports summary route uses for its
 * `overdueInvoices` list — factored out here so both call sites agree on
 * what counts as overdue without a heavier shared abstraction. This never
 * mutates Invoice.status; that stays the tenant's own manual "Mark as
 * Overdue" action (see InvoiceDetailPage.tsx).
 */
export function overdueInvoiceWhere(tenantId: string) {
  return {
    tenantId,
    status: { in: ['unpaid', 'partially_paid'] },
    dueDate: { lt: new Date() },
  };
}

async function alreadyNotifiedForTenant(tenantId: string, type: string): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      tenantId,
      type,
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
  });
  return existing !== null;
}

async function alreadyNotifiedForEntity(
  tenantId: string,
  type: string,
  relatedEntityType: string,
  relatedEntityId: string,
): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      tenantId,
      type,
      relatedEntityType,
      relatedEntityId,
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
  });
  return existing !== null;
}

async function createNotification(params: {
  tenantId: string;
  tenantEmail: string;
  type: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      tenantId: params.tenantId,
      type: params.type,
      message: params.message,
      relatedEntityType: params.relatedEntityType ?? null,
      relatedEntityId: params.relatedEntityId ?? null,
    },
  });

  if (mailer.isConfigured()) {
    try {
      await mailer.sendMail({
        to: params.tenantEmail,
        subject: 'Barkie notification',
        text: params.message,
      });
    } catch (err) {
      // A transient SMTP failure must never block the in-app notification
      // that was already created above — same pattern as POST
      // /api/auth/register's verification-email send.
      console.error('notification email failed', err);
    }
  }
}

async function checkTrialEnding(tenantId: string, tenantEmail: string): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      tenantId,
      status: 'trialing',
      trialEndsAt: { lte: new Date(Date.now() + TRIAL_ENDING_WINDOW_MS) },
    },
  });
  if (!subscription) {
    return;
  }

  if (await alreadyNotifiedForTenant(tenantId, 'trial_ending')) {
    return;
  }

  await createNotification({
    tenantId,
    tenantEmail,
    type: 'trial_ending',
    message: `Your free trial ends on ${subscription.trialEndsAt.toISOString().slice(0, 10)}. Complete payment setup to keep your subscription active.`,
  });
}

async function checkLowStock(tenantId: string, tenantEmail: string): Promise<void> {
  const filaments = await prisma.filament.findMany({
    where: {
      tenantId,
      remainingWeightGrams: { not: null },
      lowStockThresholdGrams: { not: null },
    },
  });
  for (const filament of filaments) {
    if (filament.remainingWeightGrams === null || filament.lowStockThresholdGrams === null) {
      continue;
    }
    if (filament.remainingWeightGrams > filament.lowStockThresholdGrams) {
      continue;
    }
    if (await alreadyNotifiedForEntity(tenantId, 'low_stock', 'filament', filament.id)) {
      continue;
    }
    await createNotification({
      tenantId,
      tenantEmail,
      type: 'low_stock',
      message: `${filament.brand} ${filament.materialType} is running low: ${filament.remainingWeightGrams}g remaining.`,
      relatedEntityType: 'filament',
      relatedEntityId: filament.id,
    });
  }

  const consumables = await prisma.consumable.findMany({
    where: {
      tenantId,
      reorderThreshold: { not: null },
    },
  });
  for (const consumable of consumables) {
    if (consumable.reorderThreshold === null) {
      continue;
    }
    if (consumable.currentStock > consumable.reorderThreshold) {
      continue;
    }
    if (await alreadyNotifiedForEntity(tenantId, 'low_stock', 'consumable', consumable.id)) {
      continue;
    }
    await createNotification({
      tenantId,
      tenantEmail,
      type: 'low_stock',
      message: `${consumable.name} is running low: ${consumable.currentStock} ${consumable.unitOfMeasure} remaining.`,
      relatedEntityType: 'consumable',
      relatedEntityId: consumable.id,
    });
  }
}

async function checkInvoiceOverdue(tenantId: string, tenantEmail: string): Promise<void> {
  const overdueInvoices = await prisma.invoice.findMany({
    where: overdueInvoiceWhere(tenantId),
  });
  for (const invoice of overdueInvoices) {
    if (await alreadyNotifiedForEntity(tenantId, 'invoice_overdue', 'invoice', invoice.id)) {
      continue;
    }
    await createNotification({
      tenantId,
      tenantEmail,
      type: 'invoice_overdue',
      message: `Invoice ${invoice.number} is overdue (was due ${invoice.dueDate.toISOString().slice(0, 10)}).`,
      relatedEntityType: 'invoice',
      relatedEntityId: invoice.id,
    });
  }
}

export async function runNotificationChecks(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, email: true } });
  for (const tenant of tenants) {
    await checkTrialEnding(tenant.id, tenant.email);
    await checkLowStock(tenant.id, tenant.email);
    await checkInvoiceOverdue(tenant.id, tenant.email);
  }
}
