/* ============================================================
   Dungeon toolbar — rail esquerdo de tools + ações globais
   (mesmo padrão visual do HexcrawlToolbar)
   ============================================================ */

import React from 'react';
import {
  MousePointer2,
  Hand,
  SquareDashed,
  Spline,
  Eraser,
  DoorOpen,
  MapPin,
  CloudFog,
  Type,
  Waypoints,
  Paintbrush,
  SquareDashedMousePointer,
  Undo2,
  Redo2,
  Dices,
  ImageDown,
  FileCode2,
} from 'lucide-react';
import type { CustomFont } from '../../../../shared/types';
import { FONT_OPTIONS } from './model';

const TOOLS: { id: string; title: string; kbd: string; icon: React.FC<{ size?: number | string }> }[] = [
  { id: 'select', title: 'Selecionar / mover marcadores e anotações', kbd: 'V', icon: MousePointer2 },
  { id: 'hand', title: 'Mover câmera', kbd: 'H', icon: Hand },
  { id: 'dungeon-room', title: 'Desenhar sala (arraste um retângulo; botão direito apaga)', kbd: 'B', icon: SquareDashed },
  { id: 'dungeon-corridor', title: 'Desenhar corredor (botão direito apaga)', kbd: 'C', icon: Spline },
  { id: 'dungeon-erase', title: 'Borracha de células', kbd: 'X', icon: Eraser },
  { id: 'dungeon-door', title: 'Porta: clique numa parede para adicionar/remover', kbd: 'D', icon: DoorOpen },
  { id: 'dungeon-pin', title: 'Marcador (duplo clique abre o doc vinculado)', kbd: 'P', icon: MapPin },
  { id: 'dungeon-fog', title: 'Névoa de guerra: revelar (botão direito esconde)', kbd: 'G', icon: CloudFog },
  { id: 'dungeon-text', title: 'Texto: clique para colocar um rótulo (duplo clique edita)', kbd: 'T', icon: Type },
  { id: 'dungeon-line', title: 'Linha/seta: cliques adicionam pontos, duplo clique ou Enter finaliza', kbd: 'L', icon: Waypoints },
  { id: 'dungeon-brush', title: 'Desenho livre', kbd: 'F', icon: Paintbrush },
  { id: 'dungeon-highlight', title: 'Destaque de área (retângulo/elipse translúcido)', kbd: 'R', icon: SquareDashedMousePointer },
];

const DOOR_KINDS = [
  { id: 'normal', label: 'Normal' },
  { id: 'secret', label: 'Secreta' },
  { id: 'locked', label: 'Trancada' },
  { id: 'portcullis', label: 'Grade' },
] as const;

const CHIP =
  'px-2 py-1 rounded-md text-[11px] transition-colors';
const chipCls = (active: boolean) =>
  `${CHIP} ${active ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'}`;

function Palette({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-line bg-elevated p-1 shadow-lg">
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange(v: string): void }) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Cor"
      className="w-7 h-7 rounded-md border border-line bg-app cursor-pointer"
    />
  );
}

/** paleta contextual da tool ativa — renderizada pelo DungeonMap sobre o
 *  canvas (o rail tem overflow). Segue o padrão das paletas do hexmap. */
export function DungeonToolPalette({
  tool,
  toolOptions,
  setToolOption,
  realmFonts,
}: {
  tool: string;
  toolOptions: Record<string, Record<string, unknown>>;
  setToolOption(toolId: string, key: string, value: unknown): void;
  realmFonts: CustomFont[];
}) {
  const opts = toolOptions[tool] ?? {};
  const color = (opts.color as string) ?? (tool === 'dungeon-text' ? '#e8e2d0' : '#d9a45f');

  if (tool === 'dungeon-door') {
    const kind = (opts.kind as string) ?? 'normal';
    return (
      <Palette>
        {DOOR_KINDS.map((k) => (
          <button key={k.id} onClick={() => setToolOption(tool, 'kind', k.id)} className={chipCls(kind === k.id)}>
            {k.label}
          </button>
        ))}
      </Palette>
    );
  }

  if (tool === 'dungeon-text') {
    // estilo aplicado aos NOVOS rótulos — a digitação é inline no canvas
    return (
      <Palette>
        <select
          value={(opts.font as string) ?? 'inherit'}
          onChange={(e) => setToolOption(tool, 'font', e.target.value)}
          title="Fonte"
          className="rounded-md border border-line bg-app px-1.5 py-1 text-[11px] text-ink-1 outline-none focus:border-accent"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
          {realmFonts.map((f) => (
            <option key={f.id} value={`"${f.name}"`}>
              {f.name} (realm)
            </option>
          ))}
        </select>
        <input
          type="number"
          value={(opts.size as number) ?? 15}
          min={8}
          max={96}
          onChange={(e) => {
            const size = e.target.valueAsNumber;
            if (!Number.isNaN(size)) setToolOption(tool, 'size', size);
          }}
          title="Tamanho"
          className="w-14 rounded-md border border-line bg-app px-1.5 py-1 text-[11px] text-ink-1 outline-none focus:border-accent text-right"
        />
        <button
          title="Negrito"
          onClick={() => setToolOption(tool, 'bold', !(opts.bold ?? false))}
          className={`${chipCls(!!(opts.bold ?? false))} font-bold`}
        >
          B
        </button>
        <button
          title="Itálico"
          onClick={() => setToolOption(tool, 'italic', !(opts.italic ?? false))}
          className={`${chipCls(!!(opts.italic ?? false))} italic`}
        >
          I
        </button>
        <ColorInput value={color} onChange={(v) => setToolOption(tool, 'color', v)} />
      </Palette>
    );
  }

  if (tool === 'dungeon-line') {
    return (
      <Palette>
        <button onClick={() => setToolOption(tool, 'arrow', false)} className={chipCls(!opts.arrow)}>
          Linha
        </button>
        <button onClick={() => setToolOption(tool, 'arrow', true)} className={chipCls(!!opts.arrow)}>
          Seta
        </button>
        <ColorInput value={color} onChange={(v) => setToolOption(tool, 'color', v)} />
      </Palette>
    );
  }

  if (tool === 'dungeon-brush') {
    return (
      <Palette>
        <ColorInput value={color} onChange={(v) => setToolOption(tool, 'color', v)} />
      </Palette>
    );
  }

  if (tool === 'dungeon-highlight') {
    return (
      <Palette>
        <button onClick={() => setToolOption(tool, 'ellipse', false)} className={chipCls(!opts.ellipse)}>
          Retângulo
        </button>
        <button onClick={() => setToolOption(tool, 'ellipse', true)} className={chipCls(!!opts.ellipse)}>
          Elipse
        </button>
        <button onClick={() => setToolOption(tool, 'fill', !(opts.fill ?? true))} className={chipCls(!!(opts.fill ?? true))}>
          Preenchido
        </button>
        <ColorInput value={color} onChange={(v) => setToolOption(tool, 'color', v)} />
      </Palette>
    );
  }

  return null;
}

export function DungeonToolbar({
  tool,
  setTool,
  undo,
  redo,
  canUndo,
  canRedo,
  onGenerate,
  onExportPng,
  onExportSvg,
}: {
  tool: string;
  setTool(id: string): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  onGenerate(): void;
  onExportPng(): void;
  onExportSvg(): void;
}) {
  const btn = (active: boolean) =>
    `p-2 rounded-lg transition-colors shrink-0 ${
      active ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
    }`;
  return (
    <div className="w-11 shrink-0 flex flex-col items-center py-2 gap-1 border-r border-line bg-sidebar overflow-y-auto custom-scrollbar">
      <button title="Desfazer (Ctrl+Z)" onClick={undo} disabled={!canUndo}
        className={`${btn(false)} disabled:opacity-30 disabled:pointer-events-none`}>
        <Undo2 size={17} />
      </button>
      <button title="Refazer (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}
        className={`${btn(false)} disabled:opacity-30 disabled:pointer-events-none`}>
        <Redo2 size={17} />
      </button>
      <div className="w-6 border-t border-line my-0.5 shrink-0" />
      {TOOLS.map((t) => (
        <button key={t.id} title={`${t.title} (${t.kbd})`} onClick={() => setTool(t.id)} className={btn(tool === t.id)}>
          <t.icon size={17} />
        </button>
      ))}
      <div className="w-6 border-t border-line my-0.5 shrink-0" />
      <button title="Gerar dungeon procedural" onClick={onGenerate} className={btn(false)}>
        <Dices size={17} />
      </button>
      <button title="Exportar PNG" onClick={onExportPng} className={btn(false)}>
        <ImageDown size={17} />
      </button>
      <button title="Exportar SVG" onClick={onExportSvg} className={btn(false)}>
        <FileCode2 size={17} />
      </button>
    </div>
  );
}
