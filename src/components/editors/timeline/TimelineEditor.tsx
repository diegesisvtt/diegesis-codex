import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  FoldVertical,
  GitBranch,
  MoveHorizontal,
  MoveVertical,
  Plus,
  Rows3,
  Undo2,
  Redo2,
  UnfoldVertical,
} from 'lucide-react';
import type { DocNode } from '@shared/types';
import {
  daysPerYear,
  parseTimeline,
  serializeTimeline,
  type TimelineCalendar,
  type TimelineData,
  type TimelineEra,
  type TimelineEvent,
  type TimelineLane,
  type TimelineLineage,
  type TimelineLink,
  type TimelineMoon,
} from '@shared/timeline';
import { useStore } from '../../../state/store';
import { TimelineCanvas } from './TimelineCanvas';
import { FilterBar } from './FilterBar';
import { CalendarDialog, EraDialog, EventDialog, LaneDialog } from './dialogs';
import { LineageView } from './LineageView';
import { EMPTY_FILTER, filterEvents, generateId, nextColor, sortedLanes, type TimelineFilter } from './model';

type DialogState =
  | { kind: 'event'; draft: TimelineEvent; isNew: boolean }
  | { kind: 'era'; draft: TimelineEra; isNew: boolean }
  | { kind: 'lane'; draft: TimelineLane; isNew: boolean }
  | { kind: 'calendar' }
  | null;

/**
 * Editor de timeline — ferramenta de worldbuilding estilo LegendKeeper:
 * eventos, storylines paralelas (lanes), eras aninhadas, causa e efeito,
 * fases de lua, linhagens entre documentos e retcon livre (undo/redo).
 */
export function TimelineEditor({ doc }: { doc: DocNode }) {
  const { docs, updateDocument, openDocument } = useStore();
  const [data, setDataState] = useState<TimelineData>(() => parseTimeline(doc.content));
  const dataRef = useRef(data);
  const [filter, setFilter] = useState<TimelineFilter>(EMPTY_FILTER);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [showLineage, setShowLineage] = useState(false);
  /** tempo de cima para baixo (estilo World Anvil) */
  const [vertical, setVertical] = useState(false);
  /** colapsa períodos sem eventos num separador com a duração */
  const [compact, setCompact] = useState(false);

  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  /** aplica uma mutação registrando snapshot para undo (retcon!) */
  const commit = (next: TimelineData) => {
    const prevSnap = serializeTimeline(dataRef.current);
    const nextSnap = serializeTimeline(next);
    if (prevSnap === nextSnap) return; // salvar sem mudança não polui o undo
    undoStack.current.push(prevSnap);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    dirty.current = true;
    dataRef.current = next;
    setDataState(next);
  };

  const undo = () => {
    const snap = undoStack.current.pop();
    if (snap == null) return;
    redoStack.current.push(serializeTimeline(dataRef.current));
    const parsed = parseTimeline(snap);
    dirty.current = true;
    dataRef.current = parsed;
    setDataState(parsed);
  };

  const redo = () => {
    const snap = redoStack.current.pop();
    if (snap == null) return;
    undoStack.current.push(serializeTimeline(dataRef.current));
    const parsed = parseTimeline(snap);
    dirty.current = true;
    dataRef.current = parsed;
    setDataState(parsed);
  };

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (ignora quando digitando em campos)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (key === 'z') {
        e.preventDefault();
        undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // autosave com debounce — só quando houve edição (abrir o doc não regrava,
  // evitando bump de updatedAt e perda de campos desconhecidos de versões futuras)
  useEffect(() => {
    if (!dirty.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      dirty.current = false;
      updateDocument(doc.id, { content: serializeTimeline(dataRef.current) });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, doc.id, updateDocument]);

  // flush no unmount/troca de documento: edições dentro da janela do debounce
  // não se perdem ao fechar a aba (mesmo padrão do hexcrawl)
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirty.current) {
        dirty.current = false;
        updateDocument(doc.id, { content: serializeTimeline(dataRef.current) });
      }
    };
  }, [doc.id, updateDocument]);

  const visibleEvents = useMemo(() => filterEvents(data, filter), [data, filter]);

  // ---------- mutações ----------

  const saveEvent = (ev: TimelineEvent, links: TimelineLink[]) => {
    const events = data.events.some((e) => e.id === ev.id)
      ? data.events.map((e) => (e.id === ev.id ? ev : e))
      : [...data.events, ev];
    // links: substitui os que tocam o evento pelos editados no diálogo
    const kept = data.links.filter((l) => l.fromEventId !== ev.id && l.toEventId !== ev.id);
    commit({ ...data, events, links: [...kept, ...links] });
    setDialog(null);
  };

  const deleteEvent = (id: string) => {
    commit({
      ...data,
      events: data.events.filter((e) => e.id !== id),
      links: data.links.filter((l) => l.fromEventId !== id && l.toEventId !== id),
    });
    setDialog(null);
  };

  const saveEra = (era: TimelineEra) => {
    const eras = data.eras.some((e) => e.id === era.id) ? data.eras.map((e) => (e.id === era.id ? era : e)) : [...data.eras, era];
    commit({ ...data, eras });
    setDialog(null);
  };

  const deleteEra = (id: string) => {
    const era = data.eras.find((e) => e.id === id);
    // filhas da era excluída sobem um nível na hierarquia
    const eras = data.eras
      .filter((e) => e.id !== id)
      .map((e) => (e.parentEraId === id ? { ...e, parentEraId: era?.parentEraId ?? null } : e));
    commit({ ...data, eras });
    setDialog(null);
  };

  const saveLane = (lane: TimelineLane) => {
    const lanes = data.lanes.some((l) => l.id === lane.id)
      ? data.lanes.map((l) => (l.id === lane.id ? lane : l))
      : [...data.lanes, lane];
    commit({ ...data, lanes });
    setDialog(null);
  };

  const deleteLane = (id: string) => {
    commit({
      ...data,
      lanes: data.lanes.filter((l) => l.id !== id),
      events: data.events.map((e) => (e.laneId === id ? { ...e, laneId: null } : e)),
    });
    setDialog(null);
  };

  const saveCalendar = (calendar: TimelineCalendar, moons: TimelineMoon[]) => {
    commit({ ...data, calendar, moons });
    setDialog(null);
  };

  const addLineage = (l: TimelineLineage) => commit({ ...data, lineages: [...data.lineages, l] });
  const removeLineage = (id: string) => commit({ ...data, lineages: data.lineages.filter((l) => l.id !== id) });

  // ---------- criação ----------

  const newEventAt = (serial: number, laneId: string | null) => {
    setDialog({
      kind: 'event',
      isNew: true,
      draft: {
        id: generateId(),
        title: '',
        description: '',
        date: serial,
        laneId,
        color: null,
        entityIds: [],
        tags: [],
      },
    });
  };

  const newEra = () => {
    setDialog({
      kind: 'era',
      isNew: true,
      draft: {
        id: generateId(),
        name: '',
        start: 0,
        end: daysPerYear(data.calendar) - 1,
        color: nextColor(data.eras.map((e) => e.color)),
        parentEraId: null,
      },
    });
  };

  const newLane = () => {
    setDialog({
      kind: 'lane',
      isNew: true,
      draft: {
        id: generateId(),
        name: '',
        color: nextColor(data.lanes.map((l) => l.color)),
        order: data.lanes.length,
      },
    });
  };

  const toolBtn =
    'flex items-center gap-1 px-2 py-1 text-[12px] rounded text-ink-2 hover:bg-hover hover:text-ink-1 transition-colors';

  return (
    <div className="h-full flex flex-col bg-app">
      {/* barra de ferramentas */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-line flex-wrap">
        <button type="button" className={toolBtn} onClick={() => newEventAt(0, sortedLanes(data)[0]?.id ?? null)}>
          <Plus size={13} /> Evento
        </button>
        <button type="button" className={toolBtn} onClick={newEra}>
          <Plus size={13} /> Era
        </button>
        <button type="button" className={toolBtn} onClick={newLane}>
          <Plus size={13} /> Storyline
        </button>
        <span className="w-px h-4 bg-line mx-1" />
        <button type="button" className={toolBtn} onClick={() => setDialog({ kind: 'calendar' })}>
          <CalendarDays size={13} /> Calendário
        </button>
        <button
          type="button"
          className={`${toolBtn} ${showLineage ? 'bg-active text-ink-1' : ''}`}
          onClick={() => setShowLineage((v) => !v)}
        >
          <GitBranch size={13} /> Linhagens
        </button>
        <span className="w-px h-4 bg-line mx-1" />
        <button
          type="button"
          className={`${toolBtn} ${vertical ? 'bg-active text-ink-1' : ''}`}
          onClick={() => setVertical((v) => !v)}
          title={vertical ? 'Mudar para timeline horizontal' : 'Mudar para timeline vertical'}
        >
          {vertical ? <MoveVertical size={13} /> : <MoveHorizontal size={13} />}
          {vertical ? 'Vertical' : 'Horizontal'}
        </button>
        <button
          type="button"
          className={`${toolBtn} ${compact ? 'bg-active text-ink-1' : ''}`}
          onClick={() => setCompact((c) => !c)}
          title={compact ? 'Mostrar períodos vazios' : 'Ocultar períodos sem eventos'}
        >
          {compact ? <UnfoldVertical size={13} /> : <FoldVertical size={13} />}
          {compact ? 'Expandir vazios' : 'Ocultar vazios'}
        </button>
        <span className="w-px h-4 bg-line mx-1" />
        <button type="button" className={toolBtn} onClick={undo} title="Desfazer (Ctrl+Z)">
          <Undo2 size={13} />
        </button>
        <button type="button" className={toolBtn} onClick={redo} title="Refazer (Ctrl+Shift+Z)">
          <Redo2 size={13} />
        </button>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-3">
          <Rows3 size={11} />
          {visibleEvents.length} de {data.events.length} evento{data.events.length === 1 ? '' : 's'}
        </span>
      </div>

      <FilterBar data={data} docs={docs} filter={filter} onChange={setFilter} />

      <div className="flex-1 min-h-0 flex">
        <TimelineCanvas
          data={data}
          events={visibleEvents}
          vertical={vertical}
          compact={compact}
          onEventClick={(id) => {
            const ev = data.events.find((e) => e.id === id);
            if (ev) setDialog({ kind: 'event', draft: ev, isNew: false });
          }}
          onEraClick={(id) => {
            const era = data.eras.find((e) => e.id === id);
            if (era) setDialog({ kind: 'era', draft: era, isNew: false });
          }}
          onCreateAt={newEventAt}
        />
        {showLineage && (
          <LineageView
            lineages={data.lineages}
            docs={docs}
            excludeDocId={doc.id}
            onAdd={addLineage}
            onRemove={removeLineage}
            onOpenDoc={openDocument}
            onClose={() => setShowLineage(false)}
          />
        )}
      </div>

      {/* diálogos */}
      {dialog?.kind === 'event' && (
        <EventDialog
          draft={dialog.draft}
          isNew={dialog.isNew}
          data={data}
          docs={docs}
          excludeDocId={doc.id}
          onSave={saveEvent}
          onDelete={dialog.isNew ? undefined : deleteEvent}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'era' && (
        <EraDialog
          draft={dialog.draft}
          isNew={dialog.isNew}
          data={data}
          onSave={saveEra}
          onDelete={dialog.isNew ? undefined : deleteEra}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'lane' && (
        <LaneDialog
          draft={dialog.draft}
          isNew={dialog.isNew}
          onSave={saveLane}
          onDelete={dialog.isNew ? undefined : deleteLane}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'calendar' && (
        <CalendarDialog calendar={data.calendar} moons={data.moons} onSave={saveCalendar} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
