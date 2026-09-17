import { useEffect, useState } from 'react';
import { pageLinks, type PdfLink } from './outline';
import type { PDFDocumentProxy } from './pdfjs';
import { ScryThumb } from './Scry';

interface LinkLayerProps {
  docId: string;
  pdf: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onJump: (page: number, label?: string) => void;
}

/** Clickable overlay for the PDF's own internal/external link annotations. */
export function LinkLayer({ docId, pdf, pageNumber, active, onJump }: LinkLayerProps) {
  const [links, setLinks] = useState<PdfLink[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    pageLinks(pdf, pageNumber).then((l) => !cancelled && setLinks(l));
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, active]);

  if (links.length === 0) return null;

  return (
    <>
      {links.map((link, i) => (
        <button
          key={i}
          className="absolute z-[5] rounded-sm hover:bg-accent/15 hover:outline hover:outline-1 hover:outline-accent/40 transition-colors"
          style={{
            left: `${link.x * 100}%`,
            top: `${link.y * 100}%`,
            width: `${link.w * 100}%`,
            height: `${link.h * 100}%`,
          }}
          title={link.url ?? (link.targetPage ? `Ir para página ${link.targetPage}` : undefined)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          onClick={(e) => {
            e.stopPropagation();
            if (link.url) window.open(link.url, '_blank');
            else if (link.targetPage) onJump(link.targetPage, 'link');
          }}
        >
          {hovered === i && link.targetPage && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-30 pointer-events-none animate-fade-in">
              <ScryThumb docId={docId} pdf={pdf} page={link.targetPage} width={200} />
            </div>
          )}
        </button>
      ))}
    </>
  );
}
