// Local embedding model (transformers.js + ONNX, runs in the main process).
// Model: Xenova/multilingual-e5-small (q8, 384 dims) — strong multilingual retrieval,
// works offline after a one-time download cached in userData/models.
//
// E5 models expect prefixes: "passage: " for indexed text, "query: " for searches.

import path from 'node:path';
import { app } from 'electron';

export const EMBED_DIM = 384;
export const EMBED_MODEL_ID = 'Xenova/multilingual-e5-small';

export type ModelState = 'idle' | 'downloading' | 'ready' | 'error';

type Extractor = (texts: string[], options: { pooling: string; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;
let state: ModelState = 'idle';
let progress = 0; // 0..100 across all model files
let lastError: string | null = null;

const fileProgress = new Map<string, number>();

export function modelStatus(): { state: ModelState; progress: number; error: string | null } {
  return { state, progress, error: lastError };
}

async function load(): Promise<Extractor> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = path.join(app.getPath('userData'), 'models');
  env.allowLocalModels = true;

  state = 'downloading';
  const pipe = await pipeline('feature-extraction', EMBED_MODEL_ID, {
    dtype: 'q8',
    progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
      if (p.file && typeof p.progress === 'number') {
        fileProgress.set(p.file, p.progress);
        const values = [...fileProgress.values()];
        progress = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      }
    },
  });
  state = 'ready';
  progress = 100;
  return pipe as unknown as Extractor;
}

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = load().catch((err) => {
      state = 'error';
      lastError = err instanceof Error ? err.message : String(err);
      extractorPromise = null; // allow retry on next call
      throw err;
    });
  }
  return extractorPromise;
}

async function embed(texts: string[], prefix: 'query' | 'passage'): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const out = await extractor(texts.map((t) => `${prefix}: ${t}`), { pooling: 'mean', normalize: true });
  return out.tolist();
}

export const embedPassages = (texts: string[]) => embed(texts, 'passage');
export const embedQuery = (text: string) => embed([text], 'query').then((v) => v[0]);
