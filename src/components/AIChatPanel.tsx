import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, Globe, Library, MessageSquare, Plus, Send, Settings2, Sparkles, Square, Trash2, User, Wrench, X } from 'lucide-react';
import type { ChatMessage, Conversation, RetrievedChunk } from '@shared/types';
import { useStore } from '../state/store';
import { AssistantMessage } from './AssistantMessage';
import { newId } from '@diegesis/core';

const generateChatId = newId;

interface DisplayMessage extends ChatMessage {
  sources?: RetrievedChunk[];
  tools?: { summary: string; ok: boolean }[];
  error?: boolean;
}

export function AIChatPanel() {
  const { activeRealmId, openDocument, openPanel, aiDraft, setAiDraft, focusPdf, setAiChatOpen } = useStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [convMenuOpen, setConvMenuOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [useContext, setUseContext] = useState(true);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const activeConvRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** autoscroll follows the stream only while the user is near the bottom */
  const followRef = useRef(true);
  activeConvRef.current = activeConvId;

  const reloadConversations = useCallback(async (realmId: string, preferId?: string | null) => {
    const convs = await window.diegesis.ai.listConversations(realmId);
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
    const check = () => window.diegesis.ai.getSettings().then((s) => setConfigured(!!s.chat));
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
    window.diegesis.ai.listMessages(activeConvId).then((stored) => {
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
    const offChunk = window.diegesis.ai.onChatChunk((chunk) => {
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
    const offSources = window.diegesis.ai.onChatSources((s) => {
      if (s.chatId !== chatIdRef.current) return;
      setMessages((ms) => {
        const copy = [...ms];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, sources: s.sources };
        return copy;
      });
    });
    const offTool = window.diegesis.ai.onToolEvent((e) => {
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

  // autoscroll: follow new content only when the user hasn't scrolled up to read
  useEffect(() => {
    if (followRef.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // composer auto-grow (up to ~9 lines)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [input]);

  const newConversation = async () => {
    if (!activeRealmId) return;
    const conv = await window.diegesis.ai.createConversation(activeRealmId);
    await reloadConversations(activeRealmId, conv.id);
  };

  const deleteConversation = async (id: string) => {
    if (!activeRealmId) return;
    await window.diegesis.ai.deleteConversation(id);
    await reloadConversations(activeRealmId);
  };

  // citations deep-link: PDFs open at the chunk's page, other docs just open
  const openSource = (s: RetrievedChunk) => {
    openDocument(s.docId);
    if (s.type === 'core/pdf' && s.page != null) focusPdf({ docId: s.docId, page: s.page });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || !configured || !activeRealmId) return;

    // create the conversation lazily on the first message
    let convId = activeConvId;
    if (!convId) {
      const conv = await window.diegesis.ai.createConversation(activeRealmId);
      convId = conv.id;
      await reloadConversations(activeRealmId, convId);
    }

    const chatId = generateChatId();
    chatIdRef.current = chatId;
    const history: ChatMessage[] = [...messages.map(({ role, content }) => ({ role, content })), { role: 'user', content: text }];
    setMessages((ms) => [...ms, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    followRef.current = true; // a new message re-engages autoscroll
    window.diegesis.ai
      .chat({ chatId, conversationId: convId, realmId: activeRealmId, messages: history, useContext, useWebSearch })
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
          onClick={() => openPanel('settings')}
          className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Settings2 size={15} /> Configurar provider
        </button>
      </div>
    );
  }

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  return (
    <div className="h-full flex flex-col bg-app min-h-0">
      {/* header: conversation picker + actions */}
      <div className="shrink-0 px-3 py-2 border-b border-line flex items-center gap-1">
        <Sparkles size={14} className="text-accent-ink shrink-0" />
        <div className="relative flex-1 min-w-0">
          <button
            onClick={() => setConvMenuOpen((v) => !v)}
            title="Trocar de conversa"
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[12.5px] text-ink-1 hover:bg-hover transition-colors"
          >
            <MessageSquare size={12} className="shrink-0 text-ink-3" />
            <span className="flex-1 min-w-0 text-left truncate">{activeConv?.title ?? 'Nova conversa'}</span>
            <ChevronDown size={12} className="shrink-0 text-ink-3" />
          </button>
          {convMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setConvMenuOpen(false)} />
              <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-elevated border border-line rounded-lg shadow-2xl py-1 overflow-hidden animate-fade-up">
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {conversations.length === 0 ? (
                    <div className="px-3 py-3 text-[12px] text-ink-3 text-center">Nenhuma conversa ainda.</div>
                  ) : (
                    conversations.map((c) => (
                      <div
                        key={c.id}
                        className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                          c.id === activeConvId ? 'bg-active text-ink-1' : 'text-ink-2 hover:bg-hover'
                        }`}
                        onClick={() => {
                          if (streaming) return;
                          setActiveConvId(c.id);
                          setConvMenuOpen(false);
                        }}
                      >
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
                <div className="border-t border-line mt-1 pt-1">
                  <button
                    onClick={() => {
                      setConvMenuOpen(false);
                      newConversation();
                    }}
                    className="w-full text-left px-3 py-1.5 text-[12.5px] text-ink-2 hover:bg-hover hover:text-ink-1 flex items-center gap-2 transition-colors"
                  >
                    <Plus size={13} /> Nova conversa
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <button
          onClick={newConversation}
          title="Nova conversa"
          className="p-1.5 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
        >
          <Plus size={15} />
        </button>
        <button
          onClick={() => setAiChatOpen(false)}
          title="Fechar painel"
          className="p-1.5 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center select-none">
              <Bot size={26} strokeWidth={1.5} className="text-ink-3 mb-3" />
              <p className="text-ink-3 text-[13px] max-w-xs leading-relaxed">
                Pergunte sobre seus personagens, locais e tramas — ou peça para criar e organizar notas no
                universo.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 pb-4 pt-1">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-1 ${
                      m.role === 'user' ? 'bg-accent-soft border border-line' : 'text-ink-3'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <User size={14} className="text-accent-ink" />
                    ) : (
                      <Sparkles size={15} className="text-accent-ink" />
                    )}
                  </div>
                  <div
                    className={`min-w-0 flex-1 text-[13.5px] leading-relaxed ${
                      m.role === 'user'
                        ? 'rounded-2xl px-4 py-2.5 whitespace-pre-wrap bg-accent-soft text-ink-1'
                        : m.error
                          ? 'rounded-xl px-4 py-3 whitespace-pre-wrap bg-danger-soft text-danger'
                          : 'px-1 py-1 text-ink-1'
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
                    {m.role === 'assistant' && !m.error && m.content ? (
                      <AssistantMessage markdown={m.content} sources={m.sources} onOpenSource={openSource} />
                    ) : (
                      m.content || (streaming && i === messages.length - 1 ? '…' : '')
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="shrink-0 px-3 pb-3 pt-1.5">
          <div className="rounded-2xl border border-line bg-elevated shadow-lg px-3.5 pt-3 pb-2 transition-all focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Pergunte ao assistente…"
              className="w-full bg-transparent resize-none text-[13.5px] leading-relaxed text-ink-1 placeholder-ink-3 outline-none custom-scrollbar"
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              <button
                onClick={() => setUseContext((v) => !v)}
                title="Buscar contexto do universo (RAG) antes de responder"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] font-medium transition-colors ${
                  useContext
                    ? 'border-accent/40 bg-accent-soft text-accent-ink'
                    : 'border-line bg-sidebar text-ink-3 hover:text-ink-1 hover:border-line-strong'
                }`}
              >
                <Library size={12} />
                Universo
              </button>
              <button
                onClick={() => setUseWebSearch((v) => !v)}
                title="Permitir que o assistente busque na web antes de responder"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] font-medium transition-colors ${
                  useWebSearch
                    ? 'border-accent/40 bg-accent-soft text-accent-ink'
                    : 'border-line bg-sidebar text-ink-3 hover:text-ink-1 hover:border-line-strong'
                }`}
              >
                <Globe size={12} />
                Web
              </button>
              <div className="flex-1" />
              <span className="hidden sm:block text-[10.5px] text-ink-3 select-none mr-1">
                Enter envia · Shift+Enter quebra linha
              </span>
              <button
                onClick={() => {
                  if (streaming && chatIdRef.current) {
                    window.diegesis.ai.cancelChat(chatIdRef.current);
                  } else {
                    send();
                  }
                }}
                disabled={!streaming && !input.trim()}
                title={streaming ? 'Parar geração' : 'Enviar'}
                className={`p-2 rounded-full transition-all disabled:opacity-40 ${
                  streaming
                    ? 'bg-danger-soft text-danger hover:bg-danger hover:text-white'
                    : 'bg-accent text-white hover:bg-accent-hover disabled:bg-sidebar disabled:text-ink-3'
                }`}
              >
                {streaming ? <Square size={13} fill="currentColor" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}
