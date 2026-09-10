/**
 * Shape of `POST /api/quotes/:id/send` and `POST /api/invoices/:id/send` — identical
 * for both document types, so it's defined once here instead of duplicated in
 * api/quotes.ts and api/invoices.ts (backlog #54).
 */
export interface SendDocumentResponse {
  pdfBase64: string;
  sentTo: string;
  devMode: boolean;
}
