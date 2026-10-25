// Orchestrates image generation: resolves the configured backend, runs the
// provider and persists every resulting image to disk via the images pipeline
// (diegesis-image:// assets), so generated files get the same GC as imports.

import * as images from '../../images';
import { getResolvedImageGenConfig } from '../config';
import { getImageGenProvider } from './registry';
import { num } from './base';
import type { ImageGenProgress, ImageGenRequest, ImageGenResult } from '../../../shared/types';

export function imageGenConfigured(): boolean {
  return getResolvedImageGenConfig() !== null;
}

const MAX_PROMPT = 8000;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(Math.max(Math.round(num(value, fallback)), min), max);
}

/** Bounds everything that came over IPC (renderer or LLM tool call) before it
 *  reaches a backend — NaN/unbounded values would otherwise flow into the
 *  workflow JSON or API request. */
function normalize(req: ImageGenRequest): ImageGenRequest {
  return {
    ...req,
    prompt: req.prompt.slice(0, MAX_PROMPT),
    negativePrompt: req.negativePrompt?.slice(0, MAX_PROMPT),
    width: req.width != null ? clampInt(req.width, 64, 4096, 1024) : undefined,
    height: req.height != null ? clampInt(req.height, 64, 4096, 1024) : undefined,
    steps: req.steps != null ? clampInt(req.steps, 1, 150, 20) : undefined,
    count: clampInt(req.count, 1, 4, 1),
    loras: req.loras
      ?.filter((l) => l && typeof l.name === 'string' && l.name.length <= 260)
      .slice(0, 8)
      .map((l) => ({ name: l.name, strength: Math.min(Math.max(num(l.strength, 1), 0), 2) })),
  };
}

export async function generateImages(
  req: ImageGenRequest,
  onProgress: (p: ImageGenProgress) => void,
  signal?: AbortSignal
): Promise<ImageGenResult> {
  const cfg = getResolvedImageGenConfig();
  if (!cfg) return { ok: false, error: 'Configure um backend de geração de imagens nas Configurações → Imagens (IA).' };
  const provider = getImageGenProvider(cfg.providerId);
  if (!provider) return { ok: false, error: `Backend de imagem desconhecido: ${cfg.providerId}` };
  if (typeof req.jobId !== 'string' || !req.jobId || req.jobId.length > 64) {
    return { ok: false, error: 'jobId inválido.' };
  }
  if (typeof req.prompt !== 'string' || !req.prompt.trim()) {
    return { ok: false, error: 'Descreva a imagem (prompt vazio).' };
  }
  req = normalize(req);

  try {
    const raw = await provider.generate(cfg.config, req, onProgress, signal);
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const name = `gen-${req.jobId}-${i}.${raw[i].ext}`;
      const saved = await images.saveImage(name, raw[i].data);
      if (!saved.asset) return { ok: false, error: saved.error ?? 'Falha ao salvar a imagem gerada.' };
      out.push({ url: saved.asset.url, name: saved.asset.name, seed: raw[i].seed });
    }
    return { ok: true, images: out };
  } catch (err) {
    if (err instanceof Error && err.name === 'ImageGenAbort') return { ok: false, error: 'cancelled', cancelled: true };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
