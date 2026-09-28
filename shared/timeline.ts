/* ============================================================
   Timeline — modelo de dados + matemática de calendário.
   Datas internas são "seriais": inteiros contando dias desde o
   dia 1 do ano 1 do calendário (serial 0). O calendário só
   afeta a EXIBIÇÃO — trocar de calendário é um retcon gratuito.
   ============================================================ */

export interface TimelineMonth {
  name: string;
  days: number;
}

export interface TimelineCalendar {
  months: TimelineMonth[];
  /** nomes dos dias da semana (vazio = sem semana) */
  weekDayNames: string[];
  /** rótulo da era do calendário, ex.: 'CV', 'AR', 'p.D.' */
  yearLabel: string;
}

export interface TimelineMoon {
  id: string;
  name: string;
  /** duração do ciclo em dias (aceita frações, ex.: 29.53) */
  cycleDays: number;
  /** deslocamento: serial da lua nova mais recente */
  offset: number;
  color: string;
}

export interface TimelineLane {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface TimelineEra {
  id: string;
  name: string;
  /** serial inicial (inclusivo) */
  start: number;
  /** serial final (inclusivo) */
  end: number;
  color: string;
  /** hierarquia: Era > Período > Ano nomeado */
  parentEraId: string | null;
  /** era inicial do mundo: estende-se indefinidamente para trás ("tempo imemorial") */
  openStart?: boolean;
  /** era atual: estende-se indefinidamente para frente */
  openEnd?: boolean;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  /** serial inicial */
  date: number;
  /** serial final; ausente = evento pontual */
  endDate?: number;
  laneId: string | null;
  color: string | null;
  /** ids de documentos do realm (personagens, locais, facções) */
  entityIds: string[];
  tags: string[];
  /** id do ícone (ver EVENT_ICONS no editor) */
  icon?: string | null;
  /** eventos maiores ganham marcador e título em destaque */
  importance?: 'major' | 'minor' | null;
  /** texto exibido no lugar da data real ("Tempo imemorial", "Solstício de Sangue") */
  displayDate?: string | null;
  /** URL da imagem de capa (diegesis-image://asset/… ou externa) */
  cover?: string | null;
}

/** causa e efeito entre dois eventos */
export interface TimelineLink {
  id: string;
  fromEventId: string;
  toEventId: string;
  label: string;
}

export interface TimelineData {
  /** marcador de formato (busca/indexação identificam o doc) */
  kind: 'diegesis-timeline';
  version: 1;
  calendar: TimelineCalendar;
  moons: TimelineMoon[];
  lanes: TimelineLane[];
  eras: TimelineEra[];
  events: TimelineEvent[];
  links: TimelineLink[];
}

// ---------- calendário ----------

export function daysPerYear(cal: TimelineCalendar): number {
  return cal.months.reduce((acc, m) => acc + Math.max(1, m.days), 0);
}

export interface CalendarDate {
  year: number;
  /** índice do mês (0-based) */
  month: number;
  /** dia dentro do mês (1-based) */
  day: number;
  /** índice do dia da semana; -1 quando o calendário não tem semana */
  weekDay: number;
}

/** serial → data de calendário. Seriais negativos = anos antes do ano 1. */
export function serialToDate(serial: number, cal: TimelineCalendar): CalendarDate {
  const dpy = daysPerYear(cal);
  // ano 1 começa no serial 0; divisão euclidiana lida com negativos
  const yearIndex = Math.floor(serial / dpy); // 0 = ano 1
  let dayOfYear = serial - yearIndex * dpy;
  let month = 0;
  while (month < cal.months.length - 1 && dayOfYear >= Math.max(1, cal.months[month].days)) {
    dayOfYear -= Math.max(1, cal.months[month].days);
    month++;
  }
  const weekLen = cal.weekDayNames.length;
  const weekDay = weekLen > 0 ? ((serial % weekLen) + weekLen) % weekLen : -1;
  return { year: yearIndex + 1, month, day: dayOfYear + 1, weekDay };
}

/** data de calendário → serial (clampa dia/mês inválidos) */
export function dateToSerial(year: number, month: number, day: number, cal: TimelineCalendar): number {
  const dpy = daysPerYear(cal);
  let serial = (year - 1) * dpy;
  const m = Math.max(0, Math.min(month, cal.months.length - 1));
  for (let i = 0; i < m; i++) serial += Math.max(1, cal.months[i].days);
  return serial + Math.max(1, Math.min(day, Math.max(1, cal.months[m].days))) - 1;
}

/** ex.: '14 de Marpenoth de 1492 CV' */
export function formatDate(serial: number, cal: TimelineCalendar): string {
  const d = serialToDate(serial, cal);
  const monthName = cal.months[d.month]?.name ?? `Mês ${d.month + 1}`;
  const label = cal.yearLabel ? ` ${cal.yearLabel}` : '';
  return `${d.day} de ${monthName} de ${d.year}${label}`;
}

/** ex.: '1492 CV' */
export function formatYear(serial: number, cal: TimelineCalendar): string {
  const d = serialToDate(serial, cal);
  return `${d.year}${cal.yearLabel ? ` ${cal.yearLabel}` : ''}`;
}

/** data de exibição de um evento: displayDate (se houver) ou intervalo formatado */
export function formatEventDate(
  ev: { date: number; endDate?: number; displayDate?: string | null },
  cal: TimelineCalendar
): string {
  if (ev.displayDate) return ev.displayDate;
  const a = formatDate(ev.date, cal);
  return ev.endDate != null ? `${a} → ${formatDate(ev.endDate, cal)}` : a;
}

/** intervalo de exibição de uma era, respeitando limites abertos */
export function formatEraRange(era: TimelineEra, cal: TimelineCalendar): string {
  const a = era.openStart ? 'Tempo imemorial' : formatDate(era.start, cal);
  const b = era.openEnd ? 'hoje' : formatDate(era.end, cal);
  return `${a} → ${b}`;
}

// ---------- luas ----------

/** fase 0..1 (0 = nova, 0.5 = cheia) */
export function moonPhase(serial: number, moon: TimelineMoon): number {
  const cycle = Math.max(1, moon.cycleDays);
  const t = (((serial - moon.offset) % cycle) + cycle) % cycle;
  return t / cycle;
}

export const MOON_PHASE_NAMES = [
  'Nova',
  'Crescente',
  'Quarto crescente',
  'Gibosa crescente',
  'Cheia',
  'Gibosa minguante',
  'Quarto minguante',
  'Minguante',
];

/** índice 0..7 em MOON_PHASE_NAMES (buckets iguais de 1/8 do ciclo) */
export function moonPhaseIndex(serial: number, moon: TimelineMoon): number {
  return Math.floor(moonPhase(serial, moon) * 8) % 8;
}

/** índice do glifo lunar: 0 nova, 1-3 crescentes, 4 cheia, 5-7 minguantes */
export function moonGlyph(phaseIdx: number): string {
  return ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][phaseIdx] ?? '🌑';
}

// ---------- eras aninhadas ----------

/** teto de profundidade/hops ao caminhar a hierarquia (proteção contra ciclos) */
export const MAX_ERA_DEPTH = 32;

/** profundidade da era na hierarquia (0 = raiz) */
export function eraDepth(era: TimelineEra, eras: TimelineEra[]): number {
  let depth = 0;
  let cur: TimelineEra | undefined = era;
  const byId = new Map(eras.map((e) => [e.id, e]));
  while (cur?.parentEraId) {
    cur = byId.get(cur.parentEraId);
    depth++;
    if (depth >= MAX_ERA_DEPTH) break; // proteção contra ciclos
  }
  return depth;
}

/** true se `candidate` é descendente de `ancestor` (usado p/ evitar ciclos) */
export function isEraDescendant(candidateId: string, ancestorId: string, eras: TimelineEra[]): boolean {
  const byId = new Map(eras.map((e) => [e.id, e]));
  let cur = byId.get(candidateId);
  let hops = 0;
  while (cur?.parentEraId && hops++ < MAX_ERA_DEPTH) {
    if (cur.parentEraId === ancestorId) return true;
    cur = byId.get(cur.parentEraId);
  }
  return false;
}

// ---------- serialização ----------

export const GREGORIAN_CALENDAR: TimelineCalendar = {
  months: [
    { name: 'Janeiro', days: 31 },
    { name: 'Fevereiro', days: 28 },
    { name: 'Março', days: 31 },
    { name: 'Abril', days: 30 },
    { name: 'Maio', days: 31 },
    { name: 'Junho', days: 30 },
    { name: 'Julho', days: 31 },
    { name: 'Agosto', days: 31 },
    { name: 'Setembro', days: 30 },
    { name: 'Outubro', days: 31 },
    { name: 'Novembro', days: 30 },
    { name: 'Dezembro', days: 31 },
  ],
  weekDayNames: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  yearLabel: '',
};

export function createDefaultTimeline(): TimelineData {
  return {
    kind: 'diegesis-timeline',
    version: 1,
    calendar: GREGORIAN_CALENDAR,
    moons: [],
    lanes: [],
    eras: [],
    events: [],
    links: [],
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : []);

/** entrada hostil (import de realm, versões futuras): valida campo a campo */
export function parseTimeline(content: string | null | undefined): TimelineData {
  const base = createDefaultTimeline();
  if (!content) return base;
  try {
    const raw = JSON.parse(content);
    if (!raw || typeof raw !== 'object') return base;
    const cal = raw.calendar;
    return {
      kind: 'diegesis-timeline',
      version: 1,
      calendar:
        cal && Array.isArray(cal.months) && cal.months.length > 0
          ? {
              months: cal.months
                .filter((m: unknown) => m && typeof m === 'object' && isStr((m as TimelineMonth).name) && isNum((m as TimelineMonth).days))
                .map((m: TimelineMonth) => ({ name: m.name, days: Math.max(1, Math.trunc(m.days)) })),
              weekDayNames: strArr(cal.weekDayNames),
              yearLabel: isStr(cal.yearLabel) ? cal.yearLabel : '',
            }
          : base.calendar,
      moons: Array.isArray(raw.moons)
        ? raw.moons.filter(
            (m: TimelineMoon) => m && isStr(m.id) && isStr(m.name) && isNum(m.cycleDays) && isNum(m.offset) && isStr(m.color)
          )
        : [],
      lanes: Array.isArray(raw.lanes)
        ? raw.lanes.filter((l: TimelineLane) => l && isStr(l.id) && isStr(l.name) && isStr(l.color) && isNum(l.order))
        : [],
      eras: Array.isArray(raw.eras)
        ? raw.eras.filter((e: TimelineEra) => e && isStr(e.id) && isStr(e.name) && isNum(e.start) && isNum(e.end) && isStr(e.color))
        : [],
      events: Array.isArray(raw.events)
        ? raw.events
            .filter((e: TimelineEvent) => e && isStr(e.id) && isNum(e.date))
            .map((e: TimelineEvent) => ({
              id: e.id,
              title: isStr(e.title) ? e.title : '',
              description: isStr(e.description) ? e.description : '',
              date: e.date,
              endDate: isNum(e.endDate) ? Math.max(e.endDate, e.date) : undefined,
              laneId: isStr(e.laneId) ? e.laneId : null,
              color: isStr(e.color) ? e.color : null,
              entityIds: strArr(e.entityIds),
              tags: strArr(e.tags),
              icon: isStr(e.icon) ? e.icon : null,
              importance: e.importance === 'major' || e.importance === 'minor' ? e.importance : null,
              displayDate: isStr(e.displayDate) && e.displayDate.trim() ? e.displayDate : null,
              cover: isStr(e.cover) && e.cover.trim() ? e.cover : null,
            }))
        : [],
      links: Array.isArray(raw.links)
        ? raw.links.filter((l: TimelineLink) => l && isStr(l.id) && isStr(l.fromEventId) && isStr(l.toEventId))
        : [],
    };
  } catch {
    return base;
  }
}

export function serializeTimeline(data: TimelineData): string {
  return JSON.stringify(data);
}

/** texto indexável (FTS): títulos, descrições, eras, lanes, tags, luas */
export function extractTimelineText(content: string | null | undefined): string {
  const t = parseTimeline(content);
  const parts: string[] = [];
  for (const e of t.events) {
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    parts.push(...e.tags);
  }
  for (const era of t.eras) parts.push(era.name);
  for (const lane of t.lanes) parts.push(lane.name);
  for (const moon of t.moons) parts.push(moon.name);
  for (const l of t.links) if (l.label) parts.push(l.label);
  return parts.join(' ');
}
