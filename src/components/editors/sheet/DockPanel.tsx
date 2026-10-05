// Painel arrastável/dockável (estilo VS Code): arraste pelo cabeçalho para
// desencaixar; solte próximo às bordas esquerda/direita do canvas para dockar.
// Docked: ocupa a barra lateral (empilhado); float: absoluto, segue o cursor.
export type Dock = 'left' | 'right' | 'float';

export function DockPanel({
  title,
  icon,
  dock,
  x,
  y,
  width = 288,
  containerRef,
  onMove,
  onClose,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  dock: Dock;
  x?: number;
  y?: number;
  width?: number;
  containerRef: React.RefObject<HTMLElement | null>;
  onMove: (dock: Dock, x?: number, y?: number) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const onHeaderDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return; // não arrasta ao clicar em fechar
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startX0 = x ?? 0;
    const startY0 = y ?? 0;
    const rect =
      containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    let torn = false;
    let curX = startX0;
    let curY = startY0;

    const handleMove = (ev: PointerEvent) => {
      if (!torn) {
        torn = true;
        curX = Math.max(0, Math.min(ev.clientX - rect.left - 40, rect.width - width - 8));
        curY = Math.max(0, Math.min(ev.clientY - rect.top - 16, rect.height - 48));
        onMove('float', curX, curY);
      } else {
        curX = Math.max(0, startX0 + (ev.clientX - startX));
        curY = Math.max(0, startY0 + (ev.clientY - startY));
        onMove('float', curX, curY);
      }
    };
    const handleUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (!torn) return;
      const rel = ev.clientX - rect.left;
      if (rel < rect.width * 0.25) onMove('left');
      else if (rel > rect.width * 0.75) onMove('right');
      else onMove('float', curX, curY);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const floating = dock === 'float';
  const base = 'flex flex-col min-h-0 bg-sidebar';
  const dockedCls = `w-full flex-1 ${dock === 'left' ? 'border-r border-line' : 'border-l border-line'}`;
  const floatCls =
    'absolute z-40 rounded-xl border border-line bg-overlay/95 backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.6)] overflow-hidden';

  return (
    <div className={`${base} ${floating ? floatCls : dockedCls}`} style={floating ? { left: x ?? 0, top: y ?? 0, width } : undefined}>
      <div
        onPointerDown={onHeaderDown}
        className="h-8 px-2.5 flex items-center justify-between shrink-0 border-b border-line cursor-grab active:cursor-grabbing select-none"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2">
          {icon}
          {title}
        </span>
        <button onClick={onClose} className="text-ink-3 hover:text-ink-1 p-1 rounded hover:bg-hover transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">{children}</div>
    </div>
  );
}
