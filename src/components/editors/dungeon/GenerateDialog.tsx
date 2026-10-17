// Diálogo de geração procedural: seed + tema + nº de salas + looping.
// Aplica o resultado no DungeonController como uma única unidade de undo.

import { useState } from 'react';
import { Dices, RefreshCw } from 'lucide-react';
import {
  DUNGEON_THEMES,
  generateDungeon,
  randomSeed,
  type DungeonTheme,
} from './generator';
import type { DungeonCell, DungeonDoor, DungeonGeneration, DungeonMapDoc, DungeonRoom } from './model';

export function GenerateDialog({
  model,
  onClose,
  onApply,
}: {
  model: DungeonMapDoc;
  onClose(): void;
  onApply(
    result: { cells: DungeonCell[]; rooms: DungeonRoom[]; doors: DungeonDoor[] },
    generation: DungeonGeneration
  ): void;
}) {
  const [seed, setSeed] = useState(() => model.generation?.seed ?? randomSeed());
  const [theme, setTheme] = useState<DungeonTheme>(
    () => (model.generation?.theme as DungeonTheme) ?? 'dungeon'
  );
  const [roomCount, setRoomCount] = useState(() => model.generation?.roomCount ?? 8);
  const [looping, setLooping] = useState(() => model.generation?.looping ?? 0.25);
  const hasMap = model.cells.length > 0;

  const apply = () => {
    const generation: DungeonGeneration = { seed, theme, roomCount, looping };
    onApply(generateDungeon({ seed, theme, roomCount, looping }, model.grid), generation);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-96 rounded-xl border border-line bg-elevated p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Dices size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-ink-1">Gerar dungeon procedural</h2>
        </div>

        <label className="block text-xs text-ink-3 mb-1">Seed</label>
        <div className="flex gap-1.5 mb-3">
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-app px-3 py-1.5 text-sm text-ink-1 outline-none focus:border-accent font-mono"
          />
          <button
            title="Seed aleatória"
            onClick={() => setSeed(randomSeed())}
            className="p-2 rounded-lg border border-line text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <label className="block text-xs text-ink-3 mb-1">Tema</label>
        <div className="flex gap-1.5 mb-3">
          {DUNGEON_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                theme === t.id ? 'bg-accent-soft text-accent' : 'text-ink-3 hover:text-ink-1 hover:bg-hover'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="block text-xs text-ink-3 mb-1">
          Salas: <span className="text-ink-1">{roomCount}</span>
        </label>
        <input
          type="range"
          min={4}
          max={16}
          value={roomCount}
          onChange={(e) => setRoomCount(Number(e.target.value))}
          className="w-full mb-3 accent-[var(--color-accent)]"
        />

        <label className="block text-xs text-ink-3 mb-1">
          Ramificação: <span className="text-ink-1">{Math.round(looping * 100)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={looping}
          onChange={(e) => setLooping(Number(e.target.value))}
          className="w-full mb-4 accent-[var(--color-accent)]"
        />

        {hasMap && (
          <p className="text-[11px] text-amber-400/90 mb-3">
            Gerar substitui salas, corredores e portas atuais (desfazível com Ctrl+Z).
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-ink-3 hover:text-ink-1 hover:bg-hover transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={apply}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-soft text-accent hover:brightness-110 transition-all"
          >
            Gerar dungeon
          </button>
        </div>
      </div>
    </div>
  );
}
