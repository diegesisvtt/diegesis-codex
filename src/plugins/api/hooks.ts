// Hooks: canal plugin↔plugin/host com retorno (diferente do event bus, que é
// fire-and-forget). Um plugin registra um handler nomeado (ex.: o roller
// registra 'roller:roll'); outros plugins e o host chamam via `call`.
// Primeiro registrado vence; desregistro automático na desativação.
import type { Disposable } from './types';

/** catálogo tipado de hooks conhecidos — payload/result por nome */
export interface HookMap {
  /** rola uma fórmula via roller (mesa 3D/overlay quando disponíveis) e loga */
  'roller:roll': { payload: { formula: string; label: string }; result: boolean };
}

export type HookHandler<P, R> = (payload: P) => R;
/** hook fora do catálogo (plugins externos): assinatura solta */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = HookHandler<any, any>;

export class HookRegistry {
  private handlers = new Map<string, AnyHandler[]>();

  register<K extends keyof HookMap>(name: K, handler: HookHandler<HookMap[K]['payload'], HookMap[K]['result']>): Disposable;
  register(name: string, handler: AnyHandler): Disposable;
  register(name: string, handler: AnyHandler): Disposable {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
    return {
      dispose: () => {
        const cur = this.handlers.get(name);
        if (!cur) return;
        const next = cur.filter((h) => h !== handler);
        if (next.length === 0) this.handlers.delete(name);
        else this.handlers.set(name, next);
      },
    };
  }

  /** chama o primeiro handler registrado; undefined quando ninguém proveu o hook */
  call<K extends keyof HookMap>(name: K, payload: HookMap[K]['payload']): HookMap[K]['result'] | undefined;
  call(name: string, payload?: unknown): unknown;
  call(name: string, payload?: unknown): unknown {
    const handler = this.handlers.get(name)?.[0];
    return handler ? handler(payload) : undefined;
  }

  has(name: string): boolean {
    return (this.handlers.get(name)?.length ?? 0) > 0;
  }
}
