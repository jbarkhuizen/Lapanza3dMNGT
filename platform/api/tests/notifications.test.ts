import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { buildMinimalApp, loggedInAgent, resetTestDatabase } from './helpers/testApp.js';
import { notificationsRouter } from '../src/routes/notifications.js';
import { runNotificationChecks } from '../src/notifications/checks.js';
import { prisma } from '../src/db/client.js';
import { mailer } from '../src/lib/mailer.js';

beforeEach(resetTestDatabase);

test('notification endpoints require auth', async () => {
  const app = buildMinimalApp(notificationsRouter);
  const getRes = await request(app).get('/api/notifications');
  assert.equal(getRes.status, 401);
  const patchRes = await request(app).patch('/api/notifications/does-not-exist/read');
  assert.equal(patchRes.status, 401);
  const postRes = await request(app).post('/api/notifications/mark-all-read');
  assert.equal(postRes.status, 401);
});

test('runNotificationChecks creates a trial_ending notification for a trial ending within 3 days, not for one 10 days out', async () => {
  const app = buildApp();
  const soonAgent = await loggedInAgent(app, 'trial-soon@example.co.za');
  const soonTenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'trial-soon@example.co.za' } });
  await prisma.subscription.update({
    where: { tenantId: soonTenant.id },
    data: { status: 'trialing', trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
  });

  const farAgent = await loggedInAgent(app, 'trial-far@example.co.za');
  const farTenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'trial-far@example.co.za' } });
  await prisma.subscription.update({
    where: { tenantId: farTenant.id },
    data: { status: 'trialing', trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
  });
  void soonAgent;
  void farAgent;

  await runNotificationChecks();

  const soonNotifications = await prisma.notification.findMany({ where: { tenantId: soonTenant.id, type: 'trial_ending' } });
  assert.equal(soonNotifications.length, 1);

  const farNotifications = await prisma.notification.findMany({ where: { tenantId: farTenant.id, type: 'trial_ending' } });
  assert.equal(farNotifications.length, 0);
});

test('runNotificationChecks creates low_stock notifications for both a Filament and a Consumable crossing their thresholds', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'jane@acmeprints.co.za' } });

  const filamentRes = await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    remainingWeightGrams: 40,
    lowStockThresholdGrams: 50,
  });
  assert.equal(filamentRes.status, 201);

  const consumableRes = await agent.post('/api/consumables').send({
    name: 'Nozzle 0.4mm',
    category: 'nozzle',
    unitOfMeasure: 'unit',
    costPerUnit: 10,
    currentStock: 1,
    reorderThreshold: 2,
  });
  assert.equal(consumableRes.status, 201);

  await runNotificationChecks();

  const lowStockNotifications = await prisma.notification.findMany({
    where: { tenantId: tenant.id, type: 'low_stock' },
  });
  assert.equal(lowStockNotifications.length, 2);
  const relatedTypes = lowStockNotifications.map((n) => n.relatedEntityType).sort();
  assert.deepEqual(relatedTypes, ['consumable', 'filament']);
});

test('runNotificationChecks creates invoice_overdue for a past-due unpaid invoice and does not mutate its status', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'jane@acmeprints.co.za' } });

  const customerRes = await agent.post('/api/customers').send({ name: 'Overdue Co', billingAddress: '1 Main St' });
  const pastDueDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const invoiceRes = await agent.post('/api/invoices').send({
    customerId: customerRes.body.customer.id,
    dueDate: pastDueDate,
    lineItems: [{ description: 'Widget', unitPrice: 100, quantity: 1 }],
  });
  assert.equal(invoiceRes.status, 201);
  assert.equal(invoiceRes.body.invoice.status, 'unpaid');

  await runNotificationChecks();

  const notifications = await prisma.notification.findMany({
    where: { tenantId: tenant.id, type: 'invoice_overdue' },
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].relatedEntityId, invoiceRes.body.invoice.id);

  const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceRes.body.invoice.id } });
  assert.equal(invoiceAfter.status, 'unpaid', 'the notification check must never mutate invoice status');
});

test('running the check twice in a row does not create duplicate notifications within the same 24h window', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'jane@acmeprints.co.za' } });

  await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    remainingWeightGrams: 40,
    lowStockThresholdGrams: 50,
  });

  await runNotificationChecks();
  await runNotificationChecks();

  const notifications = await prisma.notification.findMany({ where: { tenantId: tenant.id, type: 'low_stock' } });
  assert.equal(notifications.length, 1);
});

test('GET /api/notifications returns notifications newest first, and ?unreadOnly=true filters to unread', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'jane@acmeprints.co.za' } });

  const first = await prisma.notification.create({
    data: { tenantId: tenant.id, type: 'low_stock', message: 'First' },
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await prisma.notification.create({
    data: { tenantId: tenant.id, type: 'low_stock', message: 'Second' },
  });
  await prisma.notification.update({ where: { id: first.id }, data: { readAt: new Date() } });

  const listRes = await agent.get('/api/notifications');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.notifications.length, 2);
  assert.equal(listRes.body.notifications[0].id, second.id);

  const unreadRes = await agent.get('/api/notifications?unreadOnly=true');
  assert.equal(unreadRes.status, 200);
  assert.equal(unreadRes.body.notifications.length, 1);
  assert.equal(unreadRes.body.notifications[0].id, second.id);
});

test('PATCH /api/notifications/:id/read marks read and is tenant-isolated', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'notif-a@example.co.za');
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { email: 'notif-a@example.co.za' } });
  const notification = await prisma.notification.create({
    data: { tenantId: tenantA.id, type: 'low_stock', message: 'Low on filament' },
  });

  const agentB = await loggedInAgent(app, 'notif-b@example.co.za');
  const crossTenantRes = await agentB.patch(`/api/notifications/${notification.id}/read`);
  assert.equal(crossTenantRes.status, 404);

  const res = await agentA.patch(`/api/notifications/${notification.id}/read`);
  assert.equal(res.status, 200);
  assert.ok(res.body.notification.readAt);
});

test('POST /api/notifications/mark-all-read marks all unread notifications for the tenant and is tenant-isolated', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'mark-a@example.co.za');
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { email: 'mark-a@example.co.za' } });
  await prisma.notification.createMany({
    data: [
      { tenantId: tenantA.id, type: 'low_stock', message: 'One' },
      { tenantId: tenantA.id, type: 'low_stock', message: 'Two' },
    ],
  });

  const agentB = await loggedInAgent(app, 'mark-b@example.co.za');
  const tenantB = await prisma.tenant.findUniqueOrThrow({ where: { email: 'mark-b@example.co.za' } });
  await prisma.notification.create({
    data: { tenantId: tenantB.id, type: 'low_stock', message: 'Other tenant' },
  });

  const res = await agentA.post('/api/notifications/mark-all-read');
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 2);

  const remainingUnreadForA = await prisma.notification.count({ where: { tenantId: tenantA.id, readAt: null } });
  assert.equal(remainingUnreadForA, 0);

  const stillUnreadForB = await prisma.notification.count({ where: { tenantId: tenantB.id, readAt: null } });
  assert.equal(stillUnreadForB, 1);
});

test('notification preference endpoints require auth', async () => {
  const app = buildMinimalApp(notificationsRouter);
  const getRes = await request(app).get('/api/notification-preferences');
  assert.equal(getRes.status, 401);
  const patchRes = await request(app).patch('/api/notification-preferences');
  assert.equal(patchRes.status, 401);
});

test('GET /api/notification-preferences creates and returns all-true defaults on first access, and PATCH round-trips a change', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'jane@acmeprints.co.za' } });

  const getRes = await agent.get('/api/notification-preferences');
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.preferences.tenantId, tenant.id);
  assert.equal(getRes.body.preferences.trialEndingInApp, true);
  assert.equal(getRes.body.preferences.trialEndingEmail, true);
  assert.equal(getRes.body.preferences.lowStockInApp, true);
  assert.equal(getRes.body.preferences.lowStockEmail, true);
  assert.equal(getRes.body.preferences.invoiceOverdueInApp, true);
  assert.equal(getRes.body.preferences.invoiceOverdueEmail, true);
  assert.equal(getRes.body.preferences.paymentReceiptInApp, true);
  assert.equal(getRes.body.preferences.subscriptionCancelledInApp, true);
  assert.equal(getRes.body.preferences.paymentFailedInApp, true);

  const patchRes = await agent.patch('/api/notification-preferences').send({
    trialEndingInApp: false,
    lowStockEmail: false,
  });
  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.preferences.trialEndingInApp, false);
  assert.equal(patchRes.body.preferences.lowStockEmail, false);
  // Untouched fields stay at their previous value.
  assert.equal(patchRes.body.preferences.lowStockInApp, true);

  const persisted = await prisma.notificationPreference.findUniqueOrThrow({ where: { tenantId: tenant.id } });
  assert.equal(persisted.trialEndingInApp, false);
  assert.equal(persisted.lowStockEmail, false);
});

test('PATCH /api/notification-preferences is tenant-isolated', async () => {
  const app = buildApp();
  const agentA = await loggedInAgent(app, 'prefs-a@example.co.za');
  const tenantA = await prisma.tenant.findUniqueOrThrow({ where: { email: 'prefs-a@example.co.za' } });
  const agentB = await loggedInAgent(app, 'prefs-b@example.co.za');
  const tenantB = await prisma.tenant.findUniqueOrThrow({ where: { email: 'prefs-b@example.co.za' } });

  await agentA.patch('/api/notification-preferences').send({ trialEndingInApp: false });
  await agentB.patch('/api/notification-preferences').send({ trialEndingInApp: true });

  const prefA = await prisma.notificationPreference.findUniqueOrThrow({ where: { tenantId: tenantA.id } });
  const prefB = await prisma.notificationPreference.findUniqueOrThrow({ where: { tenantId: tenantB.id } });
  assert.equal(prefA.trialEndingInApp, false);
  assert.equal(prefB.trialEndingInApp, true);
});

test('runNotificationChecks skips creating a trial_ending notification entirely when trialEndingInApp is false', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app, 'trial-disabled@example.co.za');
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'trial-disabled@example.co.za' } });
  void agent;
  await prisma.subscription.update({
    where: { tenantId: tenant.id },
    data: { status: 'trialing', trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
  });
  await prisma.notificationPreference.create({ data: { tenantId: tenant.id, trialEndingInApp: false } });

  await runNotificationChecks();

  const notifications = await prisma.notification.findMany({ where: { tenantId: tenant.id, type: 'trial_ending' } });
  assert.equal(notifications.length, 0);
});

test('runNotificationChecks skips creating a low_stock notification entirely when lowStockInApp is false', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app, 'lowstock-disabled@example.co.za');
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'lowstock-disabled@example.co.za' } });
  await prisma.notificationPreference.create({ data: { tenantId: tenant.id, lowStockInApp: false } });

  await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    remainingWeightGrams: 40,
    lowStockThresholdGrams: 50,
  });

  await runNotificationChecks();

  const notifications = await prisma.notification.findMany({ where: { tenantId: tenant.id, type: 'low_stock' } });
  assert.equal(notifications.length, 0);
});

test('runNotificationChecks skips creating an invoice_overdue notification entirely when invoiceOverdueInApp is false', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app, 'invoice-disabled@example.co.za');
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'invoice-disabled@example.co.za' } });
  await prisma.notificationPreference.create({ data: { tenantId: tenant.id, invoiceOverdueInApp: false } });

  const customerRes = await agent.post('/api/customers').send({ name: 'Overdue Co', billingAddress: '1 Main St' });
  const pastDueDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  await agent.post('/api/invoices').send({
    customerId: customerRes.body.customer.id,
    dueDate: pastDueDate,
    lineItems: [{ description: 'Widget', unitPrice: 100, quantity: 1 }],
  });

  await runNotificationChecks();

  const notifications = await prisma.notification.findMany({ where: { tenantId: tenant.id, type: 'invoice_overdue' } });
  assert.equal(notifications.length, 0);
});

test('runNotificationChecks creates the notification row but does not call mailer.sendMail when *InApp is true and *Email is false', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app, 'email-disabled@example.co.za');
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'email-disabled@example.co.za' } });
  await prisma.notificationPreference.create({ data: { tenantId: tenant.id, lowStockEmail: false } });

  await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    remainingWeightGrams: 40,
    lowStockThresholdGrams: 50,
  });

  mock.method(mailer, 'isConfigured', () => true);
  const sendMailMock = mock.method(mailer, 'sendMail', async () => {});

  try {
    await runNotificationChecks();

    const notifications = await prisma.notification.findMany({ where: { tenantId: tenant.id, type: 'low_stock' } });
    assert.equal(notifications.length, 1);
    assert.equal(sendMailMock.mock.calls.length, 0);
  } finally {
    mock.restoreAll();
  }
});

test('runNotificationChecks creates the notification row AND calls mailer.sendMail when both *InApp and *Email are true', async () => {
  const app = buildApp();
  const agent = await loggedInAgent(app, 'email-enabled@example.co.za');
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { email: 'email-enabled@example.co.za' } });

  await agent.post('/api/filaments').send({
    brand: 'eSun',
    materialType: 'PLA',
    diameterMm: 1.75,
    remainingWeightGrams: 40,
    lowStockThresholdGrams: 50,
  });

  mock.method(mailer, 'isConfigured', () => true);
  const sendMailMock = mock.method(mailer, 'sendMail', async () => {});

  try {
    await runNotificationChecks();

    const notifications = await prisma.notification.findMany({ where: { tenantId: tenant.id, type: 'low_stock' } });
    assert.equal(notifications.length, 1);
    assert.equal(sendMailMock.mock.calls.length, 1);
  } finally {
    mock.restoreAll();
  }
});
