// Contract every image-generation backend must implement.
// Adding a new backend = one file here + one line in registry.ts.

import type { ImageGenProgress, ImageGenRequest, ProviderInfo } from '../../../shared/types';
import type { ProviderConfig } from '../providers/base';

/** One generated image, still in memory (the service persists it to disk). */
export interface RawGeneratedImage {
  data: Buffer;
  /** file extension without dot: png | jpeg | webp */
  ext: string;
  /** actual seed used (echoed back so the UI can reproduce/vary) */
  seed?: number;
}

export interface ImageGenProvider {
  readonly info: ProviderInfo;
  testConnection(config: ProviderConfig): Promise<{ ok: boolean; error?: string }>;
  /** checkpoint/model names known by the backend (drives the model picker) */
  listModels?(config: ProviderConfig): Promise<string[]>;
  /** LoRA names known by the backend (omit when the backend has no LoRA concept) */
  listLoras?(config: ProviderConfig): Promise<string[]>;
  generate(
    config: ProviderConfig,
    req: ImageGenRequest,
    onProgress: (p: ImageGenProgress) => void,
    signal?: AbortSignal
  ): Promise<RawGeneratedImage[]>;
}

/** Parses a numeric config/request field with a fallback. */
export function num(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** -1 / undefined / NaN → fresh random seed. */
export function resolveSeed(seed: number | undefined): number {
  return seed != null && Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : Math.floor(Math.random() * 2 ** 32);
}

export function abortError(): Error {
  const err = new Error('Geração cancelada.');
  err.name = 'ImageGenAbort';
  return err;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** fetch() with a human-readable wrapper around network failures. */
export async function fetchOrThrow(url: string, init?: RequestInit, label = 'backend'): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw abortError();
    throw new Error(`Não foi possível conectar ao ${label} (${url}). Verifique se ele está rodando.`);
  }
  return res;
}
