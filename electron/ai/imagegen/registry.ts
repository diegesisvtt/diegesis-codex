// Plug-and-play image-generation backend registry. To add a backend: implement
// ImageGenProvider in a file under imagegen/ and add it to BUILTIN_PROVIDERS.
// Only ComfyUI is enabled for now (local, free, model/LoRA support); hosted
// backends can be re-added here later.

import type { ImageGenProvider } from './base';
import type { ProviderInfo } from '../../../shared/types';
import { comfyuiProvider } from './comfyui';

const BUILTIN_PROVIDERS: ImageGenProvider[] = [comfyuiProvider];

const registry = new Map<string, ImageGenProvider>();

export function registerImageGenProvider(provider: ImageGenProvider): void {
  registry.set(provider.info.id, provider);
}

export function getImageGenProvider(id: string): ImageGenProvider | null {
  return registry.get(id) ?? null;
}

export function listImageGenProviders(): ProviderInfo[] {
  return [...registry.values()].map((p) => p.info);
}

for (const p of BUILTIN_PROVIDERS) registerImageGenProvider(p);
