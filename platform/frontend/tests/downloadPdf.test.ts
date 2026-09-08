import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadBase64Pdf } from '../src/lib/downloadPdf.js';

describe('downloadBase64Pdf', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  it('decodes the base64 PDF, creates an object URL, and clicks a temporary download link', async () => {
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    });

    downloadBase64Pdf(btoa('%PDF-1.4 fake content'), 'QT-0001.pdf');

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(blob.type).toBe('application/pdf');

    // Verify the blob's actual content was correctly decoded
    const blobContent = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(blobContent).toBe('%PDF-1.4 fake content');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
