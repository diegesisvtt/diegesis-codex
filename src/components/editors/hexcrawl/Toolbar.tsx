/* ============================================================
   Hexcrawl toolbar — left tool rail + contextual bottom palette
   (terrain/feature/line/text/region pickers follow the active tool)
   ============================================================ */

import React from 'react';
import {
  MousePointer2,
  Hand,
  Paintbrush,
  MapPin,
  Waypoints,
  Type,
  Shapes,
  Ruler,
  Magnet,
  Palette,
  Layers,
  Settings2,
  Dices,
  KeySquare,
  Undo2,
  Redo2,
  CloudFog,
} from 'lucide-react';
import type { HexMapDoc, TerrainDef, FeatureDef, LineStyle, TextStyle } from './model';
import { getGlyph } from './icons';

export type HexTool = 'select' | 'pan' | 'terrain' | 'pin' | 'line' | 'text' | 'region' | 'fog' | 'measure';

export type PanelTab = 'hex' | 'styles' | 'layers' | 'regions' | 'travel' | 'config' | 'generate' | 'key';

const TOOLS: { id: HexTool; title: string; kbd: string; icon: React.FC<{ size?: number | string }> }[] = [
  { id: 'select', title: 'Selecionar / inspecionar hex', kbd: 'V', icon: MousePointer2 },
  { id: 'pan', title: 'Mover câmera', kbd: 'H', icon: Hand },
  { id: 'terrain', title: 'Pintar terreno (botão direito apaga)', kbd: 'T', icon: Paintbrush },
  { id: 'pin', title: 'Marcador com nota vinculada (pin)', kbd: 'P', icon: MapPin },
  { id: 'line', title: 'Desenhar linha (rio, estrada…)', kbd: 'L', icon: Waypoints },
  { id: 'text', title: 'Adicionar texto', kbd: 'X', icon: Type },
  { id: 'region', title: 'Pintar região (botão direito remove)', kbd: 'R', icon: Shapes },
  { id: 'fog', title: 'Névoa de guerra (botão direito revela)', kbd: 'G', icon: CloudFog },
  { id: 'measure', title: 'Medir distância / viagem', kbd: 'M', icon: Ruler },
];

/**
 * Painéis contextuais (hex/regions/travel) não têm toggle próprio: abrem
 * junto com a ferramenta companheira (ver TOOL_PANEL no HexcrawlMap).
 * Aqui ficam apenas os painéis globais do mapa.
 */
const PANELS: { id: PanelTab; title: string; icon: React.FC<{ size?: number | string }> }[] = [
  { id: 'styles', title: 'Estilos de linha e texto', icon: Palette },
  { id: 'layers', title: 'Camadas e numeração', icon: Layers },
  { id: 'generate', title: 'Gerador de terreno', icon: Dices },
  { id: 'key', title: 'Chave do mapa (legenda)', icon: KeySquare },
  { id: 'config', title: 'Configurar mapa e hexes', icon: Settings2 },
];

export function HexcrawlToolbar({
  tool,
  setTool,
  snap,
  setSnap,
  panel,
  setPanel,
  undo,
  redo,
  canUndo,
  canRedo,
}: {
  tool: HexTool;
  setTool(t: HexTool): void;
  snap: boolean;
  setSnap(v: boolean): void;
  panel: PanelTab | null;
  setPanel(p: PanelTab | null): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return (
    <div className="w-11 shrink-0 flex flex-col items-center py-2 gap-1 border-r border-line bg-sidebar overflow-y-auto custom-scrollbar">
      {/* history */}
      <button
        title="Desfazer (Ctrl+Z)"
        onClick={undo}
        disabled={!canUndo}
        className="p-2 rounded-lg transition-colors text-ink-3 hover:text-ink-1 hover:bg-hover disabled:opacity-30 disabled:pointer-events-none"
      >
        <Undo2 size={17} />
      </button>
      <button
        title="Refazer (Ctrl+Shift+Z)"
        onClick={redo}
        disabled={!canRedo}
        className="p-2 rounded-lg transition-colors text-ink-3 hover:text-ink-1 hover:bg-hover disabled:opacity-30 disabled:pointer-events-none"
      >
        <Redo2 size={17} />
      </button>
      <div className="w-6 border-t border-line my-0.5 shrink-0" />

      {/* tools (companion panels open together — see TOOL_PANEL) */}
      {TOOLS.map((t) => (
        <button
          key={t.id}
          title={`${t.title} (${t.kbd})`}
          onClick={() => setTool(t.id)}
          className={`p-2 rounded-lg transition-colors shrink-0 ${
            tool === t.id ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
          }`}
        >
          <t.icon size={17} />
        </button>
      ))}
      <button
        title="Snap das linhas aos vértices (segure Alt para desativar temporariamente)"
        onClick={() => setSnap(!snap)}
        className={`p-2 rounded-lg transition-colors shrink-0 ${
          snap ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
        }`}
      >
        <Magnet size={17} />
      </button>
      <div className="w-6 border-t border-line my-0.5 shrink-0" />

      {/* global map panels */}
      {PANELS.map((p) => (
        <button
          key={p.id}
          title={p.title}
          onClick={() => setPanel(panel === p.id ? null : p.id)}
          className={`p-2 rounded-lg transition-colors shrink-0 ${
            panel === p.id ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
          }`}
        >
          <p.icon size={17} />
        </button>
      ))}
    </div>
  );
}

/* ---------- contextual palette (bottom strip) ---------- */

function Swatch({ selected, onClick, title, children }: { selected: boolean; onClick(): void; title: string; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 h-8 rounded-md border text-[12px] whitespace-nowrap transition-colors ${
        selected ? 'border-accent bg-accent-soft text-ink-1' : 'border-line bg-overlay text-ink-2 hover:border-ink-3'
      }`}
    >
      {children}
    </button>
  );
}

export function HexPalette({
  tool,
  map,
  activeTerrain,
  setActiveTerrain,
  activeMarker,
  setActiveMarker,
  activeLineStyle,
  setActiveLineStyle,
  activeTextStyle,
  setActiveTextStyle,
  activeRegionId,
  setActiveRegionId,
}: {
  tool: HexTool;
  map: HexMapDoc;
  activeTerrain: string;
  setActiveTerrain(id: string): void;
  activeMarker: string;
  setActiveMarker(id: string): void;
  activeLineStyle: string;
  setActiveLineStyle(id: string): void;
  activeTextStyle: string;
  setActiveTextStyle(id: string): void;
  activeRegionId: string | null;
  setActiveRegionId(id: string): void;
}) {
  if (tool === 'terrain') {
    return (
      <PaletteStrip>
        {map.terrains.map((t: TerrainDef) => {
          const Glyph = getGlyph(t.icon);
          return (
            <Swatch key={t.id} title={t.name} selected={activeTerrain === t.id} onClick={() => setActiveTerrain(t.id)}>
              <span className="w-4 h-4 rounded-sm border border-black/20 flex items-center justify-center" style={{ background: t.color }}>
                {t.iconSrc ? (
                  <img src={t.iconSrc} alt="" className="w-3.5 h-3.5 object-contain" />
                ) : Glyph ? (
                  <Glyph size={12} color="rgba(0,0,0,.55)" />
                ) : null}
              </span>
              {t.name}
            </Swatch>
          );
        })}
      </PaletteStrip>
    );
  }
  if (tool === 'pin') {
    return (
      <PaletteStrip>
        {map.features.map((f: FeatureDef) => {
          const Glyph = getGlyph(f.icon);
          return (
            <Swatch key={f.id} title={f.name} selected={activeMarker === f.id} onClick={() => setActiveMarker(f.id)}>
              {f.iconSrc ? <img src={f.iconSrc} alt="" className="w-4 h-4 object-contain" /> : Glyph ? <Glyph size={14} color={f.color} /> : null}
              {f.name}
            </Swatch>
          );
        })}
      </PaletteStrip>
    );
  }
  if (tool === 'line') {
    return (
      <PaletteStrip>
        {map.lineStyles.map((s: LineStyle) => (
          <Swatch key={s.id} title={s.name} selected={activeLineStyle === s.id} onClick={() => setActiveLineStyle(s.id)}>
            <svg width="26" height="8">
              <line x1="1" y1="4" x2="25" y2="4" stroke={s.color} strokeWidth={Math.min(s.width, 5)} strokeDasharray={s.dash ? '4 3' : undefined} strokeLinecap="round" />
            </svg>
            {s.name}
          </Swatch>
        ))}
      </PaletteStrip>
    );
  }
  if (tool === 'text') {
    return (
      <PaletteStrip>
        {map.textStyles.map((s: TextStyle) => (
          <Swatch key={s.id} title={s.name} selected={activeTextStyle === s.id} onClick={() => setActiveTextStyle(s.id)}>
            <span
              style={{
                fontFamily: s.font === 'inherit' ? undefined : s.font,
                fontWeight: s.bold ? 700 : 400,
                fontStyle: s.italic ? 'italic' : 'normal',
                letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
                color: s.color,
              }}
              className="bg-white/70 rounded px-1"
            >
              Aa
            </span>
            {s.name}
          </Swatch>
        ))}
      </PaletteStrip>
    );
  }
  if (tool === 'region') {
    return (
      <PaletteStrip>
        {map.regions.length === 0 && <span className="text-ink-3 text-[12px] px-2">Pinte no mapa para criar a primeira região.</span>}
        {map.regions.map((r) => (
          <Swatch key={r.id} title={`${r.name} (${r.hexes.length} hexes)`} selected={activeRegionId === r.id} onClick={() => setActiveRegionId(r.id)}>
            <span className="w-4 h-4 rounded-sm border border-black/20" style={{ background: r.color }} />
            {r.name}
          </Swatch>
        ))}
      </PaletteStrip>
    );
  }
  return null;
}

function PaletteStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-3 right-3 bottom-3 z-20 flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-line bg-sidebar/95 shadow-lg overflow-x-auto custom-scrollbar">
      {children}
    </div>
  );
}
