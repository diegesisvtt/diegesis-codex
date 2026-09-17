// PDF outline (table of contents) tree + destination resolution.
import type { PDFDocumentProxy } from './pdfjs';

export interface OutlineNode {
  title: string;
  page: number | null; // 1-based, null when unresolvable
  children: OutlineNode[];
}

/** Resolves a pdf.js destination (explicit ref or named) to a 1-based page number. */
export async function destToPage(pdf: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    let explicit = dest;
    if (typeof dest === 'string') explicit = await pdf.getDestination(dest);
    const ref = Array.isArray(explicit) ? explicit[0] : null;
    if (!ref) return null;
    return (await pdf.getPageIndex(ref)) + 1;
  } catch {
    return null;
  }
}

export async function loadOutline(pdf: PDFDocumentProxy): Promise<OutlineNode[]> {
  const raw = await pdf.getOutline();
  if (!raw) return [];
  const walk = async (items: any[]): Promise<OutlineNode[]> => {
    const out: OutlineNode[] = [];
    for (const item of items) {
      const page = item.dest ? await destToPage(pdf, item.dest) : null;
      out.push({
        title: String(item.title ?? '').trim() || '(sem título)',
        page,
        children: item.items?.length ? await walk(item.items) : [],
      });
    }
    return out;
  };
  return walk(raw);
}

function isSafeUrl(url: string): boolean {
  try {
    const proto = new URL(url).protocol;
    return proto === 'https:' || proto === 'http:' || proto === 'mailto:';
  } catch {
    return false;
  }
}

/** Internal link annotations of a page, resolved to target pages. */
export interface PdfLink {
  /** fractional rect within the page */
  x: number;
  y: number;
  w: number;
  h: number;
  targetPage: number | null;
  url: string | null;
}

export async function pageLinks(pdf: PDFDocumentProxy, pageNumber: number): Promise<PdfLink[]> {
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const annotations = await page.getAnnotations();
    const links: PdfLink[] = [];
    for (const a of annotations) {
      if (a.subtype !== 'Link' || !a.rect) continue;
      const [x1, y1, x2, y2] = a.rect as number[];
      const base = {
        x: Math.min(x1, x2) / viewport.width,
        y: 1 - Math.max(y1, y2) / viewport.height, // PDF y grows upward
        w: Math.abs(x2 - x1) / viewport.width,
        h: Math.abs(y2 - y1) / viewport.height,
      };
      if (a.url && isSafeUrl(a.url)) {
        links.push({ ...base, targetPage: null, url: a.url });
      } else if (a.dest) {
        const targetPage = await destToPage(pdf, a.dest);
        links.push({ ...base, targetPage, url: null });
      }
      // a.unsafeUrl is deliberately ignored: pdf.js names it "unsafe" because it
      // is unsanitized attacker data (javascript:/file:/smb: schemes).
    }
    return links;
  } catch {
    return [];
  }
}
