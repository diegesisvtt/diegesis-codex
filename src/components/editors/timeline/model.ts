/* Helpers do editor de timeline (UI-side). O modelo de dados e a
   matemática de calendário vivem em @shared/timeline. */

import {
  BookOpen,
  Church,
  Coins,
  Crown,
  Eye,
  Flag,
  Flame,
  Ghost,
  Hammer,
  Heart,
  Key,
  MapPin,
  Scroll,
  Shield,
  Ship,
  Skull,
  Sparkles,
  Star,
  Swords,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { daysPerYear, type TimelineCalendar, type TimelineData, type TimelineEvent, type TimelineLane } from '@shared/timeline';
import { newId } from '@diegesis/core';

/** ícones selecionáveis de evento (badge no canvas / card no modo história) */
export const EVENT_ICONS: { id: string; Icon: LucideIcon; label: string }[] = [
  { id: 'flag', Icon: Flag, label: 'Marco' },
  { id: 'swords', Icon: Swords, label: 'Batalha' },
  { id: 'skull', Icon: Skull, label: 'Morte' },
  { id: 'crown', Icon: Crown, label: 'Realeza' },
  { id: 'sparkles', Icon: Sparkles, label: 'Magia' },
  { id: 'scroll', Icon: Scroll, label: 'Profecia' },
  { id: 'shield', Icon: Shield, label: 'Defesa' },
  { id: 'heart', Icon: Heart, label: 'Romance' },
  { id: 'star', Icon: Star, label: 'Destaque' },
  { id: 'map-pin', Icon: MapPin, label: 'Local' },
  { id: 'book-open', Icon: BookOpen, label: 'Conhecimento' },
  { id: 'hammer', Icon: Hammer, label: 'Construção' },
  { id: 'church', Icon: Church, label: 'Religião' },
  { id: 'coins', Icon: Coins, label: 'Economia' },
  { id: 'ship', Icon: Ship, label: 'Viagem' },
  { id: 'eye', Icon: Eye, label: 'Segredo' },
  { id: 'flame', Icon: Flame, label: 'Desastre' },
  { id: 'ghost', Icon: Ghost, label: 'Sobrenatural' },
  { id: 'key', Icon: Key, label: 'Descoberta' },
  { id: 'users', Icon: Users, label: 'Aliança' },
];

const EVENT_ICON_MAP = new Map(EVENT_ICONS.map((i) => [i.id, i.Icon]));

export function eventIcon(id: string | null | undefined): LucideIcon {
  return EVENT_ICON_MAP.get(id ?? '') ?? Flag;
}

export const generateId = newId;

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

/** duração exata entre eventos (vista de história): '23 dias depois' */
export function formatGapLater(days: number, cal: TimelineCalendar): string {
  const dpy = daysPerYear(cal);
  const perMonth = dpy / Math.max(1, cal.months.length);
  if (days < perMonth) return `${days} ${days === 1 ? 'dia' : 'dias'} depois`;
  if (days < dpy) {
    const m = Math.round(days / perMonth);
    return `${m} ${m === 1 ? 'mês' : 'meses'} depois`;
  }
  const y = Math.floor(days / dpy);
  const rest = days - y * dpy;
  const m = Math.round(rest / perMonth);
  const ys = `${y} ${y === 1 ? 'ano' : 'anos'}`;
  return m > 0 ? `${ys} e ${m} ${m === 1 ? 'mês' : 'meses'} depois` : `${ys} depois`;
}
