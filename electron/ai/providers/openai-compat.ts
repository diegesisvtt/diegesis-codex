// Generic OpenAI-compatible chat provider. Covers OpenAI, LM Studio, vLLM, OpenRouter,
// Groq, Ollama (/v1), and any server exposing /v1/chat/completions.

import type { ChatRequest, ChatChunk, LLMProvider, ProviderConfig } from './base';
import type { ProviderInfo } from '../../../shared/types';

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function headers(config: ProviderConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) h['Authorization'] = `Bearer ${config.apiKey}`;
  return h;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.text();
    return `HTTP ${res.status}: ${body.slice(0, 300)}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Parses an SSE stream, tolerant to CRLF and multi-line data events. */
async function* parseSSE(res: Response): AsyncGenerator<any> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // normalize on the whole buffer so CRLF pairs split across chunks still match
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        // spec: multiple data: lines in one event are joined with '\n'
        const data = event
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).replace(/^ /, ''))
          .join('\n');
        if (!data) continue;
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data);
        } catch {
          /* partial/keep-alive lines */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function createOpenAICompatProvider(overrides: Partial<ProviderInfo> & { id: string }): LLMProvider {
  const info: ProviderInfo = {
    name: 'OpenAI-compatible',
    description: 'Qualquer endpoint compatível com a API da OpenAI (OpenAI, LM Studio, vLLM, OpenRouter…)',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.openai.com/v1', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', secret: true, placeholder: 'sk-…' },
      { key: 'chatModel', label: 'Modelo de chat', type: 'text', placeholder: 'gpt-4o-mini', required: true },
    ],
    ...overrides,
  };

  return {
    info,

    async *chat(config: ProviderConfig, req: ChatRequest): AsyncGenerator<ChatChunk> {
      const model = req.model ?? config.chatModel;
      if (!config.baseUrl || !model) throw new Error('Provider de chat não configurado (baseUrl/modelo ausentes).');

      const res = await fetch(joinUrl(config.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: headers(config),
        signal: req.signal ?? null,
        body: JSON.stringify({
          model,
          stream: true,
          messages: req.messages.map((m) => {
            const msg: Record<string, unknown> = { role: m.role, content: m.content };
            if (m.role === 'tool' && m.toolCallId) msg.tool_call_id = m.toolCallId;
            if (m.role === 'assistant' && m.toolCalls?.length) {
              msg.tool_calls = m.toolCalls.map((t) => ({
                id: t.id,
                type: 'function',
                function: { name: t.name, arguments: t.arguments },
              }));
            }
            return msg;
          }),
          ...(req.tools?.length
            ? {
                tools: req.tools.map((t) => ({
                  type: 'function',
                  function: { name: t.name, description: t.description, parameters: t.parameters },
                })),
                tool_choice: 'auto',
              }
            : {}),
        }),
      });
      if (!res.ok || !res.body) throw new Error(await readError(res));

      // tool call fragments arrive indexed; accumulate until the stream ends
      const pendingCalls = new Map<number, { id: string; name: string; arguments: string }>();
      try {
        for await (const payload of parseSSE(res)) {
          const delta = payload?.choices?.[0]?.delta;
          const text: string = delta?.content ?? '';
          if (text) yield { delta: text, done: false };
          for (const tc of delta?.tool_calls ?? []) {
            const idx: number = tc.index ?? 0;
            const cur = pendingCalls.get(idx) ?? { id: '', name: '', arguments: '' };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.arguments += tc.function.arguments;
            pendingCalls.set(idx, cur);
          }
        }
      } catch (err) {
        // aborted by the user: end the turn gracefully with whatever was streamed
        if (req.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
          yield { delta: '', done: true };
          return;
        }
        throw err;
      }
      const toolCalls = [...pendingCalls.values()].filter((t) => t.name);
      yield { delta: '', done: true, ...(toolCalls.length ? { toolCalls } : {}) };
    },

    async testConnection(config: ProviderConfig): Promise<{ ok: boolean; error?: string }> {
      if (!config.baseUrl) return { ok: false, error: 'Base URL ausente' };
      try {
        const res = await fetch(joinUrl(config.baseUrl, '/models'), { headers: headers(config) });
        if (!res.ok) return { ok: false, error: await readError(res) };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
