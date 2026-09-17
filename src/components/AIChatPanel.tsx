import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Library, MessageSquare, Plus, Send, Settings2, Sparkles, Square, Trash2, User, Wrench } from 'lucide-react';
import type { ChatMessage, Conversation, RetrievedChunk } from '@shared/types';
import { useStore } from '../state/store';

const generateChatId = () => Math.random().toString(36).slice(2, 12);

interface DisplayMessage extends ChatMessage {
  sources?: RetrievedChunk[];
  tools?: { summary: string; ok: boolean }[];
  error?: boolean;
}

export function AIChatPanel() {
  const { activeRealmId, openDocument, openPanel, aiDraft, setAiDraft } = useStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [useContext, setUseContext] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const activeConvRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  activeConvRef.current = activeConvId;

  const reloadConversations = useCallback(async (realmId: string, preferId?: string | null) => {
    const convs = await window.mythril.ai.listConversations(realmId);
    setConversations(convs);
    setActiveConvId((cur) => {
      const wanted = preferId ?? cur;
      return wanted && convs.some((c) => c.id === wanted) ? wanted : (convs[0]?.id ?? null);
    });
    return convs;
  }, []);

  // bootstrap: settings + conversations for the realm
  useEffect(() => {
    if (!activeRealmId) return;
    const check = () => window.mythril.ai.getSettings().then((s) => setConfigured(!!s.chat));
    check();
    window.addEventListener('focus', check);
    reloadConversations(activeRealmId);
    return () => window.removeEventListener('focus', check);
  }, [activeRealmId, reloadConversations]);

  // load persisted messages when switching conversations
  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    window.mythril.ai.listMessages(activeConvId).then((stored) => {
      // don't clobber an in-flight stream in this conversation
      if (chatIdRef.current && activeConvRef.current === activeConvId && streaming) return;
      setMessages(stored.map((m) => ({ role: m.role, content: m.content, sources: m.sources })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId]);

  // draft injected by editor commands ("Perguntar à IA" on a selection)
  useEffect(() => {
    if (aiDraft) {
      setInput(aiDraft);
      setAiDraft(null);
    }
  }, [aiDraft, setAiDraft]);

  // streaming subscriptions (chunks are tagged with chatId)
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
      if (chunk.done) {
        setStreaming(false);
        // refresh conversation titles (auto-titled from the first message)
        if (activeRealmId) reloadConversations(activeRealmId, activeConvRef.current);
      }
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
    const offTool = window.mythril.ai.onToolEvent((e) => {
      if (e.chatId !== chatIdRef.current) return;
      setMessages((ms) => {
        const copy = [...ms];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') {
          copy[copy.length - 1] = { ...last, tools: [...(last.tools ?? []), { summary: e.summary, ok: e.ok }] };
        }
        return copy;
      });
    });
    return () => {
      offChunk();
      offSources();
      offTool();
    };
  }, [activeRealmId, reloadConversations]);

  // autoscroll
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const newConversation = async () => {
    if (!activeRealmId) return;
    const conv = await window.mythril.ai.createConversation(activeRealmId);
    await reloadConversations(activeRealmId, conv.id);
  };

  const deleteConversation = async (id: string) => {
    if (!activeRealmId) return;
    await window.mythril.ai.deleteConversation(id);
    await reloadConversations(activeRealmId);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || !configured || !activeRealmId) return;

    // create the conversation lazily on the first message
    let convId = activeConvId;
    if (!convId) {
      const conv = await window.mythril.ai.createConversation(activeRealmId);
      convId = conv.id;
      await reloadConversations(activeRealmId, convId);
    }

    const chatId = generateChatId();
    chatIdRef.current = chatId;
    const history: ChatMessage[] = [...messages.map(({ role, content }) => ({ role, content })), { role: 'user', content: text }];
    setMessages((ms) => [...ms, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    window.mythril.ai
      .chat({ chatId, conversationId: convId, realmId: activeRealmId, messages: history, useContext })
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
    <div className="h-full flex bg-app">
      {/* conversations sidebar */}
      <div className="w-52 shrink-0 border-r border-line flex flex-col bg-sidebar">
        <div className="px-3 py-2.5 border-b border-line flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">Conversas</span>
          <button
            onClick={newConversation}
            title="Nova conversa"
            className="p-1 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
          {conversations.length === 0 ? (
            <div className="px-3 py-4 text-[12px] text-ink-3 text-center">Nenhuma conversa ainda.</div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  c.id === activeConvId ? 'bg-active text-ink-1' : 'text-ink-2 hover:bg-hover'
                }`}
                onClick={() => !streaming && setActiveConvId(c.id)}
              >
                <MessageSquare size={13} className="shrink-0 text-ink-3" />
                <span className="flex-1 text-[12.5px] truncate">{c.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(c.id);
                  }}
                  title="Excluir conversa"
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-ink-3 hover:text-danger transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* chat area */}
      <div className="flex-1 flex flex-col min-w-0">
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
                Pergunte sobre seus personagens, locais e tramas — ou peça para criar e organizar notas no
                universo.
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
                    {m.tools && m.tools.length > 0 && (
                      <div className="flex flex-col gap-1 mb-2">
                        {m.tools.map((t, j) => (
                          <div
                            key={j}
                            className={`flex items-center gap-1.5 text-[11.5px] ${
                              t.ok ? 'text-ink-3' : 'text-danger'
                            }`}
                          >
                            <Wrench size={11} className="shrink-0" />
                            {t.summary}
                          </div>
                        ))}
                      </div>
                    )}
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
              placeholder={useContext ? 'Pergunte ou peça alterações no universo…' : 'Converse com o assistente…'}
              className="flex-1 bg-transparent resize-none text-[13.5px] text-ink-1 placeholder-ink-3 outline-none max-h-40 custom-scrollbar"
            />
            <button
              onClick={() => {
                if (streaming && chatIdRef.current) {
                  window.mythril.ai.cancelChat(chatIdRef.current);
                } else {
                  send();
                }
              }}
              disabled={!streaming && !input.trim()}
              title={streaming ? 'Parar geração' : 'Enviar'}
              className="p-1.5 rounded-md text-accent-ink hover:bg-accent-soft transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {streaming ? <Square size={15} fill="currentColor" /> : <Send size={17} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
