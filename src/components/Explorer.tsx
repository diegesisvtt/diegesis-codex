import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tree, TreeApi, NodeApi, NodeRendererProps } from 'react-arborist';
import {
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  Trash2,
  Plus,
  PenLine,
  BookOpen,
  FileUp,
  MapPin,
  Bookmark,
  Star,
} from 'lucide-react';
import type { DocNode, DocumentType } from '@shared/types';
import { REF_DRAG_MIME } from '@shared/dragDrop';
import { useStore } from '../state/store';
import { useDocTypes, useMenuItems } from '../plugins/manager';
import type { DocTypeContribution } from '../plugins/api/docTypes';
import type { ExplorerMenuContext } from '../plugins/api/menus';
import { ContextMenu, type CtxMenuEntry } from './ContextMenu';
import { buildTree, TreeData } from './treeData';
import { buildPdfTreeInfo, parseBookmarkVirtualId, renameBookmarkLabel, removeBookmark, type PdfTreeInfo } from './pdfTree';
import { pinIcon } from './editors/pdf/rpg';

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
  const { docs, deleteDocument, updateDocument, openDocument, focusPdf } = useStore();
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

  const remove = () => {
    if (bookmark) {
      const pdfDoc = docs.find((d) => d.id === bookmark.pdfDocId);
      if (pdfDoc) updateDocument(pdfDoc.id, { content: removeBookmark(pdfDoc.content, bookmark.bookmarkId) });
      return;
    }
    deleteDocument(data.id);
  };

  const menuCtx: ExplorerMenuContext = bookmark
    ? { doc: null, bookmark: { pdfDocId: bookmark.pdfDocId, bookmarkId: bookmark.bookmarkId, label: data.name, page: bookmark.page } }
    : { doc: docs.find((d) => d.id === data.id) ?? null };

  const pluginEntries: CtxMenuEntry[] = menuItems
    .filter((item) => item.when?.(menuCtx) ?? true)
    .map((item) => ({ icon: item.icon, label: item.label, danger: item.danger, onClick: () => item.run(menuCtx) }));

  const menuEntries: CtxMenuEntry[] = [
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
          e.dataTransfer.setData('application/x-mythril-pin-note', `${pin.pdfDocId}:${data.id}`);
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
      className={`group flex items-center gap-1.5 pr-1.5 h-full cursor-pointer select-none text-[13px] rounded-md mx-1 transition-colors
        ${node.isSelected ? 'bg-active text-ink-1' : 'text-ink-2 hover:bg-hover hover:text-ink-1'}`}
    >
      {node.isInternal ? (
        <span className="text-ink-3 shrink-0 -ml-0.5">
          {node.isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
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
  onClose,
  onCreate,
}: {
  onClose(): void;
  onCreate(c: DocTypeContribution, name: string): void;
}) {
  const docTypes = useDocTypes();
  const [name, setName] = useState('');
  const [index, setIndex] = useState(0);
  const active = Math.min(index, docTypes.length - 1);

  const create = (c: DocTypeContribution) => {
    onCreate(c, name);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-40 w-56 bg-elevated border border-line rounded-lg shadow-2xl py-1 overflow-hidden animate-fade-up">
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
              i === active ? 'bg-hover text-ink-1' : 'text-ink-2'
            }`}
          >
            <c.icon size={14} strokeWidth={1.75} className={c.iconColor} />
            <span className="flex-1">{c.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function Explorer() {
  const { docs, createDocument, importPdf, updateDocument, moveDocument, deleteDocument, openDocument, focusPdf } = useStore();
  const treeRef = useRef<TreeApi<TreeData> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  const [importing, setImporting] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);

  const pdfInfo = useMemo(() => cachedPdfInfo(docs), [docs]);
  const data = useMemo(() => buildTree(docs, pdfInfo.bookmarksByPdf), [docs, pdfInfo]);

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

  const createFromContribution = async (c: DocTypeContribution, name: string) => {
    const parentId = selectedFolderId();
    const title = name.trim();
    const doc = await createDocument(c.docType as DocumentType, parentId, title || c.defaultTitle, c.defaultContent?.() ?? null);
    if (doc.type === 'core/folder') {
      // sem nome digitado, mantém o fluxo antigo de renomear inline
      if (!title) setTimeout(() => treeRef.current?.edit(doc.id), 60);
    } else {
      openDocument(doc.id);
    }
  };

  const importPdfHere = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await importPdf(selectedFolderId());
      if (result.error) window.alert(result.error);
      if (result.doc) openDocument(result.doc.id);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-sidebar">
      <div className="px-3 h-9 border-b border-line flex justify-between items-center shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">Explorer</span>
        <div className="flex gap-0.5">
          <div className="relative">
            <button
              onClick={() => setNewDocOpen((v) => !v)}
              title="Novo documento"
              className="text-ink-3 hover:text-ink-1 p-1 rounded-md hover:bg-hover transition-colors"
            >
              <Plus size={14} />
            </button>
            {newDocOpen && (
              <NewDocPopover onClose={() => setNewDocOpen(false)} onCreate={createFromContribution} />
            )}
          </div>
          <button
            onClick={importPdfHere}
            disabled={importing}
            title="Importar PDF"
            className="text-ink-3 hover:text-pdf p-1 rounded-md hover:bg-hover transition-colors disabled:opacity-50"
          >
            <FileUp size={14} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden py-1.5 mythril-tree">
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
            onDelete={({ ids }) =>
              ids.forEach((id) => {
                const bm = parseBookmarkVirtualId(id);
                if (bm) {
                  const pdfDoc = docs.find((d) => d.id === bm.pdfDocId);
                  if (pdfDoc) updateDocument(pdfDoc.id, { content: removeBookmark(pdfDoc.content, bm.bookmarkId) });
                  return;
                }
                deleteDocument(id);
              })
            }
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
    </div>
  );
}
