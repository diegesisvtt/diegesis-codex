// Explorer integration for PDFs: pin notes and bookmarks appear as tree
// children of the PDF document. Bookmarks are VIRTUAL nodes (they live inside
// the PDF's content JSON, not as real documents).
import type { DocNode } from '@shared/types';
import { parsePdfContent, type PdfHighlight, type PdfPin } from '../components/editors/pdf/model';

export const BOOKMARK_ID_PREFIX = 'bm:';

export function bookmarkVirtualId(pdfDocId: string, bookmarkId: string): string {
  return `${BOOKMARK_ID_PREFIX}${pdfDocId}:${bookmarkId}`;
}

export function parseBookmarkVirtualId(id: string): { pdfDocId: string; bookmarkId: string } | null {
  if (!id.startsWith(BOOKMARK_ID_PREFIX)) return null;
  const rest = id.slice(BOOKMARK_ID_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) return null;
  return { pdfDocId: rest.slice(0, sep), bookmarkId: rest.slice(sep + 1) };
}

export interface PinTreeInfo {
  pdfDocId: string;
  pinId: string;
  page: number;
  color: string;
  tag: PdfPin['tag'];
}

export interface BookmarkTreeNode {
  id: string; // virtual id (bm:…)
  pdfDocId: string;
  bookmarkId: string;
  page: number;
  label: string;
  color: string;
  favorite?: boolean;
}

export interface PdfTreeInfo {
  /** noteId -> pin metadata (for pin-note rows in the tree) */
  pinNotes: Map<string, PinTreeInfo>;
  /** pdfDocId -> virtual bookmark children (sorted by page) */
  bookmarksByPdf: Map<string, BookmarkTreeNode[]>;
}

/** Extracts pin/bookmark tree data from every PDF's content JSON. */
export function buildPdfTreeInfo(docs: DocNode[]): PdfTreeInfo {
  const pinNotes = new Map<string, PinTreeInfo>();
  const bookmarksByPdf = new Map<string, BookmarkTreeNode[]>();

  for (const d of docs) {
    if (d.type !== 'core/pdf') continue;
    let content;
    try {
      content = parsePdfContent(d.content);
    } catch {
      continue;
    }
    for (const pin of content.pins) {
      if (pin.noteId && !pinNotes.has(pin.noteId)) {
        pinNotes.set(pin.noteId, { pdfDocId: d.id, pinId: pin.id, page: pin.page, color: pin.color, tag: pin.tag });
      }
    }
    if (content.bookmarks.length > 0) {
      const nodes = [...content.bookmarks]
        .sort((a, b) => {
          if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
          return a.page - b.page;
        })
        .map((bm) => ({
          id: bookmarkVirtualId(d.id, bm.id),
          pdfDocId: d.id,
          bookmarkId: bm.id,
          page: bm.page,
          label: bm.label,
          color: bm.color,
          favorite: bm.favorite,
        }));
      bookmarksByPdf.set(d.id, nodes);
    }
  }
  return { pinNotes, bookmarksByPdf };
}

/** Returns updated PDF content JSON with the bookmark renamed (tree rename). */
export function renameBookmarkLabel(contentJson: string | null, bookmarkId: string, label: string): string {
  const c = parsePdfContent(contentJson);
  const bm = c.bookmarks.find((b) => b.id === bookmarkId);
  if (bm) bm.label = label.slice(0, 120) || bm.label;
  return JSON.stringify(c);
}

/** Returns updated PDF content JSON without the bookmark (tree delete). */
export function removeBookmark(contentJson: string | null, bookmarkId: string): string {
  const c = parsePdfContent(contentJson);
  c.bookmarks = c.bookmarks.filter((b) => b.id !== bookmarkId);
  return JSON.stringify(c);
}

// ---------------------------------------------------------------------------
// Highlights (global panel): virtual ids + cross-PDF moves
// ---------------------------------------------------------------------------

export const HIGHLIGHT_ID_PREFIX = 'hl:';

export function highlightVirtualId(pdfDocId: string, highlightId: string): string {
  return `${HIGHLIGHT_ID_PREFIX}${pdfDocId}:${highlightId}`;
}

export function parseHighlightVirtualId(id: string): { pdfDocId: string; highlightId: string } | null {
  if (!id.startsWith(HIGHLIGHT_ID_PREFIX)) return null;
  const rest = id.slice(HIGHLIGHT_ID_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0) return null;
  return { pdfDocId: rest.slice(0, sep), highlightId: rest.slice(sep + 1) };
}

export interface PdfHighlightGroup {
  pdfDoc: DocNode;
  highlights: PdfHighlight[];
  labels: Record<string, string>;
}

/** Highlights of every PDF in the realm, grouped by document (page order). */
export function collectHighlights(docs: DocNode[]): PdfHighlightGroup[] {
  const out: PdfHighlightGroup[] = [];
  for (const d of docs) {
    if (d.type !== 'core/pdf') continue;
    let content;
    try {
      content = parsePdfContent(d.content);
    } catch {
      continue;
    }
    if (content.highlights.length === 0) continue;
    out.push({
      pdfDoc: d,
      highlights: [...content.highlights].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt),
      labels: content.hlLabels,
    });
  }
  return out.sort((a, b) => (a.pdfDoc.title || '').localeCompare(b.pdfDoc.title || ''));
}

/** Returns updated PDF content JSON without the highlight (tree delete). */
export function removeHighlight(contentJson: string | null, highlightId: string): string {
  const c = parsePdfContent(contentJson);
  c.highlights = c.highlights.filter((h) => h.id !== highlightId);
  return JSON.stringify(c);
}

/**
 * Moves highlights between PDFs. Returns the new content JSON for the source
 * and target documents (unchanged when the move is a no-op).
 */
export function moveHighlights(
  sourceJson: string | null,
  targetJson: string | null,
  highlightIds: string[]
): { source: string; target: string } {
  const source = parsePdfContent(sourceJson);
  const target = parsePdfContent(targetJson);
  const moving = source.highlights.filter((h) => highlightIds.includes(h.id));
  source.highlights = source.highlights.filter((h) => !highlightIds.includes(h.id));
  target.highlights.push(...moving);
  return { source: JSON.stringify(source), target: JSON.stringify(target) };
}
