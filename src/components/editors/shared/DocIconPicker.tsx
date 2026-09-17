// Notion-style document icon picker, shared by the note editor, the PDF
// annotation panels and anywhere a document icon is shown/edited.
import { useState } from 'react';
import { pinIcon, PIN_ICON_NAMES } from '../pdf/rpg';

export function DocIconPicker({
  icon,
  color,
  size = 22,
  onPick,
}: {
  icon?: string | null;
  /** chip background; defaults to a neutral overlay */
  color?: string;
  size?: number;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = pinIcon(icon ?? 'pencil');
  return (
    <div className="relative inline-block">
      <button
        className="rounded-lg flex items-center justify-center hover:bg-hover transition-colors"
        style={{ width: size + 14, height: size + 14, color: color ?? 'var(--color-ink-2, #8b8b93)' }}
        title="Ícone do documento"
        onClick={() => setOpen(!open)}
      >
        <Icon size={size} strokeWidth={1.9} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 grid grid-cols-6 gap-1 w-64 max-h-56 overflow-auto p-2 bg-overlay border border-line rounded-lg shadow-xl">
            {PIN_ICON_NAMES.map((name) => {
              const I = pinIcon(name);
              return (
                <button
                  key={name}
                  className={`p-1.5 rounded hover:bg-hover ${name === icon ? 'bg-accent-soft text-accent-ink' : 'text-ink-2'}`}
                  onClick={() => {
                    onPick(name);
                    setOpen(false);
                  }}
                >
                  <I size={15} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
