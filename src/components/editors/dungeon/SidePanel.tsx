// Painel lateral do editor de dungeon. Nada selecionado: listas compactas de
// salas e pins (+ fog quando a tool de névoa está ativa). Com uma sala ou pin
// selecionado (clique no canvas ou na lista) o painel expande e mostra os
// detalhes: nome, cor e a descrição rica (BlockNote completo, igual às notes).

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CloudFog, Eye, EyeOff, MapPin, Trash2 } from 'lucide-react';
import { type DungeonMapDoc, type DungeonMarker, type DungeonRoom } from './model';
import { ROOM_COLORS } from './model';
import type { DungeonController } from './canvas/controller';
import { RichNoteField } from '../shared/RichNoteField';

export type DungeonSelection = { kind: 'room' | 'pin'; id: string } | null;

/** rascunho local com commit no blur/Enter — evita uma entrada de undo e um
 *  redraw completo do mapa POR TECLA (o commit grava uma única mutação) */
function useDraft(value: string, commit: (v: string) => void) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  return {
    draft,
    onChange: (v: string) => setDraft(v),
    onFocus: () => setEditing(true),
    onBlur: () => {
      setEditing(false);
      if (draft !== value) commit(draft);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') (e.target as HTMLElement).blur();
    },
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2 border-b border-line">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-2">{title}</div>
      {children}
    </div>
  );
}

const inputCls =
  'flex-1 min-w-0 rounded-md border border-line bg-app px-2 py-1 text-xs text-ink-1 outline-none focus:border-accent';

// ---------- detalhes da sala selecionada ----------

function RoomDetails({
  room,
  controller,
  onBack,
}: {
  room: DungeonRoom;
  controller(): DungeonController | null;
  onBack(): void;
}) {
  const name = useDraft(room.name, (v) => controller()?.updateRoom(room.id, { name: v }));
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <button
          title="Voltar para a lista"
          onClick={onBack}
          className="p-1 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        <span
          className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[11px] font-bold text-[#e8e2d0]"
          style={{ background: room.color ?? ROOM_COLORS[0] }}
        >
          {room.number}
        </span>
        <input
          value={name.draft}
          placeholder={`Sala ${room.number}`}
          onChange={(e) => name.onChange(e.target.value)}
          onFocus={name.onFocus}
          onBlur={name.onBlur}
          onKeyDown={name.onKeyDown}
          className={inputCls}
        />
        <button
          title="Remover sala (e suas células)"
          onClick={() => {
            controller()?.removeRoom(room.id);
            onBack();
          }}
          className="p-1.5 rounded-md text-ink-3 hover:text-red-400 hover:bg-hover transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex items-center gap-1 mb-2">
        {ROOM_COLORS.map((c) => (
          <button
            key={c}
            title="Cor da sala"
            onClick={() => controller()?.updateRoom(room.id, { color: c })}
            className={`w-5 h-5 rounded-full border-2 transition-colors ${
              (room.color ?? ROOM_COLORS[0]) === c ? 'border-accent' : 'border-transparent hover:border-line'
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
        Descrição
      </div>
      <RichNoteField
        key={room.id}
        value={room.description}
        onChange={(json) => controller()?.updateRoom(room.id, { description: json })}
        className="rounded-md border border-line bg-app min-h-32"
      />
    </div>
  );
}

// ---------- detalhes do pin selecionado ----------

function PinDetails({
  marker,
  controller,
  onBack,
}: {
  marker: DungeonMarker;
  controller(): DungeonController | null;
  onBack(): void;
}) {
  const label = useDraft(marker.label, (v) => controller()?.updateMarker(marker.id, { label: v }));
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-2">
        <button
          title="Voltar para a lista"
          onClick={onBack}
          className="p-1 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        <MapPin size={14} className="text-map shrink-0" />
        <input
          value={label.draft}
          placeholder="Rótulo"
          onChange={(e) => label.onChange(e.target.value)}
          onFocus={label.onFocus}
          onBlur={label.onBlur}
          onKeyDown={label.onKeyDown}
          className={inputCls}
        />
        <button
          title="Remover marcador"
          onClick={() => {
            controller()?.removeMarker(marker.id);
            onBack();
          }}
          className="p-1.5 rounded-md text-ink-3 hover:text-red-400 hover:bg-hover transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
        Descrição
      </div>
      <RichNoteField
        key={marker.id}
        value={marker.description}
        onChange={(json) => controller()?.updateMarker(marker.id, { description: json })}
        className="rounded-md border border-line bg-app min-h-32"
      />
      <p className="text-[11px] text-ink-3 mt-2">
        Use <code className="text-ink-2">[[</code> para vincular notas do universo.
      </p>
    </div>
  );
}

// ---------- painel ----------

export function DungeonSidePanel({
  model,
  tool,
  selection,
  onSelect,
  controller,
}: {
  model: DungeonMapDoc;
  /** tool ativa — o painel de fog só aparece com a tool de névoa selecionada */
  tool: string;
  selection: DungeonSelection;
  onSelect(sel: DungeonSelection): void;
  controller(): DungeonController | null;
}) {
  const room = selection?.kind === 'room' ? model.rooms.find((r) => r.id === selection.id) : null;
  const pin = selection?.kind === 'pin' ? model.markers.find((m) => m.id === selection.id) : null;

  return (
    // sem transition de largura de propósito: animar a largura redimensiona o
    // host do canvas a cada frame → renderer.resize() → o buffer WebGL pisca
    // preto. Expansão instantânea custa um único resize imperceptível.
    <div
      className={`${
        selection ? 'w-96' : 'w-64'
      } shrink-0 border-l border-line bg-sidebar overflow-y-auto custom-scrollbar`}
    >
      {room ? (
        <RoomDetails room={room} controller={controller} onBack={() => onSelect(null)} />
      ) : pin ? (
        <PinDetails marker={pin} controller={controller} onBack={() => onSelect(null)} />
      ) : (
        <>
          <Section title={`Salas (${model.rooms.length})`}>
            {model.rooms.length === 0 && (
              <p className="text-xs text-ink-3 mb-2">
                Arraste um retângulo com a tool Sala (B) ou gere um dungeon procedural (🎲).
              </p>
            )}
            {model.rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelect({ kind: 'room', id: r.id })}
                className="w-full flex items-center gap-2 rounded-lg border border-line bg-app px-2 py-1.5 mb-1.5 text-left hover:border-accent transition-colors"
              >
                <span
                  className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-[10px] font-bold text-[#e8e2d0]"
                  style={{ background: r.color ?? ROOM_COLORS[0] }}
                >
                  {r.number}
                </span>
                <span className="flex-1 min-w-0 truncate text-xs text-ink-1">
                  {r.name || `Sala ${r.number}`}
                </span>
                <ChevronRight size={13} className="text-ink-3 shrink-0" />
              </button>
            ))}
          </Section>

          <Section title={`Marcadores (${model.markers.length})`}>
            {model.markers.map((m) => (
              <button
                key={m.id}
                onClick={() => onSelect({ kind: 'pin', id: m.id })}
                className="w-full flex items-center gap-2 rounded-lg border border-line bg-app px-2 py-1.5 mb-1.5 text-left hover:border-accent transition-colors"
              >
                <MapPin size={13} className="text-map shrink-0" />
                <span className="flex-1 min-w-0 truncate text-xs text-ink-1">
                  {m.label || 'Marcador'}
                </span>
                <ChevronRight size={13} className="text-ink-3 shrink-0" />
              </button>
            ))}
          </Section>

          {tool === 'dungeon-fog' && (
            <Section title="Névoa de guerra">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => controller()?.setFogEnabled(!model.fog.enabled)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
                    model.fog.enabled
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
                  }`}
                >
                  <CloudFog size={13} />
                  {model.fog.enabled ? 'Ativada' : 'Desativada'}
                </button>
                <button
                  title="Revelar tudo"
                  onClick={() => controller()?.revealAll()}
                  className="p-1.5 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
                >
                  <Eye size={14} />
                </button>
                <button
                  title="Esconder tudo"
                  onClick={() => controller()?.hideAll()}
                  className="p-1.5 rounded-md text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
                >
                  <EyeOff size={14} />
                </button>
              </div>
              <p className="text-[11px] text-ink-3">
                Pinte para revelar áreas aos jogadores (botão direito esconde).
              </p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
