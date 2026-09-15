import { useState } from 'react';
import { BookOpen, Plus, ChevronDown, Search, Sparkles } from 'lucide-react';
import { useStore } from '../state/store';
import { Modal, Button } from './ui';

export function TitleBar({ onOpenSearch }: { onOpenSearch(): void }) {
  const { realms, activeRealmId, setActiveRealm, createRealm, openPanel } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const active = realms.find((r) => r.id === activeRealmId);

  return (
    <div className="h-11 border-b border-line bg-app flex items-center px-3 shrink-0 justify-between z-20 select-none">
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-accent-soft flex items-center justify-center">
          <BookOpen size={13} className="text-accent-ink" />
        </div>
        <span className="font-semibold text-[13px] tracking-tight text-ink-1">Mythril</span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => openPanel('ai-chat')}
          title="Assistente IA"
          className="flex items-center gap-2 text-[12px] text-ink-3 hover:text-ink-2 px-2.5 py-1.5 rounded-md hover:bg-hover transition-colors border border-line bg-sidebar"
        >
          <Sparkles size={13} />
          <span>IA</span>
        </button>
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 text-[12px] text-ink-3 hover:text-ink-2 px-2.5 py-1.5 rounded-md hover:bg-hover transition-colors border border-line bg-sidebar"
        >
          <Search size={13} />
          <span>Buscar</span>
          <kbd className="text-[10px] text-ink-3 bg-overlay rounded px-1 py-px font-sans">Ctrl K</kbd>
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] text-ink-2 hover:text-ink-1 px-2.5 py-1.5 rounded-md hover:bg-hover transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-board" />
            {active?.name ?? 'Sem universo'}
            <ChevronDown size={12} className="text-ink-3" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-64 bg-elevated border border-line rounded-lg shadow-2xl py-1 overflow-hidden animate-fade-up">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-3">
                  Universos
                </div>
                {realms.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setActiveRealm(r.id);
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[13px] transition-colors flex items-center gap-2 ${
                      r.id === activeRealmId ? 'text-ink-1 bg-active' : 'text-ink-2 hover:bg-hover'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        r.id === activeRealmId ? 'bg-accent' : 'bg-line-strong'
                      }`}
                    />
                    <span className="truncate">{r.name}</span>
                  </button>
                ))}
                <div className="border-t border-line mt-1 pt-1">
                  <button
                    onClick={() => {
                      setCreating(true);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink-1 flex items-center gap-2"
                  >
                    <Plus size={13} /> Novo universo
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title="Novo universo"
        actions={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!name.trim()) return;
                await createRealm(name.trim());
                setName('');
                setCreating(false);
              }}
            >
              Criar
            </Button>
          </>
        }
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              createRealm(name.trim());
              setName('');
              setCreating(false);
            }
          }}
          placeholder="Nome do universo…"
          className="w-full bg-sidebar border border-line rounded-md px-3 py-2 text-ink-1 text-sm outline-none focus:border-accent transition-colors"
        />
      </Modal>
    </div>
  );
}
