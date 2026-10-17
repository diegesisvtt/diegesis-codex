// Context-window budgeting for the chat pipeline.
//
// The local models we target (LM Studio, Ollama) expose a fixed context window
// and reject requests that exceed it with an `exceed_context_size_error`. The
// app previously had no token accounting, so a single oversized `read_document`
// result (or a long conversation) could blow past the window. This module adds
// a cheap character-based estimate (~4 chars/token, matching CHUNK_TARGET in
// embedder.ts) and helpers to keep prompts within budget before they hit the wire.

import type { ProviderMessage } from './providers/base';

/** Characters per token heuristic. Mirrors `CHUNK_TARGET` (~1800 chars ≈ 450 tokens). */
const CHARS_PER_TOKEN = 4;

/**
 * Fallback context window when the provider does not declare one.
 * 8192 is the most common default context across local models (Ollama/LM Studio),
 * chosen to be safe rather than optimistic — raise it per-model in settings.
 */
export const DEFAULT_CONTEXT_TOKENS = 8192;

/** Tokens reserved for the model's reply + tool-call arguments. */
export const RESERVE_TOKENS = 2048;

/** Hard cap for any single message payload (tool results, history, etc.). */
export const MAX_MESSAGE_CHARS = 8000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(m: ProviderMessage): number {
  return estimateTokens(m.content ?? '');
}

/** Truncates text to `maxChars`, appending a marker when anything was dropped. */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n…(truncado)';
}

/**
 * Fits a message list into `contextTokens - reserveTokens`.
 *
 * Guarantees API integrity: `system` messages are kept at the front, the last
 * `user` message (the current question) and everything after it (the tool-call
 * exchanges, which must stay paired) are kept intact, and only older history is
 * dropped — newest-first, so the most recent context survives.
 *
 * Returns the input unchanged when it already fits.
 */
export function fitToContext(messages: ProviderMessage[], contextTokens: number, reserveTokens = RESERVE_TOKENS): ProviderMessage[] {
  const budget = Math.max(0, contextTokens - reserveTokens);
  if (budget <= 0) return messages;
  if (messages.reduce((n, m) => n + estimateMessageTokens(m), 0) <= budget) return messages;

  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');

  let lastUserIdx = -1;
  for (let i = rest.length - 1; i >= 0; i--) {
    if (rest[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }
  // No user message to anchor on — trim from the front generically.
  const split = lastUserIdx >= 0 ? lastUserIdx : rest.length;
  const tail = rest.slice(split);
  const prefix = rest.slice(0, split);

  const result: ProviderMessage[] = [...system, ...tail];
  let used = result.reduce((n, m) => n + estimateMessageTokens(m), 0);

  for (let i = prefix.length - 1; i >= 0; i--) {
    const cost = estimateMessageTokens(prefix[i]);
    if (used + cost > budget) break;
    result.splice(system.length, 0, prefix[i]);
    used += cost;
  }

  return result;
}

/** True when an error message is a context-window rejection from the model server. */
export function isContextOverflowError(message: string): boolean {
  return /exceed_context|context_size|exceeds the available context|n_prompt_tokens|n_ctx/i.test(message);
}

export const CONTEXT_OVERFLOW_MESSAGE =
  'O pedido excedeu o tamanho de contexto do modelo. Reduza o documento/pergunta, ' +
  'inicie uma nova conversa ou aumente o "Contexto (tokens)" nas Configurações de IA.';
