// Custom BlockNote audio block: replaces the built-in `audio` block spec with
// a React render that stores files on disk (via the mythril-audio:// protocol)
// and plays through the global audioPlayer store (loop, simultaneous playback,
// bottom bar). Props stay compatible with the default audio block, with an
// added persisted `loop` flag.
import { useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { FileAudio, Loader2 } from 'lucide-react';
import { AudioPlayerCard } from '../../audio/AudioPlayerCard';

export const AudioBlock = createReactBlockSpec(
  {
    type: 'audio',
    propSchema: {
      backgroundColor: { default: 'default' },
      name: { default: '' },
      url: { default: '' },
      caption: { default: '' },
      showPreview: { default: true },
      loop: { default: false },
      kind: { default: 'music' as const },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const inputRef = useRef<HTMLInputElement>(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState<string | null>(null);

      /** fresh props at call time — block.props can be stale in async handlers */
      const currentProps = () => ({ ...(editor.getBlock(block.id)?.props ?? block.props) });

      const pickFile = async (file: File) => {
        setBusy(true);
        setError(null);
        try {
          const buf = await file.arrayBuffer();
          const result = await window.mythril.audio.save(file.name, buf);
          if (!result.asset) {
            if (result.error) setError(result.error);
            return;
          }
          editor.updateBlock(block, {
            props: { ...currentProps(), url: result.asset.url, name: result.asset.name },
          });
        } finally {
          setBusy(false);
        }
      };

      if (!block.props.url) {
        return (
          <div className="w-full my-1">
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-line-strong text-ink-3 hover:text-ink-1 hover:border-accent/60 hover:bg-accent-soft/40 transition-colors text-[13px]"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <FileAudio size={15} strokeWidth={1.75} />}
              {busy ? 'Importando…' : 'Adicionar áudio…'}
            </button>
            {error && <div className="text-[11px] text-danger mt-1 px-1">{error}</div>}
            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void pickFile(file);
              }}
            />
          </div>
        );
      }

      return (
        <div className="w-full my-1 px-3 py-2 rounded-lg bg-elevated/95 border border-line shadow-xl">
          <AudioPlayerCard
            id={`note:${block.id}`}
            src={block.props.url}
            name={block.props.name || 'Áudio'}
            loop={block.props.loop}
            onLoopChange={(loop) => editor.updateBlock(block, { props: { ...currentProps(), loop } })}
            kind={block.props.kind as 'music' | 'sfx'}
            onKindChange={(kind) => editor.updateBlock(block, { props: { ...currentProps(), kind } })}
            showWaveform
          />
        </div>
      );
    },
  }
);
