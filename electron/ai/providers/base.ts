// Contract every AI provider plugin must implement.
// Adding a new provider = one file here + one line in registry.ts.

import type { ChatRole, ProviderInfo } from '../../../shared/types';

/** Wire message: extends the shared ChatMessage with tool-calling fields. */
export interface ProviderMessage {
  role: ChatRole | 'tool';
  content: string;
  /** role='tool': id of the call this message answers */
  toolCallId?: string;
  /** role='assistant': calls requested by the model */
  toolCalls?: ToolCall[];
}

export interface ChatRequest {
  messages: ProviderMessage[];
  /** overrides the model from the provider config */
  model?: string;
  /** OpenAI-style function tools; when present, the model may answer with tool calls */
  tools?: ToolSpec[];
  /** aborts the HTTP request mid-stream */
  signal?: AbortSignal;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments object */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** raw JSON string of the arguments */
  arguments: string;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
  /** present on the final chunk when the model requested tool calls */
  toolCalls?: ToolCall[];
}

export type ProviderConfig = Record<string, string>;

export interface LLMProvider {
  readonly info: ProviderInfo;
  /** Streams assistant deltas. Must yield a final chunk with done=true. */
  chat(config: ProviderConfig, req: ChatRequest): AsyncGenerator<ChatChunk>;
  testConnection(config: ProviderConfig): Promise<{ ok: boolean; error?: string }>;
}
