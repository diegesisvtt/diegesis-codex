import { useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { PluginProvider, builtinPlugins, usePluginEvent, useViews } from './plugins';
import { TitleBar } from './components/TitleBar';
import { Workspace } from './components/Workspace';
import { SearchPalette } from './components/SearchPalette';
import { CommandPalette } from './components/CommandPalette';

const AI_PANEL_MIN = 300;
const AI_PANEL_MAX = 720;
const AI_PANEL_DEFAULT = 380;

function Loading() {
  return (
    <div className="h-screen flex items-center justify-center bg-app text-accent-ink font-medium animate-pulse text-sm">
      Carregando workspace…
    </div>
  );
}

function Shell() {
  const { activeRealmId, aiChatOpen, setAiChatOpen, uiState, saveUiState } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [aiWidth, setAiWidth] = useState(uiState.aiPanelWidth ?? AI_PANEL_DEFAULT);
  const widthRef = useRef(aiWidth);
  widthRef.current = aiWidth;

  // the right panel is contributed by a plugin (core/ai-chat)
  const aiChatView = useViews('right-panel').find((v) => v.id === 'ai-chat');

  // the panel is the plugin's responsibility: if the plugin is deactivated
  // while open, close it rather than keeping orphan state
  useEffect(() => {
    if (aiChatOpen && !aiChatView) setAiChatOpen(false);
  }, [aiChatOpen, aiChatView, setAiChatOpen]);

  // plugins request palettes through the event bus (Mod+K / Mod+Shift+P commands)
  usePluginEvent('palette:toggle', ({ palette }) => {
    if (palette === 'search') setSearchOpen((v) => !v);
    if (palette === 'command') setCommandOpen((v) => !v);
  });

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

  const AiChatComponent = aiChatView?.component;

  return (
    <div className="h-screen w-full bg-app text-ink-1 flex flex-col overflow-hidden selection:bg-accent-soft">
      <TitleBar />
      {/* Remount workspace per realm so tabs/layout stay realm-scoped */}
      {activeRealmId ? (
        <div className="flex-1 flex min-h-0">
          <Workspace key={activeRealmId} />
          {aiChatOpen && AiChatComponent && (
            <>
              <div
                onMouseDown={startAiDrag}
                className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/50 transition-colors"
                title="Arraste para redimensionar"
              />
              <aside style={{ width: aiWidth }} className="shrink-0 border-l border-line flex flex-col min-h-0 bg-app">
                <AiChatComponent />
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
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}

/** Boots the plugin host once the store is ready (plugin settings live in uiState). */
function PluginGate() {
  const { ready } = useStore();
  if (!ready) return <Loading />;
  return (
    <PluginProvider plugins={builtinPlugins} fallback={<Loading />}>
      <Shell />
    </PluginProvider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <PluginGate />
    </StoreProvider>
  );
}
