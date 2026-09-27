// Compact audio player card shared by note blocks, whiteboard shapes and PDF
// highlight panels. All playback state lives in the global audioPlayer store
// (per-id subscription — only this card re-renders on its own updates).
import { useEffect, useState } from 'react';
import { AlertTriangle, Music, Pause, Play, Repeat, Zap } from 'lucide-react';
import { audioPlayer, useAudioInstance, type AudioKind } from '../../state/audioPlayer';
import { Waveform, useOnScreen } from './Waveform';

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** metadata durations, keyed by src (files never change in place) */
const durationCache = new Map<string, number | null>();

/** Reads duration lazily (when visible) without registering an instance. */
function useAudioDuration(src: string, active: boolean, visible: boolean): { duration: number; error: boolean } {
  const [state, setState] = useState<{ duration: number; error: boolean }>(() => {
    const cached = durationCache.get(src);
    return cached != null ? { duration: cached, error: false } : { duration: NaN, error: cached === null };
  });
  useEffect(() => {
    if (active || !visible || !src) return;
    const cached = durationCache.get(src);
    if (cached !== undefined) {
      setState(cached != null ? { duration: cached, error: false } : { duration: NaN, error: true });
      return;
    }
    const el = new Audio();
    el.preload = 'metadata';
    el.src = src;
    const onMeta = () => {
      durationCache.set(src, el.duration);
      setState({ duration: el.duration, error: false });
    };
    const onError = () => {
      durationCache.set(src, null);
      setState({ duration: NaN, error: true });
    };
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('error', onError);
      el.removeAttribute('src');
      el.load();
    };
  }, [src, active, visible]);
  return state;
}

export function AudioPlayerCard({
  id,
  src,
  name,
  loop = false,
  onLoopChange,
  kind = 'music',
  onKindChange,
  showWaveform = false,
}: {
  /** stable instance key in the global player store */
  id: string;
  src: string;
  name: string;
  /** persisted loop preference (block/shape/highlight props) */
  loop?: boolean;
  /** persist the loop flag back into the host document */
  onLoopChange?: (loop: boolean) => void;
  /** persisted kind: 'music' joins crossfades, 'sfx' plays on top */
  kind?: AudioKind;
  /** persist the kind flag back into the host document */
  onKindChange?: (kind: AudioKind) => void;
  /** replace the seek slider with the real waveform (note blocks, big cards) */
  showWaveform?: boolean;
}) {
  const [rootRef, visible] = useOnScreen<HTMLDivElement>();
  const inst = useAudioInstance(id);
  const playing = inst?.playing ?? false;
  const currentTime = inst?.currentTime ?? 0;
  const activeLoop = inst?.loop ?? loop;
  const activeKind = inst?.kind ?? kind;
  const idle = useAudioDuration(src, !!inst, visible);
  const duration = inst?.duration ?? idle.duration;
  const errored = inst?.error ?? idle.error;
  const progress = Number.isFinite(duration) && duration > 0 ? currentTime / duration : 0;

  // mirror store → host: loop/kind toggled anywhere (card or panel) persists here
  useEffect(() => {
    if (inst && inst.loop !== loop) onLoopChange?.(inst.loop);
  }, [inst?.loop]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (inst && inst.kind !== kind) onKindChange?.(inst.kind);
  }, [inst?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    audioPlayer.toggle({ id, src, name, kind: activeKind, loop: activeLoop });
  };

  const toggleLoop = () => {
    if (inst) audioPlayer.toggleLoop(id);
    else onLoopChange?.(!loop);
  };

  const kindButton = onKindChange ? (
    <button
      title={
        activeKind === 'music'
          ? 'Música (participa do crossfade) — clique para virar efeito'
          : 'Efeito (toca por cima) — clique para virar música'
      }
      onClick={() => {
        const next: AudioKind = activeKind === 'music' ? 'sfx' : 'music';
        if (inst) audioPlayer.setKind(id, next);
        else onKindChange(next);
      }}
      className={`shrink-0 p-1 rounded transition-colors ${
        activeKind === 'music' ? 'text-accent-ink bg-accent-soft' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
      }`}
    >
      {activeKind === 'music' ? <Music size={13} strokeWidth={1.75} /> : <Zap size={13} strokeWidth={1.75} />}
    </button>
  ) : null;

  const playButton = (
    <button
      title={errored ? 'Arquivo de áudio não encontrado' : playing ? 'Pausar' : 'Reproduzir'}
      onClick={toggle}
      disabled={errored}
      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
        errored
          ? 'bg-danger-soft text-danger cursor-default'
          : playing
            ? 'bg-accent text-white'
            : 'bg-accent-soft text-accent-ink hover:bg-accent hover:text-white'
      }`}
    >
      {errored ? (
        <AlertTriangle size={13} strokeWidth={2} />
      ) : playing ? (
        <Pause size={13} strokeWidth={2} />
      ) : (
        <Play size={13} strokeWidth={2} className="ml-0.5" />
      )}
    </button>
  );

  if (showWaveform) {
    return (
      <div ref={rootRef} className="w-full min-w-0">
        <div className="flex items-center gap-2 w-full min-w-0">
          {playButton}
          <span className="flex-1 min-w-0 text-[11.5px] text-ink-1 truncate leading-tight">{name || 'Áudio'}</span>
          <span className="text-[10px] text-ink-3 tabular-nums shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          {kindButton}
          <button
            title={activeLoop ? 'Repetição ativada' : 'Repetir'}
            onClick={toggleLoop}
            className={`shrink-0 p-1 rounded transition-colors ${
              activeLoop ? 'text-accent-ink bg-accent-soft' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
            }`}
          >
            <Repeat size={13} strokeWidth={1.75} />
          </button>
        </div>
        <div className="mt-1.5">
          <Waveform
            src={src}
            progress={progress}
            onSeek={
              inst && !errored
                ? (f) => {
                    if (Number.isFinite(duration)) audioPlayer.seek(id, f * duration);
                  }
                : undefined
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex items-center gap-2 w-full min-w-0">
      {playButton}

      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] text-ink-1 truncate leading-tight">{name || 'Áudio'}</div>
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min={0}
            max={Number.isFinite(duration) ? duration : 0}
            step={0.1}
            value={Math.min(currentTime, Number.isFinite(duration) ? duration : 0)}
            disabled={!inst || errored}
            onChange={(e) => audioPlayer.seek(id, Number(e.target.value))}
            className="audio-seek flex-1 min-w-0"
            title="Posição"
          />
          <span className="text-[10px] text-ink-3 tabular-nums shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {kindButton}
      <button
        title={activeLoop ? 'Repetição ativada' : 'Repetir'}
        onClick={toggleLoop}
        className={`shrink-0 p-1 rounded transition-colors ${
          activeLoop ? 'text-accent-ink bg-accent-soft' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
        }`}
      >
        <Repeat size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
