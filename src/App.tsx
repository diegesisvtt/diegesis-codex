import { useEffect, useRef, useState } from 'react';
import { PanelRight, X } from 'lucide-react';
import { StoreProvider, useStore, RealmFontsStyle } from './state/store';
import { PluginProvider, builtinPlugins, usePluginEvent, useViews } from './plugins';
import { TitleBar } from './components/TitleBar';
import { Workspace } from './components/Workspace';
import { SearchPalette } from './components/SearchPalette';
import { CommandPalette } from './components/CommandPalette';
import { DiceOverlay } from './components/dice3d/DiceOverlay';
import { BootOverlay } from './components/LoadingScreen';

const RIGHT_PANEL_MIN = 280;
const RIGHT_PANEL_MAX = 720;
const RIGHT_PANEL_DEFAULT = 380;

function Shell() {
  const { activeRealmId, rightPanelView, setRightPanelView, uiState, saveUiState } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(uiState.rightPanelWidth ?? uiState.aiPanelWidth ?? RIGHT_PANEL_DEFAULT);
  const widthRef = useRef(panelWidth);
  widthRef.current = panelWidth;

  // right-panel views are contributed by plugins (ai-chat, roller log, …)
  const rightViews = useViews('right-panel');
  const activeView = rightViews.find((v) => v.id === rightPanelView);

  // the panel is the plugin's responsibility: if the plugin is deactivated
  // while open, close it rather than keeping orphan state
  useEffect(() => {
    if (rightPanelView && rightViews.length > 0 && !activeView) setRightPanelView(null);
  }, [rightPanelView, rightViews, activeView, setRightPanelView]);

  // plugins request palettes through the event bus (Mod+K / Mod+Shift+P commands)
  usePluginEvent('palette:toggle', ({ palette }) => {
    if (palette === 'search') setSearchOpen((v) => !v);
    if (palette === 'command') setCommandOpen((v) => !v);
  });

  // drag-to-resize the right panel (width = distance from the window's right edge)
  const startPanelDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      setPanelWidth(Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, window.innerWidth - ev.clientX)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveUiState({ rightPanelWidth: widthRef.current });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const ActiveComponent = activeView?.component;

  return (
    <div className="h-screen w-full bg-app text-ink-1 flex flex-col overflow-hidden selection:bg-accent-soft">
      <RealmFontsStyle />
      <TitleBar />
      {/* Remount workspace per realm so tabs/layout stay realm-scoped */}
      {activeRealmId ? (
        <div className="flex-1 flex min-h-0">
          <Workspace key={activeRealmId} />
          {activeView && ActiveComponent && (
            <>
              <div
                onMouseDown={startPanelDrag}
                className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/50 transition-colors"
                title="Arraste para redimensionar"
              />
              <aside style={{ width: panelWidth }} className="shrink-0 border-l border-line flex flex-col min-h-0 bg-sidebar">
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line select-none">
                  <span className="text-[12px] font-medium text-ink-2 truncate">{activeView.title}</span>
                  <button
                    type="button"
                    onClick={() => setRightPanelView(null)}
                    title="Fechar painel"
                    className="ml-auto p-1 rounded text-ink-3 hover:text-ink-1 hover:bg-elevated transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <ActiveComponent />
                </div>
              </aside>
            </>
          )}
          {rightViews.length > 0 && (
            <div className="shrink-0 w-9 border-l border-line bg-sidebar flex flex-col items-center py-1.5 gap-1">
              {rightViews.map((view) => {
                const Icon = view.icon ?? PanelRight;
                const active = view.id === rightPanelView;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setRightPanelView(active ? null : view.id)}
                    title={view.title}
                    aria-pressed={active}
                    className={`relative flex h-7 w-7 items-center justify-center rounded-none transition-all duration-100 ${
                      active
                        ? 'text-accent-ink bg-accent-soft border border-cyan-500/40 shadow-[0_0_12px_rgba(56,189,248,0.18)]'
                        : 'text-ink-3 hover:text-ink-1 hover:bg-elevated border border-transparent'
                    }`}
                  >
                    <Icon size={15} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-ink-3 text-sm">
          Crie um universo para começar.
        </div>
      )}
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      {/* dados 3D globais (Dice So Nice): inertes até o plugin dice3d ativar */}
      <DiceOverlay />
    </div>
  );
}

/** Boots the plugin host once the store is ready (plugin settings live in uiState). */
function PluginGate() {
  const { ready } = useStore();
  if (!ready) return null;
  return (
    <PluginProvider plugins={builtinPlugins} fallback={null}>
      <Shell />
    </PluginProvider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <PluginGate />
      <BootOverlay />
    </StoreProvider>
  );
}
