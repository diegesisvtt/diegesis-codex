/* ============================================================
   Confirmation wrappers for destructive actions (app-styled modal)
   ============================================================ */

import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal, Button } from '../../ui';

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Excluir',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm(): void;
  onClose(): void;
}) {
  return (
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
      <p>{message}</p>
    </Modal>
  );
}

/** trash-icon button that asks for confirmation before firing onConfirm */
export function ConfirmDeleteButton({
  title,
  message,
  onConfirm,
  className,
}: {
  title: string;
  message: React.ReactNode;
  onConfirm(): void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        title={title}
        onClick={() => setOpen(true)}
        className={className ?? 'text-ink-3 hover:text-danger p-1 rounded hover:bg-hover'}
      >
        <Trash2 size={13} />
      </button>
      <ConfirmModal open={open} title={title} message={message} onConfirm={onConfirm} onClose={() => setOpen(false)} />
    </>
  );
}
