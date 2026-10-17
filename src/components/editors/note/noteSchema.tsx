// Shared BlockNote schema + building blocks of the note editing experience.
// Used by NoteEditor (full documents) and RichNoteField (rich-text fields
// embedded in other editors, e.g. dungeon room/pin descriptions).
import type { BlockNoteEditor } from '@blocknote/core';
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { getDefaultReactSlashMenuItems } from '@blocknote/react';
import { BookMarked, Dices, FileText, Link2, Table } from 'lucide-react';
import type { DocNode } from '@shared/types';
import { AudioBlock } from './audioBlock';
import { InteractiveTableBlock } from './tableBlock';
import { TableMacroInline } from './tableMacro';
import { CalloutBlockNote } from './calloutBlock';
import { NoteRefInline } from './noteRef';

/** note schema: defaults + custom blocks (audio: disk-backed, loop-capable;
 *  interactiveTable: embeds a diegesis/table document with roll button;
 *  callout: destaque tático rule/lore/secret/quote) */
export const noteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    audio: AudioBlock(),
    interactiveTable: InteractiveTableBlock(),
    callout: CalloutBlockNote(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    noteRef: NoteRefInline(),
    tableMacro: TableMacroInline(),
  },
});

/** Media upload routing: audio files go to disk storage (streamed via the
 *  diegesis-audio:// protocol); everything else (images) stays inline base64. */
export async function uploadMedia(file: File): Promise<string> {
  if (file.type.startsWith('audio/')) {
    const buf = await file.arrayBuffer();
    const result = await window.diegesis.audio.save(file.name, buf);
    if (!result.asset) throw new Error(result.error ?? 'Falha ao importar o áudio.');
    return result.asset.url;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Position where the note-reference picker popover should open. */
export interface NotePickerRequest {
  x: number;
  y: number;
  mode: 'insert' | 'link';
  selectionText: string;
}

/** Slash menu: BlockNote defaults + Diegesis custom blocks.
 *  `openNotePicker` is invoked by the "Referência de nota" item (the picker is
 *  a portal rendered by the host component). */
export function createSlashItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>,
  openNotePicker: (req: NotePickerRequest) => void
) {
  return async (query: string) =>
    filterSuggestionItems(
      [
        ...getDefaultReactSlashMenuItems(editor),
        {
          title: 'Tabela interativa',
          onItemClick: () =>
            insertOrUpdateBlockForSlashMenu(editor, { type: 'interactiveTable' } as never),
          aliases: ['tabela', 'table', 'rolagem', 'roll', 'dados', 'dice'],
          group: 'Diegesis Codex',
          icon: <Table size={18} />,
          subtext: 'Embute uma tabela rolável do universo',
        },
        {
          title: 'Macro de tabela',
          onItemClick: () =>
            editor.insertInlineContent([{ type: 'tableMacro', props: { tableId: '' } }] as never),
          aliases: ['macro', 'inline', 'chip', 'tabela inline', 'roll inline'],
          group: 'Diegesis Codex',
          icon: <Dices size={18} />,
          subtext: 'Tabela rolável embutida no meio do texto',
        },
        {
          title: 'Callout',
          onItemClick: () =>
            insertOrUpdateBlockForSlashMenu(editor, { type: 'callout', props: { variant: 'lore' } } as never),
          aliases: ['destaque', 'lore', 'segredo', 'regra', 'citação', 'callout', 'quote'],
          group: 'Diegesis Codex',
          icon: <BookMarked size={18} />,
          subtext: 'Bloco de destaque (regra, lore, segredo, citação)',
        },
        {
          title: 'Referência de nota',
          onItemClick: () => {
            const box = editor.getSelectionBoundingBox();
            openNotePicker({
              x: box?.left ?? 40,
              y: (box?.bottom ?? 40) + 6,
              mode: 'insert',
              selectionText: '',
            });
          },
          aliases: ['nota', 'referência', 'referencia', 'link', 'vínculo', 'vinculo', 'wikilink', 'mention', 'mencionar'],
          group: 'Diegesis Codex',
          icon: <Link2 size={18} />,
          subtext: 'Referencia outra nota do universo',
        },
      ],
      query
    );
}

/** `[[` wikilink trigger: sugere notas do realm (alias via `|`). */
export function createNoteRefItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>,
  docs: DocNode[],
  excludeId?: string
) {
  return async (query: string) => {
    const pipe = query.indexOf('|');
    const search = (pipe >= 0 ? query.slice(0, pipe) : query).trim().toLowerCase();
    const alias = pipe >= 0 ? query.slice(pipe + 1).trim() : '';
    return docs
      .filter((d) => d.type === 'core/note' && d.id !== excludeId)
      .filter((d) => !search || d.title.toLowerCase().includes(search))
      .slice(0, 10)
      .map((d) => ({
        title: d.title || 'Sem título',
        subtext: alias ? `exibido como “${alias}”` : 'Referência de nota',
        icon: <FileText size={18} />,
        onItemClick: () => {
          editor.insertInlineContent([{ type: 'noteRef', props: { docId: d.id, label: alias } }] as never);
        },
      }));
  };
}
