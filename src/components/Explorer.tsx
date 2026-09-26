import { useEffect, useMemo, useRef, useState } from 'react';
import { Tree, TreeApi, NodeApi, NodeRendererProps } from 'react-arborist';
import {
  File,
  Folder,
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  Trash2,
  FilePlus2,
  FolderPlus,
  PenLine,
  BookOpen,
  FileUp,
  MapPin,
  Bookmark,
  Star,
} from 'lucide-react';
import type { DocNode } from '@shared/types';
import { REF_DRAG_MIME } from '@shared/dragDrop';
import { useStore } from '../state/store';
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
  const data = node.data;
  const bookmark = data.bookmark;
  const pin = !bookmark ? cachedPdfInfo(docs).pinNotes.get(data.id) : undefined;
  // Notion-style page icon set in the note editor (pins keep the pin icon/color)
  const docIcon = !bookmark && !pin ? docs.find((d) => d.id === data.id)?.icon : undefined;

  const Icon = bookmark
    ? Bookmark
    : pin
      ? MapPin
      : docIcon
        ? pinIcon(docIcon)
        : data.docType === 'core/folder'
          ? Folder
          : data.docType === 'core/note'
            ? File
            : data.docType === 'core/pdf'
              ? BookOpen
              : LayoutGrid;
  const iconColor =
    data.docType === 'core/folder'
      ? 'text-ink-3'
      : data.docType === 'core/note'
        ? 'text-note'
        : data.docType === 'core/pdf'
          ? 'text-pdf'
          : 'text-board';

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
          e.dataTransfer.effectAllowed = 'copy';
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
        } else if (data.docType === 'core/note') {
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
            if (bookmark) {
              const pdfDoc = docs.find((d) => d.id === bookmark.pdfDocId);
              if (pdfDoc) updateDocument(pdfDoc.id, { content: removeBookmark(pdfDoc.content, bookmark.bookmarkId) });
              return;
            }
            deleteDocument(data.id);
          }}
          className="p-1 text-ink-3 hover:text-danger hover:bg-active rounded"
        >
          <Trash2 size={12} />
        </button>
      </span>
    </div>
  );
}

export function Explorer() {
  const { docs, createDocument, importPdf, updateDocument, moveDocument, deleteDocument, openDocument, focusPdf } = useStore();
  const treeRef = useRef<TreeApi<TreeData> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  const [importing, setImporting] = useState(false);

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

  const createAndEdit = async (type: TreeData['docType']) => {
    const parentId = selectedFolderId();
    const doc = await createDocument(type, parentId);
    if (type === 'core/folder') {
      setTimeout(() => treeRef.current?.edit(doc.id), 60);
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
          <button
            onClick={() => createAndEdit('core/note')}
            title="Nova nota"
            className="text-ink-3 hover:text-note p-1 rounded-md hover:bg-hover transition-colors"
          >
            <FilePlus2 size={14} />
          </button>
          <button
            onClick={() => createAndEdit('core/whiteboard')}
            title="Novo quadro"
            className="text-ink-3 hover:text-board p-1 rounded-md hover:bg-hover transition-colors"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={importPdfHere}
            disabled={importing}
            title="Importar PDF"
            className="text-ink-3 hover:text-pdf p-1 rounded-md hover:bg-hover transition-colors disabled:opacity-50"
          >
            <FileUp size={14} />
          </button>
          <button
            onClick={() => createAndEdit('core/folder')}
            title="Nova pasta"
            className="text-ink-3 hover:text-ink-1 p-1 rounded-md hover:bg-hover transition-colors"
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden py-1.5 mythril-tree">
        {data.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-ink-3 leading-relaxed">
            Nada por aqui ainda.
            <br />
            Crie uma nota, um quadro ou uma pasta com os botões acima.
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
