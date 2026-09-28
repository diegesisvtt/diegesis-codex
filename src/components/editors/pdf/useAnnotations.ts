// Annotation lifecycle: pins/highlights/bookmarks wired to real
// Diegesis Codex documents (each pin body is a child `core/note` of the PDF).
import { useCallback, useEffect } from 'react';
import type { DocNode } from '@shared/types';
import { useStore } from '../../../state/store';
import {
  pinId,
  PIN_TAG_COLORS,
  UNTAGGED_PIN_COLOR,
  type PdfDocContent,
  type PdfPin,
  type PdfPinTag,
  type PdfHighlight,
  type PdfBookmark,
} from './model';
import { TAG_DEFAULT_ICON } from './rpg';
import type { ParsedStatblock } from './rpg';

interface AnnotationsApi {
  createPin(page: number, x: number, y: number, tag: PdfPinTag, opts?: { folderId?: string }): Promise<string>;
  createPinFromStatblock(page: number, x: number, y: number, parsed: ParsedStatblock): Promise<string>;
  createLinkToken(fromPinId: string, page: number, x: number, y: number): void;
  updatePin(pin: string, patch: Partial<PdfPin>): void;
  movePin(pin: string, page: number, x: number, y: number): void;
  deletePin(pin: string): Promise<void>;

  addHighlight(hl: Omit<PdfHighlight, 'id' | 'createdAt'>): void;
  updateHighlight(hlId: string, patch: Partial<PdfHighlight>): void;
  deleteHighlight(hlId: string): void;
  convertHighlightToNote(hlId: string): Promise<void>;

  toggleBookmark(page: number): void;
  updateBookmark(bmId: string, patch: Partial<PdfBookmark>): void;
  deleteBookmark(bmId: string): void;
}

export function usePdfAnnotations(
  doc: DocNode,
  contentRef: { current: PdfDocContent },
  commit: (mutate: (c: PdfDocContent) => void) => void
): AnnotationsApi {
  const { createDocument, updateDocument, deleteDocument, docs } = useStore();

  const createPin = useCallback(
    async (page: number, x: number, y: number, tag: PdfPinTag, opts?: { folderId?: string }): Promise<string> => {
      const note = await createDocument('core/note', opts?.folderId ?? doc.id, tag ? `Novo ${tag}` : 'Nova anotação');
      const id = pinId();
      commit((c) => {
        c.pins.push({
          id,
          noteId: note.id,
          page,
          x,
          y,
          tag,
          color: tag ? PIN_TAG_COLORS[tag] : UNTAGGED_PIN_COLOR,
          icon: tag ? TAG_DEFAULT_ICON[tag] : 'pencil',
          fields: [],
          createdAt: Date.now(),
        });
      });
      return id;
    },
    [createDocument, commit, doc.id]
  );

  const createPinFromStatblock = useCallback(
    async (page: number, x: number, y: number, parsed: ParsedStatblock): Promise<string> => {
      const note = await createDocument('core/note', doc.id, parsed.title);
      if (parsed.notes) {
        updateDocument(note.id, {
          content: JSON.stringify([
            { type: 'paragraph', content: [{ type: 'text', text: parsed.notes, styles: {} }] },
          ]),
        });
      }
      const id = pinId();
      commit((c) => {
        c.pins.push({
          id,
          noteId: note.id,
          page,
          x,
          y,
          tag: parsed.tag,
          color: PIN_TAG_COLORS[parsed.tag],
          icon: TAG_DEFAULT_ICON[parsed.tag],
          fields: parsed.fields.map((f) => ({ id: pinId(), key: f.key, value: f.value })),
          createdAt: Date.now(),
        });
      });
      return id;
    },
    [createDocument, updateDocument, commit, doc.id]
  );

  const createLinkToken = useCallback(
    (fromPinId: string, page: number, x: number, y: number) => {
      const source = contentRef.current.pins.find((p) => p.id === fromPinId);
      if (!source) return;
      commit((c) => {
        c.pins.push({
          id: pinId(),
          noteId: source.noteId, // link tokens point at the same note
          page,
          x,
          y,
          tag: source.tag,
          color: source.color,
          icon: 'link',
          fields: [],
          linkTargetPinId: source.linkTargetPinId ?? source.id,
          tokenFace: '→',
          createdAt: Date.now(),
        });
      });
    },
    [commit, contentRef]
  );

  const updatePin = useCallback(
    (id: string, patch: Partial<PdfPin>) => {
      commit((c) => {
        const pin = c.pins.find((p) => p.id === id);
        if (pin) Object.assign(pin, patch);
      });
    },
    [commit]
  );

  const movePin = useCallback(
    (id: string, page: number, x: number, y: number) => {
      commit((c) => {
        const pin = c.pins.find((p) => p.id === id);
        if (pin) {
          pin.page = page;
          pin.x = Math.min(1, Math.max(0, x));
          pin.y = Math.min(1, Math.max(0, y));
        }
      });
    },
    [commit]
  );

  const deletePin = useCallback(
    async (id: string) => {
      const pin = contentRef.current.pins.find((p) => p.id === id);
      if (!pin) return;
      const isToken = !!pin.linkTargetPinId;
      commit((c) => {
        c.pins = c.pins.filter((p) => p.id !== id);
        // deleting a pin also removes its link tokens
        if (!isToken) c.pins = c.pins.filter((p) => p.linkTargetPinId !== id);
      });
      if (!isToken) {
        // the note is the pin's body — delete it (cascades nothing else)
        await deleteDocument(pin.noteId);
      }
    },
    [commit, contentRef, deleteDocument]
  );

  const addHighlight = useCallback(
    (hl: Omit<PdfHighlight, 'id' | 'createdAt'>) => {
      commit((c) => {
        c.highlights.push({ ...hl, id: pinId(), createdAt: Date.now() });
      });
    },
    [commit]
  );

  const deleteHighlight = useCallback(
    (hlId: string) => {
      commit((c) => {
        c.highlights = c.highlights.filter((h) => h.id !== hlId);
      });
    },
    [commit]
  );

  const updateHighlight = useCallback(
    (hlId: string, patch: Partial<PdfHighlight>) => {
      commit((c) => {
        const hl = c.highlights.find((h) => h.id === hlId);
        if (hl) Object.assign(hl, patch);
      });
    },
    [commit]
  );

  const convertHighlightToNote = useCallback(
    async (hlId: string) => {
      const hl = contentRef.current.highlights.find((h) => h.id === hlId);
      if (!hl || hl.noteId) return;
      // the note belongs to the user, not to the PDF: create it at the realm
      // root so it can be moved/organized freely in the tree
      const note = await createDocument('core/note', null, `Destaque — p. ${hl.page}`);
      updateDocument(note.id, {
        content: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'blockquote',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: hl.text }] }],
            },
            { type: 'paragraph', content: [{ type: 'text', text: `— ${doc.title}, p. ${hl.page}` }] },
          ],
        }),
      });
      commit((c) => {
        const target = c.highlights.find((h) => h.id === hlId);
        if (target) target.noteId = note.id;
      });
    },
    [commit, contentRef, createDocument, updateDocument, doc.title]
  );

  const toggleBookmark = useCallback(
    (page: number) => {
      commit((c) => {
        const existing = c.bookmarks.find((b) => b.page === page);
        if (existing) c.bookmarks = c.bookmarks.filter((b) => b.id !== existing.id);
        else
          c.bookmarks.push({
            id: pinId(),
            page,
            label: `Página ${page}`,
            color: '#d96a5f',
            createdAt: Date.now(),
          });
      });
    },
    [commit]
  );

  const updateBookmark = useCallback(
    (bmId: string, patch: Partial<PdfBookmark>) => {
      commit((c) => {
        const bm = c.bookmarks.find((b) => b.id === bmId);
        if (bm) Object.assign(bm, patch);
      });
    },
    [commit]
  );

  const deleteBookmark = useCallback(
    (bmId: string) => {
      commit((c) => {
        c.bookmarks = c.bookmarks.filter((b) => b.id !== bmId);
      });
    },
    [commit]
  );

  // ---- orphan cleanup: a pin note deleted elsewhere removes the pin ----
  useEffect(() => {
    // An empty docs list means "not loaded" (or realm switch in flight), never
    // "all notes deleted" — without this guard a stale list would wipe pins.
    if (docs.length === 0) return;
    const c = contentRef.current;
    const ids = new Set(docs.map((d) => d.id));
    const hasOrphanPin = c.pins.some((p) => !ids.has(p.noteId));
    const hasOrphanHighlightLink = c.highlights.some((h) => h.noteId && !ids.has(h.noteId));
    if (!hasOrphanPin && !hasOrphanHighlightLink) return;
    commit((next) => {
      next.pins = next.pins.filter((p) => ids.has(p.noteId));
      for (const h of next.highlights) if (h.noteId && !ids.has(h.noteId)) delete h.noteId;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  return {
    createPin,
    createPinFromStatblock,
    createLinkToken,
    updatePin,
    movePin,
    deletePin,
    addHighlight,
    updateHighlight,
    deleteHighlight,
    convertHighlightToNote,
    toggleBookmark,
    updateBookmark,
    deleteBookmark,
  };
}
