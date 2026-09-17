import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type CtxMenuEntry =
  | 'divider'
  | {
      icon?: LucideIcon;
      label: string;
      shortcut?: string;
      /** renders a check mark when true (toggle items) */
      checked?: boolean;
      danger?: boolean;
      disabled?: boolean;
      onClick(): void;
    };

/**
 * App-styled context menu: fixed at the cursor, clamped to the viewport,
 * closes on outside click / Escape / scroll.
 */
export function ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: CtxMenuEntry[];
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // clamp inside the viewport once rendered
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onWheel = () => onClose();
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-[200px] py-1 rounded-lg bg-elevated border border-line shadow-2xl animate-fade-in"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((entry, i) =>
        entry === 'divider' ? (
          <div key={i} className="h-px bg-line my-1 mx-2" />
        ) : (
          <button
            key={i}
            disabled={entry.disabled}
            onClick={() => {
              entry.onClick();
              onClose();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left transition-colors ${
              entry.danger ? 'text-danger hover:bg-danger-soft' : 'text-ink-1 hover:bg-hover'
            } ${entry.disabled ? 'opacity-40 pointer-events-none' : ''}`}
          >
            {entry.icon && <entry.icon size={14} strokeWidth={1.75} className={entry.danger ? '' : 'text-ink-2'} />}
            <span className="flex-1">{entry.label}</span>
            {entry.shortcut && <span className="text-[11px] text-ink-3 ml-4">{entry.shortcut}</span>}
            {entry.checked !== undefined && (
              <span className={`w-4 flex justify-end ${entry.shortcut ? '' : 'ml-4'}`}>
                {entry.checked && <Check size={13} strokeWidth={2.5} className="text-accent-ink" />}
              </span>
            )}
          </button>
        )
      )}
    </div>
  );
}
