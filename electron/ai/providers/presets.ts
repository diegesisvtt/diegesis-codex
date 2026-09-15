// Pre-configured chat providers built on the generic OpenAI-compatible implementation.

import { createOpenAICompatProvider } from './openai-compat';
import type { LLMProvider } from './base';

export const ollamaProvider: LLMProvider = createOpenAICompatProvider({
  id: 'ollama',
  name: 'Ollama (local)',
  description: 'Modelos locais via Ollama (http://127.0.0.1:11434). Sem API key.',
  fields: [
    { key: 'baseUrl', label: 'Base URL', type: 'text', default: 'http://127.0.0.1:11434/v1', required: true },
    { key: 'chatModel', label: 'Modelo de chat', type: 'text', placeholder: 'llama3.1', required: true },
  ],
});

export const openaiProvider: LLMProvider = createOpenAICompatProvider({
  id: 'openai',
  name: 'OpenAI',
  description: 'API oficial da OpenAI.',
  fields: [
    { key: 'baseUrl', label: 'Base URL', type: 'text', default: 'https://api.openai.com/v1', required: true },
    { key: 'apiKey', label: 'API Key', type: 'password', secret: true, placeholder: 'sk-…', required: true },
    { key: 'chatModel', label: 'Modelo de chat', type: 'text', default: 'gpt-4o-mini', required: true },
  ],
});

export const lmstudioProvider: LLMProvider = createOpenAICompatProvider({
  id: 'lmstudio',
  name: 'LM Studio (local)',
  description: 'Servidor local do LM Studio. Sem API key.',
  fields: [
    { key: 'baseUrl', label: 'Base URL', type: 'text', default: 'http://127.0.0.1:1234/v1', required: true },
    { key: 'chatModel', label: 'Modelo de chat', type: 'text', required: true },
  ],
});

export const genericProvider: LLMProvider = createOpenAICompatProvider({ id: 'openai-compat' });
