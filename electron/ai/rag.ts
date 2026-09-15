// RAG pipeline: query embedding -> sqlite-vec KNN -> context injection -> streamed chat.

import * as db from '../db';
import { getResolvedChatConfig } from './config';
import { flush } from './embedder';
import { embedQuery } from './local-embedder';
import { getProvider } from './providers/registry';
import type { AIChatRequest, ChatMessage, ChatStreamChunk, RetrievedChunk, SemanticSearchResult } from '../../shared/types';

const TOP_K = 6;
const MIN_SCORE = 0.25; // drop chunks that are clearly irrelevant

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

function buildContextMessage(chunks: RetrievedChunk[]): ChatMessage {
  const body = chunks
    .map((c, i) => `[${i + 1}] "${c.title}"\n${c.text}`)
    .join('\n\n---\n\n');
  return {
    role: 'system',
    content:
      'Você é o assistente do Mythril, um estúdio de worldbuilding. Responda no idioma do usuário.\n\n' +
      'REGRA ABSOLUTA: responda ESTRITAMENTE com base nos trechos das notas do usuário abaixo. ' +
      'NÃO use conhecimento externo, suposições ou informações que não estejam nos trechos. ' +
      'Se a resposta não estiver nos trechos, diga explicitamente que não encontrou essa informação ' +
      'nas notas — nunca invente.\n\n' +
      'Ao usar uma informação, cite a fonte como [n] com o título do documento.\n\n' +
      'TRECHOS DAS NOTAS:\n\n' + body,
  };
}

/** Semantic search for the UI palette: embed query + KNN, no relevance floor. */
export async function semanticSearch(realmId: string, query: string): Promise<SemanticSearchResult[]> {
  await flush(); // index pending edits before searching
  const vector = await embedQuery(query);
  if (!vector) return [];
  db.ensureEmbedDim(vector.length);
  return db.knnSearch(realmId, Float32Array.from(vector), 12);
}

export interface ChatCallbacks {  onChunk(chunk: ChatStreamChunk): void;
  onSources(chatId: string, sources: RetrievedChunk[]): void;
}

export async function streamChat(req: AIChatRequest, cb: ChatCallbacks): Promise<void> {
  const send = (delta: string, done: boolean, error?: string) =>
    cb.onChunk({ chatId: req.chatId, delta, done, error });

  try {
    const cfg = getResolvedChatConfig();
    if (!cfg) throw new Error('Configure um provider de chat nas configurações de IA.');
    const provider = getProvider(cfg.providerId);
    if (!provider) throw new Error(`Provider desconhecido: ${cfg.providerId}`);

    const messages: ChatMessage[] = [...req.messages];

    if (req.useContext && req.realmId) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUser) {
        let sources: RetrievedChunk[] = [];
        try {
          sources = await retrieve(req.realmId, lastUser.content);
        } catch (err) {
          // surface the failure — a silent fallback makes every answer "not found"
          const msg = err instanceof Error ? err.message : String(err);
          send(
            `Erro ao buscar contexto nas notas: ${msg}\n\nO modelo de embeddings local pode estar sendo baixado — veja o status nas Configurações de IA (ou desative "Contexto do universo" para conversar sem busca).`,
            true
          );
          return;
        }
        if (sources.length > 0) {
          cb.onSources(req.chatId, sources);
          messages.unshift(buildContextMessage(sources));
        } else {
          // no matching excerpts: strict about universe facts, but casual conversation
          // ("oi", "obrigado") should still get a normal reply
          const indexEmpty = db.chunkStats().embeddedCount === 0;
          messages.unshift({
            role: 'system',
            content:
              'Você é o assistente do Mythril. Responda no idioma do usuário.\n\n' +
              (indexEmpty
                ? 'O índice de busca das notas está VAZIO (nenhuma nota foi indexada ainda). ' +
                  'Se a mensagem for uma pergunta sobre as notas/universo, explique que as notas ' +
                  'ainda estão sendo indexadas (o modelo local pode estar sendo baixado na primeira ' +
                  'execução) e sugira acompanhar o status nas Configurações de IA.\n'
                : 'Nenhum trecho das notas do usuário corresponde a esta mensagem.\n\n' +
                  '- Se for uma pergunta sobre o universo, personagens, locais ou tramas: diga que ' +
                  'não encontrou essa informação nas notas. NÃO invente fatos sobre o universo.\n') +
              '- Se for conversa casual (saudação, agradecimento, pedido genérico): responda ' +
              'normalmente e de forma breve.',
          });
        }
      }
    }

    for await (const chunk of provider.chat(cfg.config, { messages })) {
      if (chunk.done) break;
      send(chunk.delta, false);
    }
    send('', true);
  } catch (err) {
    send('', true, err instanceof Error ? err.message : String(err));
  }
}
