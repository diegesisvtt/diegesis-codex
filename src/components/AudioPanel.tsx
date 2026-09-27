// Global audio panel (left border tab, like HighlightsPanel): everything
// currently playing, with master volume, per-instance loop/volume/fades,
// music↔sfx kind toggle (crossfade happens between music tracks only) and
// missing-file indicators.
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Music,
  Pause,
  Pencil,
  Play,
  Repeat,
  Square,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { useStore } from '../state/store';
import { audioPlayer, useAudioInstance, useAudioInstanceIds, useMasterVolume } from '../state/audioPlayer';
import { formatTime } from './audio/AudioPlayerCard';

/* ============================================================
   Small shared bits
   ============================================================ */

function IconBtn({
  icon: Icon,
  title,
  active,
  danger,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  title: string;
  active?: boolean;
  danger?: boolean;
  onClick(e: React.MouseEvent<HTMLButtonElement>): void;
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`p-1 rounded transition-colors shrink-0 ${
        active
          ? 'text-accent-ink bg-accent-soft'
          : danger
            ? 'text-ink-3 hover:text-danger hover:bg-hover'
            : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
      }`}
    >
      <Icon size={12} strokeWidth={1.75} />
    </button>
  );
}

/** popover with fade-in/fade-out sliders (0-10s) */
function FadePopover({
  anchor,
  fadeIn,
  fadeOut,
  onChange,
  onClose,
}: {
  anchor: HTMLElement;
  fadeIn: number;
  fadeOut: number;
  onChange(fadeIn: number, fadeOut: number): void;
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const rect = anchor.getBoundingClientRect();
  return (
    <div
      ref={ref}
      className="fixed z-50 w-44 bg-elevated border border-line rounded-lg shadow-2xl p-2.5 space-y-2 animate-fade-up"
      style={{ left: Math.min(rect.left, window.innerWidth - 190), top: rect.bottom + 4 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {(
        [
          ['Fade in', fadeIn, (v: number) => onChange(v, fadeOut)],
          ['Fade out', fadeOut, (v: number) => onChange(fadeIn, v)],
        ] as const
      ).map(([label, value, set]) => (
        <label key={label} className="block">
          <span className="flex justify-between text-[10px] text-ink-3 mb-0.5">
            {label}
            <span className="tabular-nums">{value.toFixed(1)}s</span>
          </span>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={value}
            onChange={(e) => set(Number(e.target.value))}
            className="audio-seek w-full"
          />
        </label>
      ))}
    </div>
  );
}

/* ============================================================
   Playing instance row
   ============================================================ */

function InstanceRow({ id }: { id: string }) {
  const inst = useAudioInstance(id);
  const [fadesAnchor, setFadesAnchor] = useState<HTMLElement | null>(null);
  if (!inst) return null;
  const duration = inst.duration;

  return (
    <div className={`px-2 py-1.5 rounded-lg border ${inst.error ? 'bg-danger-soft/40 border-danger/40' : 'bg-elevated border-line'}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          title={inst.error ? 'Arquivo de áudio não encontrado' : inst.playing ? 'Pausar' : 'Reproduzir'}
          onClick={() =>
            audioPlayer.toggle({ id: inst.id, src: inst.src, name: inst.name, kind: inst.kind, loop: inst.loop })
          }
          disabled={inst.error}
          className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
            inst.error
              ? 'bg-danger-soft text-danger cursor-default'
              : inst.playing
                ? 'bg-accent text-white'
                : 'bg-accent-soft text-accent-ink hover:bg-accent hover:text-white'
          }`}
        >
          {inst.error ? (
            <AlertTriangle size={11} strokeWidth={2} />
          ) : inst.playing ? (
            <Pause size={10} strokeWidth={2} />
          ) : (
            <Play size={10} strokeWidth={2} className="ml-px" />
          )}
        </button>

        <span className="flex-1 min-w-0 truncate text-[12px] text-ink-1" title={inst.name}>
          {inst.name || 'Áudio'}
        </span>

        {/* kind toggle: music joins crossfades, sfx plays on top */}
        <IconBtn
          icon={inst.kind === 'music' ? Music : Zap}
          title={
            inst.kind === 'music'
              ? 'Música (participa do crossfade) — clique para virar efeito'
              : 'Efeito (toca por cima) — clique para virar música'
          }
          active={inst.kind === 'music'}
          onClick={() => audioPlayer.setKind(inst.id, inst.kind === 'music' ? 'sfx' : 'music')}
        />
        <IconBtn
          icon={Repeat}
          title={inst.loop ? 'Repetição ativada' : 'Repetir'}
          active={inst.loop}
          onClick={() => audioPlayer.toggleLoop(inst.id)}
        />
        <IconBtn
          icon={Pencil}
          title={`Fades (in ${inst.fadeIn}s / out ${inst.fadeOut}s)`}
          onClick={(e) => setFadesAnchor(e.currentTarget)}
        />
        <IconBtn icon={X} title="Parar e remover da lista" danger onClick={() => audioPlayer.stop(inst.id)} />
      </div>

      <div className="flex items-center gap-1.5 mt-1">
        <input
          type="range"
          min={0}
          max={Number.isFinite(duration) ? duration : 0}
          step={0.1}
          value={Math.min(inst.currentTime, Number.isFinite(duration) ? duration : 0)}
          disabled={inst.error}
          onChange={(e) => audioPlayer.seek(inst.id, Number(e.target.value))}
          className="audio-seek flex-1 min-w-0"
          title="Posição"
        />
        <span className="text-[10px] text-ink-3 tabular-nums shrink-0">
          {formatTime(inst.currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center gap-1 mt-1">
        <Volume2 size={11} strokeWidth={1.75} className="text-ink-3 shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={inst.volume}
          onChange={(e) => audioPlayer.setVolume(inst.id, Number(e.target.value))}
          className="audio-seek flex-1 min-w-0"
          title={`Volume: ${Math.round(inst.volume * 100)}%`}
        />
        <span className="text-[10px] text-ink-3 tabular-nums w-7 text-right shrink-0">
          {Math.round(inst.volume * 100)}%
        </span>
      </div>

      {fadesAnchor && (
        <FadePopover
          anchor={fadesAnchor}
          fadeIn={inst.fadeIn}
          fadeOut={inst.fadeOut}
          onChange={(fi, fo) => audioPlayer.setFades(inst.id, fi, fo)}
          onClose={() => setFadesAnchor(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Panel
   ============================================================ */

export function AudioPanel() {
  const { uiState, saveUiState, activeRealmId } = useStore();
  const ids = useAudioInstanceIds();
  const master = useMasterVolume();

  const audioUi = uiState.audio ?? {};

  // restore persisted master volume once per realm mount
  useEffect(() => {
    audioPlayer.setMasterVolume(uiState.audio?.masterVolume ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRealmId]);

  const setMaster = (v: number) => {
    audioPlayer.setMasterVolume(v);
    saveUiState({ audio: { ...audioUi, masterVolume: v } });
  };

  return (
    <div className="h-full w-full flex flex-col bg-sidebar">
      {/* header: count + stop all */}
      <div className="px-3 h-9 border-b border-line flex items-center gap-1.5 shrink-0">
        <Music size={12} className="text-ink-3 shrink-0" />
        <span className="flex-1 text-[12px] text-ink-2">
          {ids.length === 0 ? 'Nenhum áudio ativo' : `${ids.length} tocando`}
        </span>
        {ids.length > 0 && (
          <button
            onClick={() => audioPlayer.stopAll()}
            className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-danger px-1.5 py-0.5 rounded hover:bg-hover transition-colors"
            title="Parar todos os áudios"
          >
            <Square size={10} />
            Parar todos
          </button>
        )}
      </div>
      <div className="px-3 py-1.5 border-b border-line flex items-center gap-1.5 shrink-0" title="Volume master">
        <button onClick={() => setMaster(master > 0 ? 0 : 1)} title={master > 0 ? 'Silenciar tudo' : 'Restaurar volume'}>
          {master > 0 ? (
            <Volume2 size={12} strokeWidth={1.75} className="text-ink-3 hover:text-ink-1" />
          ) : (
            <VolumeX size={12} strokeWidth={1.75} className="text-danger" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={master}
          onChange={(e) => setMaster(Number(e.target.value))}
          className="audio-seek flex-1 min-w-0"
          title={`Volume master: ${Math.round(master * 100)}%`}
        />
        <span className="text-[10px] text-ink-3 tabular-nums w-7 text-right shrink-0">{Math.round(master * 100)}%</span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
        {ids.length === 0 ? (
          <div className="px-3 py-6 text-[12px] text-ink-3 leading-relaxed">
            Nenhum áudio tocando. Dê play num áudio de uma nota, do whiteboard ou de um destaque e ele aparece aqui —
            vários podem tocar ao mesmo tempo, cada um com seu volume, repetição e fades. Ao tocar uma{' '}
            <strong>música</strong>, as outras músicas fazem fade-out automaticamente (crossfade);{' '}
            <strong>efeitos</strong> tocam por cima.
          </div>
        ) : (
          ids.map((id) => <InstanceRow key={id} id={id} />)
        )}
      </div>
    </div>
  );
}
