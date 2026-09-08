export type DocumentType = 'quote' | 'invoice';

// Dev-mode implementation: logs instead of sending a real email, exactly
// like sendVerificationEmail() in src/auth/email.ts. A later phase can
// replace the body with real SMTP; callers never need to change.
export async function sendDocumentEmail(
  to: string,
  documentType: DocumentType,
  documentNumber: string,
): Promise<void> {
  console.log(
    `[dev-email] ${documentType} ${documentNumber} sent to ${to} (PDF attached, dev mode — no real email sent)`,
  );
}
