// CAMADA 2 — Modal. Usa Surface elevated. Mesma API do ui.tsx antigo.

import type { ReactNode } from 'react';
import { Surface } from './Surface';
import { IconButton } from './IconButton';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Modal({ isOpen, onClose, title, children, actions }: ModalProps) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Surface variant="elevated" className="rounded-lg w-full max-w-md overflow-hidden flex flex-col animate-fade-up">
        <div className="px-4 py-3 border-b border-white/5 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-ink-1">{title}</h3>
          <IconButton icon={X} onClick={onClose} className="!p-1" />
        </div>
        <div className="p-5 text-ink-2 text-sm">{children}</div>
        {actions && (
          <div className="px-4 py-3 border-t border-white/5 bg-sidebar flex justify-end gap-2">{actions}</div>
        )}
      </Surface>
    </div>
  );
}
