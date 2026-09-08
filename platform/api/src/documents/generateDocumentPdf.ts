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
  email: string | null;
  website: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  termsAndConditionsText: string | null;
  defaultCurrency: string;
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
  vatAmount: string;
  vatApplied: boolean;
  total: string;
  amountPaid?: string;
  balanceDue?: string;
  notes: string | null;
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
const COL_QTY = 340;
const COL_UNIT_PRICE = 400;
const COL_TOTAL = 470;

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

function drawTableRow(doc: PDFKit.PDFDocument, line: PdfLineItem, currency: string): void {
  const y = doc.y;
  const descWidth = COL_QTY - LEFT - 10;
  doc.fontSize(10);
  doc.text(line.description, LEFT, y, { width: descWidth });
  const rowHeight = doc.heightOfString(line.description, { width: descWidth });
  doc.text(String(line.quantity), COL_QTY, y, { width: COL_UNIT_PRICE - COL_QTY - 10 });
  doc.text(formatMoney(line.unitPrice, currency), COL_UNIT_PRICE, y, { width: COL_TOTAL - COL_UNIT_PRICE - 10 });
  doc.text(formatMoney(line.lineTotal, currency), COL_TOTAL, y, { width: RIGHT - COL_TOTAL, align: 'right' });
  doc.y = y + Math.max(rowHeight, 14) + 6;
}

function drawTotalsLine(doc: PDFKit.PDFDocument, label: string, value: string, bold = false): void {
  const y = doc.y;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
  doc.text(label, COL_UNIT_PRICE, y, { width: COL_TOTAL - COL_UNIT_PRICE - 10 });
  doc.text(value, COL_TOTAL, y, { width: RIGHT - COL_TOTAL, align: 'right' });
  doc.font('Helvetica');
  doc.moveDown(0.5);
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
    if (companyProfile.email) doc.text(`Email: ${companyProfile.email}`);
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
      drawTableRow(doc, line, currency);
    }
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.75);

    drawTotalsLine(doc, 'Subtotal', formatMoney(input.subtotal, currency));
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

    if (input.notes) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).text('Notes');
      doc.font('Helvetica').fontSize(9).text(input.notes);
    }

    const hasBanking =
      companyProfile.bankName || companyProfile.bankAccountHolder || companyProfile.bankAccountNumber || companyProfile.bankBranchCode;
    if (hasBanking) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).text('Banking Details');
      doc.font('Helvetica').fontSize(9);
      if (companyProfile.bankName) doc.text(`Bank: ${companyProfile.bankName}`);
      if (companyProfile.bankAccountHolder) doc.text(`Account Holder: ${companyProfile.bankAccountHolder}`);
      if (companyProfile.bankAccountNumber) doc.text(`Account Number: ${companyProfile.bankAccountNumber}`);
      if (companyProfile.bankBranchCode) doc.text(`Branch Code: ${companyProfile.bankBranchCode}`);
    }

    if (companyProfile.termsAndConditionsText) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).text('Terms & Conditions');
      doc.font('Helvetica').fontSize(9).text(companyProfile.termsAndConditionsText);
    }

    doc.end();
  });
}
