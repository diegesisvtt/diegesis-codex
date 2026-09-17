// pdf.js setup for the renderer (Vite bundles the worker via ?url).
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';

GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy };

/** URL served by the custom `mythril-pdf` protocol registered in the main process. */
export function pdfDocUrl(docId: string): string {
  return `mythril-pdf://doc/${docId}`;
}

// pdf.js shares ONE worker across all getDocument() calls — destroying a
// loading task (e.g. React StrictMode's simulated unmount in dev) kills the
// shared worker and every other in-flight load. So documents are cached per
// docId and never destroyed on unmount; reopening a tab is instant.
const docCache = new Map<string, Promise<PDFDocumentProxy>>();

export function loadPdf(docId: string): Promise<PDFDocumentProxy> {
  let cached = docCache.get(docId);
  if (!cached) {
    cached = getDocument({ url: pdfDocUrl(docId), isEvalSupported: false }).promise;
    docCache.set(docId, cached);
    cached.catch(() => docCache.delete(docId));
  }
  return cached;
}

/** Drops the cached document (e.g. after the underlying file changes). */
export function unloadPdf(docId: string): void {
  const cached = docCache.get(docId);
  docCache.delete(docId);
  cached?.then((doc) => doc.destroy()).catch(() => {});
}

/** Extracts plain text per page (index 0 = page 1). */
export async function extractPagesText(pdf: PDFDocumentProxy): Promise<string[]> {
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    let lastY: number | null = null;
    let out = '';
    for (const item of tc.items) {
      if (!('str' in item)) continue;
      // new line when the baseline moves (rough paragraph preservation)
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) out += '\n';
      out += item.str;
      if (item.hasEOL) out += '\n';
      lastY = y ?? lastY;
    }
    pages.push(out.replace(/[ \t]+/g, ' ').trim());
    page.cleanup();
  }
  return pages;
}

/** Renders page 1 to a small data-URL used as the library cover. */
export async function renderCoverThumb(pdf: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = 320 / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const url = canvas.toDataURL('image/jpeg', 0.72);
    page.cleanup();
    return url;
  } catch {
    return undefined;
  }
}
