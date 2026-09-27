import { Search, X } from 'lucide-react';
import type { DocNode } from '@shared/types';
import type { TimelineData } from '@shared/timeline';
import { NO_LANE, allTags, isFilterActive, usedEntityIds, type TimelineFilter } from './model';

/** Barra de filtros: busca textual + chips de lanes/tags + select de entidade. */
export function FilterBar({
  data,
  docs,
  filter,
  onChange,
}: {
  data: TimelineData;
  docs: DocNode[];
  filter: TimelineFilter;
  onChange(f: TimelineFilter): void;
}) {
  const tags = allTags(data);
  const entityIds = usedEntityIds(data);
  const laneChips = [
    ...data.lanes.map((l) => ({ id: l.id, name: l.name, color: l.color })),
    ...(data.events.some((e) => !e.laneId) ? [{ id: NO_LANE, name: 'Sem lane', color: '#8a8a8a' }] : []),
  ];

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const chipCls = (active: boolean) =>
    `px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
      active ? 'bg-active text-ink-1 border-line-strong' : 'text-ink-3 border-line hover:text-ink-2 hover:bg-hover'
    }`;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line bg-overlay/40 flex-wrap">
      <div className="flex items-center gap-1.5 bg-overlay border border-line rounded px-2 py-1 focus-within:border-accent w-52">
        <Search size={12} className="text-ink-3 shrink-0" />
        <input
          type="text"
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
          placeholder="Buscar eventos…"
          className="w-full bg-transparent text-[12px] text-ink-1 outline-none placeholder:text-ink-3"
        />
      </div>

      {laneChips.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {laneChips.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onChange({ ...filter, laneIds: toggle(filter.laneIds, l.id) })}
              className={chipCls(filter.laneIds.includes(l.id))}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: l.color }} />
              {l.name}
            </button>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ ...filter, tags: toggle(filter.tags, t) })}
              className={chipCls(filter.tags.includes(t))}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {entityIds.length > 0 && (
        <select
          value={filter.entityId ?? ''}
          onChange={(e) => onChange({ ...filter, entityId: e.target.value || null })}
          className="bg-overlay border border-line rounded px-2 py-1 text-[12px] text-ink-2 outline-none focus:border-accent"
        >
          <option value="">Todas as entidades</option>
          {entityIds.map((id) => (
            <option key={id} value={id}>
              {docs.find((d) => d.id === id)?.title || 'Sem título'}
            </option>
          ))}
        </select>
      )}

      {isFilterActive(filter) && (
        <button
          type="button"
          onClick={() => onChange({ query: '', laneIds: [], tags: [], entityId: null })}
          className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-ink-1"
        >
          <X size={11} /> Limpar
        </button>
      )}
    </div>
  );
}
