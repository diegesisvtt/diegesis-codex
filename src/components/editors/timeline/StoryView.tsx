import { Plus } from 'lucide-react';
import type { DocNode } from '@shared/types';
import { eraDepth, formatEventDate, type TimelineData, type TimelineEvent } from '@shared/timeline';
import { eventIcon, formatGapLater } from './model';

/**
 * Vista de história ("List Mode" do World Anvil): leitura vertical com spine,
 * marcadores de data, cards ricos e indicadores de gap entre eventos.
 * Ignora o posicionamento em lanes — o foco é a narrativa cronológica.
 */
export function StoryView({
  data,
  docs,
  events,
  onEventClick,
  onCreateAt,
  onOpenDoc,
}: {
  data: TimelineData;
  docs: DocNode[];
  /** eventos já filtrados */
  events: TimelineEvent[];
  onEventClick(id: string): void;
  /** cria evento após o último */
  onCreateAt(serial: number): void;
  onOpenDoc(id: string): void;
}) {
  const cal = data.calendar;
  const sorted = [...events].sort((a, b) => a.date - b.date);

  const laneOf = (ev: TimelineEvent) => data.lanes.find((l) => l.id === ev.laneId);
  const colorOf = (ev: TimelineEvent) => ev.color ?? laneOf(ev)?.color ?? '#8a8a8a';

  /** era mais profunda que contém a data do evento (contexto no card) */
  const eraOf = (ev: TimelineEvent) => {
    let best: { name: string; depth: number } | null = null;
    for (const era of data.eras) {
      if (ev.date < era.start || ev.date > era.end) continue;
      const depth = eraDepth(era, data.eras);
      if (!best || depth > best.depth) best = { name: era.name, depth };
    }
    return best?.name ?? null;
  };

  const docTitle = (id: string) => docs.find((d) => d.id === id)?.title;

  let prevEnd: number | null = null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-app">
      <div className="relative mx-auto max-w-2xl px-6 py-10">
        {/* spine */}
        <div className="absolute left-10 top-0 bottom-0 w-0.5 bg-line-strong" />

        {sorted.length === 0 && (
          <div className="relative pl-12 py-16 text-center text-[13px] text-ink-3">
            Nenhum evento ainda. Comece a crônica da sua história.
          </div>
        )}

        {sorted.map((ev) => {
          const gap = prevEnd == null ? null : Math.max(0, ev.date - prevEnd);
          prevEnd = Math.max(prevEnd ?? ev.date, ev.endDate ?? ev.date);
          const color = colorOf(ev);
          const lane = laneOf(ev);
          const era = eraOf(ev);
          const Icon = eventIcon(ev.icon);
          const major = ev.importance === 'major';

          return (
            <div key={ev.id}>
              {/* indicador de gap ("23 dias depois") */}
              {gap != null && gap > 0 && (
                <div className="relative flex items-center gap-3 py-4">
                  <span className="absolute left-4 -translate-x-1/2 w-2 h-2 rotate-45 bg-line-strong" />
                  <span className="pl-12 text-[11px] uppercase tracking-wider text-ink-3">{formatGapLater(gap, cal)}</span>
                </div>
              )}

              <div className="relative pl-12 pb-6">
                {/* nó na spine */}
                <span
                  className="absolute left-4 top-5 -translate-x-1/2 rotate-45 border-2 border-app"
                  style={{
                    width: major ? 14 : 10,
                    height: major ? 14 : 10,
                    backgroundColor: color,
                  }}
                />

                {/* marcador de data */}
                <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-1.5">{formatEventDate(ev, cal)}</div>

                {/* card */}
                <button
                  type="button"
                  onClick={() => onEventClick(ev.id)}
                  className="group w-full text-left bg-elevated border border-line rounded-xl overflow-hidden shadow-lg hover:border-accent/50 transition-colors"
                >
                  <div className="h-1" style={{ backgroundColor: color }} />
                  <div className="p-3.5">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md border"
                        style={{ borderColor: color, color }}
                        title={era ?? undefined}
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
                      {era && <span className="text-[10px] uppercase tracking-wider text-ink-3">{era}</span>}
                      {ev.tags.map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-active text-ink-2">
                          #{t}
                        </span>
                      ))}
                    </div>
                    <h3
                      className={`font-serif text-ink-1 group-hover:text-accent transition-colors ${
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
                              className="text-[11px] px-1.5 py-0.5 rounded bg-overlay border border-line text-ink-2 hover:text-accent hover:border-accent/50 cursor-pointer"
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
        <div className="relative pl-12">
          <button
            type="button"
            onClick={() => onCreateAt((prevEnd ?? 0) + 1)}
            className="flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-accent transition-colors"
          >
            <Plus size={13} /> Adicionar evento
          </button>
        </div>
      </div>
    </div>
  );
}
