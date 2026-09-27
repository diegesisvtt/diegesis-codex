// Waveform visualization: decodes the audio once (Web Audio API), caches the
// peaks per src and renders seekable bars — played portion in accent, the rest
// muted. Decoding is lazy: it only starts when the waveform is scrolled into
// view (IntersectionObserver), so long notes / crowded whiteboards don't open
// N requests on mount.
import { useEffect, useRef, useState } from 'react';

const BAR_COUNT = 72;
/** decoded peak bars (0..1), keyed by src — audio files never change in place */
const peaksCache = new Map<string, number[] | null>();

let sharedCtx: AudioContext | null = null;
function audioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
}

async function computePeaks(src: string): Promise<number[] | null> {
  const cached = peaksCache.get(src);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`http ${res.status}`);
    const buf = await res.arrayBuffer();
    const decoded = await audioContext().decodeAudioData(buf);
    const data = decoded.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / BAR_COUNT));
    // stride keeps the scan O(bars) even on long files
    const stride = Math.max(1, Math.floor(block / 64));
    const out: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      let max = 0;
      const start = i * block;
      for (let j = 0; j < block && start + j < data.length; j += stride) {
        const v = Math.abs(data[start + j]);
        if (v > max) max = v;
      }
      out.push(Math.max(0.08, Math.min(1, max)));
    }
    peaksCache.set(src, out);
    return out;
  } catch {
    peaksCache.set(src, null);
    return null;
  }
}

/** true while the element is on screen (starts lazy work) */
export function useOnScreen<T extends HTMLElement>(rootMargin = '200px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, rootMargin]);
  return [ref, visible];
}

export function Waveform({
  src,
  /** 0..1 played fraction */
  progress,
  onSeek,
  height = 28,
}: {
  src: string;
  progress: number;
  onSeek?: (fraction: number) => void;
  height?: number;
}) {
  const [rootRef, visible] = useOnScreen<HTMLDivElement>();
  const [peaks, setPeaks] = useState<number[] | null | undefined>(() => peaksCache.get(src));

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setPeaks(peaksCache.get(src));
    void computePeaks(src).then((p) => {
      if (!cancelled) setPeaks(p);
    });
    return () => {
      cancelled = true;
    };
  }, [src, visible]);

  const loading = peaks === undefined;
  const errored = peaks === null && !loading;
  const bars = loading || errored ? Array.from({ length: BAR_COUNT }, (_, i) => 0.12 + 0.1 * Math.abs(Math.sin(i * 1.7))) : peaks;
  const playedBars = Math.round(Math.min(1, Math.max(0, progress)) * BAR_COUNT);

  return (
    <div
      ref={rootRef}
      className={`flex items-end gap-px w-full ${onSeek ? 'cursor-pointer' : ''}`}
      style={{ height }}
      title={errored ? 'Arquivo de áudio não encontrado' : onSeek ? 'Clique para ir à posição' : undefined}
      onClick={(e) => {
        if (!onSeek || errored) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
      }}
    >
      {bars.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-[1px] transition-colors ${loading ? 'animate-pulse' : ''}`}
          style={{
            height: `${Math.round(v * 100)}%`,
            minHeight: 2,
            background: errored
              ? 'rgba(235,87,87,0.35)'
              : i < playedBars
                ? 'var(--color-accent-ink)'
                : 'rgba(255,255,255,0.18)',
          }}
        />
      ))}
    </div>
  );
}
