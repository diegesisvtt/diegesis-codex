/**
 * Drag-and-drop contract between the Explorer tree and canvas editors
 * (whiteboard, PDF pages). Payload travels as JSON under REF_DRAG_MIME.
 *
 * Note: react-dnd's HTML5 backend (used by react-arborist) force-sets
 * dropEffect='none' on window-level dragover when the pointer is not over
 * one of its own drop targets, which blocks the drop event. Drop targets
 * outside the tree must re-set dropEffect in a window listener registered
 * after the backend's (i.e. on mount, since the backend registers at boot).
 */

export const REF_DRAG_MIME = 'application/x-mythril-ref';

export type ExplorerDragRef =
  | { kind: 'note'; docId: string }
  | { kind: 'pin'; docId: string; pdfDocId: string; pinId: string; color?: string }
  | { kind: 'bookmark'; pdfDocId: string; bookmarkId: string; label: string; page: number; color?: string }
  | { kind: 'highlight'; pdfDocId: string; highlightId: string; text: string; page: number; color?: string };

export function parseExplorerDragRef(raw: string): ExplorerDragRef | null {
  try {
    const ref = JSON.parse(raw);
    return ref && typeof ref === 'object' && typeof ref.kind === 'string' ? (ref as ExplorerDragRef) : null;
  } catch {
    return null;
  }
}
