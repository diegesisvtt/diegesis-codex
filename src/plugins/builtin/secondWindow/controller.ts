/* Non-React controller behind the second-window plugin. Owns what the
   player window shows (note parchment / hexcrawl map + viewport) and the
   IPC pushes; the ControlPanel is a thin React view over this store. */

import type { PluginContext } from '../../api/types';
import type { MapViewport, SecondWindowState } from '@shared/types';

export interface ShownDoc {
  kind: 'note' | 'map';
  docId: string;
  realmId: string;
}

export interface SecondWindowSnapshot {
  windowOpen: boolean;
  shown: ShownDoc | null;
  mirrorViewport: boolean;
}

const SETTINGS_MIRROR = 'mirrorViewport';
const SETTINGS_SHOWN = 'shown';

export class SecondWindowController {
  private readonly ctx: PluginContext;
  private shown: ShownDoc | null = null;
  private mirrorViewport: boolean;
  private windowOpen = false;
  /** last camera reported by each hexcrawl editor (mirror mode) */
  private gmCamera = new Map<string, MapViewport>();
  /** viewport pushed explicitly by another plugin (takes precedence) */
  private manualViewport: MapViewport | null = null;
  private listeners = new Set<() => void>();
  private snapshot: SecondWindowSnapshot;
  private disposeStatus: (() => void) | null = null;

  constructor(ctx: PluginContext) {
    this.ctx = ctx;
    this.mirrorViewport = ctx.settings.get(SETTINGS_MIRROR, true);
    this.shown = ctx.settings.get<ShownDoc | null>(SETTINGS_SHOWN, null);
    this.snapshot = { windowOpen: false, shown: this.shown, mirrorViewport: this.mirrorViewport };
  }

  /** wires event-bus subscriptions and window status tracking */
  init(): void {
    const { events } = this.ctx;

    events.on('secondwindow:showNote', ({ docId }) => this.showNote(docId));
    events.on('secondwindow:showMap', ({ docId }) => this.showMap(docId));
    events.on('secondwindow:setViewport', (vp) => this.setViewport(vp));
    events.on('secondwindow:clear', () => this.clear());
    events.on('hexcrawl:camera', ({ docId, x, y, zoom }) => {
      this.gmCamera.set(docId, { x, y, zoom });
      if (this.mirrorViewport && this.shown?.kind === 'map' && this.shown.docId === docId) this.push();
    });
    // the shown document belongs to a realm — drop it when the realm changes
    events.on('realm:changed', ({ realmId }) => {
      if (this.shown && this.shown.realmId !== realmId) this.clear();
    });

    this.disposeStatus = window.mythril.secondWindow.onStatus(({ open }) => {
      this.windowOpen = open;
      this.ctx.events.emit('secondwindow:status', { open });
      this.notify();
    });
    void window.mythril.secondWindow.status().then(({ open }) => {
      this.windowOpen = open;
      this.notify();
    });

    // restore the last shown content into a window that is already open
    if (this.shown && this.shown.realmId === this.ctx.app.activeRealmId) this.push();
  }

  dispose(): void {
    this.disposeStatus?.();
    void window.mythril.secondWindow.close();
  }

  /* ---------- React store ---------- */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  // referentially stable between notify() calls — required by useSyncExternalStore
  getSnapshot = (): SecondWindowSnapshot => this.snapshot;

  private notify(): void {
    this.snapshot = { windowOpen: this.windowOpen, shown: this.shown, mirrorViewport: this.mirrorViewport };
    for (const fn of this.listeners) fn();
  }

  /* ---------- commands ---------- */

  toggleWindow(): void {
    if (this.windowOpen) void window.mythril.secondWindow.close();
    else {
      void window.mythril.secondWindow.open();
      // re-push so a reopened window shows the current content immediately
      if (this.shown) this.push();
    }
  }

  showNote(docId: string): void {
    const realmId = this.ctx.app.activeRealmId;
    if (!realmId) return;
    this.shown = { kind: 'note', docId, realmId };
    this.manualViewport = null;
    this.persistShown();
    this.push();
    this.notify();
  }

  showMap(docId: string): void {
    const realmId = this.ctx.app.activeRealmId;
    if (!realmId) return;
    this.shown = { kind: 'map', docId, realmId };
    this.push();
    this.notify();
  }

  setViewport(vp: MapViewport): void {
    this.manualViewport = vp;
    if (this.shown?.kind === 'map') this.push();
  }

  clear(): void {
    this.shown = null;
    this.manualViewport = null;
    this.persistShown();
    void window.mythril.secondWindow.send({ kind: 'none' });
    this.notify();
  }

  setMirrorViewport(mirror: boolean): void {
    this.mirrorViewport = mirror;
    this.ctx.settings.set(SETTINGS_MIRROR, mirror);
    if (this.shown?.kind === 'map') this.push();
    this.notify();
  }

  /* ---------- internals ---------- */

  private persistShown(): void {
    this.ctx.settings.set(SETTINGS_SHOWN, this.shown);
  }

  /** viewport-only pushes skip notify(): they don't affect the control panel */
  private push(): void {
    if (!this.shown) return;

    let state: SecondWindowState;
    if (this.shown.kind === 'note') {
      state = { kind: 'note', realmId: this.shown.realmId, docId: this.shown.docId };
    } else {
      const viewport =
        this.manualViewport ?? (this.mirrorViewport ? (this.gmCamera.get(this.shown.docId) ?? null) : null);
      state = { kind: 'map', realmId: this.shown.realmId, docId: this.shown.docId, viewport };
    }
    void window.mythril.secondWindow.send(state);
  }
}
