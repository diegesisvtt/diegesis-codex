import React, { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { DocNode } from '@shared/types';
import type { TimelineLineage } from '@shared/timeline';
import { generateId } from './model';

/**
 * Painel de linhagens: árvore genealógica (ou de sucessão/aprendizado)
 * entre documentos do realm + formulário para criar relações.
 */
export function LineageView({
  lineages,
  docs,
  excludeDocId,
  onAdd,
  onRemove,
  onOpenDoc,
  onClose,
}: {
  lineages: TimelineLineage[];
  docs: DocNode[];
  /** a própria timeline não pode participar de linhagens */
  excludeDocId?: string;
  onAdd(l: TimelineLineage): void;
  onRemove(id: string): void;
  onOpenDoc(id: string): void;
  onClose(): void;
}) {
  const [parentId, setParentId] = useState('');
  const [childId, setChildId] = useState('');
  const [relation, setRelation] = useState('filho de');

  const titleOf = (id: string) => docs.find((d) => d.id === id)?.title || 'Sem título';
  const candidates = docs.filter((d) => d.type !== 'core/folder' && d.id !== excludeDocId);

  const add = () => {
    if (!parentId || !childId || parentId === childId) return;
    const rel = relation.trim() || 'filho de';
    const dup = lineages.some((l) => l.parentDocId === parentId && l.childDocId === childId && l.relation === rel);
    if (dup) return;
    onAdd({ id: generateId(), parentDocId: parentId, childDocId: childId, relation: rel });
    setParentId('');
    setChildId('');
  };

  /** árvore: raízes = pais que não são filhos de ninguém */
  const tree = useMemo(() => {
    const childrenOf = new Map<string, TimelineLineage[]>();
    const childIds = new Set<string>();
    for (const l of lineages) {
      const list = childrenOf.get(l.parentDocId) ?? [];
      list.push(l);
      childrenOf.set(l.parentDocId, list);
      childIds.add(l.childDocId);
    }
    const roots = lineages
      .map((l) => l.parentDocId)
      .filter((id, i, arr) => !childIds.has(id) && arr.indexOf(id) === i);
    return { childrenOf, roots };
  }, [lineages]);

  const renderNode = (docId: string, depth: number, seen: Set<string>): React.ReactNode => {
    if (seen.has(docId) || depth > 16) return null; // ciclo
    const next = new Set(seen).add(docId);
    const children = tree.childrenOf.get(docId) ?? [];
    return (
      <div key={docId}>
        <button
          type="button"
          onClick={() => onOpenDoc(docId)}
          className="text-[12.5px] text-ink-1 hover:text-accent hover:underline truncate max-w-full text-left"
          style={{ paddingLeft: depth * 16 }}
        >
          {titleOf(docId)}
        </button>
        {children.map((l) => (
          <div key={l.id} className="group flex items-center">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-ink-3" style={{ paddingLeft: (depth + 1) * 16 }}>
                {l.relation}
              </div>
              {renderNode(l.childDocId, depth + 1, next)}
            </div>
            <button
              type="button"
              title="Remover relação"
              onClick={() => onRemove(l.id)}
              className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-danger shrink-0 px-1"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-72 shrink-0 border-l border-line bg-overlay/40 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line">
        <h3 className="text-[12.5px] font-semibold text-ink-1">Linhagens</h3>
        <button type="button" className="text-ink-3 hover:text-ink-1" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {lineages.length === 0 ? (
          <p className="text-[12px] text-ink-3">
            Nenhuma relação ainda. Vincule pais e filhos (ou mestres e aprendizes) para traçar linhagens.
          </p>
        ) : tree.roots.length > 0 ? (
          tree.roots.map((r) => renderNode(r, 0, new Set()))
        ) : (
          <p className="text-[12px] text-ink-3">Relações em ciclo — revise os vínculos.</p>
        )}
      </div>

      <div className="border-t border-line px-3 py-2 flex flex-col gap-1.5">
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="bg-overlay border border-line rounded px-2 py-1.5 text-[12px] text-ink-1 outline-none focus:border-accent">
          <option value="">Ascendente…</option>
          {candidates.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title || 'Sem título'}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder="relação (ex.: filho de)"
          className="bg-overlay border border-line rounded px-2 py-1.5 text-[12px] text-ink-1 outline-none focus:border-accent placeholder:text-ink-3"
        />
        <select value={childId} onChange={(e) => setChildId(e.target.value)} className="bg-overlay border border-line rounded px-2 py-1.5 text-[12px] text-ink-1 outline-none focus:border-accent">
          <option value="">Descendente…</option>
          {candidates.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title || 'Sem título'}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={!parentId || !childId || parentId === childId}
          className="flex items-center justify-center gap-1 px-2 py-1.5 text-[12px] rounded bg-active text-ink-1 hover:bg-hover disabled:opacity-40"
        >
          <Plus size={12} /> Adicionar relação
        </button>
      </div>
    </div>
  );
}
