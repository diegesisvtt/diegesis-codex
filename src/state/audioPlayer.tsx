// Global audio playback manager — external singleton store (no Context).
// Player surfaces (note blocks, whiteboard shapes, PDF highlights, soundboard
// entries) register instances by a stable id; the dockable AudioPanel lists
// them all. Multiple instances play simultaneously (one HTMLAudioElement each).
//
// Design notes:
// - useSyncExternalStore with per-id + list subscriptions: a timeupdate on one
//   instance never re-renders unrelated players.
// - Effective volume pipeline: el.volume = volume × masterVolume × fadeGain.
// - Fades ramp fadeGain on an interval; crossfade = play('music') fades out
//   every other playing 'music' instance (sfx are never touched).
import { useSyncExternalStore } from 'react';

export type AudioKind = 'music' | 'sfx';

export interface AudioInstance {
  /** stable caller-provided key, e.g. `note:<blockId>`, `wb:<shapeId>`, `hl:<highlightId>` */
  id: string;
  src: string;
  name: string;
  /** 'music' joins crossfades; 'sfx' plays on top */
  kind: AudioKind;
  playing: boolean;
  loop: boolean;
  /** user volume 0..1 (before master/fade) */
  volume: number;
  /** fade durations in seconds */
  fadeIn: number;
  fadeOut: number;
  currentTime: number;
  /** NaN until metadata loads */
  duration: number;
  /** file missing / decode failure */
  error: boolean;
}

export interface AudioPlayRequest {
  id: string;
  src: string;
  name: string;
  kind?: AudioKind;
  loop?: boolean;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
}

const FADE_TICK_MS = 50;
const DEFAULT_FADE = 2;

interface Slot {
  el: HTMLAudioElement;
  /** 0..1 ramped by the fade engine */
  fadeGain: number;
  /** active ramp timer, if any */
  fadeTimer: ReturnType<typeof setInterval> | null;
  /** what to do when the current fade-out completes */
  afterFadeOut: 'pause' | 'stop' | null;
}

class AudioPlayerStore {
  private slots = new Map<string, Slot>();
  private instanceMap = new Map<string, AudioInstance>();
  /** stable ids snapshot — only rebuilt on membership changes (ensure/destroy) */
  private idsSnapshot: string[] = [];
  private masterSnapshot = 1;
  private listListeners = new Set<() => void>();
  private masterListeners = new Set<() => void>();
  private instanceListeners = new Map<string, Set<() => void>>();

  /* ---------- subscriptions ---------- */

  subscribeList = (fn: () => void): (() => void) => {
    this.listListeners.add(fn);
    return () => this.listListeners.delete(fn);
  };

  /** ids only: membership changes re-render the list; per-instance updates don't */
  getIds = (): string[] => this.idsSnapshot;

  /** non-reactive read (grouping, lookups) */
  getInstance = (id: string | null): AudioInstance | null => (id ? (this.instanceMap.get(id) ?? null) : null);

  subscribeInstance = (id: string, fn: (() => void) | null): (() => void) => {
    if (!fn) return () => {};
    let set = this.instanceListeners.get(id);
    if (!set) {
      set = new Set();
      this.instanceListeners.set(id, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.instanceListeners.delete(id);
    };
  };

  subscribeMaster = (fn: () => void): (() => void) => {
    this.masterListeners.add(fn);
    return () => this.masterListeners.delete(fn);
  };

  getMaster = (): number => this.masterSnapshot;

  /* ---------- snapshot plumbing ---------- */

  private emitList() {
    this.idsSnapshot = [...this.instanceMap.keys()];
    for (const fn of this.listListeners) fn();
  }

  private emitInstance(id: string) {
    const set = this.instanceListeners.get(id);
    if (set) for (const fn of set) fn();
  }

  /** immutable patch: new object identity so per-id subscribers re-render */
  private patch(id: string, p: Partial<AudioInstance>) {
    const cur = this.instanceMap.get(id);
    if (!cur) return;
    this.instanceMap.set(id, { ...cur, ...p });
    this.emitInstance(id);
  }

  /* ---------- volume pipeline ---------- */

  private applyVolume(id: string) {
    const slot = this.slots.get(id);
    const inst = this.instanceMap.get(id);
    if (!slot || !inst) return;
    slot.el.volume = Math.min(1, Math.max(0, inst.volume * this.masterSnapshot * slot.fadeGain));
  }

  setMasterVolume(v: number) {
    this.masterSnapshot = Math.min(1, Math.max(0, v));
    for (const id of this.slots.keys()) this.applyVolume(id);
    for (const fn of this.masterListeners) fn();
  }

  /* ---------- fade engine ---------- */

  private clearFade(slot: Slot) {
    if (slot.fadeTimer) {
      clearInterval(slot.fadeTimer);
      slot.fadeTimer = null;
    }
    slot.afterFadeOut = null;
  }

  private ramp(id: string, target: 0 | 1, seconds: number, afterFadeOut: Slot['afterFadeOut'] = null) {
    const slot = this.slots.get(id);
    const inst = this.instanceMap.get(id);
    if (!slot || !inst) return;
    this.clearFade(slot);

    const from = slot.fadeGain;
    const duration = Math.max(0, seconds);
    // instant when the fade is disabled or already there
    if (duration <= 0 || from === target) {
      slot.fadeGain = target;
      this.applyVolume(id);
      if (target === 0 && afterFadeOut) this.finishFadeOut(id, afterFadeOut);
      return;
    }

    slot.afterFadeOut = afterFadeOut;
    const step = FADE_TICK_MS / (duration * 1000);
    slot.fadeTimer = setInterval(() => {
      const s = this.slots.get(id);
      if (!s) return;
      s.fadeGain = target === 1 ? Math.min(1, s.fadeGain + step) : Math.max(0, s.fadeGain - step);
      this.applyVolume(id);
      if (s.fadeGain === target) {
        const after = s.afterFadeOut;
        this.clearFade(s);
        if (target === 0 && after) this.finishFadeOut(id, after);
      }
    }, FADE_TICK_MS);
  }

  private finishFadeOut(id: string, action: 'pause' | 'stop') {
    if (action === 'pause') {
      const slot = this.slots.get(id);
      slot?.el.pause();
      // restore gain so resume starts audible even before the fade-in kicks in
      if (slot) {
        slot.fadeGain = 1;
        this.applyVolume(id);
      }
    } else {
      this.destroy(id);
    }
  }

  /* ---------- lifecycle ---------- */

  private ensure(req: AudioPlayRequest): Slot {
    const existing = this.slots.get(req.id);
    if (existing) return existing;

    const el = new Audio(req.src);
    el.preload = 'auto';
    el.loop = req.loop ?? false;
    // throttle: timeupdate fires ~4x/s; only patch when the 1/4s bucket changes
    let lastBucket = -1;
    el.addEventListener('timeupdate', () => {
      const bucket = Math.floor(el.currentTime * 4);
      if (bucket === lastBucket) return;
      lastBucket = bucket;
      this.patch(req.id, { currentTime: el.currentTime });
    });
    el.addEventListener('loadedmetadata', () => this.patch(req.id, { duration: el.duration, error: false }));
    el.addEventListener('play', () => this.patch(req.id, { playing: true }));
    el.addEventListener('pause', () => this.patch(req.id, { playing: false }));
    el.addEventListener('ended', () => this.patch(req.id, { playing: false, currentTime: 0 }));
    el.addEventListener('error', () => this.patch(req.id, { playing: false, error: true }));

    const slot: Slot = { el, fadeGain: 0, fadeTimer: null, afterFadeOut: null };
    this.slots.set(req.id, slot);
    this.instanceMap.set(req.id, {
      id: req.id,
      src: req.src,
      name: req.name,
      kind: req.kind ?? 'music',
      playing: false,
      loop: req.loop ?? false,
      volume: req.volume ?? 1,
      fadeIn: req.fadeIn ?? DEFAULT_FADE,
      fadeOut: req.fadeOut ?? DEFAULT_FADE,
      currentTime: 0,
      duration: NaN,
      error: false,
    });
    this.emitList();
    return slot;
  }

  play(req: AudioPlayRequest) {
    const slot = this.ensure(req);
    const inst = this.instanceMap.get(req.id)!;

    // adopt fresh metadata on re-play (kind/loop/fades may have changed)
    const kind = req.kind ?? inst.kind;
    this.patch(req.id, {
      kind,
      loop: req.loop ?? inst.loop,
      fadeIn: req.fadeIn ?? inst.fadeIn,
      fadeOut: req.fadeOut ?? inst.fadeOut,
      error: false,
    });
    slot.el.loop = req.loop ?? inst.loop;

    // crossfade: a new music fades every other playing music out
    if (kind === 'music') {
      for (const other of this.instanceMap.values()) {
        if (other.id === req.id || other.kind !== 'music' || !other.playing) continue;
        this.fadeOutAndStop(other.id);
      }
    }

    const fadeIn = req.fadeIn ?? inst.fadeIn;
    slot.fadeGain = 0;
    this.applyVolume(req.id);
    slot.el.play().then(
      () => this.ramp(req.id, 1, fadeIn),
      () => {
        if (slot.el.paused) this.patch(req.id, { playing: false, error: true });
      }
    );
  }

  pause(id: string) {
    const slot = this.slots.get(id);
    const inst = this.instanceMap.get(id);
    if (!slot || !inst || slot.el.paused) return;
    this.ramp(id, 0, inst.fadeOut, 'pause');
  }

  toggle(req: AudioPlayRequest) {
    const slot = this.slots.get(req.id);
    if (slot && !slot.el.paused) this.pause(req.id);
    else this.play(req);
  }

  seek(id: string, time: number) {
    const slot = this.slots.get(id);
    if (!slot || !Number.isFinite(time)) return;
    slot.el.currentTime = time;
    this.patch(id, { currentTime: time });
  }

  setVolume(id: string, volume: number) {
    this.patch(id, { volume: Math.min(1, Math.max(0, volume)) });
    this.applyVolume(id);
  }

  /** flips the loop flag; returns the new value so callers can persist it */
  toggleLoop(id: string): boolean | undefined {
    const slot = this.slots.get(id);
    const inst = this.instanceMap.get(id);
    if (!slot || !inst) return undefined;
    slot.el.loop = !slot.el.loop;
    this.patch(id, { loop: slot.el.loop });
    return slot.el.loop;
  }

  setKind(id: string, kind: AudioKind) {
    this.patch(id, { kind });
  }

  setFades(id: string, fadeIn: number, fadeOut: number) {
    this.patch(id, {
      fadeIn: Math.min(30, Math.max(0, fadeIn)),
      fadeOut: Math.min(30, Math.max(0, fadeOut)),
    });
  }

  /** fades out, then pauses and removes the instance (crossfade target) */
  private fadeOutAndStop(id: string) {
    const inst = this.instanceMap.get(id);
    if (!inst) return;
    this.ramp(id, 0, inst.fadeOut, 'stop');
  }

  /** fades out, then removes the instance from the panel */
  stop(id: string) {
    const slot = this.slots.get(id);
    const inst = this.instanceMap.get(id);
    if (!slot || !inst) return;
    if (slot.el.paused || slot.fadeGain === 0) {
      this.destroy(id);
      return;
    }
    this.ramp(id, 0, inst.fadeOut, 'stop');
  }

  stopAll() {
    for (const id of [...this.slots.keys()]) this.stop(id);
  }

  /** immediate teardown — used when the owning surface is deleted */
  destroy(id: string) {
    const slot = this.slots.get(id);
    if (slot) {
      this.clearFade(slot);
      slot.el.pause();
      // canonical teardown (el.src = '' would fetch the document URL)
      slot.el.removeAttribute('src');
      slot.el.load();
      this.slots.delete(id);
    }
    if (this.instanceMap.delete(id)) {
      this.emitInstance(id);
      this.emitList();
    }
  }
}

/** app-wide singleton */
export const audioPlayer = new AudioPlayerStore();

/* ---------- React bindings ---------- */

/** Instance ids (panel membership). Re-renders only when an instance is
 *  added/removed — per-instance updates flow through useAudioInstance. */
export function useAudioInstanceIds(): string[] {
  return useSyncExternalStore(audioPlayer.subscribeList, audioPlayer.getIds);
}

/** A single instance by id; null when not registered. Unrelated instances
 *  playing/pausing/seeking never re-render the caller. */
export function useAudioInstance(id: string | null): AudioInstance | null {
  return useSyncExternalStore(
    (fn) => audioPlayer.subscribeInstance(id ?? '', fn),
    () => audioPlayer.getInstance(id)
  );
}

export function useMasterVolume(): number {
  return useSyncExternalStore(audioPlayer.subscribeMaster, audioPlayer.getMaster);
}
