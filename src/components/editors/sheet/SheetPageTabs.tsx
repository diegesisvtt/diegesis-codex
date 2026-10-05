// Abas/páginas da ficha — componente específico do domínio de fichas
// (separado do `ui/Tabs` genérico do app). Seleção por clique; em modo edição
// adiciona "+" e "×" (remover) e renomeia por duplo clique.
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
}: {
  tabs: SheetTab[];
  activeId: string;
  onSelect: (id: string) => void;
  editing: boolean;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (!editing && tabs.length <= 1) return null;

  const commitRename = () => {
    if (renamingId && draft.trim()) onRename(renamingId, draft.trim());
    setRenamingId(null);
  };

  return (
    <div className="flex items-center gap-0.5 border-b border-line shrink-0">
      {tabs.map((t) =>
        renamingId === t.id ? (
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
            className="bg-transparent text-[12px] text-ink-1 outline-none border border-sheet/50 rounded px-1.5 py-0.5 mx-1 my-1"
          />
        ) : (
          <div key={t.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              onDoubleClick={editing ? () => {
                setRenamingId(t.id);
                setDraft(t.title);
              } : undefined}
              title={editing ? 'Duplo clique para renomear' : undefined}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[12px] transition-colors border-b-2 -mb-px ${
                t.id === activeId ? 'border-sheet text-ink-1 font-medium' : 'border-transparent text-ink-3 hover:text-ink-1'
              }`}
            >
              {t.title}
            </button>
            {editing && tabs.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(t.id);
                }}
                title="Remover aba"
                className="absolute -right-1.5 top-0.5 hidden group-hover:block p-0.5 rounded text-ink-3 hover:text-danger"
              >
                <X size={11} />
              </button>
            )}
          </div>
        )
      )}
      {editing && (
        <button type="button" onClick={onAdd} title="Nova aba" className="px-2 py-1.5 text-ink-3 hover:text-ink-1 transition-colors">
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}
