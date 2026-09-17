// RAG pipeline: query embedding -> sqlite-vec KNN -> context injection -> streamed chat
// with tool calling (the assistant can manipulate documents in the current realm).

import * as db from '../db';
import { getResolvedChatConfig } from './config';
import { flush } from './embedder';
import { embedQuery } from './local-embedder';
import { getProvider } from './providers/registry';
import { executeTool, REALM_TOOLS } from './tools';
import type { ProviderMessage, ToolCall } from './providers/base';
import type { AIChatRequest, ChatMessage, ChatStreamChunk, RetrievedChunk, SemanticSearchResult } from '../../shared/types';

const TOP_K = 6;
const MIN_SCORE = 0.25; // drop chunks that are clearly irrelevant
const MAX_TOOL_TURNS = 8;

export async function retrieve(realmId: string, query: string, k = TOP_K): Promise<RetrievedChunk[]> {
  // index freshly edited notes before searching
  await flush();
  const vector = await embedQuery(query);
  if (!vector) return [];
  db.ensureEmbedDim(vector.length);
  return db
    .knnChunks(realmId, Float32Array.from(vector), k)
    .filter((c) => c.score >= MIN_SCORE)
    .map((c) => ({ docId: c.docId, title: c.title, type: c.type as RetrievedChunk['type'], text: c.text, score: c.score }));
}

/** Semantic search for the UI palette: embed query + KNN, no relevance floor. */
export async function semanticSearch(realmId: string, query: string): Promise<SemanticSearchResult[]> {
  await flush(); // index pending edits before searching
  const vector = await embedQuery(query);
  if (!vector) return [];
  db.ensureEmbedDim(vector.length);
  return db.knnSearch(realmId, Float32Array.from(vector), 12);
}

function buildSystemPrompt(realmId: string | null, chunks: RetrievedChunk[] | null, indexEmpty: boolean): string {
  const parts: string[] = [
    'Você é o assistente do Mythril, um estúdio de worldbuilding. Responda no idioma do usuário.',
  ];

  if (chunks && chunks.length > 0) {
    const body = chunks.map((c, i) => `[${i + 1}] "${c.title}"\n${c.text}`).join('\n\n---\n\n');
    parts.push(
      'REGRA ABSOLUTA: responda ESTRITAMENTE com base nos trechos das notas do usuário abaixo. ' +
        'NÃO use conhecimento externo, suposições ou informações que não estejam nos trechos. ' +
        'Se a resposta não estiver nos trechos, diga explicitamente que não encontrou essa informação ' +
        'nas notas — nunca invente.\n\n' +
        'Ao usar uma informação, cite a fonte como [n] com o título do documento.\n\n' +
        'TRECHOS DAS NOTAS:\n\n' + body
    );
  } else if (indexEmpty) {
    parts.push(
      'O índice de busca das notas está VAZIO (nenhuma nota foi indexada ainda). ' +
        'Se a mensagem for uma pergunta sobre as notas/universo, explique que as notas ' +
        'ainda estão sendo indexadas (o modelo local pode estar sendo baixado na primeira ' +
        'execução) e sugira acompanhar o status nas Configurações de IA.'
    );
  } else {
    parts.push(
      'Nenhum trecho das notas do usuário corresponde a esta mensagem.\n\n' +
        '- Se for uma pergunta sobre o universo, personagens, locais ou tramas: diga que ' +
        'não encontrou essa informação nas notas. NÃO invente fatos sobre o universo.\n' +
        '- Se for conversa casual (saudação, agradecimento, pedido genérico): responda ' +
        'normalmente e de forma breve.'
    );
  }

  if (realmId) {
    parts.push(
      'Você tem ferramentas para manipular as notas e pastas DESTE universo: listar, ler, criar, ' +
        'atualizar, mover, excluir documentos e buscar semanticamente. Regras:\n' +
        '- Use list_documents para descobrir ids antes de ler/editar/mover/excluir.\n' +
        '- Nunca exclua sem confirmação explícita do usuário.\n' +
        '- Conteúdo de notas é escrito em markdown simples (# título, - lista, > citação).\n' +
        '- Após executar ações, resuma o que foi feito.'
    );
  }

  return parts.join('\n\n');
}

export interface ChatCallbacks {
  onChunk(chunk: ChatStreamChunk): void;
  onSources(chatId: string, sources: RetrievedChunk[]): void;
  onTool(chatId: string, summary: string, ok: boolean): void;
}

export async function streamChat(req: AIChatRequest, cb: ChatCallbacks, signal?: AbortSignal): Promise<void> {
  const send = (delta: string, done: boolean, error?: string) =>
    cb.onChunk({ chatId: req.chatId, delta, done, error });

  try {
    const cfg = getResolvedChatConfig();
    if (!cfg) throw new Error('Configure um provider de chat nas configurações de IA.');
    const provider = getProvider(cfg.providerId);
    if (!provider) throw new Error(`Provider desconhecido: ${cfg.providerId}`);

    // conversation is authoritative for the realm (chat is realm-scoped)
    const conversation = db.getConversation(req.conversationId);
    if (!conversation) throw new Error('Conversa não encontrada.');
    const realmId = conversation.realmId;

    // persist the new user message and auto-title the conversation
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      db.addChatMessage(conversation.id, 'user', lastUser.content);
      db.touchConversation(conversation.id, lastUser.content);
    }

    let sources: RetrievedChunk[] = [];
    let indexEmpty = false;

    if (req.useContext && lastUser) {
      try {
        sources = await retrieve(realmId, lastUser.content);
        indexEmpty = sources.length === 0 && db.chunkStats().embeddedCount === 0;
      } catch (err) {
        // surface the failure — a silent fallback makes every answer "not found"
        const msg = err instanceof Error ? err.message : String(err);
        send(
          `Erro ao buscar contexto nas notas: ${msg}\n\nO modelo de embeddings local pode estar sendo baixado — veja o status nas Configurações de IA (ou desative "Contexto do universo" para conversar sem busca).`,
          true
        );
        return;
      }
      if (sources.length > 0) cb.onSources(req.chatId, sources);
    }

    const working: ProviderMessage[] = [
      { role: 'system', content: buildSystemPrompt(realmId, req.useContext ? sources : null, indexEmpty) },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // tool-calling loop: stream turns; when the model requests tools, execute and continue
    let fullText = '';
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      if (signal?.aborted) break;
      let turnText = '';
      let toolCalls: ToolCall[] | undefined;

      for await (const chunk of provider.chat(cfg.config, { messages: working, tools: REALM_TOOLS, signal })) {
        if (chunk.done) {
          toolCalls = chunk.toolCalls;
          break;
        }
        turnText += chunk.delta;
        send(chunk.delta, false);
      }
      fullText += turnText;

      if (!toolCalls || toolCalls.length === 0) break;

      working.push({ role: 'assistant', content: turnText, toolCalls });
      for (const call of toolCalls) {
        const { result, summary, ok } = await executeTool(call, realmId, async (query) => {
          const chunks = await retrieve(realmId, query, 5);
          return chunks.map((c) => ({ docId: c.docId, title: c.title, text: c.text.slice(0, 500), score: c.score }));
        });
        cb.onTool(req.chatId, summary, ok);
        working.push({ role: 'tool', toolCallId: call.id, content: result });
      }
    }

    if (fullText.trim()) {
      db.addChatMessage(conversation.id, 'assistant', fullText, sources.length ? sources : undefined);
    }
    send('', true);
  } catch (err) {
    send('', true, err instanceof Error ? err.message : String(err));
  }
}
