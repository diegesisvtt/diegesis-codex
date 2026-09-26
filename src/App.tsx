import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { TitleBar } from './components/TitleBar';
import { Workspace } from './components/Workspace';
import { AIChatPanel } from './components/AIChatPanel';
import { SearchPalette } from './components/SearchPalette';

function Shell() {
  const { ready, activeRealmId, aiChatOpen } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-app text-accent-ink font-medium animate-pulse text-sm">
        Carregando workspace…
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-app text-ink-1 flex flex-col overflow-hidden selection:bg-accent-soft">
      <TitleBar onOpenSearch={() => setSearchOpen(true)} />
      {/* Remount workspace per realm so tabs/layout stay realm-scoped */}
      {activeRealmId ? (
        <div className="flex-1 flex min-h-0">
          <Workspace key={activeRealmId} />
          {aiChatOpen && (
            <aside className="w-[380px] shrink-0 border-l border-line flex flex-col min-h-0 bg-app">
              <AIChatPanel />
            </aside>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-ink-3 text-sm">
          Crie um universo para começar.
        </div>
      )}
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
