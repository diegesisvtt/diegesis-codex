import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { DocNode } from '@shared/types';
import {
  MOON_PHASE_NAMES,
  eraDepth,
  formatEventDate,
  moonGlyph,
  moonPhaseIndex,
  type TimelineData,
  type TimelineEra,
  type TimelineEvent,
} from '@shared/timeline';
import { NO_LANE, eventIcon, formatGapLater } from './model';

/* trilhos de storyline (mapa de metrô à esquerda dos cards) */
const THREAD_X0 = 30;
const THREAD_GAP = 18;
const RAIL_PAD = 18;

interface Thread {
  key: string; // lane id ou NO_LANE
  color: string;
}

/**
 * Vista de história: crônica vertical com cards ricos e trilhos coloridos
 * de storyline (estilo metro map) — cada evento pendura no trilho da sua
 * lane, e hover no card acende o trilho correspondente.
 */
export function StoryView({
  data,
  docs,
  events,
  onEventClick,
  onEraClick,
  onCreateAt,
  onOpenDoc,
}: {
  data: TimelineData;
  docs: DocNode[];
  /** eventos já filtrados */
  events: TimelineEvent[];
  onEventClick(id: string): void;
  onEraClick(id: string): void;
  /** cria evento após o último */
  onCreateAt(serial: number): void;
  onOpenDoc(id: string): void;
}) {
  const cal = data.calendar;
  const sorted = [...events].sort((a, b) => a.date - b.date);
  /** storyline acesa (hover no card) */
  const [hotLane, setHotLane] = useState<string | null>(null);

  // trilhos: lanes com eventos visíveis (ordem da timeline) + órfãos
  const threads = useMemo(() => {
    const used = new Set(sorted.map((e) => e.laneId));
    const list: Thread[] = [...data.lanes]
      .sort((a, b) => a.order - b.order)
      .filter((l) => used.has(l.id))
      .map((l) => ({ key: l.id, color: l.color }));
    if (sorted.some((e) => !e.laneId || !data.lanes.some((l) => l.id === e.laneId))) {
      list.push({ key: NO_LANE, color: '#8a8a8a' });
    }
    return list;
  }, [data.lanes, sorted]);

  const threadIdx = useMemo(() => new Map(threads.map((t, i) => [t.key, i])), [threads]);
  const threadX = (i: number) => THREAD_X0 + i * THREAD_GAP;
  const contentPad = THREAD_X0 + threads.length * THREAD_GAP + RAIL_PAD;

  const laneOf = (ev: TimelineEvent) => data.lanes.find((l) => l.id === ev.laneId);
  const colorOf = (ev: TimelineEvent) => ev.color ?? laneOf(ev)?.color ?? '#8a8a8a';
  const threadKeyOf = (ev: TimelineEvent) => (ev.laneId && threadIdx.has(ev.laneId) ? ev.laneId : NO_LANE);

  /** era mais profunda que contém a data do evento (contexto no card) */
  const eraOf = (ev: TimelineEvent): TimelineEra | null => {
    let best: TimelineEra | null = null;
    let bestDepth = -1;
    for (const era of data.eras) {
      if (ev.date < era.start || ev.date > era.end) continue;
      const depth = eraDepth(era, data.eras);
      if (depth > bestDepth) {
        best = era;
        bestDepth = depth;
      }
    }
    return best;
  };

  const docTitle = (id: string) => docs.find((d) => d.id === id)?.title;

  let prevEnd: number | null = null;

  return (
    <div className="tl-bg relative flex-1 min-h-0 overflow-y-auto">
      <div className="relative mx-auto max-w-3xl px-6 py-10">
        {/* trilhos de storyline */}
        {threads.map((t, i) => {
          const hot = hotLane === t.key;
          const dim = hotLane != null && !hot;
          return (
            <div
              key={t.key}
              className="tl-thread absolute top-0 bottom-0 w-0.5 rounded-full pointer-events-none"
              style={{
                left: threadX(i) - 1,
                backgroundColor: t.color,
                opacity: hot ? 0.95 : dim ? 0.08 : 0.22,
                filter: hot ? `drop-shadow(0 0 5px ${t.color})` : undefined,
              }}
            />
          );
        })}

        {sorted.length === 0 && (
          <div className="py-16 text-center">
            <div className="inline-block w-3 h-3 rotate-45 border border-map opacity-60 mb-3" />
            <p className="font-serif italic text-[14px] text-ink-3">Nenhum evento ainda. Comece a crônica da sua história.</p>
          </div>
        )}

        {sorted.map((ev, i) => {
          const gap = prevEnd == null ? null : Math.max(0, ev.date - prevEnd);
          prevEnd = Math.max(prevEnd ?? ev.date, ev.endDate ?? ev.date);
          const color = colorOf(ev);
          const lane = laneOf(ev);
          const era = eraOf(ev);
          const Icon = eventIcon(ev.icon);
          const major = ev.importance === 'major';
          const tKey = threadKeyOf(ev);
          const tIdx = threadIdx.get(tKey) ?? 0;
          const dotX = threadX(tIdx);
          const hot = hotLane === tKey;

          return (
            <div key={ev.id} style={{ animation: 'tl-in 0.4s ease both', animationDelay: `${Math.min(i * 50, 500)}ms` }}>
              {/* indicador de gap ("23 dias depois") */}
              {gap != null && gap > 0 && (
                <div className="relative flex items-center py-4" style={{ paddingLeft: contentPad }}>
                  <span className="font-serif italic text-[12px] text-ink-3">{formatGapLater(gap, cal)}</span>
                  <span className="ml-3 h-px flex-1 bg-line opacity-60" />
                </div>
              )}

              <div
                className="group relative pb-6"
                style={{ paddingLeft: contentPad }}
                onMouseEnter={() => setHotLane(tKey)}
                onMouseLeave={() => setHotLane((h) => (h === tKey ? null : h))}
              >
                {/* nó no trilho da storyline */}
                <span
                  className="absolute rounded-full border-2 border-app transition-all duration-200"
                  style={{
                    left: dotX,
                    top: 30,
                    transform: 'translateX(-50%)',
                    width: major ? 13 : 9,
                    height: major ? 13 : 9,
                    backgroundColor: color,
                    boxShadow: hot || major ? `0 0 8px ${color}` : undefined,
                  }}
                />
                {/* conector trilho → card */}
                <span
                  className="absolute h-px transition-opacity duration-200"
                  style={{
                    left: dotX + 7,
                    width: contentPad - dotX - 18,
                    top: 34,
                    backgroundColor: color,
                    opacity: hot ? 0.9 : 0.4,
                  }}
                />

                {/* marcador de data + fases das luas na data do evento */}
                <div className="font-serif text-[12.5px] text-ink-3 mb-1.5 tracking-wide flex items-center gap-2">
                  {formatEventDate(ev, cal)}
                  {data.moons.length > 0 && (
                    <span className="flex items-center gap-1">
                      {data.moons.map((m) => {
                        const phase = moonPhaseIndex(ev.date, m);
                        return (
                          <span key={m.id} title={`${m.name}: ${MOON_PHASE_NAMES[phase]}`} className="text-[12px] leading-none">
                            {moonGlyph(phase)}
                          </span>
                        );
                      })}
                    </span>
                  )}
                </div>

                {/* card */}
                <button
                  type="button"
                  onClick={() => onEventClick(ev.id)}
                  className="tl-card group/card w-full text-left bg-elevated border border-line rounded-xl overflow-hidden shadow-lg hover:border-accent/40"
                >
                  {ev.cover ? (
                    <div className={`relative overflow-hidden ${major ? 'h-40' : 'h-28'}`}>
                      <img
                        src={ev.cover}
                        alt=""
                        loading="lazy"
                        className="tl-cover w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-[1.03]"
                      />
                      {/* fusão da capa com o corpo do card */}
                      <div className="absolute inset-0 bg-gradient-to-t from-elevated via-transparent to-black/10" />
                      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: color }} />
                    </div>
                  ) : (
                    <div className="h-1" style={{ background: `linear-gradient(to right, ${color}, transparent 140%)` }} />
                  )}
                  <div className="p-3.5">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md border transition-transform duration-200 group-hover/card:scale-110"
                        style={{ borderColor: color, color, backgroundColor: `${color}1f` }}
                      >
                        <Icon size={13} />
                      </span>
                      {lane && (
                        <span
                          className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border"
                          style={{ borderColor: lane.color, color: lane.color }}
                        >
                          {lane.name}
                        </span>
                      )}
                      {era && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEraClick(era.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              onEraClick(era.id);
                            }
                          }}
                          className="text-[10px] uppercase tracking-wider text-ink-3 hover:text-map transition-colors cursor-pointer"
                          title="Editar era"
                        >
                          {era.name}
                        </span>
                      )}
                      {ev.tags.map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-active text-ink-2">
                          #{t}
                        </span>
                      ))}
                    </div>
                    <h3
                      className={`font-serif text-ink-1 group-hover/card:text-accent transition-colors ${
                        major ? 'text-[19px] font-bold' : 'text-[16px] font-semibold'
                      }`}
                    >
                      {ev.title}
                    </h3>
                    {ev.description && (
                      <p className="text-[12.5px] text-ink-2 mt-1 line-clamp-3 whitespace-pre-wrap">{ev.description}</p>
                    )}
                    {ev.entityIds.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-2">
                        {ev.entityIds.map((id) => {
                          const title = docTitle(id);
                          if (!title) return null;
                          return (
                            <span
                              key={id}
                              role="link"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenDoc(id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.stopPropagation();
                                  onOpenDoc(id);
                                }
                              }}
                              className="text-[11px] px-1.5 py-0.5 rounded bg-overlay border border-line text-ink-2 hover:text-accent hover:border-accent/50 cursor-pointer transition-colors"
                            >
                              {title}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </button>
              </div>
            </div>
          );
        })}

        {/* adicionar evento ao final */}
        <div className="relative" style={{ paddingLeft: contentPad }}>
          <button
            type="button"
            onClick={() => onCreateAt((prevEnd ?? 0) + 1)}
            className="tl-add flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-accent transition-colors"
          >
            <Plus size={13} /> Adicionar evento
          </button>
        </div>
      </div>
    </div>
  );
}
