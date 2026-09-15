// Plug-and-play provider registry. To add a provider: implement LLMProvider in a
// file under providers/ and add it to BUILTIN_PROVIDERS below.

import type { LLMProvider } from './base';
import type { ProviderInfo } from '../../../shared/types';
import { genericProvider, lmstudioProvider, ollamaProvider, openaiProvider } from './presets';

const BUILTIN_PROVIDERS: LLMProvider[] = [openaiProvider, ollamaProvider, lmstudioProvider, genericProvider];

const registry = new Map<string, LLMProvider>();

export function registerProvider(provider: LLMProvider): void {
  registry.set(provider.info.id, provider);
}

export function getProvider(id: string): LLMProvider | null {
  return registry.get(id) ?? null;
}

export function listProviders(): ProviderInfo[] {
  return [...registry.values()].map((p) => p.info);
}

for (const p of BUILTIN_PROVIDERS) registerProvider(p);
