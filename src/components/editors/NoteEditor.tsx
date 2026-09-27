// Notion-like note editor built on BlockNote. Drag handle, side menu,
// slash menu and formatting toolbar are all native BlockNote UI.
import { useEffect, useRef, useState } from 'react';
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  BlockTypeSelect,
  BasicTextStyleButton,
  CreateLinkButton,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/ariakit';
import { pt } from '@blocknote/core/locales';
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { Sparkles } from 'lucide-react';
import type { DocNode } from '@shared/types';
import { parseNoteContent } from '@shared/blockContent';
import { useStore } from '../../state/store';
import { DocIconPicker } from './shared/DocIconPicker';
import { AudioBlock } from './note/audioBlock';

/** note schema: defaults + the custom audio block (disk-backed, loop-capable) */
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    audio: AudioBlock(),
  },
});

/** Media upload routing: audio files go to disk storage (streamed via the
 *  mythril-audio:// protocol); everything else (images) stays inline base64. */
async function uploadMedia(file: File): Promise<string> {
  if (file.type.startsWith('audio/')) {
    const buf = await file.arrayBuffer();
    const result = await window.mythril.audio.save(file.name, buf);
    if (!result.asset) throw new Error(result.error ?? 'Falha ao importar o áudio.');
    return result.asset.url;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function NoteEditor({
  doc,
  embedded = false,
  showIcon = true,
}: {
  doc: DocNode;
  /** compact chrome (no title/date) for embedding inside other surfaces */
  embedded?: boolean;
  /** hide the icon picker when the host surface already provides one */
  showIcon?: boolean;
}) {
  const { updateDocument, subscribeExternalDocChange, openPanel, setAiDraft } = useStore();
  const [title, setTitle] = useState(doc.title);
  /** suppresses the persist round-trip while applying an external change */
  const applyingExternalRef = useRef(false);

  const editor = useCreateBlockNote(
    {
      schema,
      dictionary: pt,
      initialContent: parseNoteContent(doc.content) as never,
      uploadFile: uploadMedia,
      autofocus: false,
    },
    [doc.id]
  );

  /* ---------- persist on change ---------- */
  const handleChange = () => {
    if (applyingExternalRef.current) return; // external change, nothing to persist
    updateDocument(doc.id, { content: JSON.stringify(editor.document) });
  };

  useEffect(() => {
    setTitle(doc.title);
  }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- live reload when the AI edits this note ---------- */
  useEffect(() => {
    return subscribeExternalDocChange((changed) => {
      if (changed.id !== doc.id) return;
      setTitle(changed.title);
      applyingExternalRef.current = true;
      try {
        editor.replaceBlocks(editor.document, parseNoteContent(changed.content) as never);
      } catch {
        /* malformed content — ignore */
      } finally {
        // replaceBlocks fires onChange synchronously; release the guard after this tick
        setTimeout(() => {
          applyingExternalRef.current = false;
        }, 0);
      }
    });
  }, [editor, doc.id, subscribeExternalDocChange]);

  /* ---------- ask AI about the current selection ---------- */
  const askAI = () => {
    const selected = editor.getSelectedText().trim();
    if (!selected) return;
    setAiDraft(`Sobre este trecho das minhas notas:\n\n> ${selected}\n\n`);
    openPanel('ai-chat');
  };

  /* ---------- click below content appends a paragraph ---------- */
  const handlePageClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isPagePadding = e.target === e.currentTarget || target.classList?.contains('bn-editor');
    if (!isPagePadding) return;
    const last = editor.document[editor.document.length - 1];
    if (!last) return;
    const isEmptyParagraph =
      last.type === 'paragraph' && (!Array.isArray(last.content) || last.content.length === 0);
    let focusBlock = last;
    if (!isEmptyParagraph) {
      const [inserted] = editor.insertBlocks([{ type: 'paragraph' }], last, 'after');
      if (inserted) focusBlock = inserted as typeof last;
    }
    editor.focus();
    editor.setTextCursorPosition(focusBlock, 'end');
  };

  const focusEditorStart = () => {
    const first = editor.document[0];
    if (!first) return;
    editor.focus();
    editor.setTextCursorPosition(first, 'start');
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    updateDocument(doc.id, { title: e.target.value });
  };

  const updatedAt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(doc.updatedAt);

  return (
    <div className="h-full w-full bg-app flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar" onClick={handlePageClick}>
        <div className={embedded ? 'w-full px-1 pt-1' : 'w-full max-w-[724px] mx-auto pl-[54px] pr-4 pt-14'}>
          {embedded && showIcon && (
            <div className="-ml-2 mb-1">
              <DocIconPicker
                icon={doc.icon}
                size={18}
                onPick={(name) => updateDocument(doc.id, { icon: name })}
              />
            </div>
          )}
          {!embedded && (
            <>
              <div className="flex items-center gap-3">
                {showIcon && (
                  <div className="-ml-2.5 shrink-0">
                    <DocIconPicker
                      icon={doc.icon}
                      size={26}
                      onPick={(name) => updateDocument(doc.id, { icon: name })}
                    />
                  </div>
                )}
                <input
                  type="text"
                  className="w-full bg-transparent text-[40px] leading-[1.2] font-bold text-ink-1 placeholder-ink-3 outline-none tracking-tight"
                  placeholder="Nova página"
                  value={title}
                  onChange={handleTitleChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      focusEditorStart();
                    }
                  }}
                />
              </div>
              <div className="text-[12px] text-ink-3 mt-1 mb-6 select-none">Editado {updatedAt}</div>
            </>
          )}
        </div>

        <BlockNoteView
          editor={editor}
          theme="dark"
          onChange={handleChange}
          formattingToolbar={false}
          className={embedded ? 'mythril-bn embedded' : 'mythril-bn'}
        >
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                <BlockTypeSelect key="blockTypeSelect" />
                <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
                <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
                <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
                <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
                <BasicTextStyleButton basicTextStyle="code" key="codeStyleButton" />
                <CreateLinkButton key="createLinkButton" />
                <button
                  key="askAI"
                  title="Perguntar à IA sobre a seleção"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={askAI}
                  className="bn-ask-ai"
                >
                  <Sparkles size={15} strokeWidth={1.75} />
                </button>
              </FormattingToolbar>
            )}
          />
        </BlockNoteView>
      </div>
    </div>
  );
}
