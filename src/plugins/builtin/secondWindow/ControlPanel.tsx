/* GM-side control panel for the second window: a single searchable list
   of displayable documents (notes → parchment, hexcrawl maps → player
   view), plus window toggle and viewport mirroring. */

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Eye, Monitor, MonitorOff, Search, X } from 'lucide-react';
import type { DocNode } from '@shared/types';
import { useStore } from '../../../state/store';
import { useDocTypes, usePlugins } from '../../manager';
import type { SecondWindowController } from './controller';

/** doc types the player window knows how to render */
const DISPLAYABLE = new Set(['core/note', 'hexcrawl/map']);

export function SecondWindowControlPanel({ controller }: { controller: SecondWindowController }) {
  const { docs } = useStore();
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const docTypes = useDocTypes();
  const [query, setQuery] = useState('');

  // map display only makes sense while the hexcrawl plugin is active
  const plugins = usePlugins();
  const hexcrawlActive = plugins.find((p) => p.manifest.id === 'diegesis/hexcrawl')?.active ?? false;

  const displayable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => DISPLAYABLE.has(d.type) && (d.type !== 'hexcrawl/map' || hexcrawlActive))
      .filter((d) => !q || d.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [docs, query, hexcrawlActive]);

  const typeInfo = (doc: DocNode) => docTypes.find((t) => t.docType === doc.type);
  const shownTitle = snap.shown ? (docs.find((d) => d.id === snap.shown!.docId)?.title ?? 'Documento removido') : null;

  const show = (doc: DocNode) => {
    if (doc.type === 'hexcrawl/map') controller.showMap(doc.id);
    else controller.showNote(doc.id);
  };

  return (
    <div className="h-full flex flex-col min-h-0 text-[12.5px] text-ink-1">
      <div className="p-3 space-y-3 shrink-0">
        {/* window toggle */}
        <button
          onClick={() => controller.toggleWindow()}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            snap.windowOpen ? 'border-accent bg-accent-soft text-ink-1' : 'border-line hover:border-ink-3 text-ink-2'
          }`}
        >
          {snap.windowOpen ? <Monitor size={14} /> : <MonitorOff size={14} />}
          {snap.windowOpen ? 'Janela aberta — clique para fechar' : 'Abrir janela do jogador'}
        </button>

        {/* currently shown */}
        <div className="rounded-lg border border-line bg-overlay px-3 py-2 flex items-center gap-2">
          <Eye size={13} className="text-ink-3 shrink-0" />
          <span className="flex-1 truncate text-ink-2">
            {shownTitle ? (
              <>
                Exibindo: <strong className="text-ink-1">{shownTitle}</strong>
              </>
            ) : (
              'Nada em exibição'
            )}
          </span>
          {snap.shown && (
            <button title="Limpar tela do jogador" onClick={() => controller.clear()} className="p-1 rounded text-ink-3 hover:text-danger">
              <X size={13} />
            </button>
          )}
        </div>

        {/* unified document search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nota ou mapa…"
            className="w-full bg-overlay border border-line rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] text-ink-1 outline-none placeholder:text-ink-3 focus:border-accent"
          />
        </div>
      </div>

      {/* document list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-0.5">
        {displayable.length === 0 && (
          <p className="text-[11.5px] text-ink-3 italic px-1 py-2">
            {query ? 'Nenhum documento encontrado.' : 'Nenhuma nota ou mapa neste reino.'}
          </p>
        )}
        {displayable.map((doc) => {
          const info = typeInfo(doc);
          const Icon = info?.icon;
          const isShown = snap.shown?.docId === doc.id;
          return (
            <button
              key={doc.id}
              onClick={() => show(doc)}
              title={`Exibir "${doc.title || 'Sem título'}" na janela do jogador`}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors ${
                isShown ? 'border-accent bg-accent-soft' : 'border-transparent hover:border-line hover:bg-overlay'
              }`}
            >
              {Icon && <Icon size={14} className={`${info?.iconColor ?? 'text-ink-3'} shrink-0`} />}
              <span className="flex-1 min-w-0 truncate">{doc.title || 'Sem título'}</span>
              {isShown ? (
                <span className="text-[10px] uppercase tracking-wide text-accent font-semibold shrink-0">Exibindo</span>
              ) : (
                <span className="text-[10.5px] text-ink-3 shrink-0">{info?.label ?? doc.type}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* viewport mirroring (maps) */}
      {hexcrawlActive && (
        <div className="px-3 pb-3 shrink-0">
          <label className="flex items-center gap-2 text-ink-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={snap.mirrorViewport}
              onChange={(e) => controller.setMirrorViewport(e.target.checked)}
              className="accent-[#2383e2]"
            />
            Espelhar viewport do mestre (pan/zoom em tempo real)
          </label>
        </div>
      )}
    </div>
  );
}
