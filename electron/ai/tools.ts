// Tools the assistant can call to manipulate documents/folders inside a realm.
// Every mutation is validated and scoped to the conversation's realm, and emits
// docEvents so the renderer refreshes.

import * as db from '../db';
import { docEvents } from './events';
import { generateId } from '../db';
import { getResolvedSearchConfig } from './config';
import { runWebSearch } from './websearch';
import { markdownToBlocks } from '../../shared/blockContent';
import type { DocNode } from '../../shared/types';
import type { ToolCall, ToolSpec } from './providers/base';

// ---------- tool definitions ----------

export const REALM_TOOLS: ToolSpec[] = [
  {
    name: 'list_documents',
    description: 'Lista todos os documentos e pastas do universo atual, com id, título, tipo e hierarquia.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_document',
    description: 'Lê o conteúdo completo (texto) de um documento pelo id.',
    parameters: {
      type: 'object',
      properties: { docId: { type: 'string', description: 'id do documento' } },
      required: ['docId'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_document',
    description:
      'Cria uma nota ou pasta no universo. O conteúdo usa markdown simples (# título, - lista, > citação, parágrafos).',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['note', 'folder'] },
        title: { type: 'string' },
        parentId: { type: 'string', description: 'id da pasta/documento pai; omita para criar na raiz' },
        content: { type: 'string', description: 'conteúdo em markdown (apenas para notas)' },
      },
      required: ['type', 'title'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_document',
    description: 'Atualiza o título e/ou substitui todo o conteúdo de uma nota (markdown simples).',
    parameters: {
      type: 'object',
      properties: {
        docId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string', description: 'novo conteúdo completo em markdown' },
      },
      required: ['docId'],
      additionalProperties: false,
    },
  },
  {
    name: 'move_document',
    description: 'Move um documento/pasta para outra pasta (ou para a raiz se parentId for omitido).',
    parameters: {
      type: 'object',
      properties: {
        docId: { type: 'string' },
        parentId: { type: 'string', description: 'id do novo pai; omita para mover para a raiz' },
      },
      required: ['docId'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_document',
    description: 'Exclui um documento/pasta e todo o seu conteúdo filho. Destrutivo — confirme com o usuário antes.',
    parameters: {
      type: 'object',
      properties: { docId: { type: 'string' } },
      required: ['docId'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_notes',
    description: 'Busca semântica nas notas do universo. Retorna os trechos mais relevantes para a consulta.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

// ---------- execution ----------

/** Web search tool — only offered when the user enables "Busca na web". */
export const WEB_SEARCH_TOOL: ToolSpec = {
  name: 'web_search',
  description:
    'Busca na web por informações atuais ou externas ao universo. Retorna títulos, URLs e trechos.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'consulta de busca' } },
    required: ['query'],
    additionalProperties: false,
  },
};

const MAX_TITLE = 200;
const MAX_CONTENT = 100_000;

function docInRealm(docId: string, realmId: string): DocNode | null {
  const doc = db.listDocs(realmId).find((d) => d.id === docId);
  return doc ?? null;
}

/**
 * Executes a tool call scoped to a realm. Returns the JSON string sent back to the
 * model, plus a human-readable summary for the UI.
 */
export async function executeTool(
  call: ToolCall,
  realmId: string,
  semanticSearch: (query: string) => Promise<unknown>
): Promise<{ result: string; summary: string; ok: boolean }> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments || '{}');
  } catch {
    return { result: JSON.stringify({ error: 'argumentos inválidos (JSON malformado)' }), summary: 'Argumentos inválidos', ok: false };
  }

  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : undefined);

  try {
    switch (call.name) {
      case 'list_documents': {
        const docs = db.listDocs(realmId).map((d) => ({
          id: d.id,
          title: d.title,
          type:
            d.type === 'core/folder'
              ? 'folder'
              : d.type === 'core/whiteboard'
                ? 'whiteboard'
                : d.type === 'core/pdf'
                  ? 'pdf'
                  : d.type === 'hexcrawl/map'
                    ? 'hexmap'
                    : d.type === 'mythril/timeline'
                      ? 'timeline'
                      : 'note',
          parentId: d.parentId,
        }));
        return { result: JSON.stringify({ documents: docs }), summary: 'Listou os documentos', ok: true };
      }

      case 'read_document': {
        const doc = str('docId') && docInRealm(str('docId')!, realmId);
        if (!doc) return { result: JSON.stringify({ error: 'documento não encontrado neste universo' }), summary: 'Documento não encontrado', ok: false };
        // PDFs: include the extracted page text, not just the annotation JSON
        const text =
          doc.type === 'core/pdf'
            ? (db.getDocForChunking(doc.id)?.text ?? '')
            : db.extractPlainText(doc.content);
        return {
          result: JSON.stringify({ id: doc.id, title: doc.title, content: text }),
          summary: `Leu "${doc.title}"`,
          ok: true,
        };
      }

      case 'create_document': {
        const type = str('type');
        const title = str('title')?.slice(0, MAX_TITLE);
        if (!type || !['note', 'folder'].includes(type) || !title) {
          return { result: JSON.stringify({ error: 'type (note|folder) e title são obrigatórios' }), summary: 'Criação inválida', ok: false };
        }
        const parentId = str('parentId');
        if (parentId && !docInRealm(parentId, realmId)) {
          return { result: JSON.stringify({ error: 'parentId não existe neste universo' }), summary: 'Pasta pai não encontrada', ok: false };
        }
        const content =
          type === 'note'
            ? markdownToBlocks((str('content') ?? '').slice(0, MAX_CONTENT))
            : null;
        const doc = db.createDoc({
          id: generateId(),
          realmId,
          parentId: parentId ?? null,
          type: type === 'folder' ? 'core/folder' : 'core/note',
          title,
          content,
        });
        docEvents.emit('changed', realmId);
        return {
          result: JSON.stringify({ id: doc.id, title: doc.title }),
          summary: `Criou ${type === 'folder' ? 'a pasta' : 'a nota'} "${title}"`,
          ok: true,
        };
      }

      case 'update_document': {
        const doc = str('docId') && docInRealm(str('docId')!, realmId);
        if (!doc) return { result: JSON.stringify({ error: 'documento não encontrado neste universo' }), summary: 'Documento não encontrado', ok: false };
        const changes: { title?: string; content?: string } = {};
        const title = str('title');
        const content = str('content');
        if (title) changes.title = title.slice(0, MAX_TITLE);
        if (content !== undefined) {
          if (doc.type !== 'core/note') return { result: JSON.stringify({ error: 'só notas têm conteúdo editável' }), summary: 'Tipo não editável', ok: false };
          changes.content = markdownToBlocks(content.slice(0, MAX_CONTENT));
        }
        if (Object.keys(changes).length === 0) {
          return { result: JSON.stringify({ error: 'informe title e/ou content' }), summary: 'Nada para atualizar', ok: false };
        }
        db.updateDoc(doc.id, changes);
        docEvents.emit('changed', realmId);
        return { result: JSON.stringify({ id: doc.id, updated: Object.keys(changes) }), summary: `Atualizou "${changes.title ?? doc.title}"`, ok: true };
      }

      case 'move_document': {
        const doc = str('docId') && docInRealm(str('docId')!, realmId);
        if (!doc) return { result: JSON.stringify({ error: 'documento não encontrado neste universo' }), summary: 'Documento não encontrado', ok: false };
        const parentId = str('parentId') ?? null;
        if (parentId === doc.id) return { result: JSON.stringify({ error: 'um documento não pode ser pai de si mesmo' }), summary: 'Movimento inválido', ok: false };
        if (parentId && !docInRealm(parentId, realmId)) {
          return { result: JSON.stringify({ error: 'parentId não existe neste universo' }), summary: 'Pasta pai não encontrada', ok: false };
        }
        db.moveDoc(doc.id, parentId, 0);
        docEvents.emit('changed', realmId);
        return { result: JSON.stringify({ id: doc.id, parentId }), summary: `Moveu "${doc.title}"`, ok: true };
      }

      case 'delete_document': {
        const doc = str('docId') && docInRealm(str('docId')!, realmId);
        if (!doc) return { result: JSON.stringify({ error: 'documento não encontrado neste universo' }), summary: 'Documento não encontrado', ok: false };
        db.deleteDoc(doc.id);
        docEvents.emit('changed', realmId);
        return { result: JSON.stringify({ id: doc.id, deleted: true }), summary: `Excluiu "${doc.title}"`, ok: true };
      }

      case 'search_notes': {
        const query = str('query');
        if (!query) return { result: JSON.stringify({ error: 'query é obrigatória' }), summary: 'Busca inválida', ok: false };
        const results = await semanticSearch(query);
        return { result: JSON.stringify({ results }), summary: `Buscou por "${query.slice(0, 40)}"`, ok: true };
      }

      case 'web_search': {
        const query = str('query');
        if (!query) return { result: JSON.stringify({ error: 'query é obrigatória' }), summary: 'Busca inválida', ok: false };
        try {
          const results = await runWebSearch(query, getResolvedSearchConfig());
          return {
            result: JSON.stringify({ results }),
            summary: `Buscou na web por "${query.slice(0, 40)}"`,
            ok: true,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            result: JSON.stringify({ error: `falha na busca web: ${msg}` }),
            summary: 'Busca na web falhou',
            ok: false,
          };
        }
      }

      default:
        return { result: JSON.stringify({ error: `ferramenta desconhecida: ${call.name}` }), summary: 'Ferramenta desconhecida', ok: false };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { result: JSON.stringify({ error: msg }), summary: `Erro em ${call.name}`, ok: false };
  }
}
