// PanelShell: chrome compartilhado de painel lateral de propriedades
// (padrão do hexmap: borda esquerda, cabeçalho uppercase, fechar, corpo
// rolável). Suporta abas internas opcionais. O host controla dock/resize.
import { X } from 'lucide-react';

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
  return (
    <div className="shrink-0 border-l border-line bg-sidebar flex flex-col min-h-0" style={width ? { width } : undefined}>
      <div className="h-9 px-3 border-b border-line flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">{title}</span>
        {onClose && (
          <button onClick={onClose} className="text-ink-3 hover:text-ink-1 p-1 rounded hover:bg-hover">
            <X size={14} />
          </button>
        )}
      </div>
      {tabs && tab && onTabChange && (
        <div className="flex gap-1 px-3 py-1.5 border-b border-line shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                t.id === tab ? 'bg-active text-ink-1' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
              }`}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">{children}</div>
    </div>
  );
}
