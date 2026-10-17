// Full note-editing experience (custom blocks, slash menu, [[wiki-links]],
// formatting toolbar, Ask AI) as a compact FIELD bound to a JSON-string value
// inside another document — e.g. dungeon room/pin descriptions.
// For plain compact surfaces (whiteboard shapes), see RichTextEditor.
import { useRef, useState } from 'react';
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  BlockTypeSelect,
  BasicTextStyleButton,
  CreateLinkButton,
  SuggestionMenuController,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/ariakit';
import { pt } from '@blocknote/core/locales';
import { Link2, Sparkles } from 'lucide-react';
import { parseNoteContent } from '@shared/blockContent';
import { useStore } from '../../../state/store';
import {
  noteSchema,
  uploadMedia,
  createSlashItems,
  createNoteRefItems,
  type NotePickerRequest,
} from '../note/noteSchema';
import { NotePickerPopover } from '../note/noteRef';
import { InlineAiPopover } from '../note/InlineAiPopover';

export function RichNoteField({
  value,
  onChange,
  autofocus = false,
  className,
}: {
  /** BlockNote JSON string ('' treated as empty). Read once — the host keys
   *  the component by entity id so each selection gets a fresh editor. */
  value: string;
  onChange(json: string): void;
  autofocus?: boolean;
  className?: string;
}) {
  const { docs } = useStore();
  const [notePicker, setNotePicker] = useState<NotePickerRequest | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAnchor, setAiAnchor] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);

  const editor = useCreateBlockNote({
    schema: noteSchema,
    dictionary: pt,
    initialContent: parseNoteContent(value || undefined) as never,
    uploadFile: uploadMedia,
    autofocus,
  });

  const slashItems = createSlashItems(editor, setNotePicker);
  const noteRefItems = createNoteRefItems(editor, docs);

  const openAi = (rect?: DOMRect) => {
    let r = rect;
    if (!r) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount) {
        const sr = sel.getRangeAt(0).getBoundingClientRect();
        if (sr && (sr.width || sr.height)) r = sr;
      }
    }
    if (!r) r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    setAiAnchor({ x: r.left, y: r.bottom + 8 });
    setAiOpen(true);
  };

  return (
    <div
      ref={rootRef}
      className={className}
      // canvas/global hotkeys must not fire while typing in the field
      onKeyDown={(e) => e.stopPropagation()}
    >
      <BlockNoteView
        editor={editor}
        theme="dark"
        onChange={() => onChange(JSON.stringify(editor.document))}
        formattingToolbar={false}
        slashMenu={false}
        className="diegesis-bn embedded"
      >
        <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
        <SuggestionMenuController triggerCharacter="[[" minQueryLength={0} getItems={noteRefItems} />
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              <BlockTypeSelect key="blockTypeSelect" />
              <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
              <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
              <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
              <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
              <BasicTextStyleButton basicTextStyle="code" key="codeStyleButton" />
              <CreateLinkButton key="createLinkButton" />
              <button
                key="linkNote"
                title="Vincular nota"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) =>
                  setNotePicker({
                    x: (e.currentTarget as HTMLElement).getBoundingClientRect().left,
                    y: (e.currentTarget as HTMLElement).getBoundingClientRect().bottom + 6,
                    mode: 'link',
                    selectionText: editor.getSelectedText(),
                  })
                }
                className="bn-ak-button bn-ak-secondary bn-ask-ai"
              >
                <Link2 size={16} strokeWidth={1.75} />
              </button>
              <button
                key="askAI"
                title="Perguntar à IA sobre a seleção"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => openAi((e.currentTarget as HTMLElement).getBoundingClientRect())}
                className="bn-ak-button bn-ak-secondary bn-ask-ai"
              >
                <Sparkles size={16} strokeWidth={1.75} />
              </button>
            </FormattingToolbar>
          )}
        />
      </BlockNoteView>
      {aiOpen && <InlineAiPopover editor={editor} anchor={aiAnchor} onClose={() => setAiOpen(false)} />}
      {notePicker && (
        <NotePickerPopover
          anchor={{ x: notePicker.x, y: notePicker.y }}
          onClose={() => setNotePicker(null)}
          onPick={(target) => {
            const label =
              notePicker.mode === 'link' && notePicker.selectionText.trim()
                ? notePicker.selectionText.trim()
                : '';
            editor.insertInlineContent([
              { type: 'noteRef', props: { docId: target.id, label } },
            ] as never);
          }}
        />
      )}
    </div>
  );
}
