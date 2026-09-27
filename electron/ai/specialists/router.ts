// Intent router: a single cheap LLM call decides whether a message is regular
// chat (existing RAG pipeline) or a generation request — and which specialist
// task it maps to. Runs before the main pipeline in streamChat.

import type { ChatMessage } from '../../../shared/types';
import type { ToolSpec } from '../providers/base';
import type { LLMHandle } from './base';

export type GenerationTask =
  | 'names'
  | 'npc'
  | 'encounter'
  | 'narrative'
  | 'demon'
  | 'dialogue'
  | 'plot'
  | 'combat'
  | 'adventure';

export interface RouteDecision {
  mode: 'chat' | 'generate';
  task?: GenerationTask;
  /** restated, self-contained version of what to generate */
  resumo?: string;
}

const ROUTE_TOOL: ToolSpec = {
  name: 'route',
  description: 'Classifica a mensagem do usuário e decide o fluxo.',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['chat', 'generate'],
        description:
          '"generate" quando o usuário pede para CRIAR conteúdo novo de RPG (nomes, NPC, monstro, encontro, descrição, aventura); "chat" para todo o resto',
      },
      task: {
        type: 'string',
        enum: ['names', 'npc', 'encounter', 'narrative', 'demon', 'dialogue', 'plot', 'combat', 'adventure'],
        description:
          'obrigatório quando mode=generate. "adventure" para aventuras de RPG completas, jogáveis, ' +
          'com cenas/NPCs/encontros, ou pedidos multi-parte; "plot" para o esqueleto estrutural de uma ' +
          'trama (desejo, obstáculo, arco) sem detalhar cenas; "demon" para descrever demônios/criaturas ' +
          'infernais; "dialogue" para cenas de diálogo entre personagens; "combat" para cenas de combate; ' +
          'os demais para peças isoladas',
      },
      resumo: {
        type: 'string',
        description:
          'reformulação autocontida do que deve ser gerado, incluindo detalhes do pedido e respostas anteriores do usuário na conversa',
      },
    },
    required: ['mode'],
    additionalProperties: false,
  },
};

const VALID_TASKS: GenerationTask[] = [
  'names',
  'npc',
  'encounter',
  'narrative',
  'demon',
  'dialogue',
  'plot',
  'combat',
  'adventure',
];

/**
 * Classifies the conversation. Fails open to { mode: 'chat' } so a router
 * error never breaks the existing chat pipeline.
 */
export async function routeGeneration(
  llm: LLMHandle,
  messages: ChatMessage[],
  signal?: AbortSignal
): Promise<RouteDecision> {
  const history = messages
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content.slice(0, 600)}`)
    .join('\n');

  try {
    let toolCalls: import('../providers/base').ToolCall[] = [];
    for await (const chunk of llm.provider.chat(llm.config, {
      messages: [
        {
          role: 'system',
          content:
            'Você é o roteador do Mythril, um estúdio de worldbuilding de RPG. Classifique a ÚLTIMA mensagem ' +
            'do usuário (no contexto da conversa) chamando a ferramenta route.\n\n' +
            '- mode="generate": o usuário pede para criar/inventar/gerar conteúdo novo — nomes, NPCs, monstros, ' +
            'demônios, diálogos entre personagens, tramas/plots, cenas de combate, encontros, descrições de ' +
            'cenas/locais, ou uma aventura inteira. ' +
            'Perguntas sobre as notas, pedidos ' +
            'de busca, edição de documentos e conversa casual são mode="chat".\n' +
            '- Se a mensagem anterior do assistente foi uma pergunta de refinamento sobre uma criação e o usuário ' +
            'está respondendo, continue em mode="generate" e incorpore a resposta no resumo.\n' +
            '- Na dúvida, mode="chat".',
        },
        { role: 'user', content: `Conversa:\n${history}` },
      ],
      tools: [ROUTE_TOOL],
      toolChoice: 'route',
      temperature: 0,
      signal,
    })) {
      if (chunk.done) {
        toolCalls = chunk.toolCalls ?? [];
        break;
      }
    }

    const call = toolCalls.find((c) => c.name === 'route');
    if (!call?.arguments) return { mode: 'chat' };
    const parsed = JSON.parse(call.arguments) as { mode?: string; task?: string; resumo?: string };
    if (parsed.mode !== 'generate' || !parsed.task || !VALID_TASKS.includes(parsed.task as GenerationTask)) {
      return { mode: 'chat' };
    }
    return {
      mode: 'generate',
      task: parsed.task as GenerationTask,
      resumo: typeof parsed.resumo === 'string' && parsed.resumo.trim() ? parsed.resumo.trim() : undefined,
    };
  } catch (err) {
    // a user cancel must propagate; classification failures fail open to chat
    if (signal?.aborted) throw err;
    return { mode: 'chat' };
  }
}
