// Notion-like note editor built on BlockNote. Drag handle, side menu,
// slash menu and formatting toolbar are all native BlockNote UI.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  BlockTypeSelect,
  BasicTextStyleButton,
  CreateLinkButton,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/ariakit';
import { pt } from '@blocknote/core/locales';
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { BookMarked, Clock, FileText, ImagePlus, Layers, Sparkles, Table } from 'lucide-react';
import { REF_DRAG_MIME, parseExplorerDragRef } from '@shared/dragDrop';
import type { DocNode } from '@shared/types';
import { parseNoteContent } from '@shared/blockContent';
import { useStore } from '../../state/store';
import { Badge } from '../ui/Badge';
import { DocIconPicker } from './shared/DocIconPicker';
import { AudioBlock } from './note/audioBlock';
import { InteractiveTableBlock } from './note/tableBlock';
import { CalloutBlockNote } from './note/calloutBlock';
import { InlineAiPopover } from './note/InlineAiPopover';

/** rótulo legível por tipo de documento (metadados) */
const DOC_TYPE_LABEL: Record<string, string> = {
  'core/note': 'Nota',
  'core/whiteboard': 'Quadro branco',
  'core/pdf': 'PDF',
  'hexcrawl/map': 'Mapa',
  'diegesis/timeline': 'Linha do tempo',
  'diegesis/table': 'Tabela',
  'diegesis/sheet': 'Ficha',
};

/** contagem aproximada de palavras do conteúdo serializado (BlockNote JSON) */
function countWords(content: string | null): number {
  if (!content) return 0;
  try {
    const parsed = JSON.parse(content);
    let words = 0;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const x of node) walk(x);
        return;
      }
      if (node && typeof node === 'object') {
        const n = node as { text?: string; content?: unknown; children?: unknown };
        if (typeof n.text === 'string' && n.text.trim()) {
          words += n.text.trim().split(/\s+/).filter(Boolean).length;
        }
        if (n.content) walk(n.content);
        if (n.children) walk(n.children);
      }
    };
    walk(parsed);
    return words;
  } catch {
    return 0;
  }
}

/** note schema: defaults + custom blocks (audio: disk-backed, loop-capable;
 *  interactiveTable: embeds a diegesis/table document with roll button;
 *  callout: destaque tático rule/lore/secret/quote) */
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    audio: AudioBlock(),
    interactiveTable: InteractiveTableBlock(),
    callout: CalloutBlockNote(),
  },
});

/** Media upload routing: audio files go to disk storage (streamed via the
 *  diegesis-audio:// protocol); everything else (images) stays inline base64. */
async function uploadMedia(file: File): Promise<string> {
  if (file.type.startsWith('audio/')) {
    const buf = await file.arrayBuffer();
    const result = await window.diegesis.audio.save(file.name, buf);
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

/** Downscales a cover image to a compact JPEG data URL (max 1600px wide) so
 *  the documents.cover column doesn't bloat the DB. Small images pass through. */
async function downscaleCover(file: File): Promise<string> {
  if (file.size > 25_000_000) throw new Error('Imagem grande demais para capa.');
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
  const MAX_W = 1600;
  const MAX_PASSTHROUGH_BYTES = 400_000; // small images keep their original encoding
  if (img.naturalWidth <= MAX_W && src.length < MAX_PASSTHROUGH_BYTES) return src;
  const scale = Math.min(1, MAX_W / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  // JPEG has no alpha — flatten transparency onto the app background
  ctx.fillStyle = '#191919';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
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
  const { docs, updateDocument, subscribeExternalDocChange } = useStore();
  const [title, setTitle] = useState(doc.title);
  /** suppresses the persist round-trip while applying an external change */
  const applyingExternalRef = useRef(false);
  /** inline "Ask AI" popover state */
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAnchor, setAiAnchor] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const aiTriggerRef = useRef<HTMLButtonElement>(null);

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

  /* ---------- slash menu: defaults + custom blocks ---------- */
  // BlockNote's default slash items are hardcoded to built-in blocks, so custom
  // blocks (interactiveTable) need an explicit item here.
  const slashItems = async (query: string) =>
    filterSuggestionItems(
      [
        ...getDefaultReactSlashMenuItems(editor),
        {
          title: 'Tabela interativa',
          onItemClick: () =>
            insertOrUpdateBlockForSlashMenu(editor, { type: 'interactiveTable' } as never),
          aliases: ['tabela', 'table', 'rolagem', 'roll', 'dados', 'dice'],
          group: 'Diegesis Codex',
          icon: <Table size={18} />,
          subtext: 'Embute uma tabela rolável do universo',
        },
        {
          title: 'Callout',
          onItemClick: () =>
            insertOrUpdateBlockForSlashMenu(editor, { type: 'callout', props: { variant: 'lore' } } as never),
          aliases: ['destaque', 'lore', 'segredo', 'regra', 'citação', 'callout', 'quote'],
          group: 'Diegesis Codex',
          icon: <BookMarked size={18} />,
          subtext: 'Bloco de destaque (regra, lore, segredo, citação)',
        },
      ],
      query
    );

  /* ---------- drop de documentos do Explorer (tabelas viram bloco) ---------- */
  // react-dnd's HTML5 backend force-sets dropEffect='none' outside its own drop
  // targets; this window listener (registered after the backend's) wins.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(REF_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    window.addEventListener('dragover', onDragOver);
    return () => window.removeEventListener('dragover', onDragOver);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(REF_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDropRef = (e: React.DragEvent) => {
    const ref = parseExplorerDragRef(e.dataTransfer.getData(REF_DRAG_MIME));
    if (!ref || ref.kind !== 'note') return;
    const target = docs.find((d) => d.id === ref.docId);
    if (!target || target.type !== 'diegesis/table') return;
    e.preventDefault();
    const last = editor.document[editor.document.length - 1];
    if (!last) return;
    editor.insertBlocks(
      [{ type: 'interactiveTable', props: { tableId: target.id } }] as never,
      last,
      'after'
    );
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

  /* ---------- inline AI: open the popover near the selection/trigger ---------- */
  const openAi = (rect?: DOMRect) => {
    let r = rect;
    if (!r) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount) {
        const sr = sel.getRangeAt(0).getBoundingClientRect();
        if (sr && (sr.width || sr.height)) r = sr;
      }
    }
    if (!r) r = aiTriggerRef.current?.getBoundingClientRect();
    if (!r) r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    setAiAnchor({ x: r.left, y: r.bottom + 8 });
    setAiOpen(true);
  };

  /* ---------- keyboard shortcut (Cmd/Ctrl+J) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        openAi();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  /* ---------- cover banner ---------- */
  const coverInputRef = useRef<HTMLInputElement>(null);
  const pickCover = () => coverInputRef.current?.click();
  const handleCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file || !file.type.startsWith('image/')) return;
    try {
      updateDocument(doc.id, { cover: await downscaleCover(file) });
    } catch {
      /* undecodable or oversized image — keep the current cover */
    }
  };
  const removeCover = () => updateDocument(doc.id, { cover: null });

  const updatedAt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(doc.updatedAt);

  const wordCount = useMemo(() => countWords(doc.content), [doc.content]);

  return (
    <div
      ref={rootRef}
      className="h-full w-full bg-app flex flex-col overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDropRef}
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar" onClick={handlePageClick}>
        {!embedded && doc.cover && (
          <div className="group/cover relative h-52 w-full select-none">
            <img src={doc.cover} alt="Capa da nota" draggable={false} className="h-full w-full object-cover" />
            <div className="absolute bottom-3 right-4 flex gap-1.5 opacity-0 transition-opacity group-hover/cover:opacity-100 group-focus-within/cover:opacity-100">
              <button
                type="button"
                onClick={pickCover}
                className="rounded-md border border-line bg-app/80 px-2 py-1 text-[12px] text-ink-1 backdrop-blur hover:bg-hover"
              >
                Trocar capa
              </button>
              <button
                type="button"
                onClick={removeCover}
                className="rounded-md border border-line bg-app/80 px-2 py-1 text-[12px] text-ink-1 backdrop-blur hover:bg-hover"
              >
                Remover
              </button>
            </div>
          </div>
        )}
        <div
          className={
            embedded
              ? 'w-full px-1 pt-1'
              : `w-full max-w-[724px] mx-auto pl-[54px] pr-4 ${doc.cover ? 'pt-6' : 'pt-14'}`
          }
        >
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
            <div className="group/header relative">
              {!doc.cover && (
                <button
                  type="button"
                  onClick={pickCover}
                  className="absolute -top-8 left-[44px] flex items-center gap-1.5 rounded px-2 py-1 text-[13px] text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink-2 group-hover/header:opacity-100 group-focus-within/header:opacity-100"
                >
                  <ImagePlus size={15} strokeWidth={1.75} />
                  Adicionar capa
                </button>
              )}
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
              <div className="mt-2 flex items-center gap-1.5 flex-wrap select-none">
                <Badge variant="arcane">
                  <Layers size={10} /> {DOC_TYPE_LABEL[doc.type] ?? 'Documento'}
                </Badge>
                <Badge variant="neutral">
                  <FileText size={10} /> {wordCount} palavra{wordCount === 1 ? '' : 's'}
                </Badge>
                <Badge variant="neutral">
                  <Clock size={10} /> Editado {updatedAt}
                </Badge>
              </div>
              <div className="mt-3 mb-5 h-px bg-gradient-to-r from-cyan-500/25 via-cyan-500/10 to-transparent" />
            </div>
          )}
        </div>

        <BlockNoteView
          editor={editor}
          theme="dark"
          onChange={handleChange}
          formattingToolbar={false}
          slashMenu={false}
          className={embedded ? 'diegesis-bn embedded' : 'diegesis-bn'}
        >
          <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
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
                  ref={aiTriggerRef}
                  title="Perguntar à IA sobre a seleção"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => openAi((e.currentTarget as HTMLElement).getBoundingClientRect())}
                  className="bn-ak-button bn-ak-secondary bn-ask-ai"
                >
                  <Sparkles size={16} strokeWidth={1.75} />
                </button>
              </FormattingToolbar>
            )}
          />
        </BlockNoteView>
      </div>
      {aiOpen && <InlineAiPopover editor={editor} anchor={aiAnchor} onClose={() => setAiOpen(false)} />}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverFile}
      />
    </div>
  );
}
