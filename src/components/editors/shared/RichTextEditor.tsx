// Shared BlockNote-based rich text editor for compact surfaces:
// whiteboard note shapes, PDF pin/annotation cards…
import { useEffect, useRef } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/ariakit';
import { pt } from '@blocknote/core/locales';
import { parseNoteContent } from '@shared/blockContent';

export interface RichTextEditorProps {
  /** initial content JSON string (BlockNote format; legacy tiptap auto-converts) */
  content?: string | null;
  onChange?: (json: string, html: string) => void;
  /** classes applied to the wrapper div */
  className?: string;
  autofocus?: boolean | 'start' | 'end';
  /**
   * Serialized JSON that may change from outside (AI tools, other tabs).
   * When it differs from the editor state, the editor adopts it.
   */
  externalContent?: string | null;
  /** Escape blurs the editor and fires this (used by the whiteboard) */
  onEscape?: () => void;
  /** stops keydown propagation so canvas/tree shortcuts don't fire while typing */
  stopKeyPropagation?: boolean;
}

export function RichTextEditor({
  content,
  onChange,
  className,
  autofocus = false,
  externalContent,
  onEscape,
  stopKeyPropagation,
}: RichTextEditorProps) {
  /** suppresses the onChange echo while applying external content */
  const applyingExternalRef = useRef(false);

  const editor = useCreateBlockNote({
    dictionary: pt,
    initialContent: parseNoteContent(content) as never,
    autofocus: autofocus || false,
  });

  const handleChange = () => {
    if (applyingExternalRef.current) return;
    const json = JSON.stringify(editor.document);
    const html = editor.blocksToHTMLLossy(editor.document);
    onChange?.(json, html);
  };

  // adopt external content changes (guard: don't clobber while the user types)
  useEffect(() => {
    if (externalContent === undefined) return;
    if (!externalContent) {
      if (editor.document.some((b) => b.type !== 'paragraph' || (Array.isArray(b.content) && b.content.length > 0))) {
        applyingExternalRef.current = true;
        editor.replaceBlocks(editor.document, [{ type: 'paragraph' }]);
        setTimeout(() => {
          applyingExternalRef.current = false;
        }, 0);
      }
      return;
    }
    if (externalContent !== JSON.stringify(editor.document)) {
      applyingExternalRef.current = true;
      try {
        editor.replaceBlocks(editor.document, parseNoteContent(externalContent) as never);
      } catch {
        /* malformed content — ignore */
      } finally {
        setTimeout(() => {
          applyingExternalRef.current = false;
        }, 0);
      }
    }
  }, [editor, externalContent]);

  return (
    <div
      className={className}
      onKeyDown={(e) => {
        if (stopKeyPropagation) e.stopPropagation();
        if (e.key === 'Escape' && onEscape) {
          e.preventDefault();
          (e.target as HTMLElement).blur();
          onEscape();
        }
      }}
    >
      <BlockNoteView
        editor={editor}
        theme="dark"
        sideMenu={false}
        onChange={handleChange}
        className="diegesis-bn mini"
      />
    </div>
  );
}
