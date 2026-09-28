// Region text capture for AI table extraction: the user drags a rectangle
// over a PDF page; we pull the text items inside it (PDF.js textContent),
// group them into visual lines and return reading-order plain text for the
// table-extract specialist. Works on digital PDFs (no OCR for scans).

import type { PDFDocumentProxy } from './pdfjs';

/** fractional (0..1) rectangle on a page */
export interface FractionalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Item {
  fx: number;
  fy: number;
  str: string;
}

export async function extractRegionText(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  rect: FractionalRect,
  rotation: number
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  // same viewport the page renders with, so fractional coords line up
  const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
  const content = await page.getTextContent();

  const items: Item[] = [];
  for (const raw of content.items) {
    if (!('str' in raw) || !raw.str.trim()) continue;
    const [vx, vy] = viewport.convertToViewportPoint(raw.transform[4], raw.transform[5]);
    const fx = vx / viewport.width;
    const fy = vy / viewport.height;
    if (fx >= rect.x && fx <= rect.x + rect.w && fy >= rect.y && fy <= rect.y + rect.h) {
      items.push({ fx, fy, str: raw.str });
    }
  }

  // group into visual lines by vertical proximity, then read left→right
  items.sort((a, b) => a.fy - b.fy || a.fx - b.fx);
  const lineTol = 0.006;
  const lines: string[] = [];
  let curY = Number.NaN;
  let cur: string[] = [];
  const flush = () => {
    if (cur.length > 0) lines.push(cur.join(' ').replace(/\s+/g, ' ').trim());
    cur = [];
  };
  for (const it of items) {
    if (Number.isNaN(curY) || Math.abs(it.fy - curY) > lineTol) {
      flush();
      curY = it.fy;
    }
    cur.push(it.str);
  }
  flush();
  return lines.filter(Boolean).join('\n');
}
