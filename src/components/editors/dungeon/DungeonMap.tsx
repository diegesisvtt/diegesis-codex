// Editor de Mapa de Dungeon (diegesis/dungeon): React cuida do chrome
// (toolbar, painel lateral, diálogos) e o @diegesis/canvas (PixiJS) cuida do
// canvas — tools, undo/redo, viewport. O canvas é a fonte de verdade durante
// a sessão; mudanças são serializadas para o documento via store (debounced).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, dynamicBus, Easing } from '@diegesis/canvas';
import { gridSquarePlugin } from '@diegesis/canvas-plugin-grid-square';
import { useStore, useRealmFonts } from '../../../state/store';
import { usePluginSettings } from '../../../plugins';
import { REF_DRAG_MIME, parseExplorerDragRef } from '../../../../shared/dragDrop';
import type { DocNode, MapViewport } from '../../../../shared/types';
import { cellKey, noteRefDescription, parseDungeon, roomCenter, type DungeonMapDoc } from './model';
import { blocksToPlainText } from '../../../../shared/blockContent';
import { dungeonCanvasPlugin } from './canvas/plugin';
import { controllerOf } from './canvas/controller';
import { setDungeonAudience } from './canvas/DungeonMapPlaceable';
import { DungeonToolbar, DungeonToolPalette } from './Toolbar';
import { DungeonSidePanel } from './SidePanel';
import { GenerateDialog } from './GenerateDialog';
import { InlineTextEditor } from './TextEditor';
import { exportPng, exportSvg } from './export';

/** glide cinematográfico até um ponto de mundo: o centro interpola com
 *  ease in-out enquanto o zoom afasta ~20% no meio do trajeto e volta
 *  (dolly-out → pan → dolly-in). Interações do usuário cancelam. */
function focusViewport(canvas: Canvas, target: { x: number; y: number }) {
  const vp = canvas.viewport;
  const pixi = vp?.pixi;
  if (!vp || !pixi) return;
  if (!canvas.animation) {
    canvas.centerOn(target.x, target.y);
    return;
  }
  const from = { x: pixi.center.x, y: pixi.center.y };
  const fromScale = pixi.scale.x;
  const ZOOM_OUT = 0.2;
  canvas.animation.cancel('dungeon:focus');
  canvas.animation.animate({
    name: 'dungeon:focus',
    duration: 900,
    ease: Easing.inOutQuad,
    onUpdate: (progress, eased) => {
      const cx = from.x + (target.x - from.x) * eased;
      const cy = from.y + (target.y - from.y) * eased;
      const scale = fromScale * (1 - ZOOM_OUT * Math.sin(Math.PI * progress));
      // pan(x, y, scale) recebe o offset de TELA (mesma fórmula de centerOn)
      canvas.pan(pixi.screenWidth / 2 - cx * scale, pixi.screenHeight / 2 - cy * scale, scale);
    },
  });
}

export function DungeonMap({
  doc,
  onCameraChange,
}: {
  doc: DocNode;
  onCameraChange?: (viewport: MapViewport) => void;
}) {
  const { updateDocument, openDocument, docs } = useStore();
  const realmFonts = useRealmFonts();
  const dungeonSettings = usePluginSettings('diegesis/dungeon');
  /** centralizar a viewport na sala/pin ao selecionar (settings; padrão: ligado) */
  const panToSelection = dungeonSettings.get('panToSelection', true);
  const panToSelectionRef = useRef(panToSelection);
  panToSelectionRef.current = panToSelection;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setToolState] = useState('select');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [model, setModel] = useState<DungeonMapDoc>(() => parseDungeon(doc.content));
  const [generateOpen, setGenerateOpen] = useState(false);
  /** edição inline de texto (estilo tldraw): shape sob o textarea overlay */
  const [editingText, setEditingText] = useState<{ shapeId: string; fresh: boolean } | null>(null);
  const editingTextRef = useRef(editingText);
  editingTextRef.current = editingText;
  /** sala/pin selecionado — detalhes no painel lateral (mutuamente exclusivo) */
  const [selection, setSelection] = useState<{ kind: 'room' | 'pin'; id: string } | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  /** hover para o rich tooltip (350ms parado, tool Selecionar) */
  const [hover, setHover] = useState<{ kind: 'room' | 'pin'; id: string; x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ kind: 'room' | 'pin'; id: string; x: number; y: number } | null>(null);
  /** bump para reposicionar o overlay de texto durante pan/zoom */
  const [, setCamTick] = useState(0);
  /** último content salvo por ESTE editor — evita rehidratar no próprio save */
  const lastSavedRef = useRef<string | null>(doc.content);
  const cameraThrottleRef = useRef(0);
  /** espelho mutável de canvas.tools.options para a paleta contextual */
  const [toolOptions, setToolOptions] = useState<Record<string, Record<string, unknown>>>({});

  // ---------- ciclo de vida do canvas ----------

  useEffect(() => {
    setDungeonAudience('gm');
    const host = hostRef.current;
    if (!host) return;
    const initial = parseDungeon(doc.content);
    const canvas = new Canvas(host, {
      background: '#090c12',
      plugins: [gridSquarePlugin, dungeonCanvasPlugin],
    });
    canvasRef.current = canvas;
    let disposed = false;
    let initialized = false;
    let destroyed = false;
    // destroy() não é idempotente (bus.destroy lança na 2ª vez) e aborta antes
    // do app.destroy se o bus já morreu — o fallback encerra ticker/renderer
    const safeDestroy = () => {
      if (destroyed) return;
      destroyed = true;
      try {
        canvas.destroy();
      } catch {
        try {
          canvas.app.destroy({ removeView: true }, { children: true });
        } catch {
          /* app já destruído */
        }
      }
    };
    const unsubs: (() => void)[] = [];

    void (async () => {
      try {
        await canvas.initialize();
        initialized = true;
        // StrictMode/dev: desmontou durante o init — destrói aqui
        if (disposed) {
          safeDestroy();
          return;
        }
        const { cols, rows, cellSize } = initial.grid;
        canvas.grid.set({ type: 'square', size: cellSize });
        await canvas.draw({
          width: cols * cellSize,
          height: rows * cellSize,
          grid: { type: 'square', size: cellSize },
        });
        if (disposed) return;
        await controllerOf(canvas).hydrate(initial);
        if (disposed) return;
        canvas.fit();
      } catch {
        // desmontado no meio do boot (StrictMode/troca de aba): o canvas já
        // foi destruído pelo cleanup — nada a fazer
        return;
      }

      const bus = dynamicBus(canvas.bus);
      unsubs.push(
        bus.on('dungeon:change', () => {
          const ctrl = controllerOf(canvas);
          const next = ctrl.doc();
          const markersLayer = canvas.documents.layer('dungeon-marker');
          setModel({
            ...next,
            markers: markersLayer
              ? markersLayer.placeables.map((p) => ({
                  ...(p.document as DungeonMapDoc['markers'][number]),
                  id: p.id,
                }))
              : [],
          });
          const content = ctrl.serialize();
          lastSavedRef.current = content;
          updateDocument(doc.id, { content });
        }),
        bus.on('dungeon:open-doc', ({ docId }: { docId: string }) => openDocument(docId)),
        bus.on('dungeon:edit-text', ({ shapeId, fresh }: { shapeId: string; fresh?: boolean }) => {
          setEditingText({ shapeId, fresh: !!fresh });
        }),
        bus.on('dungeon:room-selected', ({ roomId }: { roomId: string | null }) => {
          setSelection(roomId ? { kind: 'room', id: roomId } : null);
        })
      );
      unsubs.push(
        canvas.on('history:change', ({ canUndo, canRedo }) => {
          setCanUndo(canUndo);
          setCanRedo(canRedo);
        }),
        canvas.on('tool:changed', ({ id }) => setToolState(id)),
        canvas.on('pan', reportCamera),
        canvas.on('zoom', reportCamera),
        // pin selecionado via kernel (Select tool) → detalhes no painel
        canvas.on('selection:change', ({ ids }) => {
          const pinId = ids.find((id) => canvas.documents.get('dungeon-marker', id));
          setSelection(pinId ? { kind: 'pin', id: pinId } : null);
        }),
        canvas.on('pointerdown', () => {
          setHover(null);
          // interação manual cancela o glide cinematográfico em andamento
          canvas.animation?.cancel('dungeon:focus');
        })
      );
      // hover para o rich tooltip (throttle ~25/s; pick cobre pins, o resto
      // cai no hit-test de célula → sala)
      let lastHoverAt = 0;
      unsubs.push(
        canvas.on('pointermove', ({ x, y }) => {
          const now = Date.now();
          if (now - lastHoverAt < 40) return;
          lastHoverAt = now;
          if (canvas.getCurrentToolId() !== 'select' || editingTextRef.current) {
            setHover(null);
            return;
          }
          const hit = canvas.pick({ x, y });
          if (hit) {
            setHover(hit.objectType === 'dungeon-marker' ? { kind: 'pin', id: hit.id, x, y } : null);
            return;
          }
          const ctrl = controllerOf(canvas);
          const world = canvas.toWorld(x, y);
          const s = ctrl.doc().grid.cellSize;
          const cell = ctrl
            .doc()
            .cells.find((c) => c.x === Math.floor(world.x / s) && c.y === Math.floor(world.y / s));
          setHover(cell?.roomId ? { kind: 'room', id: cell.roomId, x, y } : null);
        })
      );
      setReady(true);
      // zoom manual (rodinha) também cancela o glide — o kernel não emite
      // evento de wheel, então escutamos o DOM do host
      const cancelFocus = () => canvas.animation?.cancel('dungeon:focus');
      host.addEventListener('wheel', cancelFocus, { passive: true });
      unsubs.push(() => host.removeEventListener('wheel', cancelFocus));
    })();

    function reportCamera() {
      // reposiciona o editor inline de texto durante pan/zoom
      if (editingTextRef.current) setCamTick((t) => t + 1);
      if (!onCameraChange || !canvas.viewport) return;
      const now = Date.now();
      if (now - cameraThrottleRef.current < 66) return; // ~15/s
      cameraThrottleRef.current = now;
      const center = canvas.viewport.pixi.center;
      onCameraChange({ x: center.x, y: center.y, zoom: canvas.viewport.pixi.scale.x });
    }

    return () => {
      disposed = true;
      for (const u of unsubs) u();
      // se o init ainda está em andamento, o fluxo async destrói ao concluir
      if (initialized) safeDestroy();
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // ---------- rehidratação por mudanças externas (sync, AI, undo de outra janela) ----------

  useEffect(() => {
    if (!ready) return;
    if (doc.content == null || doc.content === lastSavedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    lastSavedRef.current = doc.content;
    void controllerOf(canvas)
      .hydrate(parseDungeon(doc.content))
      .catch(() => {}); // canvas destruído no meio da hidratação (troca de doc)
  }, [doc.content, ready]);

  // ---------- tooltip rico: 350ms com o cursor parado sobre sala/pin ----------

  useEffect(() => {
    if (!hover || tool !== 'select') {
      setTooltip(null);
      return;
    }
    const t = setTimeout(() => setTooltip(hover), 350);
    return () => clearTimeout(t);
  }, [hover, tool]);

  // ---------- seleção ----------

  /** seleção vinda da UI (listas do painel): reflete no canvas e centraliza
   *  a viewport na sala/pin selecionado */
  const handleSelect = useCallback((sel: { kind: 'room' | 'pin'; id: string } | null) => {
    setSelection(sel);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctrl = controllerOf(canvas);
    ctrl.setSelectedRoom(sel?.kind === 'room' ? sel.id : null);

    // centro de mundo do alvo (sala: centro de massa das células; pin: posição)
    let target: { x: number; y: number } | null = null;
    if (sel?.kind === 'room') target = roomCenter(ctrl.doc(), sel.id);
    if (sel?.kind === 'pin') {
      const marker = canvas.documents.get('dungeon-marker', sel.id)?.document as
        | { x: number; y: number }
        | undefined;
      if (marker) target = { x: marker.x, y: marker.y };
    }
    // o painel expande ao selecionar → o renderer redimensiona neste frame;
    // esperar 2 frames garante um render limpo antes do glide começar
    if (target && panToSelectionRef.current)
      requestAnimationFrame(() => requestAnimationFrame(() => focusViewport(canvas, target)));

    if (sel?.kind === 'pin') {
      const placeable = canvas.documents.get('dungeon-marker', sel.id);
      if (placeable) canvas.select(placeable as never, false);
    } else {
      canvas.clearSelection();
    }
  }, []);

  // seleção ficou órfã (sala/pin removido por undo, erase ou Delete do kernel)
  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'pin' && !model.markers.some((m) => m.id === selection.id)) setSelection(null);
    if (selection.kind === 'room' && !model.rooms.some((r) => r.id === selection.id)) setSelection(null);
  }, [model, selection]);

  // Delete apaga a sala selecionada (pins são apagados pelo kernel); Escape limpa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], .bn-editor')) return;
      const sel = selectionRef.current;
      if (e.key === 'Escape' && sel) {
        setSelection(null);
        controllerOf(canvasRef.current!).setSelectedRoom(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.kind === 'room') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctrl = controllerOf(canvas);
        const keys = new Set(
          ctrl.doc().cells.filter((c) => c.roomId === sel.id).map((c) => cellKey(c.x, c.y))
        );
        if (keys.size > 0) ctrl.eraseCells(keys);
        else ctrl.removeRoom(sel.id);
        setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- ações da UI ----------

  const setTool = useCallback((id: string) => canvasRef.current?.setCurrentTool(id), []);
  const undo = useCallback(() => void canvasRef.current?.undo(), []);
  const redo = useCallback(() => void canvasRef.current?.redo(), []);
  const setToolOption = useCallback((toolId: string, key: string, value: unknown) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.tools.options[toolId] = { ...canvas.tools.options[toolId], [key]: value };
    setToolOptions({ ...canvas.tools.options });
  }, []);

  const controller = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas ? controllerOf(canvas) : null;
  }, []);

  const handleExportPng = useCallback(async () => {
    const canvas = canvasRef.current;
    if (canvas) await exportPng(canvas, doc.title);
  }, [doc.title]);

  const handleExportSvg = useCallback(() => {
    const ctrl = controller();
    if (ctrl) exportSvg(parseDungeon(ctrl.serialize()), doc.title);
  }, [controller, doc.title]);

  // drop do Explorer (notas/pins) → marcador vinculado na posição do drop
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(REF_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    window.addEventListener('dragover', onDragOver);
    return () => window.removeEventListener('dragover', onDragOver);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(REF_DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      const ref = parseExplorerDragRef(raw);
      const canvas = canvasRef.current;
      if (!ref || !canvas) return;
      const rect = hostRef.current?.getBoundingClientRect();
      const world = canvas.toWorld(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
      if (ref.kind === 'note') {
        void controllerOf(canvas).addMarker({
          x: world.x,
          y: world.y,
          icon: 'map-pin',
          label: docs.find((d) => d.id === ref.docId)?.title ?? '',
          // o vínculo vive como chip [[nota]] na descrição rica do pin
          description: noteRefDescription(ref.docId),
        });
      }
    },
    [docs]
  );

  return (
    <div className="flex h-full min-h-0 bg-app">
      <DungeonToolbar
        tool={tool}
        setTool={setTool}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onGenerate={() => setGenerateOpen(true)}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
      />
      <div
        ref={hostRef}
        className="relative flex-1 min-w-0 overflow-hidden"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(REF_DRAG_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={handleDrop}
      >
        <DungeonToolPalette
          tool={tool}
          toolOptions={toolOptions}
          setToolOption={setToolOption}
          realmFonts={realmFonts}
        />
        {editingText && canvasRef.current && (
          <InlineTextEditor
            canvas={canvasRef.current}
            shapeId={editingText.shapeId}
            fresh={editingText.fresh}
            realmFonts={realmFonts}
            onClose={() => setEditingText(null)}
          />
        )}
        {tooltip &&
          (() => {
            const room = tooltip.kind === 'room' ? model.rooms.find((r) => r.id === tooltip.id) : null;
            const pin = tooltip.kind === 'pin' ? model.markers.find((m) => m.id === tooltip.id) : null;
            if (!room && !pin) return null;
            const title = room ? room.name || `Sala ${room.number}` : pin!.label || 'Marcador';
            const excerpt = blocksToPlainText(room ? room.description : pin!.description).slice(0, 140);
            const hostW = hostRef.current?.clientWidth ?? 800;
            return (
              <div
                className="absolute z-30 w-64 rounded-lg border border-line bg-sidebar/95 shadow-xl p-3 pointer-events-none"
                style={{
                  left: Math.max(8, Math.min(tooltip.x + 16, hostW - 264)),
                  top: Math.max(8, tooltip.y + 18),
                }}
              >
                <div className="flex items-center gap-2">
                  {room && (
                    <span
                      className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-[10px] font-bold text-[#e8e2d0]"
                      style={{ background: room.color ?? '#3d4457' }}
                    >
                      {room.number}
                    </span>
                  )}
                  <div className="text-[13px] font-semibold text-ink-1 truncate">{title}</div>
                </div>
                {excerpt ? (
                  <p className="text-[11px] text-ink-2 leading-snug mt-1.5 line-clamp-3">{excerpt}</p>
                ) : (
                  <p className="text-[11px] text-ink-3 italic mt-1.5">
                    Sem descrição — clique para editar.
                  </p>
                )}
              </div>
            );
          })()}
      </div>
      {ready && (
        <DungeonSidePanel
          model={model}
          tool={tool}
          selection={selection}
          onSelect={handleSelect}
          controller={controller}
        />
      )}
      {generateOpen && (
        <GenerateDialog
          model={model}
          onClose={() => setGenerateOpen(false)}
          onApply={(result, generation) => {
            const ctrl = controller();
            if (!ctrl) return;
            ctrl.batch(() =>
              ctrl.mutate({
                cells: result.cells,
                rooms: result.rooms,
                doors: result.doors,
                generation,
              })
            );
            canvasRef.current?.fit();
            setGenerateOpen(false);
          }}
        />
      )}
    </div>
  );
}


