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
} from 'lucide-react';
import { useStore } from '../state/store';
import { buildTree, TreeData } from './treeData';

function Node({ node, style, dragHandle }: NodeRendererProps<TreeData>) {
  const { deleteDocument, openDocument } = useStore();
  const data = node.data;

  const Icon =
    data.docType === 'core/folder' ? Folder : data.docType === 'core/note' ? File : LayoutGrid;
  const iconColor =
    data.docType === 'core/folder'
      ? 'text-ink-3'
      : data.docType === 'core/note'
        ? 'text-note'
        : 'text-board';

  return (
    <div
      style={style}
      ref={dragHandle}
      onClick={() => (data.docType === 'core/folder' ? node.toggle() : node.select())}
      onDoubleClick={() => {
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
      <Icon size={15} strokeWidth={1.75} className={`${iconColor} shrink-0`} />
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
        <span className="truncate flex-1">{data.name}</span>
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
  const { docs, createDocument, updateDocument, moveDocument, deleteDocument, openDocument } = useStore();
  const treeRef = useRef<TreeApi<TreeData> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);

  const data = useMemo(() => buildTree(docs), [docs]);

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
              if (node.data.docType !== 'core/folder') openDocument(node.data.id);
            }}
            onRename={({ id, name }) => updateDocument(id, { title: name })}
            onDelete={({ ids }) => ids.forEach((id) => deleteDocument(id))}
            onMove={({ dragIds, parentId, index }) => {
              dragIds.forEach((id, i) => moveDocument(id, parentId, index + i));
              // Garante que o destino fique visível após o drop
              if (parentId) setTimeout(() => treeRef.current?.open(parentId), 80);
            }}
          >
            {Node}
          </Tree>
        )}
      </div>
    </div>
  );
}
