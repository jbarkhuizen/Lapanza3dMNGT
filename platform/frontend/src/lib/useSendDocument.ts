import type { UseMutationResult } from '@tanstack/react-query';
import { downloadBase64Pdf } from './downloadPdf.js';
import { ApiError } from '../api/client.js';
import type { SendDocumentResponse } from '../api/sendDocument.js';

/**
 * Shared "Send to Customer" flow for QuoteDetailPage/InvoiceDetailPage (backlog #54):
 * downloads the generated PDF and reports success/failure through the CALLER's own
 * error/success banner state (rather than owning that state itself), so an unrelated
 * status-changing action on the same page can also clear a stale success banner.
 */
export function useSendDocument(
  sendMutation: Pick<UseMutationResult<SendDocumentResponse, unknown, void>, 'mutateAsync'>,
  documentNumber: string,
  setError: (message: string | null) => void,
  setSuccessMessage: (message: string | null) => void,
) {
  return async function handleSend() {
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await sendMutation.mutateAsync();
      downloadBase64Pdf(result.pdfBase64, `${documentNumber}.pdf`);
      setSuccessMessage(
        result.devMode
          ? `Emailed to ${result.sentTo} (dev mode — check server console for the email log).`
          : `Emailed to ${result.sentTo}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  };
}
