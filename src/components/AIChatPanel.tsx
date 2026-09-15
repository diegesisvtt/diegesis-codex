import { useEffect, useRef, useState } from 'react';
import { Bot, Library, Loader2, Send, Settings2, Sparkles, User } from 'lucide-react';
import type { ChatMessage, RetrievedChunk } from '@shared/types';
import { useStore } from '../state/store';

const generateChatId = () => Math.random().toString(36).slice(2, 12);

interface DisplayMessage extends ChatMessage {
  sources?: RetrievedChunk[];
  error?: boolean;
}

export function AIChatPanel() {
  const { activeRealmId, openDocument, openPanel, aiDraft, setAiDraft } = useStore();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [useContext, setUseContext] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => window.mythril.ai.getSettings().then((s) => setConfigured(!!s.chat));
    check();
    // re-check when the window regains focus (user may have configured in the settings tab)
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  // Draft injected by editor commands ("Perguntar à IA" on a selection)
  useEffect(() => {
    if (aiDraft) {
      setInput(aiDraft);
      setAiDraft(null);
    }
  }, [aiDraft, setAiDraft]);

  // Streaming subscriptions (chunks are tagged with chatId)
  useEffect(() => {
    const offChunk = window.mythril.ai.onChatChunk((chunk) => {
      if (chunk.chatId !== chatIdRef.current) return;
      if (chunk.error) {
        setMessages((ms) => {
          const copy = [...ms];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, content: chunk.error!, error: true };
          return copy;
        });
        setStreaming(false);
        return;
      }
      if (chunk.delta) {
        setMessages((ms) => {
          const copy = [...ms];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, content: last.content + chunk.delta };
          return copy;
        });
      }
      if (chunk.done) setStreaming(false);
    });
    const offSources = window.mythril.ai.onChatSources((s) => {
      if (s.chatId !== chatIdRef.current) return;
      setMessages((ms) => {
        const copy = [...ms];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, sources: s.sources };
        return copy;
      });
    });
    return () => {
      offChunk();
      offSources();
    };
  }, []);

  // autoscroll
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || streaming || !configured) return;
    const chatId = generateChatId();
    chatIdRef.current = chatId;
    const history: ChatMessage[] = [...messages.map(({ role, content }) => ({ role, content })), { role: 'user', content: text }];
    setMessages((ms) => [...ms, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    window.mythril.ai
      .chat({ chatId, realmId: useContext ? activeRealmId : null, messages: history, useContext })
      .catch((err) => {
        setMessages((ms) => {
          const copy = [...ms];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant')
            copy[copy.length - 1] = { ...last, content: err instanceof Error ? err.message : String(err), error: true };
          return copy;
        });
        setStreaming(false);
      });
  };

  if (configured === null) return null;

  if (!configured) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center select-none bg-app">
        <div className="w-16 h-16 rounded-2xl bg-elevated border border-line flex items-center justify-center mb-6 shadow-xl">
          <Sparkles size={28} strokeWidth={1.5} className="text-ink-3" />
        </div>
        <h2 className="text-xl font-semibold text-ink-1 mb-2 tracking-tight">Assistente IA</h2>
        <p className="max-w-sm text-ink-3 text-[13px] leading-relaxed mb-6">
          Conecte qualquer LLM compatível com a API da OpenAI (OpenAI, Ollama, LM Studio…) para conversar com o
          seu universo.
        </p>
        <button
          onClick={() => openPanel('ai-settings')}
          className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Settings2 size={15} /> Configurar provider
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-app">
      {/* header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink-1">
          <Sparkles size={15} className="text-accent-ink" />
          Assistente IA
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setUseContext((v) => !v)}
            title="Buscar contexto do universo (RAG) antes de responder"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] transition-colors ${
              useContext ? 'text-accent-ink bg-accent-soft' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
            }`}
          >
            <Library size={13} />
            Contexto do universo
          </button>
          <button
            onClick={() => openPanel('ai-settings')}
            title="Configurações de IA"
            className="p-1.5 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
          >
            <Settings2 size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center select-none">
            <Bot size={26} strokeWidth={1.5} className="text-ink-3 mb-3" />
            <p className="text-ink-3 text-[13px] max-w-xs leading-relaxed">
              Pergunte sobre seus personagens, locais e tramas.
              {useContext && ' O assistente busca trechos relevantes nas suas notas.'}
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-4 pb-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-7 h-7 rounded-md border border-line flex items-center justify-center shrink-0 mt-0.5 ${
                    m.role === 'user' ? 'bg-accent-soft' : 'bg-elevated'
                  }`}
                >
                  {m.role === 'user' ? (
                    <User size={14} className="text-accent-ink" />
                  ) : (
                    <Bot size={14} className="text-ink-2" />
                  )}
                </div>
                <div
                  className={`min-w-0 flex-1 rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-accent-soft text-ink-1'
                      : m.error
                        ? 'bg-danger-soft text-danger'
                        : 'bg-elevated border border-line text-ink-1'
                  }`}
                >
                  {m.sources && m.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {m.sources.map((s, j) => (
                        <button
                          key={j}
                          onClick={() => openDocument(s.docId)}
                          title={`score ${s.score.toFixed(2)}`}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-sidebar border border-line text-ink-2 hover:text-accent-ink hover:border-accent transition-colors truncate max-w-[200px]"
                        >
                          [{j + 1}] {s.title || 'Sem título'}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* input */}
      <div className="shrink-0 border-t border-line p-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2 bg-elevated border border-line rounded-lg px-3 py-2 focus-within:border-accent transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={useContext ? 'Pergunte ao seu universo…' : 'Converse com o assistente…'}
            className="flex-1 bg-transparent resize-none text-[13.5px] text-ink-1 placeholder-ink-3 outline-none max-h-40 custom-scrollbar"
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="p-1.5 rounded-md text-accent-ink hover:bg-accent-soft transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {streaming ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}
