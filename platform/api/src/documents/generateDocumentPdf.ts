import PDFDocument from 'pdfkit';

export interface PdfLineItem {
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface PdfCompanyProfile {
  businessName: string | null;
  registrationNumber: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  website: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  // Tenant-level default -- no longer read directly by this module (the
  // document's OWN termsAndConditionsText snapshot, on GenerateDocumentPdfInput
  // below, is what actually renders), but kept here since callers still pass
  // the full company-profile select through.
  termsAndConditionsText: string | null;
  defaultCurrency: string;
  // Small footer caption shown alongside the banking-details block.
  pricingNotesText: string | null;
}

export interface PdfCustomer {
  name: string;
  billingAddress: string;
  vatNumber: string | null;
}

export interface GenerateDocumentPdfInput {
  documentType: 'Quote' | 'Invoice';
  number: string;
  createdAt: Date;
  dateLabel: string;
  dateValue: Date | null;
  companyProfile: PdfCompanyProfile;
  customer: PdfCustomer;
  lineItems: PdfLineItem[];
  subtotal: string;
  // Rendered as a "Discount" line between Subtotal and VAT, only when > 0.
  discountAmount: string;
  vatAmount: string;
  vatApplied: boolean;
  total: string;
  amountPaid?: string;
  balanceDue?: string;
  notes: string | null;
  // Document-level snapshot fields (see Quote/Invoice.paymentTerms and
  // .termsAndConditionsText) -- these, not companyProfile.termsAndConditionsText,
  // are what gets rendered, since each document snapshots the tenant's default
  // at creation time rather than following it live.
  paymentTerms: string | null;
  termsAndConditionsText: string | null;
  // Invoice only.
  paymentLinkUrl?: string | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: 'R',
};

function formatMoney(value: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol} ${value}`;
}

const LEFT = 50;
const RIGHT = 545;
// Was 340 (paired with COL_UNIT_PRICE 400): narrowing COL_UNIT_PRICE to 390 to fix the
// totals-label wrap below took its 10pt from the Qty column, which reopened the same
// stale-doc.y pagination bug on quantities in the 5-8 digit range (e.g. "12345.67" wraps
// in a 40pt Qty column). Taking the 10pt from Description instead — 280pt down to 270pt
// has ample slack for real line-item descriptions — keeps Qty at its original 50pt.
// Was 330: the Decimal(12,2) ceiling value "R 9999999999.99" measures 79.50pt in both
// Helvetica and Helvetica-Bold 10pt, which didn't fit the old 70/75pt Unit Price/Total
// columns. Shifted 25pt left (taken from Description, 270pt -> 245pt, still ample) to
// widen both money columns to 85pt while keeping Qty at its guarded 50pt width.
const COL_QTY = 305;
// Was 400: at that value the totals-block label column (COL_TOTAL - COL_UNIT_PRICE - 10 = 60pt)
// was narrower than "Balance Due" measured in Helvetica-Bold 10pt (60.02pt), so pdfkit wrapped
// it onto 2 lines. Shifting to 390 widens that shared label/unit-price column to 70pt.
// Was 390: see COL_QTY comment above — widened further to 365 so the shared
// Unit-Price/totals-label column becomes 85pt, clearing the 79.50pt worst case.
const COL_UNIT_PRICE = 365;
// Was 470: see COL_QTY comment above — widened to 460 so the Total column
// (RIGHT - COL_TOTAL) becomes 85pt, clearing the 79.50pt worst case with margin.
const COL_TOTAL = 460;
// Shared by the "Unit Price" line-item column and the totals-block label column
// (both are drawn at COL_UNIT_PRICE with this width). Exported so tests can
// assert real labels ("Balance Due", "Amount Paid", ...) fit on one line at
// this exact width, as a permanent regression guard against the column being
// narrowed back below a label's rendered width.
export const TOTALS_LABEL_WIDTH = COL_TOTAL - COL_UNIT_PRICE - 10;
// Width of the right-aligned Total column. Exported as a regression guard so
// tests can assert the Decimal(12,2) ceiling value ("R 9999999999.99") fits
// within it.
export const TOTAL_COLUMN_WIDTH = RIGHT - COL_TOTAL;
// Width of the Qty column. Exported as a regression guard so tests can assert
// a realistic large quantity string still fits within it.
export const QTY_COLUMN_WIDTH = COL_UNIT_PRICE - COL_QTY - 10;

function drawTableHeader(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Description', LEFT, y, { width: COL_QTY - LEFT - 10 });
  doc.text('Qty', COL_QTY, y, { width: COL_UNIT_PRICE - COL_QTY - 10 });
  doc.text('Unit Price', COL_UNIT_PRICE, y, { width: COL_TOTAL - COL_UNIT_PRICE - 10 });
  doc.text('Total', COL_TOTAL, y, { width: RIGHT - COL_TOTAL, align: 'right' });
  doc.font('Helvetica');
  doc.moveDown(0.75);
}

/**
 * Advances to a new page (without drawing anything else) if the given
 * height would not fit above the bottom margin on the current page.
 * Returns true when a page break was inserted, so callers can redraw
 * whatever per-page furniture (e.g. a table header) belongs at the top.
 */
function ensurePageSpace(doc: PDFKit.PDFDocument, estimatedHeight: number): boolean {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + estimatedHeight > bottomLimit) {
    doc.addPage();
    return true;
  }
  return false;
}

function ensureRowFits(doc: PDFKit.PDFDocument, estimatedHeight: number): void {
  if (ensurePageSpace(doc, estimatedHeight)) {
    drawTableHeader(doc);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);
  }
}

// Real (not estimated) content height of a row's description cell, which is
// the tallest cell in the row since it's the only one that can wrap. This
// still only measures the description cell: Qty/Unit Price/Total render
// fixed-format values (an integer quantity, or "<symbol> <12,2-decimal>"
// money strings) that are structurally guaranteed to fit within their
// columns (see COL_QTY/COL_UNIT_PRICE/COL_TOTAL and their *_WIDTH exports
// above), so they never wrap and never need a measured height.
function computeRowContentHeight(doc: PDFKit.PDFDocument, line: PdfLineItem): number {
  const descWidth = COL_QTY - LEFT - 10;
  doc.fontSize(10);
  return Math.max(doc.heightOfString(line.description, { width: descWidth }), 14);
}

function drawTableRow(doc: PDFKit.PDFDocument, line: PdfLineItem, currency: string, rowContentHeight: number): void {
  const y = doc.y;
  const descWidth = COL_QTY - LEFT - 10;
  doc.fontSize(10);
  doc.text(line.description, LEFT, y, { width: descWidth });
  doc.text(String(line.quantity), COL_QTY, y, { width: COL_UNIT_PRICE - COL_QTY - 10 });
  doc.text(formatMoney(line.unitPrice, currency), COL_UNIT_PRICE, y, { width: COL_TOTAL - COL_UNIT_PRICE - 10 });
  doc.text(formatMoney(line.lineTotal, currency), COL_TOTAL, y, { width: RIGHT - COL_TOTAL, align: 'right' });
  doc.y = y + rowContentHeight + 6;
}

// Real (not estimated) content height of a totals line's label cell, mirroring
// computeRowContentHeight. Totals labels are normally single-line, but this
// guards against a future label ever being long enough to wrap in the label
// column, the same way computeRowContentHeight guards line-item descriptions.
function computeTotalsLineHeight(doc: PDFKit.PDFDocument, label: string, bold: boolean): number {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
  return Math.max(doc.heightOfString(label, { width: TOTALS_LABEL_WIDTH }), 14);
}

function drawTotalsLine(doc: PDFKit.PDFDocument, label: string, value: string, bold = false): void {
  const lineContentHeight = computeTotalsLineHeight(doc, label, bold);
  ensurePageSpace(doc, lineContentHeight + 6);
  const y = doc.y;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
  doc.text(label, COL_UNIT_PRICE, y, { width: TOTALS_LABEL_WIDTH });
  doc.text(value, COL_TOTAL, y, { width: RIGHT - COL_TOTAL, align: 'right' });
  doc.font('Helvetica');
  doc.y = y + lineContentHeight + 6;
}

export function generateDocumentPdf(input: GenerateDocumentPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { companyProfile, customer } = input;
    const currency = companyProfile.defaultCurrency;

    doc.font('Helvetica-Bold').fontSize(18).text(companyProfile.businessName ?? 'Business');
    doc.font('Helvetica').fontSize(9);
    const addressCityLine = [companyProfile.city, companyProfile.postalCode].filter(Boolean).join(' ');
    for (const line of [companyProfile.addressLine1, companyProfile.addressLine2, addressCityLine || null]) {
      if (line) doc.text(line);
    }
    if (companyProfile.phone) doc.text(`Tel: ${companyProfile.phone}`);
    if (companyProfile.website) doc.text(companyProfile.website);
    if (companyProfile.registrationNumber) doc.text(`Reg No: ${companyProfile.registrationNumber}`);
    if (companyProfile.vatRegistered && companyProfile.vatNumber) doc.text(`VAT No: ${companyProfile.vatNumber}`);

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(16).text(`${input.documentType.toUpperCase()} ${input.number}`);
    doc.font('Helvetica').fontSize(9);
    doc.text(`Date: ${input.createdAt.toISOString().slice(0, 10)}`);
    if (input.dateValue) {
      doc.text(`${input.dateLabel}: ${input.dateValue.toISOString().slice(0, 10)}`);
    }

    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).text('Bill To');
    doc.font('Helvetica').fontSize(9);
    doc.text(customer.name);
    doc.text(customer.billingAddress);
    if (customer.vatNumber) doc.text(`VAT No: ${customer.vatNumber}`);

    doc.moveDown(1.5);
    drawTableHeader(doc);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.5);
    for (const line of input.lineItems) {
      const rowContentHeight = computeRowContentHeight(doc, line);
      ensureRowFits(doc, rowContentHeight + 6);
      drawTableRow(doc, line, currency, rowContentHeight);
    }
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.75);

    drawTotalsLine(doc, 'Subtotal', formatMoney(input.subtotal, currency));
    if (input.discountAmount && Number(input.discountAmount) > 0) {
      drawTotalsLine(doc, 'Discount', `- ${formatMoney(input.discountAmount, currency)}`);
    }
    if (input.vatApplied) {
      drawTotalsLine(doc, 'VAT (15%)', formatMoney(input.vatAmount, currency));
    }
    drawTotalsLine(doc, 'Total', formatMoney(input.total, currency), true);
    if (input.amountPaid !== undefined) {
      drawTotalsLine(doc, 'Amount Paid', formatMoney(input.amountPaid, currency));
    }
    if (input.balanceDue !== undefined) {
      drawTotalsLine(doc, 'Balance Due', formatMoney(input.balanceDue, currency), true);
    }

    if (input.paymentTerms) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).text('Payment Terms');
      doc.font('Helvetica').fontSize(9).text(input.paymentTerms);
    }

    if (input.notes) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).text('Notes');
      doc.font('Helvetica').fontSize(9).text(input.notes);
    }

    if (input.paymentLinkUrl) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).text('Payment Link');
      doc.font('Helvetica').fontSize(9);
      // pdfkit renders a text-with-`link` option as a clickable annotation over
      // that text run; if a future pdfkit version ever dropped link-annotation
      // support this would still degrade gracefully to plain URL text.
      doc.fillColor('#1d4ed8').text(input.paymentLinkUrl, { link: input.paymentLinkUrl, underline: true });
      doc.fillColor('black');
    }

    const hasBanking =
      companyProfile.bankName || companyProfile.bankAccountHolder || companyProfile.bankAccountNumber || companyProfile.bankBranchCode;
    if (hasBanking || companyProfile.pricingNotesText) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).text('Banking Details');
      doc.font('Helvetica').fontSize(9);
      if (companyProfile.bankName) doc.text(`Bank: ${companyProfile.bankName}`);
      if (companyProfile.bankAccountHolder) doc.text(`Account Holder: ${companyProfile.bankAccountHolder}`);
      if (companyProfile.bankAccountNumber) doc.text(`Account Number: ${companyProfile.bankAccountNumber}`);
      if (companyProfile.bankBranchCode) doc.text(`Branch Code: ${companyProfile.bankBranchCode}`);
      if (companyProfile.pricingNotesText) {
        doc.moveDown(0.5);
        doc.fontSize(8).fillColor('#666666').text(companyProfile.pricingNotesText);
        doc.fillColor('black').fontSize(9);
      }
    }

    if (input.termsAndConditionsText) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).text('Terms & Conditions');
      doc.font('Helvetica').fontSize(9).text(input.termsAndConditionsText);
    }

    doc.end();
  });
}
