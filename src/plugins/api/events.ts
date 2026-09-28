import { createBus, defineContract, type Contract, type EventBus as SdkEventBus, type Schema } from '@diegesis/events';
import * as v from 'valibot';
import type { Disposable } from './types';

/** Application-wide event schemas. This is the single source of truth for the
 *  app event map — payloads are validated against these schemas (in 'warn'
 *  mode) and the `AppEvents` payload types are derived from them.
 *
 *  - `palette:toggle` — request to toggle a floating palette
 *  - `realm:changed` — the active realm (universe) changed
 *  - `command:executed` — a command was executed through the registry
 *  - `plugins:changed` — a plugin was activated or deactivated
 *  - `secondwindow:showNote` / `showMap` — show content in the second window
 *  - `secondwindow:setViewport` — set the second window map viewport
 *  - `secondwindow:clear` — clear the second window (back to idle screen)
 *  - `secondwindow:status` — second window was opened/closed
 *  - `hexcrawl:camera` — hexcrawl map editor camera moved (hex-space center + zoom)
 *  - `roller:rolled` — a table roll happened (table editor or note block); feeds the roll log
 */
const appEvents = {
  'palette:toggle': v.object({ palette: v.union([v.literal('search'), v.literal('command')]) }),
  'realm:changed': v.object({ realmId: v.nullable(v.string()) }),
  'command:executed': v.object({ commandId: v.string() }),
  'plugins:changed': v.object({ pluginId: v.string(), enabled: v.boolean() }),
  'secondwindow:showNote': v.object({ docId: v.string() }),
  'secondwindow:showMap': v.object({ docId: v.string() }),
  'secondwindow:setViewport': v.object({ x: v.number(), y: v.number(), zoom: v.number() }),
  'secondwindow:clear': v.undefined(),
  'secondwindow:status': v.object({ open: v.boolean() }),
  'hexcrawl:camera': v.object({ docId: v.string(), x: v.number(), y: v.number(), zoom: v.number() }),
  'roller:rolled': v.object({
    tableTitle: v.string(),
    steps: v.array(
      v.object({
        title: v.string(),
        formula: v.string(),
        total: v.nullable(v.number()),
        dice: v.array(v.number()),
        text: v.string(),
      }),
    ),
  }),
};

/** Valibot contract for the app bus. Validation runs in 'warn' mode: a bad
 *  payload is logged but never crashes the emitter. */
export const appContract = defineContract({ namespace: 'diegesis-codex', events: appEvents });

/** Application-wide event map (payloads derived from `appEvents` schemas).
 *  Plugins can subscribe to any of these through `ctx.events`
 *  (auto-unsubscribed on deactivation) or `usePluginEvent`. */
export type AppEvents = { [K in keyof typeof appEvents]: v.InferOutput<(typeof appEvents)[K]> };

type Handler<T> = (payload: T) => void;

/** Public event bus contract (implemented by TypedEventBus; used by plugin contexts). */
export interface EventBus<Events> {
  on<K extends keyof Events & string>(type: K, handler: Handler<Events[K]>): Disposable;
  emit<K extends keyof Events & string>(type: K, payload: Events[K]): void;
}

/** Typed event bus backed by `@diegesis/events` (schema-validated payloads,
 *  isolated handler errors routed to `onError`, traced emissions). Keeps the
 *  Disposable-based surface used by the plugin host. */
export class TypedEventBus<Events> implements EventBus<Events> {
  private readonly bus: SdkEventBus<Record<string, Schema>>;

  constructor(contract?: Contract<Record<string, Schema>>) {
    this.bus = createBus(contract, { validate: 'warn' });
    this.bus.onError((error, info) => {
      console.error(`[events] '${info.name}' failed`, error);
    });
  }

  on<K extends keyof Events & string>(type: K, handler: Handler<Events[K]>): Disposable {
    const off = this.bus.on(type, (payload) => handler(payload as Events[K]));
    return { dispose: off };
  }

  emit<K extends keyof Events & string>(type: K, payload: Events[K]): void {
    this.bus.emit(type, payload);
  }
}

/** Shared app bus factory with the app contract applied. */
export function createAppEventBus(): TypedEventBus<AppEvents> {
  return new TypedEventBus<AppEvents>(appContract);
}
