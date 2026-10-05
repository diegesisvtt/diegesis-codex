// Inline "Ask AI" popover for the note editor. Anchored near the selection or
// the formatting-toolbar button, it offers quick editing actions (rewrite,
// summarize, explain, …) plus free-form conversation — all ephemeral, scoped to
// the current selection, streamed via the dedicated ai.inline endpoint.
//
// The actions and base system prompt are user-configurable: they are loaded
// from the AI plugin settings (see src/ai/inlinePrompts.ts).
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCheck,
  Copy,
  CornerDownRight,
  Expand,
  Languages,
  Lightbulb,
  Library,
  Loader2,
  Minimize2,
  PenLine,
  Replace,
  Send,
  Sparkles,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import type { BlockNoteEditor } from '@blocknote/core';
import type { RetrievedChunk } from '@shared/types';
import { newId } from '@diegesis/core';
import { useStore } from '../../../state/store';
import { AssistantMessage } from '../../AssistantMessage';
import {
  INLINE_AI_PLUGIN_ID,
  INLINE_PROMPTS_KEY,
  loadInlinePrompts,
  type InlineActionConfig,
  type InlineOutput,
} from '../../../ai/inlinePrompts';

const generateChatId = newId;

const ACTION_ICONS: Record<string, ReactNode> = {
  rewrite: <PenLine size={14} />,
  fix: <CheckCheck size={14} />,
  expand: <Expand size={14} />,
  summarize: <Minimize2 size={14} />,
  explain: <Lightbulb size={14} />,
  translate: <Languages size={14} />,
};
const FALLBACK_ICON = <Wand2 size={14} />;

interface Action extends InlineActionConfig {
  icon: ReactNode;
}

interface SelectionCtx {
  blocks: BlockNoteEditor<any, any, any>['document'];
  text: string;
  ref: any;
}

export function InlineAiPopover({
  editor,
  anchor,
  onClose,
}: {
  editor: BlockNoteEditor<any, any, any>;
  anchor: { x: number; y: number };
  onClose: () => void;
}) {
  const { activeRealmId, openDocument, focusPdf, uiState } = useStore();

  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [mode, setMode] = useState<InlineOutput | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useContext, setUseContext] = useState(false);
  const [sources, setSources] = useState<RetrievedChunk[] | null>(null);
  const [copied, setCopied] = useState(false);

  const chatIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const cfg = loadInlinePrompts(uiState.plugins?.settings?.[INLINE_AI_PLUGIN_ID]?.[INLINE_PROMPTS_KEY]);
  const actions: Action[] = cfg.actions.map((a) => ({ ...a, icon: ACTION_ICONS[a.id] ?? FALLBACK_ICON }));

  // Capture the selection/cursor once, before focus moves into the popover.
  const [ctx] = useState<SelectionCtx>(() => {
    const selection = editor.getSelection();
    const text = editor.getSelectedText().trim();
    const blocks = selection?.blocks ?? [];
    return {
      blocks,
      text,
      ref: blocks.length ? blocks[blocks.length - 1] : editor.getTextCursorPosition().block,
    };
  });

  const hasSelection = ctx.blocks.length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const offChunk = window.diegesis.ai.onChatChunk((chunk) => {
      if (chunk.chatId !== chatIdRef.current) return;
      if (chunk.error) {
        setError(chunk.error);
        setStreaming(false);
        return;
      }
      if (chunk.delta) setResult((r) => r + chunk.delta);
      if (chunk.done) setStreaming(false);
    });
    const offSources = window.diegesis.ai.onChatSources((s) => {
      if (s.chatId !== chatIdRef.current) return;
      setSources(s.sources);
    });
    return () => {
      offChunk();
      offSources();
    };
  }, []);

  const run = async (action?: Action) => {
    if (streaming) return;
    const prompt = input.trim();
    if (!action && !prompt) return;

    const system = action ? `${cfg.baseSystem}\n\n${action.system}` : cfg.baseSystem;
    const user =
      action || !ctx.text
        ? ctx.text
          ? `Trecho selecionado:\n\n${ctx.text}`
          : prompt
        : `Trecho selecionado:\n\n${ctx.text}\n\nInstrução:\n${prompt}`;

    const chatId = generateChatId();
    chatIdRef.current = chatId;
    setResult('');
    setError(null);
    setSources(null);
    setMode(action ? action.output : 'markdown');
    setStreaming(true);
    setInput('');

    window.diegesis.ai
      .inline({
        chatId,
        realmId: activeRealmId,
        system,
        messages: [{ role: 'user', content: user }],
        useContext,
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStreaming(false);
      });
  };

  const apply = async (kind: 'replace' | 'insert') => {
    if (!result.trim()) return;
    try {
      const blocks = await editor.tryParseMarkdownToBlocks(result.trim());
      if (kind === 'replace' && ctx.blocks.length) {
        editor.replaceBlocks(ctx.blocks, blocks);
      } else {
        editor.insertBlocks(blocks, ctx.ref, 'after');
      }
    } catch {
      const last = editor.document[editor.document.length - 1];
      if (last) {
        const blocks = await editor.tryParseMarkdownToBlocks(result.trim());
        editor.insertBlocks(blocks, last, 'after');
      }
    }
    onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const openSource = (s: RetrievedChunk) => {
    onClose();
    openDocument(s.docId);
    if (s.type === 'core/pdf' && s.page != null) focusPdf({ docId: s.docId, page: s.page });
  };

  const width = 440;
  const left = Math.min(Math.max(8, anchor.x), window.innerWidth - width - 8);
  const top = Math.max(8, Math.min(anchor.y, Math.max(8, window.innerHeight - 480)));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[71] w-[440px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-elevated shadow-[0_16px_48px_rgba(0,0,0,0.55)] overflow-hidden animate-fade-up flex flex-col"
        style={{ left, top }}
      >
        {/* header */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line bg-sidebar">
          <Sparkles size={13} className="text-accent-ink shrink-0" />
          <span className="text-[12px] font-semibold text-ink-1">Perguntar à IA</span>
          {hasSelection && (
            <span className="text-[10.5px] text-ink-3 truncate max-w-[240px]">· {ctx.text.slice(0, 60) || 'seleção'}</span>
          )}
          <div className="flex-1" />
          <button onClick={onClose} title="Fechar" className="p-1 rounded text-ink-3 hover:text-ink-1 hover:bg-hover">
            <X size={14} />
          </button>
        </div>

        {/* body: actions + result */}
        <div className="max-h-[320px] overflow-y-auto custom-scrollbar px-3 py-2.5">
          {!result && !streaming && !error ? (
            <>
              {hasSelection && actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-2 border-b border-line mb-2">
                  {actions.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => run(a)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] text-ink-2 bg-sidebar border border-line hover:text-ink-1 hover:border-accent/40 hover:bg-accent-soft transition-colors"
                    >
                      {a.icon}
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-ink-3 pb-1.5 select-none">
                {hasSelection
                  ? 'Escolha uma ação ou pergunte livremente sobre o trecho selecionado.'
                  : 'Nenhum texto selecionado — pergunte algo e insira a resposta abaixo.'}
              </div>
            </>
          ) : (
            <div className="text-[13px] leading-relaxed text-ink-1">
              {error ? (
                <div className="rounded-lg px-3 py-2 bg-danger-soft text-danger whitespace-pre-wrap">{error}</div>
              ) : mode === 'markdown' ? (
                <AssistantMessage markdown={result || ' '} sources={sources ?? undefined} onOpenSource={openSource} />
              ) : (
                <div className="whitespace-pre-wrap">{result}</div>
              )}
              {streaming && !result && <Loader2 size={16} className="animate-spin text-ink-3 mt-1" />}
            </div>
          )}
        </div>

        {/* result actions */}
        {result && !streaming && !error && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-t border-line">
            {mode === 'text' && hasSelection && (
              <button
                onClick={() => apply('replace')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent text-white text-[11.5px] font-medium hover:bg-accent-hover transition-colors"
              >
                <Replace size={13} />
                Substituir
              </button>
            )}
            <button
              onClick={() => apply('insert')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-sidebar text-ink-2 text-[11.5px] hover:text-ink-1 hover:border-line-strong transition-colors"
            >
              <CornerDownRight size={13} />
              Inserir abaixo
            </button>
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line bg-sidebar text-ink-2 text-[11.5px] hover:text-ink-1 hover:border-line-strong transition-colors"
            >
              {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}

        {/* composer */}
        <div className="px-3 pb-2.5 pt-1.5 border-t border-line">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) run();
              }
            }}
            rows={1}
            placeholder={hasSelection ? 'Ou pergunte algo sobre a seleção…' : 'Peça algo à IA…'}
            className="w-full bg-transparent resize-none text-[13px] leading-relaxed text-ink-1 placeholder-ink-3 outline-none custom-scrollbar max-h-24"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              onClick={() => setUseContext((v) => !v)}
              title="Buscar contexto do universo (RAG) antes de responder"
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10.5px] font-medium transition-colors ${
                useContext
                  ? 'border-accent/40 bg-accent-soft text-accent-ink'
                  : 'border-line bg-sidebar text-ink-3 hover:text-ink-1 hover:border-line-strong'
              }`}
            >
              <Library size={11} />
              Universo
            </button>
            <div className="flex-1" />
            <button
              onClick={() => {
                if (streaming && chatIdRef.current) {
                  window.diegesis.ai.cancelChat(chatIdRef.current);
                } else {
                  run();
                }
              }}
              disabled={!streaming && !input.trim()}
              title={streaming ? 'Parar geração' : 'Enviar'}
              className={`p-1.5 rounded-full transition-all disabled:opacity-40 ${
                streaming
                  ? 'bg-danger-soft text-danger hover:bg-danger hover:text-white'
                  : 'bg-accent text-white hover:bg-accent-hover disabled:bg-sidebar disabled:text-ink-3'
              }`}
            >
              {streaming ? <Square size={12} fill="currentColor" /> : <Send size={13} />}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
