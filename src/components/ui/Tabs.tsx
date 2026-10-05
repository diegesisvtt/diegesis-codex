// CAMADA 2 — Tabs. Abas horizontais para alternância de vistas/painéis.
// Estilo "underline" tático com indicador cyan; `items` + `activeId` + `onSelect`.

import type { ComponentType, ReactNode } from 'react';

export interface TabItemData {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number | string; className?: string }>;
  disabled?: boolean;
  /** conteúdo opcional à direita do rótulo (badge de contagem etc.) */
  trailing?: ReactNode;
}

export interface TabItemProps extends TabItemData {
  active: boolean;
  onSelect(id: string): void;
}

export function TabItem({ id, label, icon: Icon, disabled, active, onSelect, trailing }: TabItemProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={() => onSelect(id)}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[12px] transition-colors duration-100 disabled:opacity-40 ${
        active ? 'text-ink-1 font-medium' : 'text-ink-3 hover:text-ink-1'
      }`}
    >
      {Icon && <Icon size={13} className={active ? 'text-cyan-300' : ''} />}
      {label}
      {trailing}
      {active && (
        <span
          className="absolute left-1.5 right-1.5 -bottom-px h-[2px] rounded-full bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_8px_rgba(56,189,248,0.45)]"
          aria-hidden
        />
      )}
    </button>
  );
}

export interface TabsProps {
  items: TabItemData[];
  activeId?: string;
  onSelect(id: string): void;
  className?: string;
}

export function Tabs({ items, activeId, onSelect, className = '' }: TabsProps) {
  return (
    <div role="tablist" className={`flex items-center gap-0.5 border-b border-line ${className}`}>
      {items.map((item) => (
        <TabItem key={item.id} {...item} active={item.id === activeId} onSelect={onSelect} />
      ))}
    </div>
  );
}
