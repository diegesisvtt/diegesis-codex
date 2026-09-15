// Contract every AI provider plugin must implement.
// Adding a new provider = one file here + one line in registry.ts.

import type { ChatMessage, ProviderInfo } from '../../../shared/types';

export interface ChatRequest {
  messages: ChatMessage[];
  /** overrides the model from the provider config */
  model?: string;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
}

export type ProviderConfig = Record<string, string>;

export interface LLMProvider {
  readonly info: ProviderInfo;
  /** Streams assistant deltas. Must yield a final chunk with done=true. */
  chat(config: ProviderConfig, req: ChatRequest): AsyncGenerator<ChatChunk>;
  testConnection(config: ProviderConfig): Promise<{ ok: boolean; error?: string }>;
}
