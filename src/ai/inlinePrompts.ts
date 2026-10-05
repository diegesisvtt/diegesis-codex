// Inline "Ask AI" prompt configuration — externalized so users can fully
// customize the writing/editing actions from the AI settings page.
//
// Pure data (no JSX) shared by:
//   - the inline popover (reads the effective config)
//   - the AI settings page (edits + persists it)
//
// Persistence lives in the plugin-settings KV under `core/ai-chat`, key
// `inlinePrompts`; `loadInlinePrompts` merges/validates any saved blob against
// the defaults so missing or malformed fields never break the editor.

export const INLINE_AI_PLUGIN_ID = 'core/ai-chat';
export const INLINE_PROMPTS_KEY = 'inlinePrompts';

export type InlineOutput = 'text' | 'markdown';

export interface InlineActionConfig {
  /** stable id; built-ins have fixed ids, custom ones are `custom-*` */
  id: string;
  label: string;
  /** 'text' = raw result (replace-ready); 'markdown' = free-form answer */
  output: InlineOutput;
  system: string;
}

export interface InlinePromptsConfig {
  baseSystem: string;
  actions: InlineActionConfig[];
}

export const DEFAULT_BASE_SYSTEM =
  'Você é o assistente de escrita embutido no editor de notas do Diegesis Codex, um estúdio de worldbuilding de RPG. ' +
  'Aja sobre o trecho selecionado fornecido pelo usuário. Responda no idioma do trecho.';

export const DEFAULT_INLINE_PROMPTS: InlinePromptsConfig = {
  baseSystem: DEFAULT_BASE_SYSTEM,
  actions: [
    {
      id: 'rewrite',
      label: 'Reescrever',
      output: 'text',
      system:
        'Reescreva o trecho selecionado de forma mais clara, fluida e natural, preservando o significado e o tom. ' +
        'Responda SOMENTE com o texto reescrito, sem aspas, sem comentários e sem markdown.',
    },
    {
      id: 'fix',
      label: 'Corrigir',
      output: 'text',
      system:
        'Corrija erros de gramática, ortografia e pontuação do trecho selecionado, preservando o conteúdo. ' +
        'Responda SOMENTE com o texto corrigido, sem aspas, sem comentários e sem markdown.',
    },
    {
      id: 'expand',
      label: 'Expandir',
      output: 'text',
      system:
        'Expanda o trecho selecionado com mais detalhes e profundidade, mantendo o estilo e a voz do autor. ' +
        'Responda SOMENTE com o texto expandido, sem aspas, sem comentários e sem markdown.',
    },
    {
      id: 'summarize',
      label: 'Resumir',
      output: 'text',
      system:
        'Resuma o trecho selecionado de forma concisa e objetiva. ' +
        'Responda SOMENTE com o resumo, sem aspas, sem comentários e sem markdown.',
    },
    {
      id: 'explain',
      label: 'Explicar',
      output: 'markdown',
      system:
        'Explique o trecho selecionado em linguagem simples e didática, no idioma do trecho. ' +
        'Use markdown simples (listas, títulos) quando ajudar.',
    },
    {
      id: 'translate',
      label: 'Traduzir',
      output: 'text',
      system:
        'Traduza o trecho selecionado para o inglês, preservando o significado e o tom. ' +
        'Responda SOMENTE com a tradução, sem aspas, sem comentários e sem markdown.',
    },
  ],
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function asTrimmedString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function asOutput(v: unknown): InlineOutput | null {
  return v === 'text' || v === 'markdown' ? v : null;
}

function mergeAction(entry: unknown, fallback: InlineActionConfig | undefined, index: number): InlineActionConfig {
  const obj = isObject(entry) ? entry : {};
  const id = asTrimmedString(obj.id) ?? fallback?.id ?? `custom-${index}`;
  const label = asTrimmedString(obj.label) ?? fallback?.label ?? id;
  const output = asOutput(obj.output) ?? fallback?.output ?? 'text';
  const system = asTrimmedString(obj.system) ?? fallback?.system ?? '';
  return { id, label, output, system };
}

/** Merges a saved config blob against the defaults. The saved `actions` list is
 *  the source of truth (order + presence), while each entry's fields fall back
 *  to the built-in default of the same id — so partial or malformed blobs are
 *  always safe. Returns the defaults when nothing valid is stored. */
export function loadInlinePrompts(raw: unknown): InlinePromptsConfig {
  const defaults = DEFAULT_INLINE_PROMPTS;
  if (!isObject(raw)) return defaults;

  const baseSystem = asTrimmedString(raw.baseSystem) ?? defaults.baseSystem;

  let actions = defaults.actions;
  if (Array.isArray(raw.actions) && raw.actions.length > 0) {
    const byId = new Map(defaults.actions.map((a) => [a.id, a]));
    actions = raw.actions.map((entry, i) => {
      const id = isObject(entry) ? (asTrimmedString(entry.id) ?? undefined) : undefined;
      return mergeAction(entry, id ? byId.get(id) : undefined, i);
    });
  }

  return { baseSystem, actions };
}
