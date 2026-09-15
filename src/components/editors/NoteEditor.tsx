import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, Editor, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Link2,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  ImageIcon,
  Minus,
  Type,
  SquareCode,
  Plus,
  GripVertical,
  Copy,
  Trash2,
  Sparkles,
} from 'lucide-react';
import type { DocNode } from '@shared/types';
import { useStore } from '../../state/store';

/* ============================================================
   Turn-into definitions (shared by bubble menu + block menu)
   ============================================================ */

interface TurnIntoItem {
  id: string;
  name: string;
  keywords: string[];
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  isActive(editor: Editor): boolean;
  run(editor: Editor): void;
}

const TURN_INTO: TurnIntoItem[] = [
  {
    id: 'p', name: 'Texto', keywords: ['texto', 'text', 'paragrafo', 'paragraph', 't'],
    icon: Type,
    isActive: (e) => e.isActive('paragraph'),
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    id: 'h1', name: 'Título 1', keywords: ['titulo', 'h1', 'heading', 'title'],
    icon: Heading1,
    isActive: (e) => e.isActive('heading', { level: 1 }),
    run: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    id: 'h2', name: 'Título 2', keywords: ['titulo', 'h2', 'heading', 'subtitle'],
    icon: Heading2,
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: 'h3', name: 'Título 3', keywords: ['titulo', 'h3', 'heading'],
    icon: Heading3,
    isActive: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    id: 'todo', name: 'Checklist', keywords: ['todo', 'check', 'tarefa', 'task', 'checkbox', 'lista'],
    icon: CheckSquare,
    isActive: (e) => e.isActive('taskList'),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'bullet', name: 'Lista', keywords: ['lista', 'bullet', 'ul', 'marcadores'],
    icon: List,
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered', name: 'Lista numerada', keywords: ['lista', 'numerada', 'ordered', 'ol', 'numero'],
    icon: ListOrdered,
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'quote', name: 'Citação', keywords: ['citacao', 'quote', 'blockquote'],
    icon: Quote,
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'code', name: 'Código', keywords: ['codigo', 'code', 'pre'],
    icon: SquareCode,
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

/* ============================================================
   Slash menu
   ============================================================ */

interface SlashItem extends Omit<TurnIntoItem, 'isActive'> {
  desc: string;
  pickImage?: boolean;
}

const SLASH_EXTRA: SlashItem[] = [
  { id: 'hr', name: 'Divisor', desc: 'Linha horizontal de separação', keywords: ['divisor', 'linha', 'hr', 'divider', 'separador'], icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
  { id: 'image', name: 'Imagem', desc: 'Envie ou insira uma imagem', keywords: ['imagem', 'image', 'img', 'foto', 'picture'], icon: ImageIcon, pickImage: true, run: () => {} },
];

const SLASH_DESCS: Record<string, string> = {
  p: 'Comece a escrever texto simples',
  h1: 'Título grande de seção',
  h2: 'Título médio de seção',
  h3: 'Título pequeno de seção',
  todo: 'Acompanhe tarefas com caixas de seleção',
  bullet: 'Lista com marcadores',
  ordered: 'Lista ordenada com números',
  quote: 'Destaque uma citação ou nota',
  code: 'Bloco de código',
};

const SLASH_ITEMS: SlashItem[] = [
  ...TURN_INTO.map((t) => ({ ...t, desc: SLASH_DESCS[t.id] ?? '' })),
  ...SLASH_EXTRA,
];

interface SlashState {
  from: number;
  query: string;
  left: number;
  top: number;
}

function SlashMenu({
  editor,
  state,
  onClose,
  onPickImage,
}: {
  editor: Editor;
  state: SlashState;
  onClose(): void;
  onPickImage(): void;
}) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const q = state.query.toLowerCase();
  const items = SLASH_ITEMS.filter(
    (it) => it.name.toLowerCase().includes(q) || it.keywords.some((k) => k.includes(q))
  );

  useEffect(() => setIndex(0), [state.query]);

  const apply = useCallback(
    (item: SlashItem) => {
      editor
        .chain()
        .focus()
        .deleteRange({ from: state.from, to: editor.state.selection.from })
        .run();
      if (item.pickImage) onPickImage();
      else item.run(editor);
      onClose();
    },
    [editor, state.from, onClose, onPickImage]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (items.length === 0) {
        if (e.key === 'Escape') onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setIndex((i) => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        apply(items[Math.min(index, items.length - 1)]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [items, index, apply, onClose]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  return (
    <div
      className="fixed z-[90] w-72 bg-elevated border border-line rounded-lg shadow-2xl overflow-hidden animate-fade-up"
      style={{ left: state.left, top: state.top }}
    >
      <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        Blocos
      </div>
      <div ref={listRef} className="max-h-72 overflow-y-auto custom-scrollbar pb-1.5">
        {items.length === 0 ? (
          <div className="px-3 py-2.5 text-[13px] text-ink-3">Nenhum bloco encontrado.</div>
        ) : (
          items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                data-idx={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  apply(item);
                }}
                onMouseMove={() => setIndex(i)}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 text-left rounded-md mx-0.5 transition-colors ${
                  i === index ? 'bg-hover' : ''
                }`}
                style={{ width: 'calc(100% - 4px)' }}
              >
                <div className="w-9 h-9 rounded-md bg-sidebar border border-line flex items-center justify-center shrink-0">
                  <Icon size={16} strokeWidth={1.75} className="text-ink-2" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink-1">{item.name}</div>
                  <div className="text-[11px] text-ink-3 truncate">{item.desc}</div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Selection bubble menu (Notion-style)
   ============================================================ */

function BubbleIconButton({
  icon: Icon,
  active,
  title,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  active?: boolean;
  title: string;
  onClick(): void;
}) {
  return (
    <button
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`p-1.5 rounded-md transition-colors ${
        active ? 'text-accent-ink bg-accent-soft' : 'text-ink-2 hover:text-ink-1 hover:bg-hover'
      }`}
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  );
}

function SelectionBubble({ editor }: { editor: Editor }) {
  const { openPanel, setAiDraft } = useStore();
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const activeBlock = TURN_INTO.find((t) => t.isActive(editor));

  const askAI = () => {
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selected) return;
    setAiDraft(`Sobre este trecho das minhas notas:\n\n> ${selected}\n\n`);
    openPanel('ai-chat');
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
    } else {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, placement: 'top', offset: [0, 8] }}
      shouldShow={({ editor, state }) => {
        const { empty } = state.selection;
        if (empty) return false;
        if (editor.isActive('image') || editor.isActive('codeBlock')) return false;
        return true;
      }}
    >
      <div className="relative flex items-center gap-px bg-elevated border border-line rounded-lg shadow-2xl p-1">
        {/* Turn into */}
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            setTurnIntoOpen((v) => !v);
            setLinkOpen(false);
          }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] text-ink-1 hover:bg-hover transition-colors max-w-[110px]"
        >
          <span className="truncate">{activeBlock?.name ?? 'Texto'}</span>
          <ChevronDown size={12} className="text-ink-3 shrink-0" />
        </button>
        <div className="w-px h-4 bg-line-strong mx-1" />

        <BubbleIconButton icon={Bold} title="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <BubbleIconButton icon={Italic} title="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <BubbleIconButton icon={UnderlineIcon} title="Sublinhado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <BubbleIconButton icon={Strikethrough} title="Tachado" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <BubbleIconButton icon={Code} title="Código" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} />
        <BubbleIconButton
          icon={Link2}
          title="Link"
          active={editor.isActive('link')}
          onClick={() => {
            setLinkUrl(editor.getAttributes('link').href ?? '');
            setLinkOpen((v) => !v);
            setTurnIntoOpen(false);
          }}
        />
        <div className="w-px h-4 bg-line-strong mx-1" />
        <BubbleIconButton icon={Sparkles} title="Perguntar à IA sobre a seleção" onClick={askAI} />

        {/* Turn-into dropdown */}
        {turnIntoOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-52 bg-elevated border border-line rounded-lg shadow-2xl py-1 z-10 animate-fade-up">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
              Transformar em
            </div>
            {TURN_INTO.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    t.run(editor);
                    setTurnIntoOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink-1 transition-colors"
                >
                  <Icon size={14} strokeWidth={1.75} className="text-ink-3" />
                  {t.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Link editor */}
        {linkOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-72 bg-elevated border border-line rounded-lg shadow-2xl p-2 z-10 animate-fade-up">
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyLink();
                if (e.key === 'Escape') setLinkOpen(false);
              }}
              placeholder="Cole um link…"
              className="w-full bg-sidebar border border-line rounded-md px-2.5 py-1.5 text-[13px] text-ink-1 placeholder-ink-3 outline-none focus:border-accent transition-colors"
            />
          </div>
        )}
      </div>
    </BubbleMenu>
  );
}

/* ============================================================
   Block handles (+ / grip, block menu, drag & drop)
   ============================================================ */

interface BlockInfo {
  before: number; // posição do bloco no doc
  nodeSize: number;
  rect: DOMRect;
}

function BlockHandles({
  editor,
  block,
  onHide,
  onDragStateChange,
}: {
  editor: Editor;
  block: BlockInfo;
  onHide(): void;
  onDragStateChange(dragging: boolean): void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const selectBlock = () => {
    editor
      .chain()
      .focus()
      .setTextSelection({ from: block.before + 1, to: block.before + block.nodeSize - 1 })
      .run();
  };

  const insertBelow = () => {
    const pos = block.before + block.nodeSize;
    editor
      .chain()
      .insertContentAt(pos, { type: 'paragraph', content: [{ type: 'text', text: '/' }] })
      .setTextSelection(pos + 2)
      .run();
    onHide();
  };

  const duplicate = () => {
    const node = editor.state.doc.nodeAt(block.before);
    if (!node) return;
    editor.chain().focus().insertContentAt(block.before + node.nodeSize, node.toJSON()).run();
    setMenuOpen(false);
  };

  const remove = () => {
    editor.chain().focus().deleteRange({ from: block.before, to: block.before + block.nodeSize }).run();
    setMenuOpen(false);
    onHide();
  };

  return (
    <div
      className="fixed z-[80] flex items-center gap-0.5 select-none"
      style={{ top: block.rect.top + 2, left: block.rect.left - 52 }}
    >
      <button
        title="Inserir bloco abaixo"
        onClick={insertBelow}
        className="p-1 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors animate-fade-in"
      >
        <Plus size={16} strokeWidth={1.75} />
      </button>
      <div className="relative">
        <button
          title="Arrastar ou clicar para opções"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-mythril-block', String(block.before));
            e.dataTransfer.effectAllowed = 'move';
            onDragStateChange(true);
          }}
          onDragEnd={() => onDragStateChange(false)}
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors cursor-grab active:cursor-grabbing animate-fade-in"
        >
          <GripVertical size={16} strokeWidth={1.75} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[85]" onClick={() => setMenuOpen(false)} />
            <div className="absolute left-0 top-full mt-1 w-56 bg-elevated border border-line rounded-lg shadow-2xl py-1 z-[86] animate-fade-up">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                Transformar em
              </div>
              {TURN_INTO.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      selectBlock();
                      // aplica após a seleção ser registrada
                      requestAnimationFrame(() => t.run(editor));
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink-1 transition-colors"
                  >
                    <Icon size={14} strokeWidth={1.75} className="text-ink-3" />
                    {t.name}
                  </button>
                );
              })}
              <div className="border-t border-line my-1" />
              <button
                onClick={duplicate}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ink-2 hover:bg-hover hover:text-ink-1 transition-colors"
              >
                <Copy size={14} strokeWidth={1.75} className="text-ink-3" /> Duplicar
              </button>
              <button
                onClick={remove}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-danger hover:bg-danger-soft transition-colors"
              >
                <Trash2 size={14} strokeWidth={1.75} /> Excluir
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Editor (Notion-like)
   ============================================================ */

export function NoteEditor({ doc }: { doc: DocNode }) {
  const { updateDocument } = useStore();
  const [title, setTitle] = useState(doc.title);
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [hoverBlock, setHoverBlock] = useState<BlockInfo | null>(null);
  const [dropLine, setDropLine] = useState<{ top: number; left: number; width: number; pos: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const detectSlash = useCallback((editor: Editor) => {
    const { state } = editor;
    const { $from, empty } = state.selection;
    if (!empty || !$from.parent.isTextblock) {
      setSlash(null);
      return;
    }
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
    const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBefore);
    if (!match) {
      setSlash(null);
      return;
    }
    const slashTextStart = $from.pos - match[1].length - 1;
    const coords = editor.view.coordsAtPos(slashTextStart);
    setSlash({
      from: slashTextStart,
      query: match[1],
      left: Math.min(coords.left, window.innerWidth - 300),
      top: Math.min(coords.bottom + 6, window.innerHeight - 320),
    });
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        showOnlyCurrent: true,
        includeChildren: true,
        placeholder: ({ node }) =>
          node.type.name === 'heading' ? `Título ${node.attrs.level}` : "Escreva, ou '/' para comandos…",
      }),
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: doc.content ? JSON.parse(doc.content) : undefined,
    autofocus: false,
    onUpdate: ({ editor }) => {
      updateDocument(doc.id, { content: JSON.stringify(editor.getJSON()) });
      detectSlash(editor);
    },
    onSelectionUpdate: ({ editor }) => detectSlash(editor),
    onBlur: () => setTimeout(() => setSlash(null), 150),
    editorProps: {
      attributes: {
        class: 'tiptap w-full max-w-[724px] mx-auto px-4 pt-2 pb-[40vh]',
      },
    },
  });

  useEffect(() => {
    setTitle(doc.title);
  }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- hover block handles ---------- */
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!editor || draggingRef.current) return;
      const editorRect = editor.view.dom.getBoundingClientRect();
      if (e.clientY < editorRect.top || e.clientY > editorRect.bottom) {
        setHoverBlock(null);
        return;
      }
      const posInfo = editor.view.posAtCoords({
        left: Math.min(Math.max(e.clientX, editorRect.left + 8), editorRect.right - 8),
        top: e.clientY,
      });
      if (!posInfo) {
        setHoverBlock(null);
        return;
      }
      const $pos = editor.state.doc.resolve(posInfo.pos);
      if ($pos.depth < 1) {
        setHoverBlock(null);
        return;
      }
      const before = $pos.before(1);
      const node = editor.state.doc.nodeAt(before);
      const dom = editor.view.nodeDOM(before);
      if (!node || !(dom instanceof HTMLElement)) {
        setHoverBlock(null);
        return;
      }
      const rect = dom.getBoundingClientRect();
      setHoverBlock((prev) =>
        prev?.before === before ? prev : { before, nodeSize: node.nodeSize, rect }
      );
    },
    [editor]
  );

  /* ---------- drag & drop reorder ---------- */
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!editor || !e.dataTransfer.types.includes('application/x-mythril-block')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const editorRect = editor.view.dom.getBoundingClientRect();
      const posInfo = editor.view.posAtCoords({
        left: Math.min(Math.max(e.clientX, editorRect.left + 8), editorRect.right - 8),
        top: e.clientY,
      });
      if (!posInfo) return;
      const $pos = editor.state.doc.resolve(posInfo.pos);
      if ($pos.depth < 1) return;
      const before = $pos.before(1);
      const node = editor.state.doc.nodeAt(before);
      const dom = editor.view.nodeDOM(before);
      if (!node || !(dom instanceof HTMLElement)) return;
      const rect = dom.getBoundingClientRect();
      const lowerHalf = e.clientY > rect.top + rect.height / 2;
      const insertPos = lowerHalf ? before + node.nodeSize : before;
      const top = lowerHalf ? rect.bottom : rect.top;
      setDropLine({ top: top - 1, left: editorRect.left, width: editorRect.width, pos: insertPos });
    },
    [editor]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const data = e.dataTransfer.getData('application/x-mythril-block');
      setDropLine(null);
      if (!editor || !data) return;
      e.preventDefault();
      const from = parseInt(data, 10);
      const node = editor.state.doc.nodeAt(from);
      if (!node || !dropLine) return;
      const size = node.nodeSize;
      let insertPos = dropLine.pos;
      if (insertPos === from || insertPos === from + size) return; // soltou sobre si mesmo
      let tr = editor.state.tr.delete(from, from + size);
      if (from < insertPos) insertPos -= size;
      tr = tr.insert(insertPos, node);
      editor.view.dispatch(tr);
      editor.commands.focus();
    },
    [editor, dropLine]
  );

  /* ---------- click below content appends a paragraph ---------- */
  const handlePageClick = (e: React.MouseEvent) => {
    if (!editor) return;
    if (e.target !== e.currentTarget && e.target !== editor.view.dom) return;
    const last = editor.state.doc.lastChild;
    if (last?.type.name === 'paragraph' && last.content.size === 0) {
      editor.commands.focus('end');
    } else {
      editor.chain().insertContentAt(editor.state.doc.content.size, { type: 'paragraph' }).focus('end').run();
    }
  };

  const insertImage = (file: File) => {
    if (!editor) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);
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
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar"
        onScroll={() => setHoverBlock(null)}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverBlock(null)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={() => setDropLine(null)}
        onClick={handlePageClick}
      >
        <div className="w-full max-w-[724px] mx-auto px-4 pt-14">
          <input
            type="text"
            className="w-full bg-transparent text-[40px] leading-[1.2] font-bold text-ink-1 placeholder-ink-3 outline-none tracking-tight"
            placeholder="Nova página"
            value={title}
            onChange={handleTitleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                e.preventDefault();
                editor?.commands.focus('start');
              }
            }}
          />
          <div className="text-[12px] text-ink-3 mt-1 mb-6 select-none">Editado {updatedAt}</div>
        </div>
        <EditorContent editor={editor} />
      </div>

      {editor && <SelectionBubble editor={editor} />}

      {editor && hoverBlock && !slash && (
        <BlockHandles
          editor={editor}
          block={hoverBlock}
          onHide={() => setHoverBlock(null)}
          onDragStateChange={(d) => {
            draggingRef.current = d;
            if (d) setHoverBlock(null);
          }}
        />
      )}

      {dropLine && (
        <div
          className="fixed z-[85] h-[3px] rounded-full bg-accent pointer-events-none"
          style={{ top: dropLine.top, left: dropLine.left, width: dropLine.width }}
        />
      )}

      {editor && slash && (
        <SlashMenu
          editor={editor}
          state={slash}
          onClose={() => setSlash(null)}
          onPickImage={() => fileInputRef.current?.click()}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) insertImage(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
