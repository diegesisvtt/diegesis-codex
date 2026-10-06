// Confirmation modal for destructive actions. Generic wrapper over Modal with
// a cancel/confirm pair; the confirm button uses the danger variant.

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm(): void;
  onClose(): void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', onConfirm, onClose }: ConfirmDialogProps) {
  // Portal to <body>: the dialog is often opened from inside transformed layout
  // containers (tree rows), which would otherwise break its fixed positioning.
  return createPortal(
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {typeof message === 'string' ? <p>{message}</p> : message}
    </Modal>,
    document.body
  );
}
