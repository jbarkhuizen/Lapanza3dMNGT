import { mailer } from '../lib/mailer.js';

export type DocumentType = 'quote' | 'invoice';

export async function sendDocumentEmail(
  to: string,
  documentType: DocumentType,
  documentNumber: string,
  pdfBuffer: Buffer,
): Promise<void> {
  if (!mailer.isConfigured()) {
    console.log(
      `[dev-email] ${documentType} ${documentNumber} sent to ${to} (PDF attached, dev mode — no real email sent)`,
    );
    return;
  }

  await mailer.sendMail({
    to,
    subject: `Your ${documentType} ${documentNumber}`,
    text: `Please find your ${documentType} ${documentNumber} attached.`,
    attachments: [
      { filename: `${documentNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' },
    ],
  });
}
