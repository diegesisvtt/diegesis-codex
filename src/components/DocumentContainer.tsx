import type { ComponentType } from 'react';
import type { DocNode, DocumentType } from '@shared/types';
import { useStore } from '../state/store';
import { NoteEditor } from './editors/NoteEditor';
import { Whiteboard } from './editors/Whiteboard';
import { PdfReader } from './editors/pdf/PdfReader';

/** Registry of editor components per document type (folders have no editor). */
const EDITORS: Partial<Record<DocumentType, ComponentType<{ doc: DocNode }>>> = {
  'core/note': NoteEditor,
  'core/whiteboard': Whiteboard,
  'core/pdf': PdfReader,
};

export function DocumentContainer({ docId }: { docId: string }) {
  const { docs } = useStore();
  const doc = docs.find((d) => d.id === docId);

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-ink-3 text-sm">
        Documento não encontrado ou foi excluído.
      </div>
    );
  }

  const Editor = EDITORS[doc.type];
  if (Editor) return <Editor key={doc.id} doc={doc} />;
  return <div className="p-6 text-ink-3 text-sm">Tipo de documento desconhecido: {doc.type}</div>;
}
