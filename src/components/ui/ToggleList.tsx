// CAMADA 2 — ToggleList. Seleção múltipla premium de entidades nomeadas
// (universos, pastas, categorias…) em telas de configuração (ver DESIGN.md).
// Substitui listas de checkbox: linha clicável com ícone em tile, rótulo e
// Toggle à direita; a linha selecionada ganha realce tático cyan.

import type { ComponentType } from 'react';
import { Toggle } from './Toggle';

export interface ToggleListItem {
  id: string;
  label: string;
  /** metadado curto à direita do rótulo (ex.: "12 docs") */
  description?: string;
}

export interface ToggleListProps {
  items: ToggleListItem[];
  selectedIds: string[];
  onChange(ids: string[]): void;
  /** ícone da entidade (ex.: BookOpen para universos) */
  icon?: ComponentType<{ size?: number | string; className?: string }>;
  emptyLabel?: string;
  className?: string;
}

export function ToggleList({
  items,
  selectedIds,
  onChange,
  icon: Icon,
  emptyLabel = 'Nada para selecionar.',
  className = '',
}: ToggleListProps) {
  if (items.length === 0) {
    return (
      <p className="text-[12px] text-ink-3/80 border border-dashed border-cyan-500/15 rounded-md px-3 py-3 leading-relaxed">
        {emptyLabel}
      </p>
    );
  }

  const toggleItem = (id: string, checked: boolean) =>
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((x) => x !== id));

  return (
    <div
      className={`bg-card backdrop-blur-sm border border-cyan-500/15 rounded-lg divide-y divide-cyan-500/10 overflow-hidden ${className}`}
    >
      {items.map((item) => {
        const selected = selectedIds.includes(item.id);
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onClick={() => toggleItem(item.id, !selected)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleItem(item.id, !selected);
              }
            }}
            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none transition-colors duration-100 ${
              selected ? 'bg-cyan-500/10' : 'hover:bg-cyan-500/5'
            }`}
          >
            {Icon && (
              <span
                className={`w-7 h-7 rounded-md grid place-items-center border shrink-0 transition-colors duration-100 ${
                  selected
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-glow-cyan'
                    : 'bg-overlay border-white/10 text-ink-3'
                }`}
              >
                <Icon size={14} />
              </span>
            )}
            <span
              className={`flex-1 min-w-0 truncate text-[13px] transition-colors ${
                selected ? 'text-ink-1 font-medium' : 'text-ink-2'
              }`}
            >
              {item.label}
            </span>
            {item.description && <span className="text-[11px] text-ink-3 shrink-0">{item.description}</span>}
            <Toggle
              checked={selected}
              onChange={(v) => toggleItem(item.id, v)}
              title={selected ? `Remover ${item.label}` : `Incluir ${item.label}`}
            />
          </div>
        );
      })}
    </div>
  );
}
