// Menu de modelos de ficha: aplica um modelo existente, salva o layout atual
// como modelo novo do realm, renomeia/exclui modelos do usuário. Modelos
// embutidos (Personagem, Monstro/NPC) não podem ser alterados.
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import type { SheetTemplate } from '@shared/sheetLayout';

export interface SheetTemplateMenuProps {
  templates: SheetTemplate[];
  activeId: string | undefined;
  onApply: (id: string) => void;
  onSaveAs: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function SheetTemplateMenu({ templates, activeId, onApply, onSaveAs, onRename, onDelete }: SheetTemplateMenuProps) {
  const [open, setOpen] = useState(false);
  const [savingAs, setSavingAs] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const active = templates.find((t) => t.id === activeId);

  const submitSaveAs = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveAs(trimmed);
    setName('');
    setSavingAs(false);
    setOpen(false);
  };

  const submitRename = () => {
    const trimmed = name.trim();
    if (renamingId && trimmed) onRename(renamingId, trimmed);
    setRenamingId(null);
    setName('');
  };

  return (
    <div ref={rootRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Modelo da ficha"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-line bg-elevated/60 text-[12px] text-ink-2 hover:text-ink-1 hover:border-sheet/40 transition-colors"
      >
        <Layers size={13} className="text-sheet" />
        {active ? active.name : 'Modelo…'}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 rounded-xl border border-line bg-overlay/95 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.55)] py-1 flex flex-col">
          <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.16em] text-ink-3 select-none">Modelos</div>
          {templates.map((t) => (
            <div key={t.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-hover">
              {renamingId === t.id ? (
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  spellCheck={false}
                  className="flex-1 bg-transparent text-[12.5px] text-ink-1 outline-none border border-sheet/50 rounded px-1.5 py-0.5"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onApply(t.id);
                    setOpen(false);
                  }}
                  className="flex-1 flex items-center gap-2 text-left text-[12.5px] text-ink-1"
                >
                  <span className="w-3.5 shrink-0">{t.id === activeId && <Check size={13} className="text-sheet" />}</span>
                  {t.name}
                  {t.builtin && <span className="text-[9.5px] uppercase tracking-wide text-ink-3">embutido</span>}
                </button>
              )}
              {!t.builtin && renamingId !== t.id && (
                <span className="hidden group-hover:flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Renomear modelo"
                    onClick={() => {
                      setRenamingId(t.id);
                      setName(t.name);
                    }}
                    className="p-1 rounded text-ink-3 hover:text-ink-1"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    title="Excluir modelo"
                    onClick={() => onDelete(t.id)}
                    className="p-1 rounded text-ink-3 hover:text-danger"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              )}
            </div>
          ))}

          <div className="h-px bg-line my-1" />
          {savingAs ? (
            <div className="px-3 py-1.5">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSaveAs();
                  if (e.key === 'Escape') setSavingAs(false);
                }}
                placeholder="Nome do modelo…"
                spellCheck={false}
                className="w-full bg-transparent text-[12.5px] text-ink-1 outline-none border border-sheet/50 rounded px-1.5 py-1 placeholder:text-ink-3"
              />
              <div className="text-[10.5px] text-ink-3 mt-1">Enter salva — esta ficha passa a usar o modelo</div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSavingAs(true);
                setName('');
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-2 hover:text-ink-1 hover:bg-hover"
            >
              <Plus size={12} className="text-sheet" />
              Salvar layout como modelo…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
