import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy } from './pdfjs';

interface PageViewProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** absolute render scale (already includes fit + user zoom) */
  scale: number;
  /** extra rotation in degrees (0/90/180/270) */
  rotation: number;
  /** fallback aspect ratio (w/h) used before the page is loaded */
  fallbackAspect: number;
  /** CSS filter applied to the page canvas (invert/sepia) */
  filter?: string;
  /** overlay layers (pins, highlights, links…) positioned in fractional coords */
  children?: ReactNode;
  onVisible?: (page: number) => void;
}

/**
 * A single PDF page: lazily renders canvas + text layer when near the viewport,
 * cancels work on scale change/unmount. Overlay children are positioned over a
 * relative wrapper so fractional (0..1) coordinates just work.
 */
export function PageView({ pdf, pageNumber, scale, rotation, fallbackAspect, filter, children, onVisible }: PageViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Lazy-activate when approaching the viewport.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setNear(true);
            onVisible?.(pageNumber);
          }
        }
      },
      { root: el.closest('.pdf-scroll'), rootMargin: '1200px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  // Render when active / scale / rotation changes.
  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let renderTask: { promise: Promise<unknown>; cancel(): void } | null = null;
    let textLayer: TextLayer | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
        setSize({ w: viewport.width, h: viewport.height });

        const canvas = canvasRef.current;
        const textEl = textRef.current;
        if (!canvas || !textEl) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d')!;
        // HiDPI: render through a DPR transform instead of scaling the context
        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        renderTask = page.render({ canvasContext: ctx, viewport, transform });
        try {
          await renderTask.promise;
        } catch {
          /* cancelled */
        }
        if (cancelled) return;

        textEl.innerHTML = '';
        textEl.style.setProperty('--scale-factor', String(viewport.scale));
        textEl.style.width = `${Math.floor(viewport.width)}px`;
        textEl.style.height = `${Math.floor(viewport.height)}px`;
        textLayer = new TextLayer({
          textContentSource: page.streamTextContent(),
          container: textEl,
          viewport,
        });
        try {
          await textLayer.render();
        } catch {
          /* cancelled */
        }
      } catch {
        /* pdf destroyed mid-flight (reader closed) */
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, rotation, near]);

  const w = size?.w;
  const h = size?.h;

  return (
    <div
      ref={wrapperRef}
      data-page={pageNumber}
      className="pdf-page group relative shadow-lg bg-white shrink-0"
      style={{
        width: w ?? undefined,
        height: h ?? undefined,
        aspectRatio: w ? undefined : fallbackAspect.toString(),
        minWidth: 200,
      }}
    >
      <canvas ref={canvasRef} className="block" style={filter ? { filter } : undefined} />
      <div ref={textRef} className="textLayer" />
      {children}
    </div>
  );
}
