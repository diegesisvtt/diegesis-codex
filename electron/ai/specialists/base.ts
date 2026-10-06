// Specialist contract + shared execution machinery.
// Adding a specialist = one file in this folder + one line in registry.ts.
//
// Specialists never stream free text: they answer via a forced `submit_result`
// tool call whose JSON Schema is the specialist's output contract. Providers
// without tool support fall back to a ```json block in the text.

import type { LLMProvider, ProviderConfig, ProviderMessage, ToolCall, ToolSpec } from '../providers/base';
import type { RetrievedChunk } from '../../../shared/types';
import type { AdventureStructure, Encounter, Npc, Premise } from './schemas';

export type SpecialistId =
  | 'premise'
  | 'adventure-structure'
  | 'names'
  | 'narrative'
  | 'npc'
  | 'encounter'
  | 'critic'
  | 'pain'
  | 'demon'
  | 'dialogue'
  | 'plot'
  | 'combat'
  | 'villain'
  | 'motivation'
  | 'body-language'
  | 'world'
  | 'society'
  | 'creature'
  | 'inner-story'
  | 'history'
  | 'character'
  | 'city'
  | 'titles'
  | 'romance'
  | 'scenery'
  | 'scene'
  | 'speech'
  | 'opening'
  | 'religion'
  | 'magic'
  | 'army'
  | 'campaign-start'
  | 'mood'
  | 'quest'
  | 'location'
  | 'dungeon'
  | 'table-extract'
  | 'sheet-effect';

/** A ready-to-call model: provider + resolved config. */
export interface LLMHandle {
  provider: LLMProvider;
  config: ProviderConfig;
}

/** Everything a specialist produced so far in this pipeline run. */
export interface Dossier {
  premissa?: Premise;
  estrutura?: AdventureStructure;
  npcs: Npc[];
  encontros: Encounter[];
  /** every name already used, for consistency and anti-repetition */
  nomesUsados: string[];
}

export function emptyDossier(): Dossier {
  return { npcs: [], encontros: [], nomesUsados: [] };
}

export interface SpecialistContext {
  realmId: string;
  /** canon: chunks retrieved from the realm's notes (RAG). May be empty. */
  canon: RetrievedChunk[];
  dossier: Dossier;
}

export interface Specialist<I, O> {
  id: SpecialistId;
  /** shown to the router classifier so it can pick this specialist */
  description: string;
  temperature: number;
  /** generation cap; structured outputs must not be truncated */
  maxTokens?: number;
  /** JSON Schema of the output, sent as the submit_result tool parameters */
  schema: Record<string, unknown>;
  buildPrompt(input: I, ctx: SpecialistContext): ProviderMessage[];
  /** validates the parsed JSON value; throws with a useful message on failure */
  parse(value: unknown): O;
}

// ---------- context injection ----------

/** Renders canon + dossier as a prompt section. Every specialist gets this. */
export function contextBlock(ctx: SpecialistContext): string {
  const parts: string[] = [];

  if (ctx.canon.length > 0) {
    const body = ctx.canon.map((c, i) => `[${i + 1}] "${c.title}"\n${c.text}`).join('\n\n---\n\n');
    parts.push(
      'CÂNONE DO UNIVERSO (trechos das notas do usuário — respeite nomes, culturas, ' +
        'fatos e tom já estabelecidos; nunca contradiga o cânone):\n\n' + body
    );
  }

  const d = ctx.dossier;
  const lines: string[] = [];
  if (d.premissa) {
    lines.push(
      `Premissa: tema "${d.premissa.tema}", tom ${d.premissa.tom}, escopo: ${d.premissa.escopo}, ` +
        `ameaça ${d.premissa.nivelAmeaca}, duração ${d.premissa.duracaoEstimada}.`
    );
  }
  if (d.estrutura) {
    lines.push(
      `Aventura "${d.estrutura.titulo}" (tema: ${d.estrutura.tema}). Cenas: ` +
        d.estrutura.cenas.map((c) => `${c.nome} (${c.local})`).join('; ') +
        `. Clímax: ${d.estrutura.climax}`
    );
  }
  if (d.npcs.length > 0) {
    lines.push('NPCs já criados: ' + d.npcs.map((n) => `${n.nome} — ${n.conceito}`).join('; '));
  }
  if (d.encontros.length > 0) {
    lines.push(
      'Encontros já criados: ' +
        d.encontros.map((e) => e.monstros.map((m) => m.nome).join(', ')).join(' | ')
    );
  }
  if (d.nomesUsados.length > 0) {
    lines.push(`Nomes já usados (não repita, mantenha o mesmo estilo): ${d.nomesUsados.join(', ')}`);
  }
  if (lines.length > 0) {
    parts.push('DOSSIÊ DA AVENTURA ATÉ AGORA (mantenha coerência com estas peças):\n' + lines.join('\n'));
  }

  return parts.join('\n\n');
}

// ---------- execution ----------

const SUBMIT_TOOL_NAME = 'submit_result';

function submitTool(spec: Specialist<unknown, unknown>): ToolSpec {
  return {
    name: SUBMIT_TOOL_NAME,
    description: 'Envia o resultado final, estruturado exatamente conforme o schema.',
    parameters: spec.schema,
  };
}

/** Collects a full (non-streamed) response from the provider. */
async function complete(
  llm: LLMHandle,
  req: Parameters<LLMProvider['chat']>[1]
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  let text = '';
  let toolCalls: ToolCall[] = [];
  for await (const chunk of llm.provider.chat(llm.config, req)) {
    if (chunk.done) {
      toolCalls = chunk.toolCalls ?? [];
      break;
    }
    text += chunk.delta;
  }
  return { text, toolCalls };
}

/** Extracts a JSON object from free text: ```json fence or the outermost {...}. */
function extractJson(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/**
 * Tolerant JSON parse for LLM output. Repairs the two most common model
 * mistakes: trailing commas and raw control characters inside strings.
 */
function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    /* try repaired version */
  }

  // escape raw control characters that appear inside string literals
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString && (ch === '\n' || ch === '\r' || ch === '\t')) {
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : '\\t';
      continue;
    }
    out += ch;
  }
  // drop trailing commas before } or ]
  out = out.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(out);
}

/**
 * Runs a specialist: builds the prompt, forces a submit_result call, validates
 * the JSON. One retry with the validation error fed back to the model.
 *
 * Providers that reject tool parameters (older Ollama/LM Studio builds answer
 * HTTP 400) degrade to a ```json-only prompt, parsed via extractJson.
 */
export async function runSpecialist<I, O>(
  spec: Specialist<I, O>,
  input: I,
  ctx: SpecialistContext,
  llm: LLMHandle,
  signal?: AbortSignal
): Promise<O> {
  let lastError = 'o modelo não retornou resultado estruturado';
  let lastRaw: string | null = null;
  let noTools = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error('Geração cancelada.');

    const messages = spec.buildPrompt(input, ctx);
    if (attempt > 0) {
      messages.push({
        role: 'user',
        content:
          `Sua resposta anterior foi rejeitada: ${lastError}. ` +
          (lastRaw ? `Resposta inválida enviada (trecho): ${lastRaw.slice(0, 1000)}\n` : '') +
          (noTools
            ? 'Responda APENAS com um bloco ```json válido, seguindo o schema à risca.'
            : `Responda novamente chamando a ferramenta ${SUBMIT_TOOL_NAME} com JSON válido, seguindo o schema à risca.`),
      });
    }
    if (noTools) {
      messages.push({
        role: 'user',
        content:
          'IMPORTANTE: responda APENAS com um bloco ```json contendo o resultado, ' +
          'sem texto antes ou depois, seguindo exatamente o schema pedido.',
      });
    }

    let text = '';
    let toolCalls: ToolCall[] = [];
    try {
      const res = await complete(llm, {
        messages,
        ...(noTools
          ? {}
          : { tools: [submitTool(spec as Specialist<unknown, unknown>)], toolChoice: SUBMIT_TOOL_NAME }),
        temperature: spec.temperature,
        maxTokens: spec.maxTokens,
        signal,
      });
      text = res.text;
      toolCalls = res.toolCalls;
    } catch (err) {
      if (signal?.aborted) throw err;
      // transport/HTTP error: the server may not support tools — degrade and retry
      if (!noTools) {
        noTools = true;
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
      throw err;
    }

    const call = toolCalls.find((c) => c.name === SUBMIT_TOOL_NAME);
    const raw = call?.arguments ?? extractJson(text);
    if (!raw) {
      lastRaw = text || null;
      lastError = 'o modelo não retornou resultado estruturado';
      continue;
    }

    let parsed: unknown;
    try {
      parsed = tryParseJson(raw);
    } catch (err) {
      lastError = `JSON malformado (${err instanceof Error ? err.message : String(err)})`;
      lastRaw = raw;
      continue;
    }

    try {
      return spec.parse(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastRaw = raw;
    }
  }

  throw new Error(`Especialista "${spec.id}" falhou: ${lastError}`);
}
