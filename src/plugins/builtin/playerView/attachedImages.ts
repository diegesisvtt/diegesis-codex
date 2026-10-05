/* Extracts images attached to documents (BlockNote image blocks in notes,
   image shapes in whiteboards) so the GM can push them to the player view. */

import { parseNoteContent, type BNBlock } from '@shared/blockContent';
import type { DocNode } from '@shared/types';

export interface AttachedImage {
  docId: string;
  docTitle: string;
  src: string;
  name: string;
}

function noteImages(doc: DocNode): AttachedImage[] {
  const out: AttachedImage[] = [];
  const walk = (blocks: BNBlock[]): void => {
    for (const b of blocks) {
      if (b.type === 'image' && typeof b.props?.url === 'string' && b.props.url) {
        out.push({
          docId: doc.id,
          docTitle: doc.title,
          src: b.props.url,
          name: typeof b.props.caption === 'string' && b.props.caption ? b.props.caption : doc.title,
        });
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(parseNoteContent(doc.content));
  return out;
}

function whiteboardImages(doc: DocNode): AttachedImage[] {
  const out: AttachedImage[] = [];
  try {
    const raw = JSON.parse(doc.content ?? 'null') as { shapes?: Record<string, { type?: string; props?: Record<string, unknown> }> } | null;
    for (const shape of Object.values(raw?.shapes ?? {})) {
      const src = shape.props?.src;
      if (shape.type === 'image' && typeof src === 'string' && src) {
        const name = shape.props?.name;
        out.push({
          docId: doc.id,
          docTitle: doc.title,
          src,
          name: typeof name === 'string' && name ? name : doc.title,
        });
      }
    }
  } catch {
    /* corrupted content — no images */
  }
  return out;
}

/** Images attached to a document; empty for types that can't hold any. */
export function extractAttachedImages(doc: DocNode): AttachedImage[] {
  if (doc.type === 'core/note') return noteImages(doc);
  if (doc.type === 'core/whiteboard') return whiteboardImages(doc);
  return [];
}
