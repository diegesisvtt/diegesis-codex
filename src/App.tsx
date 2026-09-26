import { useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { TitleBar } from './components/TitleBar';
import { Workspace } from './components/Workspace';
import { AIChatPanel } from './components/AIChatPanel';
import { SearchPalette } from './components/SearchPalette';

const AI_PANEL_MIN = 300;
const AI_PANEL_MAX = 720;
const AI_PANEL_DEFAULT = 380;

function Shell() {
  const { ready, activeRealmId, aiChatOpen, uiState, saveUiState } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiWidth, setAiWidth] = useState(uiState.aiPanelWidth ?? AI_PANEL_DEFAULT);
  const widthRef = useRef(aiWidth);
  widthRef.current = aiWidth;

  // drag-to-resize the AI panel (width = distance from the window's right edge)
  const startAiDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      setAiWidth(Math.min(AI_PANEL_MAX, Math.max(AI_PANEL_MIN, window.innerWidth - ev.clientX)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveUiState({ aiPanelWidth: widthRef.current });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

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
            <>
              <div
                onMouseDown={startAiDrag}
                className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/50 transition-colors"
                title="Arraste para redimensionar"
              />
              <aside style={{ width: aiWidth }} className="shrink-0 border-l border-line flex flex-col min-h-0 bg-app">
                <AIChatPanel />
              </aside>
            </>
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
