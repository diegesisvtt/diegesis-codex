import type { ComponentType } from 'react';
import type { DocNode, DocumentType } from '@shared/types';
import { useStore } from '../state/store';
import { useEditor } from '../plugins/manager';
import { NoteEditor } from './editors/NoteEditor';
import { Whiteboard } from './editors/Whiteboard';
import { PdfReader } from './editors/pdf/PdfReader';

/** Built-in editor components per core document type (folders have no editor). */
const CORE_EDITORS: Partial<Record<DocumentType, ComponentType<{ doc: DocNode }>>> = {
  'core/note': NoteEditor,
  'core/whiteboard': Whiteboard,
  'core/pdf': PdfReader,
};

export function DocumentContainer({ docId }: { docId: string }) {
  const { docs } = useStore();
  const doc = docs.find((d) => d.id === docId);
  // plugin-contributed editors (registered for non-core document types)
  const contributed = useEditor(doc?.type ?? '');

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-ink-3 text-sm">
        Documento não encontrado ou foi excluído.
      </div>
    );
  }

  const CoreEditor = CORE_EDITORS[doc.type];
  if (CoreEditor) return <CoreEditor key={doc.id} doc={doc} />;
  if (contributed) {
    const PluginEditor = contributed.component;
    return <PluginEditor key={doc.id} doc={doc} />;
  }
  return (
    <div className="p-6 text-ink-3 text-sm">
      Tipo de documento sem editor registrado: {doc.type} (ative o plugin responsável nas Configurações)
    </div>
  );
}
