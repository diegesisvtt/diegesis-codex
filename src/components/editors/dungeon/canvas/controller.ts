// DungeonController — fachada de mutação do mapa sobre o kernel do canvas.
// O documento raiz (`dungeon-map`) carrega o DungeonMapDoc inteiro; markers
// vivem como documentos `dungeon-marker` na layer própria. Toda mutação
// passa por `update(changes, { before })` → undo/redo via HistoryManager.

import { dynamicBus, type Canvas, type PlaceablesLayer } from '@diegesis/canvas';
import {
  cellKey,
  createDefaultDungeon,
  doorAt,
  generateDungeonId,
  inGrid,
  serializeDungeon,
  type DungeonCell,
  type DungeonDoor,
  type DungeonDoorKind,
  type DungeonMapDoc,
  type DungeonMarker,
  type DungeonRoom,
  type DungeonShape,
  type DungeonWallSide,
} from '../model';
import type { DungeonMapPlaceable } from './DungeonMapPlaceable';

const controllers = new WeakMap<Canvas, DungeonController>();

export function controllerOf(canvas: Canvas): DungeonController {
  const c = controllers.get(canvas);
  if (!c) throw new Error('DungeonController não inicializado para este canvas');
  return c;
}

/** acesso tolerante (placeables recebem CanvasLike) — null fora do editor */
export function controllerFor(canvas: { bus: unknown }): DungeonController | null {
  return controllers.get(canvas as Canvas) ?? null;
}

type RootLayer = PlaceablesLayer<DungeonMapDoc, DungeonMapPlaceable, DungeonMapDoc>;

export class DungeonController {
  /** true durante hydrate: mutações não disparam eventos/saves parciais */
  hydrating = false;
  /** sala selecionada pela Select tool (efêmero — não faz parte do documento) */
  selectedRoomId: string | null = null;

  constructor(readonly canvas: Canvas) {
    controllers.set(canvas, this);
  }

  /** seleciona uma sala (highlight no canvas + detalhes no painel React) */
  setSelectedRoom(id: string | null): void {
    if (this.selectedRoomId === id) return;
    this.selectedRoomId = id;
    this.root()?.refresh();
    dynamicBus(this.canvas.bus).emit('dungeon:room-selected', { roomId: id });
  }

  // ---------- acesso ----------

  private rootLayer(): RootLayer {
    return this.canvas.documents.layer('dungeon-map') as unknown as RootLayer;
  }

  root(): DungeonMapPlaceable | undefined {
    return this.rootLayer()?.placeables[0];
  }

  doc(): DungeonMapDoc {
    return this.root()?.document ?? createDefaultDungeon();
  }

  private hydrateQueue: Promise<void> = Promise.resolve();

  /** hidrata o canvas a partir do conteúdo do documento — hidratações são
   *  enfileiradas (mudanças externas durante sync nunca são descartadas) */
  hydrate(doc: DungeonMapDoc): Promise<void> {
    this.hydrateQueue = this.hydrateQueue.then(() => this.doHydrate(doc));
    return this.hydrateQueue;
  }

  private async doHydrate(doc: DungeonMapDoc): Promise<void> {
    this.hydrating = true;
    try {
      const layer = this.rootLayer();
      for (const p of [...layer.placeables]) layer.delete(p.id);
      const markers = this.canvas.documents.layer('dungeon-marker');
      if (markers) for (const p of [...markers.placeables]) markers.delete(p.id);
      const shapes = this.canvas.documents.layer('dungeon-shape');
      if (shapes) for (const p of [...shapes.placeables]) shapes.delete(p.id);
      // id fixo: undo entries anteriores seguem válidos e o id não vaza pro save
      await this.canvas.documents.create('dungeon-map', { ...doc, id: 'dungeon-root' });
      for (const m of doc.markers) await this.canvas.documents.create('dungeon-marker', m);
      for (const s of doc.shapes) await this.canvas.documents.create('dungeon-shape', s);
      // carga não é edição: o histórico começa limpo após hidratar
      this.canvas.history.clear();
    } finally {
      this.hydrating = false;
    }
    this.emitChange();
  }

  /** serializa o estado atual do canvas (root + markers + shapes) */
  serialize(): string {
    const doc = this.doc();
    // campos do kernel (id do placeable, locked) não fazem parte do modelo
    const collect = <T extends { id: string }>(type: string): T[] => {
      const layer = this.canvas.documents.layer(type);
      if (!layer) return [];
      return layer.placeables.map((p) => {
        const d = { ...(p.document as T), id: p.id };
        delete (d as Record<string, unknown>).locked;
        return d;
      });
    };
    const clean: Record<string, unknown> = {
      ...doc,
      markers: collect<DungeonMarker>('dungeon-marker'),
      shapes: collect<DungeonShape>('dungeon-shape'),
    };
    delete clean.id;
    delete clean.locked;
    return serializeDungeon(clean as unknown as DungeonMapDoc);
  }

  // ---------- mutação undoable ----------

  /** aplica mudança parcial no doc raiz (a layer grava o `before` no histórico;
   *  o evento document:update dispara o emitChange — ver plugin.ts) */
  mutate(changes: Partial<DungeonMapDoc>): void {
    const root = this.root();
    if (!root) return;
    this.canvas.documents.update('dungeon-map', root.id, changes);
  }

  /** agrupa uma sequência de mutações numa única unidade de undo */
  batch(fn: () => void): void {
    this.canvas.history.beginBatch();
    try {
      fn();
    } finally {
      this.canvas.history.endBatch();
    }
  }

  // ---------- células ----------

  /** pinta células (mescla por posição); cria sala nova quando pedido */
  paintCells(cells: DungeonCell[], newRoom?: DungeonRoom): void {
    const doc = this.doc();
    const index = new Map(doc.cells.map((c, i) => [cellKey(c.x, c.y), i]));
    const next = [...doc.cells];
    for (const c of cells) {
      if (!inGrid(doc.grid, c.x, c.y)) continue;
      const at = index.get(cellKey(c.x, c.y));
      if (at != null) next[at] = c;
      else next.push(c);
    }
    const changes: Partial<DungeonMapDoc> = { cells: next };
    if (newRoom) changes.rooms = [...doc.rooms, newRoom];
    this.mutate(changes);
  }

  /** apaga células; remove portas órfãs e salas que esvaziaram */
  eraseCells(keys: Set<string>): void {
    const doc = this.doc();
    const cells = doc.cells.filter((c) => !keys.has(cellKey(c.x, c.y)));
    const surviving = new Set(cells.map((c) => cellKey(c.x, c.y)));
    const rooms = doc.rooms.filter((r) => cells.some((c) => c.roomId === r.id));
    const doors = doc.doors.filter((d) => surviving.has(cellKey(d.x, d.y)));
    this.mutate({ cells, rooms, doors });
  }

  // ---------- salas ----------

  addRoom(room: DungeonRoom): void {
    this.mutate({ rooms: [...this.doc().rooms, room] });
  }

  updateRoom(id: string, changes: Partial<DungeonRoom>): void {
    const rooms = this.doc().rooms.map((r) => (r.id === id ? { ...r, ...changes } : r));
    this.mutate({ rooms });
  }

  removeRoom(id: string): void {
    const doc = this.doc();
    const cells = doc.cells.filter((c) => c.roomId !== id);
    const surviving = new Set(cells.map((c) => cellKey(c.x, c.y)));
    this.mutate({
      rooms: doc.rooms.filter((r) => r.id !== id),
      cells,
      doors: doc.doors.filter((d) => surviving.has(cellKey(d.x, d.y))),
    });
  }

  nextRoomNumber(): number {
    return this.doc().rooms.reduce((n, r) => Math.max(n, r.number), 0) + 1;
  }

  // ---------- portas ----------

  /** adiciona ou remove a porta na parede dada */
  toggleDoor(x: number, y: number, side: DungeonWallSide, kind: DungeonDoorKind): void {
    const doc = this.doc();
    const existing = doorAt(doc, x, y, side);
    if (existing) {
      this.mutate({ doors: doc.doors.filter((d) => d.id !== existing.id) });
      return;
    }
    const door: DungeonDoor = { id: generateDungeonId(), x, y, side, kind };
    this.mutate({ doors: [...doc.doors, door] });
  }

  // ---------- fog ----------

  setFogEnabled(enabled: boolean): void {
    this.mutate({ fog: { ...this.doc().fog, enabled } });
  }

  setCellsRevealed(keys: string[], revealed: boolean): void {
    const doc = this.doc();
    const set = new Set(doc.fog.revealed);
    for (const k of keys) {
      if (revealed) set.add(k);
      else set.delete(k);
    }
    const fog = { enabled: doc.fog.enabled || revealed, revealed: [...set] };
    this.mutate({ fog });
  }

  revealAll(): void {
    const doc = this.doc();
    const revealed: string[] = [];
    for (let y = 0; y < doc.grid.rows; y++)
      for (let x = 0; x < doc.grid.cols; x++) revealed.push(cellKey(x, y));
    this.mutate({ fog: { ...doc.fog, revealed } });
  }

  hideAll(): void {
    this.mutate({ fog: { ...this.doc().fog, revealed: [] } });
  }

  // ---------- shapes (documentos na layer `dungeon-shape`) ----------

  async addShape(shape: Omit<DungeonShape, 'id'>): Promise<string> {
    const id = generateDungeonId();
    await this.canvas.documents.create('dungeon-shape', { ...shape, id });
    return id;
  }

  updateShape(id: string, changes: Partial<DungeonShape>): void {
    this.canvas.documents.update('dungeon-shape', id, changes);
  }

  removeShape(id: string): void {
    this.canvas.documents.delete('dungeon-shape', id);
  }

  // ---------- markers (documentos na layer `dungeon-marker`) ----------

  async addMarker(marker: Omit<DungeonMarker, 'id'>): Promise<void> {
    await this.canvas.documents.create('dungeon-marker', { ...marker, id: generateDungeonId() });
  }

  updateMarker(id: string, changes: Partial<DungeonMarker>): void {
    this.canvas.documents.update('dungeon-marker', id, changes);
  }

  removeMarker(id: string): void {
    this.canvas.documents.delete('dungeon-marker', id);
  }

  // ---------- eventos ----------

  /** avisa o React (save debounce, painéis) que o modelo mudou */
  emitChange(): void {
    if (this.hydrating) return;
    dynamicBus(this.canvas.bus).emit('dungeon:change');
  }
}
