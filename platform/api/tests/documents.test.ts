import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import PDFDocument from 'pdfkit';
import {
  generateDocumentPdf,
  TOTALS_LABEL_WIDTH,
  TOTAL_COLUMN_WIDTH,
  QTY_COLUMN_WIDTH,
} from '../src/documents/generateDocumentPdf.js';
import { sendDocumentEmail } from '../src/documents/sendDocumentEmail.js';
import { mailer } from '../src/lib/mailer.js';

// pdfkit compresses page content streams with FlateDecode by default AND
// renders text as `[<hex> kerningNumber <hex> ...] TJ` glyph-run arrays
// (WinAnsiEncoding, so each hex byte pair is the plain ASCII/Latin-1 char
// code) rather than plain `(text) Tj` strings -- so a plain string search on
// the raw buffer never finds rendered text (only structural PDF syntax and
// uncompressed objects like link annotations' /URI entries, which is why the
// page-count/font-metric tests below never needed this). This inflates every
// FlateDecode stream, then reconstructs the literal rendered text by
// concatenating every `<hex>` glyph run in document order and hex-decoding
// each one -- the bare numbers between them are just kerning displacements,
// not characters, so dropping them and keeping only the hex runs in order
// reproduces the original text exactly (spaces included, since a run like
// `<796d656e7420>` decodes to "yment " with its trailing space intact).
function extractPdfRenderedText(buffer: Buffer): string {
  const text = buffer.toString('latin1');
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const decodedStreams: string[] = [];
  for (const match of text.matchAll(streamPattern)) {
    const raw = Buffer.from(match[1], 'latin1');
    try {
      decodedStreams.push(zlib.inflateSync(raw).toString('latin1'));
    } catch {
      // Not a FlateDecode stream (e.g. an uncompressed/binary section) -- skip it.
    }
  }
  const combinedStreams = decodedStreams.join('\n');
  const hexRuns = combinedStreams.match(/<[0-9a-fA-F]+>/g) ?? [];
  return hexRuns.map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1')).join('');
}

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
  pricingNotesText: null,
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
    discountAmount: '0.00',
    vatAmount: '45.00',
    vatApplied: true,
    total: '345.00',
    notes: 'Rush order.',
    paymentTerms: null,
    termsAndConditionsText: null,
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
      website: null,
      bankName: null,
      bankAccountHolder: null,
      bankAccountNumber: null,
      bankBranchCode: null,
      termsAndConditionsText: null,
      defaultCurrency: 'ZAR',
      pricingNotesText: null,
    },
    customer: { name: 'Bob Client', billingAddress: '5 Oak St', vatNumber: null },
    lineItems: [{ description: 'Custom bracket', quantity: 1, unitPrice: '100.00', lineTotal: '100.00' }],
    subtotal: '100.00',
    discountAmount: '0.00',
    vatAmount: '0.00',
    vatApplied: false,
    total: '100.00',
    amountPaid: '0.00',
    balanceDue: '100.00',
    notes: null,
    paymentTerms: null,
    termsAndConditionsText: null,
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
});

test('generateDocumentPdf renders a Discount line between Subtotal and VAT only when discountAmount > 0', async () => {
  const withDiscount = await generateDocumentPdf({
    documentType: 'Quote',
    number: 'QT-0010',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dateLabel: 'Valid until',
    dateValue: null,
    companyProfile: baseCompanyProfile,
    customer: { name: 'Bob Client', billingAddress: '5 Oak St', vatNumber: null },
    lineItems: [{ description: 'Custom bracket', quantity: 2, unitPrice: '150.00', lineTotal: '300.00' }],
    subtotal: '300.00',
    discountAmount: '30.00',
    vatAmount: '40.50',
    vatApplied: true,
    total: '310.50',
    notes: null,
    paymentTerms: null,
    termsAndConditionsText: null,
  });
  assert.match(extractPdfRenderedText(withDiscount), /Discount/);

  const withoutDiscount = await generateDocumentPdf({
    documentType: 'Quote',
    number: 'QT-0011',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dateLabel: 'Valid until',
    dateValue: null,
    companyProfile: baseCompanyProfile,
    customer: { name: 'Bob Client', billingAddress: '5 Oak St', vatNumber: null },
    lineItems: [{ description: 'Custom bracket', quantity: 2, unitPrice: '150.00', lineTotal: '300.00' }],
    subtotal: '300.00',
    discountAmount: '0.00',
    vatAmount: '45.00',
    vatApplied: true,
    total: '345.00',
    notes: null,
    paymentTerms: null,
    termsAndConditionsText: null,
  });
  assert.doesNotMatch(extractPdfRenderedText(withoutDiscount), /Discount/);
});

test('generateDocumentPdf renders Payment Terms, the document\'s own Terms & Conditions snapshot, an Invoice-only Payment Link, and the tenant pricingNotesText footer', async () => {
  const buffer = await generateDocumentPdf({
    documentType: 'Invoice',
    number: 'INV-0010',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dateLabel: 'Due date',
    dateValue: new Date('2026-02-01T00:00:00.000Z'),
    companyProfile: { ...baseCompanyProfile, pricingNotesText: 'Prices exclude shipping.' },
    customer: { name: 'Bob Client', billingAddress: '5 Oak St', vatNumber: null },
    lineItems: [{ description: 'Custom bracket', quantity: 1, unitPrice: '100.00', lineTotal: '100.00' }],
    subtotal: '100.00',
    discountAmount: '0.00',
    vatAmount: '15.00',
    vatApplied: true,
    total: '115.00',
    amountPaid: '0.00',
    balanceDue: '115.00',
    notes: null,
    paymentTerms: '50% deposit, balance on delivery.',
    termsAndConditionsText: 'This document\'s own snapshot, not the tenant default.',
    paymentLinkUrl: 'https://pay.example.com/inv-0010',
  });

  const decodedText = extractPdfRenderedText(buffer);
  assert.match(decodedText, /Payment Terms/);
  assert.match(decodedText, /Prices exclude shipping\./);
  assert.match(decodedText, /Payment Link/);
  // The link annotation's target URL is stored as a direct (uncompressed) PDF
  // object, not inside a content stream, so it's checked against the raw buffer.
  assert.match(buffer.toString('latin1'), /\/URI \(https:\/\/pay\.example\.com\/inv-0010\)/);
});

test('generateDocumentPdf paginates a long line-item table onto multiple pages without losing rows', async () => {
  const manyLines = Array.from({ length: 30 }, (_, i) => ({
    description: `Custom part ${i + 1}`,
    quantity: 1,
    unitPrice: '10.00',
    lineTotal: '10.00',
  }));
  const buffer = await generateDocumentPdf({
    documentType: 'Quote',
    number: 'QT-0002',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dateLabel: 'Valid until',
    dateValue: new Date('2026-01-15T00:00:00.000Z'),
    companyProfile: baseCompanyProfile,
    customer: { name: 'Bob Client', billingAddress: '5 Oak St', vatNumber: null },
    lineItems: manyLines,
    subtotal: '300.00',
    discountAmount: '0.00',
    vatAmount: '45.00',
    vatApplied: true,
    total: '345.00',
    notes: null,
    paymentTerms: null,
    termsAndConditionsText: null,
  });

  const pdfText = buffer.toString('latin1');
  const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  // The pre-fix flat ROW_HEIGHT_ESTIMATE bug caused pdfkit's own automatic
  // pagination to trigger mid-row on nearly every row once the estimate drifted
  // out of sync with doc.y, producing 13 pages for this exact input. A correct
  // pagination should pack these single-line rows tightly onto very few pages.
  assert.ok(
    pageCount > 1 && pageCount <= 3,
    `expected a tight page count (<=3) for 30 single-line items, got ${pageCount}`,
  );
});

test('generateDocumentPdf paginates wrapped multi-line descriptions without a page break per row', async () => {
  const longDescription =
    'This is a deliberately long line item description used to force the description ' +
    'column to wrap onto two or more lines when rendered in the PDF table cell width.';
  // 50 rows: measured empirically against this exact pdfkit version. At smaller
  // counts (~18-20) the flat-estimate bug only bites once, near the single page
  // boundary, and produces the same page count as the fix (so it isn't a
  // reliable regression signal). At 50 rows the bug compounds across multiple
  // page boundaries: the pre-fix flat ROW_HEIGHT_ESTIMATE=20 undercounts each
  // ~3-line wrapped row's real ~35-40pt height, so pdfkit's own automatic
  // pagination keeps triggering mid-row breaks, producing 6 pages pre-fix vs 4
  // pages once the real per-row height is used for the fit check.
  // Re-measured at 5 (was 4) after the Description column was narrowed from
  // 270pt to 245pt (money-column widening fix for the Decimal(12,2) ceiling
  // value "R 9999999999.99"): the same long description now wraps onto one
  // more line sooner in the narrower cell, adding real height across the
  // fixture and pushing one more row past a page boundary. Still nowhere
  // near the pre-fix 6-page pathological case, so the upper bound moves to
  // <=5 rather than indicating a regression.
  const wrappingLines = Array.from({ length: 50 }, (_, i) => ({
    description: `${longDescription} (item ${i + 1})`,
    quantity: 1,
    unitPrice: '10.00',
    lineTotal: '10.00',
  }));
  const buffer = await generateDocumentPdf({
    documentType: 'Quote',
    number: 'QT-0003',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dateLabel: 'Valid until',
    dateValue: new Date('2026-01-15T00:00:00.000Z'),
    companyProfile: baseCompanyProfile,
    customer: { name: 'Bob Client', billingAddress: '5 Oak St', vatNumber: null },
    lineItems: wrappingLines,
    subtotal: '500.00',
    discountAmount: '0.00',
    vatAmount: '75.00',
    vatApplied: true,
    total: '575.00',
    notes: null,
    paymentTerms: null,
    termsAndConditionsText: null,
  });

  const pdfText = buffer.toString('latin1');
  const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  assert.ok(
    pageCount <= 5,
    `expected wrapped rows to pack tightly (<=5 pages) for 50 wrapping items, got ${pageCount}`,
  );
});

test('generateDocumentPdf keeps the totals block together instead of splitting it across a page boundary', async () => {
  // 25 short single-line items: measured empirically to land the totals block
  // (Subtotal/VAT/Total/Amount Paid/Balance Due) right at the pre-fix page
  // boundary. Pre-fix, drawTotalsLine never checked doc.y before drawing, so
  // pdfkit's automatic pagination tore a totals line's label from its value
  // mid-row, producing 3 pages. Post-fix, the totals block gets pushed onto a
  // fresh page as a whole, producing 2.
  const lines = Array.from({ length: 25 }, (_, i) => ({
    description: `Custom part ${i + 1}`,
    quantity: 1,
    unitPrice: '10.00',
    lineTotal: '10.00',
  }));
  const buffer = await generateDocumentPdf({
    documentType: 'Quote',
    number: 'QT-0004',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    dateLabel: 'Valid until',
    dateValue: new Date('2026-01-15T00:00:00.000Z'),
    companyProfile: baseCompanyProfile,
    customer: { name: 'Bob Client', billingAddress: '5 Oak St', vatNumber: null },
    lineItems: lines,
    subtotal: '250.00',
    discountAmount: '0.00',
    vatAmount: '37.50',
    vatApplied: true,
    total: '287.50',
    amountPaid: '0.00',
    balanceDue: '287.50',
    notes: null,
    paymentTerms: null,
    termsAndConditionsText: null,
  });

  const pdfText = buffer.toString('latin1');
  const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  assert.ok(
    pageCount <= 2,
    `expected the totals block to stay intact (<=2 pages) for 25 short line items, got ${pageCount}`,
  );
});

test('totals-block labels ("Balance Due", "Amount Paid", ...) render on a single line at the real label column width', () => {
  // Direct content-based regression guard for the bug the page-count tests above
  // cannot catch: the "Balance Due" split doesn't change total page count (the
  // label and value both still land somewhere in the document), so a page-count
  // assertion alone can't detect a label silently wrapping onto two lines.
  //
  // Root cause (now fixed): the label column used to be COL_TOTAL - COL_UNIT_PRICE - 10
  // = 60pt, but "Balance Due" measures 60.02pt and "Amount Paid" measures 61.37pt in
  // Helvetica-Bold 10pt, so pdfkit wrapped both onto 2 lines ("Balance" / "Due"). That
  // wrap made the row tall enough to trigger a second bug: drawTotalsLine's flat
  // fit-check height estimate (20pt) undercounted the wrapped row's real ~23.8pt height,
  // so pdfkit could auto-break mid-label near a page boundary, landing the value at a
  // stale pre-break y-coordinate far from its label.
  //
  // This test measures the exact same way pdfkit itself decides whether to wrap
  // (doc.heightOfString(label, { width }) at the real, exported label column width) and
  // asserts every current totals label fits on one line with real margin, not just
  // barely. It will fail the moment TOTALS_LABEL_WIDTH is narrowed back below a label's
  // rendered width, independent of the height-aware fit-check added in drawTotalsLine.
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const singleLineThreshold = 14; // matches the 14pt floor used by computeRowContentHeight/computeTotalsLineHeight

  const labels = ['Subtotal', 'VAT (15%)', 'Total', 'Amount Paid', 'Balance Due'];
  for (const label of labels) {
    doc.font('Helvetica-Bold').fontSize(10);
    const height = doc.heightOfString(label, { width: TOTALS_LABEL_WIDTH });
    assert.ok(
      height <= singleLineThreshold,
      `expected "${label}" to render on a single line (height <= ${singleLineThreshold}pt) at ` +
        `TOTALS_LABEL_WIDTH=${TOTALS_LABEL_WIDTH}pt, got height=${height}pt (label wrapped)`,
    );
  }

  // "Balance Due" specifically, with an explicit margin check: it must fit with real
  // headroom, not just barely clear the wrap threshold by a fraction of a point.
  doc.font('Helvetica-Bold').fontSize(10);
  const balanceDueWidth = doc.widthOfString('Balance Due');
  assert.ok(
    TOTALS_LABEL_WIDTH - balanceDueWidth >= 5,
    `expected "Balance Due" (${balanceDueWidth}pt) to fit within TOTALS_LABEL_WIDTH ` +
      `(${TOTALS_LABEL_WIDTH}pt) with at least 5pt of margin, got ${TOTALS_LABEL_WIDTH - balanceDueWidth}pt`,
  );

  doc.end();
});

test('the Decimal(12,2) ceiling money value ("R 9999999999.99") fits within the Total and Unit Price/totals-label columns', () => {
  // Regression guard for the widened Total/Unit Price columns. This exact string is the
  // widest value serializeQuote()/serializeInvoice() can ever produce for a Decimal(12,2)
  // money field: measured (via pdfkit's own bundled Helvetica.afm/Helvetica-Bold.afm) at
  // exactly 79.50pt in both weights at 10pt, identical across weights since the digits,
  // space, period, and "R" glyphs share the same em-width in both Helvetica AFMs.
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const ceilingValue = 'R 9999999999.99';

  for (const font of ['Helvetica', 'Helvetica-Bold'] as const) {
    doc.font(font).fontSize(10);
    const width = doc.widthOfString(ceilingValue);
    assert.ok(
      TOTAL_COLUMN_WIDTH - width >= 5,
      `expected "${ceilingValue}" (${width}pt, ${font}) to fit within TOTAL_COLUMN_WIDTH ` +
        `(${TOTAL_COLUMN_WIDTH}pt) with at least 5pt of margin, got ${TOTAL_COLUMN_WIDTH - width}pt`,
    );
    assert.ok(
      TOTALS_LABEL_WIDTH - width >= 5,
      `expected "${ceilingValue}" (${width}pt, ${font}) to fit within TOTALS_LABEL_WIDTH ` +
        `(${TOTALS_LABEL_WIDTH}pt) with at least 5pt of margin, got ${TOTALS_LABEL_WIDTH - width}pt`,
    );
  }

  doc.end();
});

test('a realistic 8-digit quantity fits within the Qty column', () => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const largeQty = '12345678';

  doc.font('Helvetica').fontSize(10);
  const width = doc.widthOfString(largeQty);
  assert.ok(
    QTY_COLUMN_WIDTH - width >= 5,
    `expected "${largeQty}" (${width}pt) to fit within QTY_COLUMN_WIDTH ` +
      `(${QTY_COLUMN_WIDTH}pt) with at least 5pt of margin, got ${QTY_COLUMN_WIDTH - width}pt`,
  );

  doc.end();
});

test('sendDocumentEmail logs the send to console in dev mode', async () => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (msg: string) => { logs.push(msg); };
  try {
    await sendDocumentEmail(
      'bob@example.com',
      'quote',
      'QT-0001',
      Buffer.from('%PDF-fake'),
      'Acme Prints',
      'hello@acme.co.za',
    );
  } finally {
    console.log = original;
  }
  assert.equal(logs.length, 1);
  assert.match(logs[0], /quote QT-0001 sent to bob@example\.com/);
});

test('sendDocumentEmail sends real mail with the PDF attached when SMTP is configured', async () => {
  mock.method(mailer, 'isConfigured', () => true);
  const sendMailCalls: Array<Record<string, unknown>> = [];
  mock.method(mailer, 'sendMail', async (opts: Record<string, unknown>) => {
    sendMailCalls.push(opts);
  });

  try {
    const pdfBuffer = Buffer.from('%PDF-fake');
    await sendDocumentEmail(
      'bob@example.com',
      'invoice',
      'INV-0001',
      pdfBuffer,
      'Acme Prints',
      'hello@acme.co.za',
    );

    assert.equal(sendMailCalls.length, 1);
    assert.equal(sendMailCalls[0].to, 'bob@example.com');
    assert.equal(sendMailCalls[0].replyTo, 'hello@acme.co.za');
    assert.match(sendMailCalls[0].subject as string, /INV-0001/);
    assert.match(sendMailCalls[0].subject as string, /Acme Prints/);
    assert.match(sendMailCalls[0].text as string, /Acme Prints/);
    const attachments = sendMailCalls[0].attachments as Array<Record<string, unknown>>;
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].filename, 'INV-0001.pdf');
    assert.equal(attachments[0].content, pdfBuffer);
    assert.equal(attachments[0].contentType, 'application/pdf');
  } finally {
    mock.restoreAll();
  }
});
