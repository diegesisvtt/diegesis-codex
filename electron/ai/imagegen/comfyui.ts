// ComfyUI backend — the primary image-generation target.
//
// Two modes:
//  - Built-in template (default): the app assembles a txt2img workflow graph
//    (Checkpoint → LoRA chain → CLIP encode ×2 → KSampler → VAE Decode → SaveImage)
//    and injects prompt/seed/steps/model/LoRAs. Zero setup beyond the server URL.
//  - Custom workflow (advanced): the user pastes an API-format workflow exported
//    from the ComfyUI UI; {{prompt}}, {{negative_prompt}}, {{seed}}, {{width}},
//    {{height}}, {{steps}}, {{cfg}} and {{model}} placeholders are substituted.
//
// Progress is tracked by polling /queue and /history (Electron 31 ships Node 20,
// no global WebSocket), which is more than enough for a local server.

import type { ImageGenRequest, ProviderInfo } from '../../../shared/types';
import type { ProviderConfig } from '../providers/base';
import {
  abortError,
  fetchOrThrow,
  num,
  resolveSeed,
  throwIfAborted,
  type ImageGenProvider,
  type RawGeneratedImage,
} from './base';

type ComfyNode = { class_type: string; inputs: Record<string, unknown> };
type ComfyWorkflow = Record<string, ComfyNode>;

const POLL_MS = 1000;
const TIMEOUT_MS = 10 * 60 * 1000;

const info: ProviderInfo = {
  id: 'comfyui',
  name: 'ComfyUI (local)',
  description:
    'Servidor ComfyUI local ou em rede (padrão http://127.0.0.1:8188). Suporta checkpoints, diffusion models (FLUX/Krea), LoRAs e workflow customizado. Sem API key.',
  fields: [
    { key: 'baseUrl', label: 'URL do servidor', type: 'text', default: 'http://127.0.0.1:8188', required: true },
    {
      key: 'defaultModel',
      label: 'Modelo padrão',
      type: 'text',
      placeholder: 'vazio = primeiro checkpoint/diffusion model disponível',
    },
    {
      key: 'modelType',
      label: 'Família do modelo (opcional)',
      type: 'text',
      placeholder: 'auto (recomendado), checkpoint, flux ou krea2',
    },
    { key: 'steps', label: 'Steps padrão', type: 'number', default: '20', placeholder: '20' },
    { key: 'cfg', label: 'CFG padrão (checkpoints)', type: 'number', default: '7', placeholder: '7' },
    { key: 'width', label: 'Largura padrão', type: 'number', default: '1024', placeholder: '1024' },
    { key: 'height', label: 'Altura padrão', type: 'number', default: '1024', placeholder: '1024' },
    {
      key: 'clipModel1',
      label: 'Text encoder 1 (diffusion models, opcional)',
      type: 'text',
      placeholder: 'auto: FLUX → t5*; Krea 2 → qwen3vl*',
    },
    {
      key: 'clipModel2',
      label: 'Text encoder 2 (só FLUX, opcional)',
      type: 'text',
      placeholder: 'auto: primeiro arquivo com "clip_l" em models/clip',
    },
    {
      key: 'vaeModel',
      label: 'VAE (diffusion models, opcional)',
      type: 'text',
      placeholder: 'auto: FLUX → ae*; Krea 2 → qwen_image_vae*',
    },
    {
      key: 'guidance',
      label: 'Guidance (só FLUX, opcional)',
      type: 'number',
      default: '3.5',
      placeholder: '3.5',
    },
    {
      key: 'workflow',
      label: 'Workflow customizado (JSON, opcional)',
      type: 'textarea',
      placeholder:
        'Cole um workflow em formato API (ComfyUI → Save API Format). Placeholders: {{prompt}}, {{negative_prompt}}, {{seed}}, {{width}}, {{height}}, {{steps}}, {{cfg}}, {{model}}',
    },
  ],
};

function base(config: ProviderConfig): string {
  return (config.baseUrl?.trim() || 'http://127.0.0.1:8188').replace(/\/+$/, '');
}

/** Built-in txt2img graph with an optional LoRA chain. */
function templateWorkflow(config: ProviderConfig, req: ImageGenRequest, model: string, seed: number): ComfyWorkflow {
  const width = Math.round(num(req.width, num(config.width, 1024)) / 8) * 8;
  const height = Math.round(num(req.height, num(config.height, 1024)) / 8) * 8;
  const steps = Math.round(num(req.steps, num(config.steps, 20)));
  const cfg = num(req.cfg, num(config.cfg, 7));
  const count = Math.min(Math.max(Math.round(num(req.count, 1)), 1), 4);

  const nodes: ComfyWorkflow = {
    ckpt: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: count } },
    save: { class_type: 'SaveImage', inputs: { filename_prefix: 'diegesis', images: ['decode', 0] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['ckpt', 2] } },
  };

  let modelRef: unknown = ['ckpt', 0];
  let clipRef: unknown = ['ckpt', 1];
  (req.loras ?? []).forEach((lora, i) => {
    const id = `lora${i}`;
    nodes[id] = {
      class_type: 'LoraLoader',
      inputs: {
        lora_name: lora.name,
        strength_model: lora.strength,
        strength_clip: lora.strength,
        model: modelRef,
        clip: clipRef,
      },
    };
    modelRef = [id, 0];
    clipRef = [id, 1];
  });

  nodes.pos = { class_type: 'CLIPTextEncode', inputs: { text: req.prompt, clip: clipRef } };
  nodes.neg = { class_type: 'CLIPTextEncode', inputs: { text: req.negativePrompt ?? '', clip: clipRef } };
  nodes.sampler = {
    class_type: 'KSampler',
    inputs: {
      seed,
      steps,
      cfg,
      sampler_name: 'euler',
      scheduler: 'normal',
      denoise: 1,
      model: modelRef,
      positive: ['pos', 0],
      negative: ['neg', 0],
      latent_image: ['latent', 0],
    },
  };
  return nodes;
}

/**
 * Built-in txt2img graph for diffusion models (FLUX, Krea, etc. — files under
 * models/diffusion_models/): UNET + DualCLIP + VAE loaded separately, guidance
 * via FluxGuidance (distilled models sample with cfg=1), LoRAs patched into
 * the model only (LoraLoaderModelOnly — no CLIP comes out of a UNET loader).
 */
function fluxWorkflow(
  config: ProviderConfig,
  req: ImageGenRequest,
  model: string,
  seed: number,
  encoders: { clip1: string; clip2: string; vae: string }
): ComfyWorkflow {
  const width = Math.round(num(req.width, num(config.width, 1024)) / 8) * 8;
  const height = Math.round(num(req.height, num(config.height, 1024)) / 8) * 8;
  const steps = Math.round(num(req.steps, num(config.steps, 20)));
  const guidance = num(config.guidance, 3.5);
  const count = Math.min(Math.max(Math.round(num(req.count, 1)), 1), 4);

  const nodes: ComfyWorkflow = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: model, weight_dtype: 'default' } },
    clip: { class_type: 'DualCLIPLoader', inputs: { clip_name1: encoders.clip1, clip_name2: encoders.clip2, type: 'flux' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: encoders.vae } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: count } },
    guidance: { class_type: 'FluxGuidance', inputs: { guidance, conditioning: ['pos', 0] } },
    save: { class_type: 'SaveImage', inputs: { filename_prefix: 'diegesis', images: ['decode', 0] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } },
  };

  let modelRef: unknown = ['unet', 0];
  (req.loras ?? []).forEach((lora, i) => {
    const id = `lora${i}`;
    nodes[id] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { lora_name: lora.name, strength_model: lora.strength, model: modelRef },
    };
    modelRef = [id, 0];
  });

  nodes.pos = { class_type: 'CLIPTextEncode', inputs: { text: req.prompt, clip: ['clip', 0] } };
  nodes.neg = { class_type: 'CLIPTextEncode', inputs: { text: req.negativePrompt ?? '', clip: ['clip', 0] } };
  nodes.sampler = {
    class_type: 'KSampler',
    inputs: {
      seed,
      steps,
      cfg: 1, // distilled diffusion models ignore CFG; steering is via FluxGuidance
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
      model: modelRef,
      positive: ['guidance', 0],
      negative: ['neg', 0],
      latent_image: ['latent', 0],
    },
  };
  return nodes;
}

/** Model architectures the built-in templates know how to wire up. */
type ModelFamily = 'checkpoint' | 'flux' | 'krea2';

const FAMILY_LOADER_FIELD: Record<ModelFamily, string> = {
  checkpoint: 'ckpt_name',
  flux: 'unet_name',
  krea2: 'unet_name',
};

/**
 * Picks the template family: explicit config ('modelType' field) wins;
 * otherwise name heuristics for diffusion models (krea…/flux… cover the
 * official Comfy-Org file names), with FLUX as the generic fallback.
 */
function detectFamily(config: ProviderConfig, model: string, isDiffusion: boolean): ModelFamily {
  const forced = config.modelType?.trim().toLowerCase();
  if (forced === 'checkpoint' || forced === 'flux' || forced === 'krea2') return forced;
  if (!isDiffusion) return 'checkpoint';
  const name = model.toLowerCase();
  if (name.includes('krea')) return 'krea2';
  return 'flux';
}

/**
 * Built-in txt2img graph for Krea 2 (official Comfy-Org template): UNETLoader
 * + single CLIPLoader with type 'krea2' (qwen3vl encoder) + qwen_image VAE.
 * Turbo-distilled: 8 steps, cfg 1; the negative branch is a zeroed-out copy of
 * the positive (the model ignores negative prompts).
 */
function krea2Workflow(
  config: ProviderConfig,
  req: ImageGenRequest,
  model: string,
  seed: number,
  encoders: { clip1: string; vae: string }
): ComfyWorkflow {
  const width = Math.round(num(req.width, num(config.width, 1024)) / 8) * 8;
  const height = Math.round(num(req.height, num(config.height, 1024)) / 8) * 8;
  const steps = Math.round(num(req.steps, 8)); // turbo-distilled: few steps
  const count = Math.min(Math.max(Math.round(num(req.count, 1)), 1), 4);

  const nodes: ComfyWorkflow = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: model, weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: encoders.clip1, type: 'krea2' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: encoders.vae } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: count } },
    neg: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } },
    save: { class_type: 'SaveImage', inputs: { filename_prefix: 'diegesis', images: ['decode', 0] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } },
  };

  let modelRef: unknown = ['unet', 0];
  (req.loras ?? []).forEach((lora, i) => {
    const id = `lora${i}`;
    nodes[id] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { lora_name: lora.name, strength_model: lora.strength, model: modelRef },
    };
    modelRef = [id, 0];
  });

  nodes.pos = { class_type: 'CLIPTextEncode', inputs: { text: req.prompt, clip: ['clip', 0] } };
  nodes.sampler = {
    class_type: 'KSampler',
    inputs: {
      seed,
      steps,
      cfg: 1, // distilled: no classifier-free guidance; negative is zeroed out
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
      model: modelRef,
      positive: ['pos', 0],
      negative: ['neg', 0],
      latent_image: ['latent', 0],
    },
  };
  return nodes;
}

/**
 * Picks CLIP encoder(s) + VAE for diffusion models. Explicit config wins and
 * is VALIDATED against the server lists (a wrong name = clear error, not a
 * garbage image); otherwise per-family name heuristics. Fails with an
 * actionable error listing where each file goes.
 */
async function resolveEncoders(
  config: ProviderConfig,
  family: ModelFamily
): Promise<{ clip1: string; clip2: string; vae: string }> {
  const [clips, vaes] = await Promise.all([
    listNames(config, 'CLIPLoader', 'clip_name'),
    listNames(config, 'VAELoader', 'vae_name'),
  ]);
  const lower = (s: string) => s.toLowerCase();

  /** config override (validated) > first name matching any of the matchers, in order */
  const pick = (configValue: string | undefined, list: string[], matchers: string[], label: string): string => {
    const explicit = configValue?.trim();
    if (explicit) {
      if (list.length > 0 && !list.includes(explicit)) {
        throw new Error(
          `${label} "${explicit}" não existe no ComfyUI. Disponíveis: ${list.slice(0, 8).join(', ')}${list.length > 8 ? '…' : ''}`
        );
      }
      return explicit;
    }
    for (const m of matchers) {
      const hit = list.find((name) => lower(name).includes(m));
      if (hit) return hit;
    }
    throw new Error(`${label} não encontrado no ComfyUI. Indique o nome nas Configurações → Imagens (IA).`);
  };

  if (family === 'krea2') {
    return {
      clip1: pick(config.clipModel1, clips, ['qwen3vl_4b', 'qwen3vl', 'qwen3'], 'Text encoder Krea 2 (ex. qwen3vl_4b_fp8_scaled.safetensors em models/clip/)'),
      clip2: '',
      vae: pick(config.vaeModel, vaes, ['qwen_image_vae', 'qwen_image'], 'VAE Krea 2 (ex. qwen_image_vae.safetensors em models/vae/)'),
    };
  }

  // flux
  return {
    clip1: pick(config.clipModel1, clips, ['t5'], 'Text encoder T5 (ex. t5xxl_fp16.safetensors em models/clip/)'),
    clip2: pick(config.clipModel2, clips, ['clip_l'], 'Text encoder CLIP-L (ex. clip_l.safetensors em models/clip/)'),
    vae: pick(config.vaeModel, vaes, ['ae'], 'VAE (ex. ae.safetensors em models/vae/)'),
  };
}

/** Replaces {{tokens}} anywhere in a parsed workflow (exact-token values keep their type). */
function substituteTokens(node: unknown, tokens: Record<string, string | number>): unknown {
  if (typeof node === 'string') {
    const exact = tokens[node];
    if (exact !== undefined) return exact;
    let out = node;
    for (const [token, value] of Object.entries(tokens)) {
      if (out.includes(token)) out = out.split(token).join(String(value));
    }
    return out;
  }
  if (Array.isArray(node)) return node.map((v) => substituteTokens(v, tokens));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, substituteTokens(v, tokens)]));
  }
  return node;
}

function customWorkflow(config: ProviderConfig, req: ImageGenRequest, model: string, seed: number): ComfyWorkflow {
  let parsed: unknown;
  try {
    parsed = JSON.parse(config.workflow);
  } catch {
    throw new Error('O workflow customizado não é um JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Workflow customizado inválido: esperado um objeto no formato API do ComfyUI.');
  }
  const tokens: Record<string, string | number> = {
    '{{prompt}}': req.prompt,
    '{{negative_prompt}}': req.negativePrompt ?? '',
    '{{seed}}': seed,
    '{{width}}': Math.round(num(req.width, num(config.width, 1024)) / 8) * 8,
    '{{height}}': Math.round(num(req.height, num(config.height, 1024)) / 8) * 8,
    '{{steps}}': Math.round(num(req.steps, num(config.steps, 20))),
    '{{cfg}}': num(req.cfg, num(config.cfg, 7)),
    '{{model}}': model,
  };
  return substituteTokens(parsed, tokens) as ComfyWorkflow;
}

interface ComfyHistoryImage {
  filename: string;
  subfolder: string;
  type: string;
}

interface ComfyHistoryEntry {
  status?: { status_str?: string; completed?: boolean; messages?: [string, { exception_message?: string }][] };
  outputs?: Record<string, { images?: ComfyHistoryImage[] }>;
}

async function listNames(config: ProviderConfig, nodeClass: string, field: string): Promise<string[]> {
  const res = await fetchOrThrow(`${base(config)}/object_info/${nodeClass}`, undefined, 'ComfyUI');
  if (!res.ok) throw new Error(`ComfyUI respondeu HTTP ${res.status} ao listar ${nodeClass}.`);
  const json = (await res.json()) as Record<string, { input?: { required?: Record<string, unknown> } }>;
  const entry = json[nodeClass]?.input?.required?.[field];
  const names = Array.isArray(entry) ? entry[0] : undefined;
  return Array.isArray(names) ? names.filter((x): x is string => typeof x === 'string') : [];
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const comfyuiProvider: ImageGenProvider = {
  info,

  async testConnection(config) {
    try {
      const res = await fetchOrThrow(`${base(config)}/system_stats`, undefined, 'ComfyUI');
      if (!res.ok) return { ok: false, error: `ComfyUI respondeu HTTP ${res.status}.` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  listModels: async (config) => {
    const [checkpoints, unets] = await Promise.all([
      listNames(config, 'CheckpointLoaderSimple', 'ckpt_name'),
      listNames(config, 'UNETLoader', 'unet_name').catch(() => [] as string[]), // older ComfyUI may lack UNETLoader
    ]);
    return [...checkpoints, ...unets];
  },
  listLoras: (config) => listNames(config, 'LoraLoader', 'lora_name'),

  async generate(config, req, onProgress, signal) {
    const [checkpoints, unets] = await Promise.all([
      listNames(config, 'CheckpointLoaderSimple', 'ckpt_name'),
      listNames(config, 'UNETLoader', 'unet_name').catch(() => [] as string[]),
    ]);
    const all = [...checkpoints, ...unets];
    const model = req.model || config.defaultModel?.trim() || all[0];
    if (!model) throw new Error('Nenhum modelo encontrado no ComfyUI. Baixe um checkpoint ou diffusion model primeiro.');
    if (req.model && all.length > 0 && !all.includes(req.model)) {
      const sample = all.slice(0, 5).join(', ');
      throw new Error(`Modelo "${req.model}" não existe no ComfyUI. Disponíveis: ${sample}${all.length > 5 ? '…' : ''}`);
    }
    // full checkpoints bundle CLIP+VAE; diffusion models (FLUX, Krea…) load them separately
    const isDiffusion = !checkpoints.includes(model) && unets.includes(model);

    const seed = resolveSeed(req.seed);

    /** Enqueues a workflow; on rejection returns the raw error body for inspection. */
    const submit = async (workflow: ComfyWorkflow): Promise<{ promptId?: string; errorDetail?: string }> => {
      const res = await fetchOrThrow(
        `${base(config)}/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: workflow }),
          signal,
        },
        'ComfyUI'
      );
      if (!res.ok) return { errorDetail: (await res.text().catch(() => '')).slice(0, 300) };
      const { prompt_id } = (await res.json()) as { prompt_id?: string };
      return { promptId: prompt_id };
    };

    const isLoaderMismatch = (detail: string | undefined, field: string) =>
      !!detail && detail.includes('value_not_in_list') && detail.includes(field);

    let promptId: string | undefined;
    if (config.workflow?.trim()) {
      const r = await submit(customWorkflow(config, req, model, seed));
      if (!r.promptId) throw new Error(`ComfyUI rejeitou o workflow: ${r.errorDetail ?? 'sem prompt_id'}`);
      promptId = r.promptId;
    } else {
      const family = detectFamily(config, model, isDiffusion);
      const buildFor = async (f: ModelFamily): Promise<ComfyWorkflow> => {
        if (f === 'checkpoint') return templateWorkflow(config, req, model, seed);
        const encoders = await resolveEncoders(config, f);
        return f === 'krea2'
          ? krea2Workflow(config, req, model, seed, encoders)
          : fluxWorkflow(config, req, model, seed, encoders);
      };

      // Family detection trusts config + listings, but listings can fail
      // silently (older ComfyUI, restricted object_info): if the server itself
      // says the model name isn't in that loader's list, retry once with the
      // checkpoint/diffusion counterpart.
      let r = await submit(await buildFor(family));
      if (!r.promptId && isLoaderMismatch(r.errorDetail, FAMILY_LOADER_FIELD[family])) {
        const fallback: ModelFamily = family === 'checkpoint' ? 'flux' : 'checkpoint';
        r = await submit(await buildFor(fallback));
      }
      if (!r.promptId) throw new Error(`ComfyUI rejeitou o workflow: ${r.errorDetail ?? 'sem prompt_id'}`);
      promptId = r.promptId;
    }

    throwIfAborted(signal);
    onProgress({ jobId: req.jobId, progress: -1, stage: 'Na fila…' });

    const deadline = Date.now() + TIMEOUT_MS;
    let announcedRunning = false;
    for (;;) {
      throwIfAborted(signal);
      if (Date.now() > deadline) throw new Error('Tempo esgotado aguardando o ComfyUI.');

      const historyRes = await fetchOrThrow(`${base(config)}/history/${promptId}`, { signal }, 'ComfyUI');
      if (historyRes.ok) {
        const history = (await historyRes.json()) as Record<string, ComfyHistoryEntry>;
        const entry = history[promptId];
        if (entry) {
          if (entry.status?.status_str === 'error') {
            const detail =
              entry.status.messages?.map(([, m]) => m?.exception_message).find(Boolean) ?? 'erro desconhecido';
            throw new Error(`ComfyUI falhou ao gerar: ${detail}`);
          }
          const files = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? []);
          if (files.length > 0) {
            onProgress({ jobId: req.jobId, progress: -1, stage: 'Baixando imagem…' });
            const out: RawGeneratedImage[] = [];
            for (const f of files) {
              throwIfAborted(signal);
              const url = `${base(config)}/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder)}&type=${encodeURIComponent(f.type)}`;
              const img = await fetchOrThrow(url, { signal }, 'ComfyUI');
              if (!img.ok) continue;
              const ext = (f.filename.split('.').pop() ?? 'png').toLowerCase();
              out.push({ data: Buffer.from(await img.arrayBuffer()), ext, seed });
            }
            if (out.length === 0) throw new Error('ComfyUI concluiu, mas não foi possível baixar as imagens.');
            return out;
          }
          // entry exists but no outputs yet — keep polling
        }
      }

      if (!announcedRunning) {
        const queueRes = await fetchOrThrow(`${base(config)}/queue`, { signal }, 'ComfyUI').catch(() => null);
        if (queueRes?.ok) {
          const queue = (await queueRes.json()) as { queue_running?: [string, string][]; queue_pending?: [string, string][] };
          const running = (queue.queue_running ?? []).some((item) => item[1] === promptId);
          if (running) {
            announcedRunning = true;
            onProgress({ jobId: req.jobId, progress: -1, stage: 'Gerando…' });
          }
        }
      }

      await sleep(POLL_MS, signal);
    }
  },
};
