import { useStore } from '../state/store';
import { NoteEditor } from './editors/NoteEditor';
import { Whiteboard } from './editors/Whiteboard';

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

  if (doc.type === 'core/note') return <NoteEditor key={doc.id} doc={doc} />;
  if (doc.type === 'core/whiteboard') return <Whiteboard key={doc.id} doc={doc} />;
  return <div className="p-6 text-ink-3 text-sm">Tipo de documento desconhecido: {doc.type}</div>;
}
