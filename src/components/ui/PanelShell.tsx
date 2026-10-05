// PanelShell: chrome compartilhado de painel lateral de propriedades
// (padrão do hexmap: borda esquerda, cabeçalho uppercase, fechar, corpo
// rolável). Suporta abas internas opcionais. O host controla dock/resize.
import { X } from 'lucide-react';
import { Surface } from './Surface';
import { Tabs, type TabItemData } from './Tabs';

export interface PanelTab {
  id: string;
  title: string;
}

export function PanelShell({
  title,
  width,
  onClose,
  tabs,
  tab,
  onTabChange,
  children,
}: {
  title: string;
  width?: number;
  onClose?: () => void;
  tabs?: PanelTab[];
  tab?: string;
  onTabChange?: (id: string) => void;
  children: React.ReactNode;
}) {
  const tabItems: TabItemData[] = (tabs ?? []).map((t) => ({ id: t.id, label: t.title }));

  return (
    <Surface
      variant="panel"
      className="shrink-0 border-l border-line flex flex-col min-h-0"
      style={width ? { width } : undefined}
    >
      <div className="h-9 px-3 border-b border-line flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 shadow-[0_0_6px_rgba(56,189,248,0.6)]" />
          {title}
        </span>
        {onClose && (
          <button onClick={onClose} className="text-ink-3 hover:text-ink-1 p-1 rounded hover:bg-hover transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
      {tabs && tab && onTabChange && tabItems.length > 0 && (
        <Tabs items={tabItems} activeId={tab} onSelect={onTabChange} className="!border-b-0 border-b border-line" />
      )}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">{children}</div>
    </Surface>
  );
}
