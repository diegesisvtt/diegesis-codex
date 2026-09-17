// In-PDF full-text search with lazy index building and progress reporting.
import type { PDFDocumentProxy } from './pdfjs';

export interface PdfSearchHit {
  page: number;
  before: string;
  match: string;
  after: string;
}

export interface PdfSearcher {
  /** builds the index once; safe to call repeatedly */
  ensureIndex(onProgress?: (done: number, total: number) => void): Promise<void>;
  search(query: string): PdfSearchHit[];
  readonly ready: boolean;
}

const MAX_HITS_PER_PAGE = 4;
export const MAX_TOTAL_HITS = 300;

export function createPdfSearcher(pdf: PDFDocumentProxy): PdfSearcher {
  let index: string[] | null = null;
  let building: Promise<void> | null = null;

  return {
    get ready() {
      return index !== null;
    },
    ensureIndex(onProgress) {
      if (index) return Promise.resolve();
      if (building) return building;
      building = (async () => {
        const pages: string[] = [];
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const tc = await page.getTextContent();
          pages.push(
            tc.items
              .map((it) => ('str' in it ? it.str : ''))
              .join(' ')
              .replace(/\s+/g, ' ')
          );
          page.cleanup();
          if (p % 5 === 0 || p === pdf.numPages) onProgress?.(p, pdf.numPages);
        }
        index = pages;
      })();
      return building;
    },
    search(query) {
      if (!index) return [];
      const q = query.trim().toLowerCase();
      if (q.length < 2) return [];
      const hits: PdfSearchHit[] = [];
      for (let p = 0; p < index.length && hits.length < MAX_TOTAL_HITS; p++) {
        const text = index[p];
        const lower = text.toLowerCase();
        let from = 0;
        let pageHits = 0;
        while (pageHits < MAX_HITS_PER_PAGE && hits.length < MAX_TOTAL_HITS) {
          const at = lower.indexOf(q, from);
          if (at === -1) break;
          hits.push({
            page: p + 1,
            before: text.slice(Math.max(0, at - 40), at),
            match: text.slice(at, at + q.length),
            after: text.slice(at + q.length, at + q.length + 50),
          });
          from = at + q.length;
          pageHits++;
        }
      }
      return hits;
    },
  };
}
