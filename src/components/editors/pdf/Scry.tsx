import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PDFDocumentProxy } from './pdfjs';

// Cache of small page renders per document, shared by hover previews.
const thumbCache = new Map<string, Map<number, string>>();

export function getPageThumb(docId: string, page: number): string | undefined {
  return thumbCache.get(docId)?.get(page);
}

// Disk cache only for small thumbs: a 220px JPEG served into a big preview
// would be blurry; large renders stay memory-only.
const DISK_CACHE_MAX_WIDTH = 240;

/**
 * Ensures a thumbnail exists for (docId, page): memory → disk → live render.
 * Renders write back to both caches. Exported so the bookmarks tab can
 * pre-warm the cache in the background.
 */
export async function ensurePageThumb(docId: string, pdf: PDFDocumentProxy, page: number, width: number): Promise<string> {
  let cache = thumbCache.get(docId);
  if (!cache) {
    cache = new Map();
    thumbCache.set(docId, cache);
    if (thumbCache.size > 8) {
      // evict the oldest document cache
      const first = thumbCache.keys().next().value;
      if (first) thumbCache.delete(first);
    }
  }
  const hit = cache.get(page);
  if (hit) return hit;

  const useDisk = width <= DISK_CACHE_MAX_WIDTH;
  if (useDisk) {
    try {
      const disk = await window.diegesis.pdf.readThumb(docId, page);
      if (disk) {
        const url = `data:image/jpeg;base64,${disk}`;
        cache.set(page, url);
        return url;
      }
    } catch {
      /* cache miss — render below */
    }
  }

  const p = await pdf.getPage(page);
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  await p.render({ canvasContext: ctx, viewport }).promise;
  const url = canvas.toDataURL('image/jpeg', 0.8);
  p.cleanup();
  // bound per-document cache (JPEG data URLs are not cheap)
  if (cache.size >= 40) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(page, url);
  if (useDisk) {
    window.diegesis.pdf.writeThumb(docId, page, url.split(',')[1]).catch(() => {});
  }
  return url;
}

/** Live mini-render of a PDF page, used on hover previews (bookmarks, links). */
export function ScryThumb({ docId, pdf, page, width = 240 }: { docId: string; pdf: PDFDocumentProxy; page: number; width?: number }) {
  const [url, setUrl] = useState<string | undefined>(getPageThumb(docId, page));
  useEffect(() => {
    if (url) return;
    let cancelled = false;
    ensurePageThumb(docId, pdf, page, width).then((u) => !cancelled && setUrl(u)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [docId, pdf, page, width, url]);
  if (!url) return <div className="bg-overlay animate-pulse rounded" style={{ width, height: width * 1.3 }} />;
  return <img src={url} width={width} alt={`Página ${page}`} className="rounded shadow-lg block" draggable={false} />;
}

/** Full-page preview modal ("Scry"). */
export function ScryModal({
  docId,
  pdf,
  page,
  onJump,
  onClose,
}: {
  docId: string;
  pdf: PDFDocumentProxy;
  page: number;
  onJump: (page: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const width = Math.min(760, Math.round(window.innerWidth * 0.7));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={ref}
        className="bg-elevated border border-line rounded-xl p-4 shadow-2xl animate-fade-up max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-semibold text-ink-2">P.{page}</span>
          <div className="flex items-center gap-1">
            <button
              className="text-[12px] text-accent-ink hover:text-accent px-2 py-1 rounded hover:bg-accent-soft"
              onClick={() => {
                onJump(page);
                onClose();
              }}
            >
              Ir para a página {page} →
            </button>
            <button className="p-1 text-ink-3 hover:text-ink-1 rounded hover:bg-hover" onClick={onClose} title="Fechar (Esc)">
              <X size={15} />
            </button>
          </div>
        </div>
        <ScryThumb docId={docId} pdf={pdf} page={page} width={width} />
      </div>
    </div>
  );
}
