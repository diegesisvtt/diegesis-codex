// Docked panel for a highlight: quote, color, label and — once converted —
// the linked note edited inline with the main editor (embedded mode).
import { MapPin, Music, Trash2, X } from 'lucide-react';
import { useStore } from '../../../state/store';
import { HIGHLIGHT_COLORS, REDACTION_COLOR, type PdfDocContent, type PdfHighlight } from './model';
import { NoteEditor } from '../NoteEditor';
import { AudioPlayerCard } from '../../audio/AudioPlayerCard';
import type { usePdfAnnotations } from './useAnnotations';

type Annotations = ReturnType<typeof usePdfAnnotations>;

export function HighlightPanel({
  hl,
  content,
  annotations,
  commit,
  onLocate,
  onClose,
}: {
  hl: PdfHighlight;
  content: PdfDocContent;
  annotations: Annotations;
  commit: (mutate: (c: PdfDocContent) => void) => void;
  onLocate: () => void;
  onClose: () => void;
}) {
  const { docs } = useStore();
  const note = hl.noteId ? docs.find((d) => d.id === hl.noteId) : undefined;
  const isRedaction = hl.color === REDACTION_COLOR;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line shrink-0" style={{ borderLeft: `3px solid ${hl.color}` }}>
        <span className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ background: hl.color }} />
        <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-ink-1">
          {content.hlLabels[hl.color] ?? (isRedaction ? 'Redação' : 'Destaque')}
        </span>
        <span className="text-[10px] text-ink-3 shrink-0">p.{hl.page}</span>
        <button className="p-1 text-ink-3 hover:text-ink-1 rounded hover:bg-hover shrink-0" title="Fechar painel" onClick={onClose}>
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2.5 space-y-3 min-h-0">
        <blockquote className="text-[12.5px] text-ink-2 leading-snug border-l-2 pl-2.5 py-0.5" style={{ borderColor: hl.color }}>
          “{hl.text}”
        </blockquote>

        {/* recolor */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 mb-1">Cor</div>
          <div className="flex gap-1.5 flex-wrap">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${hl.color === c ? 'ring-2 ring-white/70' : 'border-white/20'}`}
                style={{ background: c }}
                title={content.hlLabels[c] ?? (c === REDACTION_COLOR ? 'Redação' : 'Destaque')}
                onClick={() => annotations.updateHighlight(hl.id, { color: c })}
              />
            ))}
          </div>
        </div>

        {/* color label */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink-3 shrink-0">Nome da cor:</span>
          <input
            className="flex-1 min-w-0 bg-overlay text-[11px] text-ink-1 rounded px-1.5 py-0.5 outline-none placeholder:text-ink-3/60"
            placeholder={isRedaction ? 'Redação' : 'Ex.: Tesouro, Perigo'}
            value={content.hlLabels[hl.color] ?? ''}
            onChange={(e) =>
              commit((cc) => {
                if (e.target.value) cc.hlLabels[hl.color] = e.target.value;
                else delete cc.hlLabels[hl.color];
              })
            }
          />
        </div>

        {/* attached audio clip */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 mb-1">Áudio</div>
          {hl.audioUrl ? (
            <div className="flex items-center gap-1 rounded-lg bg-app/60 border border-line/60 px-2 py-1.5">
              <div className="flex-1 min-w-0">
                <AudioPlayerCard
                  id={`hl:${hl.id}`}
                  src={hl.audioUrl}
                  name={hl.audioName || 'Áudio'}
                  loop={hl.audioLoop ?? false}
                  onLoopChange={(loop) => annotations.updateHighlight(hl.id, { audioLoop: loop })}
                  kind={hl.audioKind ?? 'music'}
                  onKindChange={(kind) => annotations.updateHighlight(hl.id, { audioKind: kind })}
                />
              </div>
              <button
                title="Remover áudio"
                onClick={() =>
                  annotations.updateHighlight(hl.id, { audioUrl: undefined, audioName: undefined, audioLoop: undefined })
                }
                className="p-1 text-ink-3 hover:text-danger rounded hover:bg-hover shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ) : (
            <button
              className="flex items-center gap-1.5 text-[11.5px] text-accent-ink hover:text-accent px-2 py-1 rounded hover:bg-accent-soft"
              title="Anexar um arquivo de áudio a este destaque"
              onClick={() => {
                void window.mythril.audio.import().then((result) => {
                  if (!result.asset) return;
                  annotations.updateHighlight(hl.id, { audioUrl: result.asset.url, audioName: result.asset.name });
                });
              }}
            >
              <Music size={12} strokeWidth={1.75} />
              Anexar áudio…
            </button>
          )}
        </div>

        {/* linked note (main editor, embedded) or convert action */}
        {note ? (
          <div className="rounded-lg bg-app/60 border border-line/60 h-[300px] overflow-hidden">
            <NoteEditor doc={note} embedded />
          </div>
        ) : (
          !isRedaction && (
            <button
              className="text-[11.5px] text-accent-ink hover:text-accent px-2 py-1 rounded hover:bg-accent-soft"
              title="Criar uma nota com este trecho (editável aqui mesmo)"
              onClick={() => annotations.convertHighlightToNote(hl.id)}
            >
              → Converter em nota
            </button>
          )
        )}
      </div>

      <div className="flex items-center gap-0.5 px-3 py-1.5 border-t border-line shrink-0">
        <button title="Localizar no PDF" onClick={onLocate} className="p-1.5 text-ink-3 hover:text-ink-1 rounded hover:bg-hover">
          <MapPin size={13} />
        </button>
        <span className="flex-1" />
        <button
          title="Excluir destaque"
          onClick={() => {
            annotations.deleteHighlight(hl.id);
            onClose();
          }}
          className="p-1.5 text-ink-3 hover:text-danger rounded hover:bg-hover"
        >
          <Trash2 size={13} className="text-danger/80" />
        </button>
      </div>
    </div>
  );
}
