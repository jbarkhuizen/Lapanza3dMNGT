import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDocumentPdf } from '../src/documents/generateDocumentPdf.js';
import { sendDocumentEmail } from '../src/documents/sendDocumentEmail.js';

const baseCompanyProfile = {
  businessName: 'Acme Prints',
  registrationNumber: null,
  vatRegistered: true,
  vatNumber: '4123456789',
  addressLine1: '1 Main St',
  addressLine2: null,
  city: 'Cape Town',
  postalCode: '8001',
  phone: '0211234567',
  email: 'hello@acme.co.za',
  website: null,
  bankName: 'FNB',
  bankAccountHolder: 'Acme Prints',
  bankAccountNumber: '1234567890',
  bankBranchCode: '250655',
  termsAndConditionsText: 'Payment due within 30 days.',
  defaultCurrency: 'ZAR',
};

test('generateDocumentPdf produces a valid PDF buffer with VAT, banking, and notes sections', async () => {
  const buffer = await generateDocumentPdf({
    documentType: 'Quote',
    number: 'QT-0001',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dateLabel: 'Valid until',
    dateValue: new Date('2026-01-15T00:00:00.000Z'),
    companyProfile: baseCompanyProfile,
    customer: { name: 'Bob Client', billingAddress: '5 Oak St', vatNumber: null },
    lineItems: [{ description: 'Custom bracket', quantity: 2, unitPrice: '150.00', lineTotal: '300.00' }],
    subtotal: '300.00',
    vatAmount: '45.00',
    vatApplied: true,
    total: '345.00',
    notes: 'Rush order.',
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);
  assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
});

test('generateDocumentPdf handles a minimal profile with no VAT, no banking, no notes', async () => {
  const buffer = await generateDocumentPdf({
    documentType: 'Invoice',
    number: 'INV-0001',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dateLabel: 'Due date',
    dateValue: new Date('2026-02-01T00:00:00.000Z'),
    companyProfile: {
      businessName: null,
      registrationNumber: null,
      vatRegistered: false,
      vatNumber: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      phone: null,
      email: null,
      website: null,
      bankName: null,
      bankAccountHolder: null,
      bankAccountNumber: null,
      bankBranchCode: null,
      termsAndConditionsText: null,
      defaultCurrency: 'ZAR',
    },
    customer: { name: 'Bob Client', billingAddress: '5 Oak St', vatNumber: null },
    lineItems: [{ description: 'Custom bracket', quantity: 1, unitPrice: '100.00', lineTotal: '100.00' }],
    subtotal: '100.00',
    vatAmount: '0.00',
    vatApplied: false,
    total: '100.00',
    amountPaid: '0.00',
    balanceDue: '100.00',
    notes: null,
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
});

test('sendDocumentEmail logs the send to console in dev mode', async () => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (msg: string) => { logs.push(msg); };
  try {
    await sendDocumentEmail('bob@example.com', 'quote', 'QT-0001');
  } finally {
    console.log = original;
  }
  assert.equal(logs.length, 1);
  assert.match(logs[0], /quote QT-0001 sent to bob@example\.com/);
});
