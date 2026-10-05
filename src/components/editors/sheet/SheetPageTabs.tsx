// Abas/páginas da ficha — componente específico do domínio de fichas
// (separado do `ui/Tabs` genérico do app). Parte visual da própria ficha:
// Cinzel small-caps sobre um filete gradiente; aba ativa com sublinhado
// dourado brilhante. Abas fixas (Geral/Efeitos) não podem ser removidas,
// renomeadas nem arrastadas; as demais, em modo edição, ganham "×",
// duplo clique (renomear) e drag para reordenar.
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { SheetTab } from '@shared/sheetLayout';

export function SheetPageTabs({
  tabs,
  activeId,
  onSelect,
  editing,
  onAdd,
  onRename,
  onRemove,
  onReorder,
  fixedIds,
}: {
  tabs: SheetTab[];
  activeId: string;
  onSelect: (id: string) => void;
  editing: boolean;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  /** reordena: insere a aba `fromId` imediatamente antes de `toId` */
  onReorder: (fromId: string, toId: string) => void;
  /** abas de sistema (sempre presentes): sem remoção/renomeação/drag */
  fixedIds?: ReadonlySet<string>;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  const commitRename = () => {
    if (renamingId && draft.trim()) onRename(renamingId, draft.trim());
    setRenamingId(null);
  };

  return (
    <div className="relative flex items-end justify-center gap-1 select-none">
      {/* filete gradiente que ancora as abas à ficha */}
      <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-sheet/25 to-transparent" aria-hidden />

      {tabs.map((t) => {
        const fixed = fixedIds?.has(t.id) ?? false;
        const active = t.id === activeId;

        if (renamingId === t.id) {
          return (
            <input
              key={t.id}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              spellCheck={false}
              className="bg-transparent font-display text-[11.5px] uppercase tracking-[0.18em] text-ink-1 outline-none border-b border-sheet/60 px-2 py-1.5 mx-1 text-center w-28"
            />
          );
        }

        return (
          <div
            key={t.id}
            className={`group relative ${dragId === t.id ? 'opacity-40' : ''}`}
            draggable={editing && !fixed && renamingId === null}
            onDragStart={(e) => {
              setDragId(t.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', t.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropId(null);
            }}
            onDragOver={(e) => {
              if (!editing || !dragId || dragId === t.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropId(t.id);
            }}
            onDragLeave={() => {
              if (dropId === t.id) setDropId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dragId !== t.id) onReorder(dragId, t.id);
              setDragId(null);
              setDropId(null);
            }}
          >
            {/* indicador de inserção (drop) */}
            {dropId === t.id && dragId && (
              <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-sheet shadow-[0_0_8px_rgba(212,175,55,0.7)]" aria-hidden />
            )}
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              onDoubleClick={
                editing && !fixed
                  ? () => {
                      setRenamingId(t.id);
                      setDraft(t.title);
                    }
                  : undefined
              }
              title={editing && !fixed ? 'Arraste para reordenar · duplo clique para renomear' : undefined}
              className={`relative flex items-center gap-1.5 px-4 py-2 font-display text-[11.5px] uppercase tracking-[0.18em] transition-all duration-150 ${
                editing && !fixed ? 'cursor-grab active:cursor-grabbing' : ''
              } ${active ? 'text-sheet-strong' : 'text-ink-3 hover:text-ink-1'}`}
            >
              {t.title}
              {active && (
                <span
                  className="absolute -bottom-px inset-x-3 h-[2px] rounded-full bg-gradient-to-r from-transparent via-sheet to-transparent shadow-[0_0_10px_rgba(212,175,55,0.55)]"
                  aria-hidden
                />
              )}
            </button>
            {editing && !fixed && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(t.id);
                }}
                title="Remover aba"
                className="absolute -right-1 top-1 hidden group-hover:block p-0.5 rounded text-ink-3 hover:text-danger"
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}

      {editing && (
        <button
          type="button"
          onClick={onAdd}
          title="Nova aba"
          className="px-2 py-2 text-ink-3 hover:text-sheet-strong transition-colors"
        >
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}
