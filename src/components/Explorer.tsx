import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tree, TreeApi, NodeApi, NodeRendererProps } from 'react-arborist';
import {
  LayoutGrid,
  ChevronRight,
  ChevronsDownUp,
  Trash2,
  Plus,
  PenLine,
  BookOpen,
  MapPin,
  Bookmark,
  Download,
  Star,
  Folder,
} from 'lucide-react';
import type { DocNode, DocumentType } from '@shared/types';
import { REF_DRAG_MIME } from '@shared/dragDrop';
import { useStore } from '../state/store';
import { useDocTypes, useMenuItems } from '../plugins/manager';
import type { DocTypeContribution } from '../plugins/api/docTypes';
import type { ExplorerMenuContext } from '../plugins/api/menus';
import { ContextMenu, type CtxMenuEntry } from './ContextMenu';
import { ConfirmDialog } from './ui';
import { buildTree, TreeData } from './treeData';
import { buildPdfTreeInfo, parseBookmarkVirtualId, renameBookmarkLabel, removeBookmark, type PdfTreeInfo } from './pdfTree';
import { pinIcon } from './editors/pdf/rpg';

/** A pending delete confirmation, requested by a row or the tree's Delete key. */
interface DeleteRequest {
  ids: string[];
  /** display name of the single targeted item ('N itens' cases use the count) */
  label?: string;
}

const DeleteConfirmContext = createContext<(req: DeleteRequest) => void>(() => {});

/** Creation actions offered by the folder and background context menus. */
interface ExplorerActions {
  /** opens the "new document" popover targeting `parentId` at the given cursor */
  newDocAt(parentId: string | null, x: number, y: number): void;
  /** creates a folder inside `parentId` and starts inline rename */
  newFolderAt(parentId: string | null): void;
}

const ExplorerActionsContext = createContext<ExplorerActions | null>(null);

// buildPdfTreeInfo parses every PDF's content JSON; cache per docs-array
// reference so each row render doesn't redo the work.
const pdfInfoCache = new WeakMap<DocNode[], PdfTreeInfo>();
function cachedPdfInfo(docs: DocNode[]): PdfTreeInfo {
  let info = pdfInfoCache.get(docs);
  if (!info) {
    info = buildPdfTreeInfo(docs);
    pdfInfoCache.set(docs, info);
  }
  return info;
}

function Node({ node, style, dragHandle }: NodeRendererProps<TreeData>) {
  const { docs, openDocument, focusPdf, exportDocument } = useStore();
  const requestDelete = useContext(DeleteConfirmContext);
  const explorerActions = useContext(ExplorerActionsContext);
  const docTypes = useDocTypes();
  const menuItems = useMenuItems('explorer:item');
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const data = node.data;
  const bookmark = data.bookmark;
  const pin = !bookmark ? cachedPdfInfo(docs).pinNotes.get(data.id) : undefined;
  // Notion-style page icon set in the note editor (pins keep the pin icon/color)
  const docIcon = !bookmark && !pin ? docs.find((d) => d.id === data.id)?.icon : undefined;
  // PDFs are imported rather than created, so they have no docType contribution
  const contribution = docTypes.find((d) => d.docType === data.docType);

  // deletions are confirmed by a modal owned by <Explorer> (rendered outside
  // the transformed tree rows)
  const remove = () => requestDelete({ ids: [data.id], label: data.name });
  const onExport = async () => {
    const res = await exportDocument(data.id);
    if (!res.ok && !res.canceled) window.alert(res.error ?? 'Falha ao exportar o documento.');
  };
  const canExport = !bookmark && data.docType !== 'core/folder';

  const menuCtx: ExplorerMenuContext = bookmark
    ? { doc: null, bookmark: { pdfDocId: bookmark.pdfDocId, bookmarkId: bookmark.bookmarkId, label: data.name, page: bookmark.page } }
    : { doc: docs.find((d) => d.id === data.id) ?? null };

  const pluginEntries: CtxMenuEntry[] = menuItems
    .filter((item) => item.when?.(menuCtx) ?? true)
    .map((item) => ({ icon: item.icon, label: item.label, danger: item.danger, onClick: () => item.run(menuCtx) }));

  const menuEntries: CtxMenuEntry[] =
    data.docType === 'core/folder'
      ? [
          { icon: Plus, label: 'Novo documento', onClick: () => explorerActions?.newDocAt(data.id, menuPos!.x, menuPos!.y) },
          { icon: Folder, label: 'Nova pasta', onClick: () => explorerActions?.newFolderAt(data.id) },
          'divider',
          { icon: ChevronsDownUp, label: node.isOpen ? 'Recolher' : 'Expandir', onClick: () => (node.isOpen ? node.close() : node.open()) },
          'divider',
          { icon: PenLine, label: 'Renomear', onClick: () => node.edit() },
          { icon: Trash2, label: 'Excluir', danger: true, onClick: remove },
          ...(pluginEntries.length > 0 ? (['divider', ...pluginEntries] as CtxMenuEntry[]) : []),
        ]
      : [
          { icon: Download, label: 'Exportar', disabled: !canExport, onClick: onExport },
          { icon: PenLine, label: 'Renomear', onClick: () => node.edit() },
          { icon: Trash2, label: 'Excluir', danger: true, onClick: remove },
          ...(pluginEntries.length > 0 ? (['divider', ...pluginEntries] as CtxMenuEntry[]) : []),
        ];

  const Icon = bookmark
    ? Bookmark
    : pin
      ? MapPin
      : docIcon
        ? pinIcon(docIcon)
        : data.docType === 'core/pdf'
          ? BookOpen
          : (contribution?.icon ?? LayoutGrid);
  const iconColor = data.docType === 'core/pdf' ? 'text-pdf' : (contribution?.iconColor ?? 'text-board');

  // pins and bookmarks open the PDF at their location, not an editor tab
  const openAtLocation = () => {
    if (bookmark) {
      openDocument(bookmark.pdfDocId);
      focusPdf({ docId: bookmark.pdfDocId, page: bookmark.page });
    } else if (pin) {
      openDocument(pin.pdfDocId);
      focusPdf({ docId: pin.pdfDocId, pinId: pin.pinId });
    }
  };

  return (
    <div
      style={style}
      ref={dragHandle}
      // pin notes can be dragged onto a PDF page to create a link token there.
      // capture phase: react-arborist stops propagation in its own native
      // dragstart handler, which would prevent a bubble-phase listener from
      // ever firing (the token never arrived at the PDF)
      onDragStartCapture={(e) => {
        // a generic ref payload lets whiteboards create linked cards for
        // notes, PDF pins and bookmarks (capture phase: react-dnd stops
        // propagation in its own native dragstart handler)
        if (pin) {
          e.dataTransfer.setData('application/x-diegesis-pin-note', `${pin.pdfDocId}:${data.id}`);
          e.dataTransfer.setData(
            REF_DRAG_MIME,
            JSON.stringify({ kind: 'pin', docId: data.id, pdfDocId: pin.pdfDocId, pinId: pin.pinId, color: pin.color })
          );
          // 'copyLink': whiteboards copy the card, the PDF links a token —
          // a plain 'copy' would invalidate the PDF's dropEffect='link'
          e.dataTransfer.effectAllowed = 'copyLink';
        } else if (bookmark) {
          e.dataTransfer.setData(
            REF_DRAG_MIME,
            JSON.stringify({
              kind: 'bookmark',
              pdfDocId: bookmark.pdfDocId,
              bookmarkId: bookmark.bookmarkId,
              label: data.name,
              page: bookmark.page,
              color: bookmark.color,
            })
          );
          e.dataTransfer.effectAllowed = 'copy';
        } else if (data.docType !== 'core/folder' && data.docType !== 'core/pdf') {
          // every real document (note, table, whiteboard, map, timeline…) is
          // draggable as a generic 'note' ref; targets resolve the doc type
          e.dataTransfer.setData(REF_DRAG_MIME, JSON.stringify({ kind: 'note', docId: data.id }));
          e.dataTransfer.effectAllowed = 'copy';
        }
      }}
      onClick={() => {
        if (bookmark || pin) {
          node.select();
          openAtLocation();
          return;
        }
        if (data.docType === 'core/folder' || data.docType === 'core/pdf') node.toggle();
        else node.select();
      }}
      onDoubleClick={() => {
        if (bookmark || pin) return; // single click already navigated
        if (data.docType !== 'core/folder') openDocument(data.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        node.select();
        setMenuPos({ x: e.clientX, y: e.clientY });
      }}
      className={`group flex items-center gap-1.5 pr-1.5 h-full cursor-pointer select-none text-[13px] rounded-md mx-1 border-l-2 transition-colors
        ${node.isSelected ? 'border-l-cyan-400 bg-cyan-500/10 text-ink-1' : 'border-l-transparent text-ink-2 hover:bg-hover hover:text-ink-1'}`}
    >
      {node.isInternal ? (
        <span
          className="text-ink-3 shrink-0 -ml-0.5 transition-transform duration-150 ease-out"
          style={{ transform: node.isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <ChevronRight size={13} />
        </span>
      ) : (
        <span className="w-[13px] shrink-0" />
      )}
      {bookmark || pin ? (
        <span className="relative shrink-0 flex items-center">
          <Icon size={15} strokeWidth={1.75} style={{ color: (bookmark ?? pin)!.color }} />
          {bookmark?.favorite && <Star size={7} className="absolute -top-1 -right-1 text-yellow-400 fill-current" />}
        </span>
      ) : (
        <Icon size={15} strokeWidth={1.75} className={`${iconColor} shrink-0`} />
      )}
      {node.isEditing ? (
        <input
          type="text"
          defaultValue={data.name}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => node.reset()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') node.submit(e.currentTarget.value);
            if (e.key === 'Escape') node.reset();
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-overlay text-ink-1 text-[13px] rounded px-1.5 py-0.5 outline-none border border-accent min-w-0"
        />
      ) : (
        <span className="truncate flex-1">
          {data.name}
          {bookmark && <span className="ml-1.5 text-[10px] text-ink-3">p.{bookmark.page}</span>}
        </span>
      )}
      <span className="opacity-0 group-hover:opacity-100 flex items-center shrink-0 transition-opacity">
        <button
          title="Renomear"
          onClick={(e) => {
            e.stopPropagation();
            node.edit();
          }}
          className="p-1 text-ink-3 hover:text-ink-1 hover:bg-active rounded"
        >
          <PenLine size={12} />
        </button>
        <button
          title="Excluir"
          onClick={(e) => {
            e.stopPropagation();
            remove();
          }}
          className="p-1 text-ink-3 hover:text-danger hover:bg-active rounded"
        >
          <Trash2 size={12} />
        </button>
      </span>
      {menuPos &&
        // portal: as linhas da árvore usam transform, o que quebraria o
        // position:fixed do menu (ficaria relativo à linha)
        createPortal(
          <ContextMenu x={menuPos.x} y={menuPos.y} entries={menuEntries} onClose={() => setMenuPos(null)} />,
          document.body
        )}
    </div>
  );
}

/** Popover de criação: escolhe o tipo (vindo do registro de docTypes) e digita o nome. */
function NewDocPopover({
  x,
  y,
  alignRight,
  onClose,
  onCreate,
}: {
  x: number;
  y: number;
  /** when true, the popover is anchored to `x` as its right edge (header +) */
  alignRight?: boolean;
  onClose(): void;
  onCreate(c: DocTypeContribution, name: string): void;
}) {
  const docTypes = useDocTypes();
  const [name, setName] = useState('');
  const [index, setIndex] = useState(0);
  const active = Math.min(index, docTypes.length - 1);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // clamp inside the viewport (and right-align against `x` when requested)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(alignRight ? x - rect.width : x, window.innerWidth - rect.width - 8)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y, alignRight]);

  const create = (c: DocTypeContribution) => {
    onCreate(c, name);
    onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        ref={ref}
        className="fixed z-40 w-56 bg-card backdrop-blur-md border border-cyan-500/15 rounded-lg shadow-2xl py-1 overflow-hidden animate-fade-up"
        style={{ left: pos.x, top: pos.y }}
      >
        <div className="px-2 pt-1 pb-1.5">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do documento"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, docTypes.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === 'Enter' && docTypes[active]) create(docTypes[active]);
            }}
            className="w-full bg-overlay text-ink-1 text-[13px] rounded px-2 py-1.5 outline-none border border-line focus:border-accent placeholder:text-ink-3"
          />
        </div>
        <div className="h-px bg-line mx-2 mb-1" />
        {docTypes.map((c, i) => (
          <button
            key={c.docType}
            onClick={() => create(c)}
            onMouseEnter={() => setIndex(i)}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left transition-colors ${
              i === active ? 'bg-cyan-500/10 text-ink-1' : 'text-ink-2'
            }`}
          >
            <c.icon size={14} strokeWidth={1.75} className={c.iconColor} />
            <span className="flex-1">{c.label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}

export function Explorer() {
  const { docs, createDocument, importPdf, updateDocument, moveDocument, deleteDocument, openDocument, focusPdf } = useStore();
  const treeRef = useRef<TreeApi<TreeData> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const newDocBtnRef = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(400);
  const [importing, setImporting] = useState(false);
  const [newDocTarget, setNewDocTarget] = useState<{ parentId: string | null; x: number; y: number; alignRight?: boolean } | null>(null);
  const [backgroundMenu, setBackgroundMenu] = useState<{ x: number; y: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteRequest | null>(null);
  const bgMenuItems = useMenuItems('explorer:background');

  const pdfInfo = useMemo(() => cachedPdfInfo(docs), [docs]);
  const data = useMemo(() => buildTree(docs, pdfInfo.bookmarksByPdf), [docs, pdfInfo]);

  const requestDelete = useCallback((req: DeleteRequest) => setPendingDelete(req), []);

  // Bookmarks are virtual rows stored inside their PDF's content; real docs
  // delete their subtree.
  const performDelete = useCallback(
    (ids: string[]) => {
      ids.forEach((id) => {
        const bm = parseBookmarkVirtualId(id);
        if (bm) {
          const pdfDoc = docs.find((d) => d.id === bm.pdfDocId);
          if (pdfDoc) updateDocument(pdfDoc.id, { content: removeBookmark(pdfDoc.content, bm.bookmarkId) });
          return;
        }
        deleteDocument(id);
      });
    },
    [docs, updateDocument, deleteDocument]
  );

  const deleteCount = pendingDelete?.ids.length ?? 0;
  const deletingFolder = pendingDelete?.ids.some((id) => docs.find((d) => d.id === id)?.type === 'core/folder') ?? false;

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const selectedFolderId = (): string | null => {
    const tree = treeRef.current;
    if (!tree) return null;
    const selected: NodeApi<TreeData>[] = tree.selectedNodes;
    const first = selected[0];
    if (!first) return null;
    if (first.data.docType === 'core/folder') return first.data.id;
    const doc = docs.find((d) => d.id === first.data.id);
    return doc?.parentId ?? null;
  };

  const importPdfAt = useCallback(
    async (parentId: string | null) => {
      if (importing) return;
      setImporting(true);
      try {
        const result = await importPdf(parentId);
        if (result.error) window.alert(result.error);
        if (result.doc) openDocument(result.doc.id);
      } finally {
        setImporting(false);
      }
    },
    [importing, importPdf, openDocument]
  );

  const createFromContribution = async (c: DocTypeContribution, name: string, parentId: string | null) => {
    // 'import' types (PDF) come from a native file picker, not createDocument;
    // the typed name is ignored (the title comes from the file name)
    if (c.kind === 'import') {
      await importPdfAt(parentId);
      return;
    }
    const title = name.trim();
    const doc = await createDocument(c.docType as DocumentType, parentId, title || c.defaultTitle, c.defaultContent?.() ?? null);
    if (doc.type === 'core/folder') {
      // sem nome digitado, mantém o fluxo antigo de renomear inline
      if (!title) setTimeout(() => treeRef.current?.edit(doc.id), 60);
    } else {
      openDocument(doc.id);
    }
  };

  const createFolderHere = useCallback(
    async (parentId: string | null) => {
      const doc = await createDocument('core/folder', parentId, 'Nova Pasta', null);
      setTimeout(() => treeRef.current?.edit(doc.id), 60);
    },
    [createDocument]
  );

  const newDocAt = useCallback((parentId: string | null, x: number, y: number) => setNewDocTarget({ parentId, x, y }), []);
  const newFolderAt = useCallback((parentId: string | null) => void createFolderHere(parentId), [createFolderHere]);
  const explorerActions = useMemo<ExplorerActions>(() => ({ newDocAt, newFolderAt }), [newDocAt, newFolderAt]);

  const openHeaderPopover = () => {
    if (newDocTarget) {
      setNewDocTarget(null);
      return;
    }
    const r = newDocBtnRef.current?.getBoundingClientRect();
    setNewDocTarget({ parentId: selectedFolderId(), x: r?.right ?? 0, y: (r?.bottom ?? 0) + 4, alignRight: true });
  };

  const bgPluginEntries: CtxMenuEntry[] = bgMenuItems
    .filter((item) => item.when?.({ doc: null }) ?? true)
    .map((item) => ({ icon: item.icon, label: item.label, danger: item.danger, onClick: () => item.run({ doc: null }) }));

  const backgroundEntries: CtxMenuEntry[] = [
    { icon: Plus, label: 'Novo documento', onClick: () => newDocAt(null, backgroundMenu!.x, backgroundMenu!.y) },
    { icon: Folder, label: 'Nova pasta', onClick: () => newFolderAt(null) },
    ...(bgPluginEntries.length > 0 ? (['divider', ...bgPluginEntries] as CtxMenuEntry[]) : []),
  ];

  return (
    <DeleteConfirmContext.Provider value={requestDelete}>
    <ExplorerActionsContext.Provider value={explorerActions}>
    <div className="h-full w-full flex flex-col bg-sidebar">
      <div className="px-3 h-9 border-b border-line flex justify-between items-center shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 shadow-[0_0_6px_rgba(56,189,248,0.6)]" />
          Explorer
        </span>
        <div className="flex gap-0.5">
          <button
            ref={newDocBtnRef}
            onClick={openHeaderPopover}
            title="Novo documento"
            className="text-ink-3 hover:text-ink-1 p-1 rounded-md hover:bg-hover transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden py-1.5 diegesis-tree"
        // rows stop propagation, so this only fires for the empty area
        onContextMenu={(e) => {
          e.preventDefault();
          setBackgroundMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {data.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-ink-3 leading-relaxed">
            Nada por aqui ainda.
            <br />
            Use o botão + acima para criar seu primeiro documento.
          </div>
        ) : (
          <Tree<TreeData>
            ref={treeRef}
            data={data}
            width="100%"
            height={height}
            rowHeight={28}
            indent={15}
            paddingTop={2}
            openByDefault={true}
            onActivate={(node) => {
              const bm = node.data.bookmark;
              if (bm) {
                openDocument(bm.pdfDocId);
                focusPdf({ docId: bm.pdfDocId, page: bm.page });
                return;
              }
              const pin = pdfInfo.pinNotes.get(node.data.id);
              if (pin) {
                openDocument(pin.pdfDocId);
                focusPdf({ docId: pin.pdfDocId, pinId: pin.pinId });
                return;
              }
              if (node.data.docType !== 'core/folder') openDocument(node.data.id);
            }}
            disableDrag={false}
            onRename={({ id, name }) => {
              const bm = parseBookmarkVirtualId(id);
              if (bm) {
                const pdfDoc = docs.find((d) => d.id === bm.pdfDocId);
                if (pdfDoc && name.trim())
                  updateDocument(pdfDoc.id, { content: renameBookmarkLabel(pdfDoc.content, bm.bookmarkId, name.trim()) });
                return;
              }
              updateDocument(id, { title: name });
            }}
            onDelete={({ ids }) => requestDelete({ ids })}
            onMove={({ dragIds, parentId, index }) => {
              // virtual bookmark nodes can't be dragged, and nothing can be
              // dropped "inside" one (it has no real children)
              const realIds = dragIds.filter((id) => !id.startsWith('bm:'));
              if (realIds.length === 0) return;
              const target = parentId && parentId.startsWith('bm:') ? null : parentId;
              realIds.forEach((id, i) => moveDocument(id, target, index + i));
              // Garante que o destino fique visível após o drop
              if (target) setTimeout(() => treeRef.current?.open(target), 80);
            }}
          >
            {Node}
          </Tree>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={deleteCount > 1 ? 'Excluir itens' : 'Excluir documento'}
        message={
          <>
            <p>
              {deleteCount > 1
                ? `Excluir ${deleteCount} itens? Esta ação não pode ser desfeita.`
                : `Excluir "${pendingDelete?.label ?? 'este item'}"? Esta ação não pode ser desfeita.`}
            </p>
            {deletingFolder && <p className="mt-1 text-ink-3">Os itens dentro da pasta também serão excluídos.</p>}
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => pendingDelete && performDelete(pendingDelete.ids)}
        onClose={() => setPendingDelete(null)}
      />
      {newDocTarget && (
        <NewDocPopover
          x={newDocTarget.x}
          y={newDocTarget.y}
          alignRight={newDocTarget.alignRight}
          onClose={() => setNewDocTarget(null)}
          onCreate={(c, name) => createFromContribution(c, name, newDocTarget.parentId)}
        />
      )}
      {backgroundMenu &&
        createPortal(
          <ContextMenu x={backgroundMenu.x} y={backgroundMenu.y} entries={backgroundEntries} onClose={() => setBackgroundMenu(null)} />,
          document.body
        )}
    </div>
    </ExplorerActionsContext.Provider>
    </DeleteConfirmContext.Provider>
  );
}
