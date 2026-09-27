import type { Disposable } from './types';

/** Application-wide event map. Plugins can subscribe to any of these through
 *  `ctx.events` (auto-unsubscribed on deactivation) or `usePluginEvent`. */
export interface AppEvents {
  /** request to toggle a floating palette */
  'palette:toggle': { palette: 'search' | 'command' };
  /** the active realm (universe) changed */
  'realm:changed': { realmId: string | null };
  /** a command was executed through the registry */
  'command:executed': { commandId: string };
  /** a plugin was activated or deactivated */
  'plugins:changed': { pluginId: string; enabled: boolean };
  /** request to show a note (parchment view) in the second window */
  'secondwindow:showNote': { docId: string };
  /** request to show a hexcrawl map (player view) in the second window */
  'secondwindow:showMap': { docId: string };
  /** request to set the second window map viewport (hex-space world center + zoom) */
  'secondwindow:setViewport': { x: number; y: number; zoom: number };
  /** request to clear the second window (back to idle screen) */
  'secondwindow:clear': undefined;
  /** second window was opened/closed */
  'secondwindow:status': { open: boolean };
  /** a hexcrawl map editor camera moved (hex-space world center + zoom) */
  'hexcrawl:camera': { docId: string; x: number; y: number; zoom: number };
}

type Handler<T> = (payload: T) => void;

/** Public event bus contract (implemented by TypedEventBus; used by plugin contexts). */
export interface EventBus<Events> {
  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): Disposable;
  emit<K extends keyof Events>(type: K, payload: Events[K]): void;
}

/** Minimal typed event bus. */
export class TypedEventBus<Events> implements EventBus<Events> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): Disposable {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return {
      dispose: () => {
        set.delete(handler as Handler<never>);
        if (set.size === 0) this.handlers.delete(type);
      },
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<Events[K]>)(payload);
      } catch (err) {
        console.error(`[events] handler for '${String(type)}' failed`, err);
      }
    }
  }
}
