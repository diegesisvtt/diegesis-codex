/* Helpers do editor de timeline (UI-side). O modelo de dados e a
   matemática de calendário vivem em @shared/timeline. */

import { daysPerYear, type TimelineCalendar, type TimelineData, type TimelineEvent, type TimelineLane } from '@shared/timeline';

export const generateId = () => Math.random().toString(36).slice(2, 10);

/** laneId sentinela para eventos sem lane (filtros e render) */
export const NO_LANE = '__none__';

export const PALETTE = [
  '#529cca',
  '#4dab9a',
  '#d9a45f',
  '#d96a5f',
  '#b48ad9',
  '#8ab4f8',
  '#e2c08d',
  '#7fbf7f',
];

/** primeira cor da paleta ainda não usada (ou aleatória) */
export function nextColor(used: string[]): string {
  const free = PALETTE.find((c) => !used.includes(c));
  return free ?? PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

export interface TimelineFilter {
  query: string;
  /** ids de lane visíveis; vazio = todas (NO_LANE representa eventos sem lane) */
  laneIds: string[];
  tags: string[];
  entityId: string | null;
}

export const EMPTY_FILTER: TimelineFilter = { query: '', laneIds: [], tags: [], entityId: null };

export function isFilterActive(f: TimelineFilter): boolean {
  return !!f.query.trim() || f.laneIds.length > 0 || f.tags.length > 0 || !!f.entityId;
}

export function laneKeyOf(ev: TimelineEvent): string {
  return ev.laneId ?? NO_LANE;
}

export function eventMatches(ev: TimelineEvent, f: TimelineFilter): boolean {
  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    if (!ev.title.toLowerCase().includes(q) && !ev.description.toLowerCase().includes(q)) return false;
  }
  if (f.laneIds.length > 0 && !f.laneIds.includes(laneKeyOf(ev))) return false;
  if (f.tags.length > 0 && !f.tags.some((t) => ev.tags.includes(t))) return false;
  if (f.entityId && !ev.entityIds.includes(f.entityId)) return false;
  return true;
}

export function filterEvents(data: TimelineData, f: TimelineFilter): TimelineEvent[] {
  if (!isFilterActive(f)) return data.events;
  return data.events.filter((ev) => eventMatches(ev, f));
}

export function sortedLanes(data: TimelineData): TimelineLane[] {
  return [...data.lanes].sort((a, b) => a.order - b.order);
}

export function allTags(data: TimelineData): string[] {
  const set = new Set<string>();
  for (const ev of data.events) for (const t of ev.tags) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** ids de documentos referenciados por algum evento (para o filtro por entidade) */
export function usedEntityIds(data: TimelineData): string[] {
  const set = new Set<string>();
  for (const ev of data.events) for (const id of ev.entityIds) set.add(id);
  return [...set];
}

// ---------- eixo comprimido (ocultar períodos vazios) ----------

/** gap mínimo para colapsar (dias) */
export const MIN_GAP_DAYS = 90;
/** tamanho virtual de um gap colapsado (dias) */
export const COLLAPSED_DAYS = 14;

export interface TimeGap {
  startSerial: number;
  endSerial: number;
  days: number;
}

/**
 * Intervalos vazios entre breakpoints (datas de eventos e limites de eras).
 * Gaps maiores que MIN_GAP_DAYS são comprimidos no modo compacto.
 */
export function buildGaps(data: TimelineData, events: TimelineEvent[]): TimeGap[] {
  const points = new Set<number>();
  for (const ev of events) {
    points.add(ev.date);
    points.add(ev.endDate ?? ev.date);
  }
  for (const era of data.eras) {
    points.add(era.start);
    points.add(era.end);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const gaps: TimeGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = sorted[i] - sorted[i - 1];
    if (days > MIN_GAP_DAYS) gaps.push({ startSerial: sorted[i - 1], endSerial: sorted[i], days });
  }
  return gaps;
}

/** serial → serial "virtual" (gaps comprimidos). Monotônica; identidade sem gaps. */
export function toVirtual(serial: number, gaps: TimeGap[]): number {
  let v = serial;
  for (const g of gaps) {
    if (serial <= g.startSerial) break;
    const collapsed = Math.min(g.days, COLLAPSED_DAYS);
    if (serial >= g.endSerial) {
      v -= g.days - collapsed;
    } else {
      // dentro do gap: interpola linearmente para o espaço colapsado
      const t = (serial - g.startSerial) / g.days;
      v -= serial - g.startSerial - t * collapsed;
    }
  }
  return v;
}

/** serial virtual → serial real (inversa de toVirtual; para cliques no canvas) */
export function fromVirtual(v: number, gaps: TimeGap[]): number {
  let serial = v;
  let shift = 0; // redução acumulada aplicada a v
  for (const g of gaps) {
    const collapsed = Math.min(g.days, COLLAPSED_DAYS);
    const vStart = g.startSerial - shift;
    if (v <= vStart) break;
    if (v <= vStart + collapsed) {
      const t = (v - vStart) / collapsed;
      return g.startSerial + t * g.days;
    }
    shift += g.days - collapsed;
    serial += g.days - collapsed;
  }
  return serial;
}

/** rótulo humano da duração de um gap: '≈ 137 anos', '≈ 3 meses', '45 dias' */
export function formatGapDuration(days: number, cal: TimelineCalendar): string {
  const dpy = daysPerYear(cal);
  if (days >= dpy * 2) return `≈ ${Math.round(days / dpy)} anos`;
  if (days >= dpy) return '≈ 1 ano';
  const perMonth = dpy / Math.max(1, cal.months.length);
  if (days >= perMonth * 2) return `≈ ${Math.round(days / perMonth)} meses`;
  return `${days} dias`;
}
