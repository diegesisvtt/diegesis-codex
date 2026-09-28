import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  daysPerYear,
  eraDepth,
  formatEraRange,
  formatEventDate,
  moonGlyph,
  moonPhaseIndex,
  type TimelineData,
  type TimelineEra,
  type TimelineEvent,
} from '@shared/timeline';
import { NO_LANE, buildGaps, eventIcon, formatGapDuration, fromVirtual, toVirtual } from './model';

/* ---------- layout horizontal ---------- */
const RULER_H = 30;
const MOON_ROW_H = 16;
const ERA_ROW_H = 18;
const LANE_H = 56;
const GUTTER_W = 132; // nomes das lanes à esquerda
/* ---------- layout vertical ---------- */
const RULER_W = 64; // régua de anos à esquerda
const MOON_COL_W = 20;
const ERA_COL_W = 18;
const LANE_W = 170;
const LANE_HEADER_H = 30; // nomes das lanes no topo

const MIN_PX_DAY = 0.004;
const MAX_PX_DAY = 40;
/** margem (dias virtuais) além da viewport para culling de eventos */
const CULL_MARGIN_DAYS = 30;

const INK_2 = 'var(--color-ink-2)';
const INK_3 = 'var(--color-ink-3)';
const LINE = 'var(--color-line)';
const LINE_STRONG = 'var(--color-line-strong)';

interface RenderLane {
  key: string; // lane id ou NO_LANE
  name: string;
  color: string;
}

interface Camera {
  pxPerDay: number;
  /** deslocamento ao longo do eixo do tempo (x na horizontal, y na vertical) */
  offset: number;
}

export function TimelineCanvas({
  data,
  events,
  vertical,
  compact,
  onEventClick,
  onEraClick,
  onCreateAt,
}: {
  data: TimelineData;
  /** eventos já filtrados */
  events: TimelineEvent[];
  /** true = tempo flui de cima para baixo (estilo World Anvil) */
  vertical: boolean;
  /** true = períodos vazios colapsam num separador com a duração */
  compact: boolean;
  onEventClick(id: string): void;
  onEraClick(id: string): void;
  /** duplo clique no vazio: criar evento nesta data/lane */
  onCreateAt(serial: number, laneId: string | null): void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  // câmera em estado único: zoom-to-cursor computa os dois campos juntos
  const [cam, setCam] = useState<Camera>({ pxPerDay: 0.2, offset: 100 });
  const dragRef = useRef<{ pos: number; offset: number } | null>(null);

  const cal = data.calendar;
  const dpy = daysPerYear(cal);
  const { pxPerDay, offset } = cam;

  // ---------- eixo comprimido ----------
  const gaps = useMemo(() => (compact ? buildGaps(data, events) : []), [compact, data, events]);
  const virt = (serial: number) => (compact ? toVirtual(serial, gaps) : serial);

  // ---------- lanes ----------
  const lanes: RenderLane[] = useMemo(() => {
    const sorted = [...data.lanes].sort((a, b) => a.order - b.order);
    const visible = sorted.map((l): RenderLane => ({ key: l.id, name: l.name, color: l.color }));
    if (events.some((e) => !e.laneId || !sorted.some((l) => l.id === e.laneId))) {
      visible.push({ key: NO_LANE, name: 'Sem lane', color: '#8a8a8a' });
    }
    if (visible.length === 0) visible.push({ key: NO_LANE, name: 'Eventos', color: '#8a8a8a' });
    return visible;
  }, [data.lanes, events]);

  const laneIndex = useMemo(() => new Map(lanes.map((l, i) => [l.key, i])), [lanes]);

  // ---------- eras: profundidade → faixas ----------
  const eraRows = useMemo(() => {
    let maxDepth = 0;
    for (const e of data.eras) maxDepth = Math.max(maxDepth, eraDepth(e, data.eras));
    return data.eras.length > 0 ? maxDepth + 1 : 0;
  }, [data.eras]);

  // luas e ticks de calendário são lineares — não fazem sentido no eixo comprimido
  const showLinear = !compact;
  const moonCount = showLinear ? data.moons.length : 0;

  /** espaço reservado no INÍCIO do eixo do tempo (gutter de lanes / régua) */
  const timeStart = vertical ? LANE_HEADER_H : GUTTER_W;
  /** espaço reservado no início do eixo cruzado (régua+luas+eras / header de lanes) */
  const crossStart = vertical
    ? RULER_W + moonCount * MOON_COL_W + eraRows * ERA_COL_W
    : RULER_H + moonCount * MOON_ROW_H + eraRows * ERA_ROW_H;
  const laneSize = vertical ? LANE_W : LANE_H;
  /** extensão da viewport ao longo do eixo do tempo */
  const viewportT = vertical ? size.h : size.w;

  /** posição (px) de um serial no eixo do tempo */
  const T = (serial: number) => timeStart + offset + virt(serial) * pxPerDay;
  /** centro (px) da lane i no eixo cruzado */
  const laneCenter = (i: number) => crossStart + i * laneSize + laneSize / 2;

  // extensão virtual visível (para culling)
  const vMin = (0 - timeStart - offset) / pxPerDay;
  const vMax = (viewportT - timeStart - offset) / pxPerDay;

  // tamanho do SVG: eixo do tempo acompanha a viewport (pan pela câmera);
  // eixo cruzado cresce com as lanes e usa scroll nativo do container
  const svgW = vertical ? crossStart + lanes.length * LANE_W + 24 : size.w;
  const svgH = vertical ? size.h : Math.max(crossStart + lanes.length * LANE_H + 24, 240);

  // ---------- ajuste inicial da câmera (e re-fit ao trocar modo) ----------
  const fitKey = `${vertical}|${compact}`;
  const lastFitKey = useRef<string | null>(null);
  useEffect(() => {
    if (viewportT <= 0 || lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;
    if (data.events.length > 0) {
      const vs = data.events.flatMap((e) => [virt(e.date), virt(e.endDate ?? e.date)]);
      const lo = Math.min(...vs) - 60;
      const hi = Math.max(...vs) + 60;
      const span = Math.max(30, hi - lo);
      const usable = Math.max(200, viewportT - timeStart - 60);
      const p = Math.min(MAX_PX_DAY, Math.max(MIN_PX_DAY, usable / span));
      setCam({ pxPerDay: p, offset: 30 - lo * p });
    } else {
      const p = Math.max(MIN_PX_DAY, (viewportT - timeStart - 60) / (dpy * 3));
      setCam({ pxPerDay: p, offset: 30 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportT, fitKey]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    );
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // ---------- zoom/pan (wheel precisa de listener não-passivo) ----------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mPos = vertical ? e.clientY - rect.top : e.clientX - rect.left;
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
        setCam((prev) => {
          const next = Math.min(MAX_PX_DAY, Math.max(MIN_PX_DAY, prev.pxPerDay * factor));
          // manter o serial sob o cursor fixo
          const v = (mPos - timeStart - prev.offset) / prev.pxPerDay;
          return { pxPerDay: next, offset: mPos - timeStart - v * next };
        });
      } else {
        setCam((prev) => ({ ...prev, offset: prev.offset - (e.deltaY + e.deltaX) }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [vertical, timeStart]);

  // ---------- ticks da régua (apenas eixo linear) ----------
  const yearTicks = useMemo(() => {
    if (!showLinear) return [];
    const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
    const step = steps.find((s) => s * dpy * pxPerDay >= 90) ?? 1000;
    const firstIdx = Math.floor(vMin / (dpy * step)) * step; // índice de ano (0 = ano 1)
    const ticks: { serial: number; year: number }[] = [];
    for (let idx = firstIdx; idx * dpy <= vMax; idx += step) {
      ticks.push({ serial: idx * dpy, year: idx + 1 });
    }
    return ticks;
  }, [showLinear, vMin, vMax, dpy, pxPerDay]);

  const monthTicks = useMemo(() => {
    if (!showLinear || pxPerDay < 0.35) return [];
    const ticks: number[] = [];
    let idx = Math.floor(vMin / dpy) - 1;
    const endIdx = Math.ceil(vMax / dpy) + 1;
    for (; idx <= endIdx; idx++) {
      let s = idx * dpy;
      for (const m of cal.months) {
        if (s >= vMin && s <= vMax) ticks.push(s);
        s += Math.max(1, m.days);
      }
    }
    return ticks;
  }, [showLinear, vMin, vMax, dpy, pxPerDay, cal.months]);

  // ---------- posições de fase lunar ----------
  const moonMarks = useMemo(() => {
    if (!showLinear || pxPerDay < 0.05) return [];
    const stepDays = pxPerDay >= 1.2 ? 1 : Math.max(1, Math.round(8 / pxPerDay));
    const marks: { serial: number }[] = [];
    const start = Math.floor(vMin / stepDays) * stepDays;
    for (let s = start; s <= vMax; s += stepDays) marks.push({ serial: s });
    return marks;
  }, [showLinear, vMin, vMax, pxPerDay]);

  // ---------- interações de mouse ----------
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { pos: vertical ? e.clientY : e.clientX, offset };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const pos = vertical ? e.clientY : e.clientX;
    const next = dragRef.current.offset + (pos - dragRef.current.pos);
    setCam((prev) => ({ ...prev, offset: next }));
  };
  const endDrag = () => (dragRef.current = null);

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mt = vertical ? e.clientY - rect.top : e.clientX - rect.left; // eixo do tempo
    const mc = vertical ? e.clientX - rect.left : e.clientY - rect.top; // eixo cruzado
    if (mc < crossStart) return; // régua/eras: não cria evento
    const laneIdx = Math.floor((mc - crossStart) / laneSize);
    const lane = lanes[laneIdx];
    if (!lane) return;
    const v = (mt - timeStart - offset) / pxPerDay;
    const serial = Math.round(compact ? fromVirtual(v, gaps) : v);
    onCreateAt(serial, lane.key === NO_LANE ? null : lane.key);
  };

  const laneColorOf = (laneId: string | null) => data.lanes.find((l) => l.id === laneId)?.color ?? '#8a8a8a';

  const eventCross = (ev: TimelineEvent): number | null => {
    const key = ev.laneId && laneIndex.has(ev.laneId) ? ev.laneId : NO_LANE;
    const idx = laneIndex.get(key) ?? laneIndex.get(lanes[0]?.key ?? NO_LANE);
    if (idx == null) return null;
    return laneCenter(idx);
  };

  // ---------- culling: só eventos que tocam a viewport (viram nós SVG) ----------
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (ev) => virt(ev.endDate ?? ev.date) >= vMin - CULL_MARGIN_DAYS && virt(ev.date) <= vMax + CULL_MARGIN_DAYS
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, vMin, vMax, gaps, compact]
  );

  // âncoras dos eventos visíveis (para setas de causa/efeito)
  const anchors = useMemo(() => {
    const map = new Map<string, { t1: number; t2: number; c: number }>();
    for (const ev of visibleEvents) {
      const c = eventCross(ev);
      if (c == null) continue;
      map.set(ev.id, { t1: T(ev.date), t2: T((ev.endDate ?? ev.date) + 1), c });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, laneIndex, crossStart, offset, pxPerDay, gaps, compact]);

  const visibleLinks = data.links.filter((l) => anchors.has(l.fromEventId) && anchors.has(l.toEventId));

  const truncate = (s: string, px: number) => {
    const maxChars = Math.max(0, Math.floor(px / 6.2));
    return s.length > maxChars ? s.slice(0, Math.max(0, maxChars - 1)) + '…' : s;
  };

  // ---------- mini-mapa (visão geral + quick-jump, estilo World Anvil) ----------
  const mapRange = useMemo(() => {
    const pts: number[] = [];
    for (const e of data.events) pts.push(e.date, e.endDate ?? e.date);
    for (const era of data.eras) {
      if (!era.openStart) pts.push(era.start);
      if (!era.openEnd) pts.push(era.end);
    }
    if (pts.length === 0) return null;
    let lo = Math.min(...pts);
    let hi = Math.max(...pts);
    if (hi - lo < dpy) {
      const mid = (lo + hi) / 2;
      lo = mid - dpy / 2;
      hi = mid + dpy / 2;
    }
    return { lo, hi };
  }, [data, dpy]);

  /** serial visível nas bordas da viewport (reais, descomprimindo gaps) */
  const visibleRange = {
    lo: compact ? fromVirtual(vMin, gaps) : vMin,
    hi: compact ? fromVirtual(vMax, gaps) : vMax,
  };

  const centerCameraOn = (serial: number) => {
    setCam((prev) => ({ ...prev, offset: viewportT / 2 - timeStart - virt(serial) * prev.pxPerDay }));
  };

  /** salta para o evento anterior/próximo em relação ao centro da viewport */
  const stepEvent = (dir: 1 | -1) => {
    const dates = [...new Set(data.events.map((e) => e.date))].sort((a, b) => a - b);
    if (dates.length === 0) return;
    const mid = (visibleRange.lo + visibleRange.hi) / 2;
    const target =
      dir === 1 ? dates.find((d) => d > mid + 1) : [...dates].reverse().find((d) => d < mid - 1);
    if (target != null) centerCameraOn(target);
    else centerCameraOn(dir === 1 ? dates[dates.length - 1] : dates[0]);
  };

  const renderMinimap = () => {
    if (!mapRange || size.h < 120) return null;
    const { lo, hi } = mapRange;
    const span = hi - lo;
    const pct = (s: number) => `${(Math.max(0, Math.min(1, (s - lo) / span)) * 100).toFixed(2)}%`;
    const vpLo = Math.max(lo, visibleRange.lo);
    const vpHi = Math.min(hi, visibleRange.hi);
    return (
      <div
        className="absolute right-2 top-3 bottom-3 flex flex-col items-center gap-1 z-10"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Evento anterior"
          onClick={() => stepEvent(-1)}
          className="p-1 rounded bg-elevated/90 border border-line text-ink-3 hover:text-ink-1 hover:border-accent/50"
        >
          <ChevronUp size={12} />
        </button>
        <div
          className="relative flex-1 w-4 rounded-full bg-elevated/90 border border-line overflow-hidden cursor-pointer"
          title="Mapa da timeline — clique para navegar"
          onMouseDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const f = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
            centerCameraOn(lo + f * span);
          }}
        >
          {data.eras.map((era) => {
            const a = era.openStart ? lo : era.start;
            const b = era.openEnd ? hi : era.end;
            return (
              <div
                key={era.id}
                className="absolute left-0 right-0"
                style={{ top: pct(a), height: pct(b > a ? b - a + lo : 1), backgroundColor: era.color, opacity: 0.5 }}
              />
            );
          })}
          {data.events.map((ev) => (
            <div
              key={ev.id}
              className="absolute left-1 right-1 rounded-full"
              style={{ top: pct(ev.date), height: 2, backgroundColor: 'var(--color-ink-2)', opacity: 0.8 }}
            />
          ))}
          {/* posição atual da viewport */}
          <div
            className="absolute left-0 right-0 border-y border-accent bg-accent/15 pointer-events-none"
            style={{ top: pct(vpLo), height: `max(6px, ${(((vpHi - vpLo) / span) * 100).toFixed(2)}%)` }}
          />
        </div>
        <button
          type="button"
          title="Próximo evento"
          onClick={() => stepEvent(1)}
          className="p-1 rounded bg-elevated/90 border border-line text-ink-3 hover:text-ink-1 hover:border-accent/50"
        >
          <ChevronDown size={12} />
        </button>
      </div>
    );
  };

  // ---------- seções de render ----------

  const renderRuler = () => {
    if (!showLinear) return null;
    return (
      <>
        {vertical ? (
          <rect x={0} y={0} width={RULER_W} height={svgH} fill="var(--color-overlay)" />
        ) : (
          <rect x={GUTTER_W} y={0} width={Math.max(0, size.w - GUTTER_W)} height={RULER_H} fill="var(--color-overlay)" />
        )}
        {monthTicks.map((s) =>
          vertical ? (
            <line key={`m${s}`} x1={RULER_W - 8} y1={T(s)} x2={RULER_W} y2={T(s)} stroke={LINE} strokeWidth={1} />
          ) : (
            <line key={`m${s}`} x1={T(s)} y1={RULER_H - 8} x2={T(s)} y2={RULER_H} stroke={LINE} strokeWidth={1} />
          )
        )}
        {yearTicks.map((t) =>
          vertical ? (
            <g key={`y${t.serial}`}>
              <line x1={0} y1={T(t.serial)} x2={svgW} y2={T(t.serial)} stroke={LINE} strokeWidth={1} />
              <text x={RULER_W - 6} y={T(t.serial) - 4} fontSize={11} fill={INK_2} textAnchor="end" className="pointer-events-none">
                {t.year}
                {cal.yearLabel ? ` ${cal.yearLabel}` : ''}
              </text>
            </g>
          ) : (
            <g key={`y${t.serial}`}>
              <line x1={T(t.serial)} y1={0} x2={T(t.serial)} y2={svgH} stroke={LINE} strokeWidth={1} />
              <text x={T(t.serial) + 4} y={RULER_H - 10} fontSize={11} fill={INK_2} className="pointer-events-none">
                {t.year}
                {cal.yearLabel ? ` ${cal.yearLabel}` : ''}
              </text>
            </g>
          )
        )}
        {vertical ? (
          <line x1={RULER_W} y1={0} x2={RULER_W} y2={svgH} stroke={LINE_STRONG} strokeWidth={1} />
        ) : (
          <line x1={0} y1={RULER_H} x2={size.w} y2={RULER_H} stroke={LINE_STRONG} strokeWidth={1} />
        )}
      </>
    );
  };

  const renderMoons = () => {
    if (!showLinear) return null;
    return data.moons.map((moon, mi) =>
      vertical ? (
        <g key={moon.id}>
          <text
            x={RULER_W + mi * MOON_COL_W + MOON_COL_W / 2}
            y={LANE_HEADER_H - 8}
            fontSize={9}
            fill={moon.color}
            textAnchor="middle"
            className="pointer-events-none"
          >
            {truncate(moon.name, MOON_COL_W * 2.4)}
          </text>
          {moonMarks.map((m) => (
            <text
              key={m.serial}
              x={RULER_W + mi * MOON_COL_W + MOON_COL_W / 2}
              y={T(m.serial) + 4}
              fontSize={10}
              textAnchor="middle"
              className="pointer-events-none"
            >
              {moonGlyph(moonPhaseIndex(m.serial, moon))}
            </text>
          ))}
          <line
            x1={RULER_W + (mi + 1) * MOON_COL_W}
            y1={0}
            x2={RULER_W + (mi + 1) * MOON_COL_W}
            y2={svgH}
            stroke={LINE}
            strokeWidth={0.5}
          />
        </g>
      ) : (
        <g key={moon.id}>
          <text x={8} y={RULER_H + mi * MOON_ROW_H + 12} fontSize={10} fill={moon.color} className="pointer-events-none">
            {moon.name}
          </text>
          {moonMarks.map((m) => (
            <text key={m.serial} x={T(m.serial)} y={RULER_H + mi * MOON_ROW_H + 12} fontSize={10} textAnchor="middle" className="pointer-events-none">
              {moonGlyph(moonPhaseIndex(m.serial, moon))}
            </text>
          ))}
          <line
            x1={0}
            y1={RULER_H + (mi + 1) * MOON_ROW_H}
            x2={size.w}
            y2={RULER_H + (mi + 1) * MOON_ROW_H}
            stroke={LINE}
            strokeWidth={0.5}
          />
        </g>
      )
    );
  };

  const renderEras = () =>
    data.eras.map((era: TimelineEra) => {
      const depth = eraDepth(era, data.eras);
      // eras abertas (inicial/atual) estendem-se até a borda da viewport
      const t1 = era.openStart ? 0 : T(era.start);
      const t2 = era.openEnd ? viewportT : T(era.end + 1);
      const len = Math.max(3, t2 - t1);
      const tip = `${era.name} — ${formatEraRange(era, cal)}`;
      if (vertical) {
        const ex = RULER_W + moonCount * MOON_COL_W + depth * ERA_COL_W;
        return (
          <g
            key={era.id}
            className="cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEraClick(era.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <rect x={ex + 1} y={t1} width={ERA_COL_W - 2} height={len} rx={3} fill={era.color} opacity={0.22} />
            <rect x={ex + 1} y={t1} width={ERA_COL_W - 2} height={len} rx={3} fill="none" stroke={era.color} strokeWidth={1} opacity={0.7} />
            <text
              transform={`translate(${ex + ERA_COL_W - 5}, ${t1 + 5}) rotate(90)`}
              fontSize={9.5}
              fill={INK_2}
              className="pointer-events-none"
            >
              {truncate(era.name, len - 10)}
            </text>
            <title>{tip}</title>
          </g>
        );
      }
      const ey = RULER_H + moonCount * MOON_ROW_H + depth * ERA_ROW_H;
      return (
        <g
          key={era.id}
          className="cursor-pointer"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEraClick(era.id);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <rect x={t1} y={ey + 1} width={len} height={ERA_ROW_H - 2} rx={3} fill={era.color} opacity={0.22} />
          <rect x={t1} y={ey + 1} width={len} height={ERA_ROW_H - 2} rx={3} fill="none" stroke={era.color} strokeWidth={1} opacity={0.7} />
          <text x={t1 + 5} y={ey + ERA_ROW_H - 5} fontSize={10} fill={INK_2} className="pointer-events-none">
            {truncate(era.name, len - 8)}
          </text>
          <title>{tip}</title>
        </g>
      );
    });

  const renderLanes = () => (
    <>
      {lanes.map((lane, i) =>
        vertical ? (
          <g key={lane.key}>
            <rect x={crossStart + i * LANE_W} y={0} width={LANE_W} height={LANE_HEADER_H} fill="var(--color-overlay)" opacity={0.5} />
            <rect x={crossStart + i * LANE_W} y={0} width={LANE_W} height={4} fill={lane.color} />
            <text
              x={laneCenter(i)}
              y={LANE_HEADER_H - 9}
              fontSize={11}
              fill={INK_2}
              textAnchor="middle"
              className="pointer-events-none"
            >
              {truncate(lane.name, LANE_W - 18)}
            </text>
            {/* spine colorida da lane (estilo LegendKeeper) */}
            <line x1={laneCenter(i)} y1={LANE_HEADER_H} x2={laneCenter(i)} y2={svgH} stroke={lane.color} strokeWidth={2.5} strokeOpacity={0.35} />
            <line x1={crossStart + (i + 1) * LANE_W} y1={0} x2={crossStart + (i + 1) * LANE_W} y2={svgH} stroke={LINE} strokeWidth={1} />
            {i === 0 && <line x1={crossStart} y1={0} x2={crossStart} y2={svgH} stroke={LINE_STRONG} strokeWidth={1} />}
          </g>
        ) : (
          <g key={lane.key}>
            <rect x={0} y={crossStart + i * LANE_H} width={GUTTER_W} height={LANE_H} fill="var(--color-overlay)" opacity={0.5} />
            <rect x={0} y={crossStart + i * LANE_H} width={4} height={LANE_H} fill={lane.color} />
            <text x={12} y={laneCenter(i) + 4} fontSize={11} fill={INK_2} className="pointer-events-none">
              {truncate(lane.name, GUTTER_W - 22)}
            </text>
            {/* spine colorida da lane */}
            <line x1={GUTTER_W} y1={laneCenter(i)} x2={size.w} y2={laneCenter(i)} stroke={lane.color} strokeWidth={2.5} strokeOpacity={0.3} />
            <line x1={0} y1={crossStart + (i + 1) * LANE_H} x2={size.w} y2={crossStart + (i + 1) * LANE_H} stroke={LINE} strokeWidth={1} />
            {i === 0 && <line x1={0} y1={crossStart} x2={size.w} y2={crossStart} stroke={LINE_STRONG} strokeWidth={1} />}
          </g>
        )
      )}
      {vertical ? (
        <line x1={0} y1={LANE_HEADER_H} x2={svgW} y2={LANE_HEADER_H} stroke={LINE_STRONG} strokeWidth={1} />
      ) : (
        <line x1={GUTTER_W} y1={0} x2={GUTTER_W} y2={svgH} stroke={LINE_STRONG} strokeWidth={1} />
      )}
    </>
  );

  /** separadores de gaps colapsados (modo compacto) */
  const renderGaps = () =>
    gaps.map((g) => {
      const mid = T(g.startSerial + g.days / 2);
      const label = formatGapDuration(g.days, cal);
      return vertical ? (
        <g key={`${g.startSerial}`} className="pointer-events-none">
          <line x1={crossStart} y1={mid} x2={svgW} y2={mid} stroke={INK_3} strokeWidth={1} strokeDasharray="2 4" />
          <text x={crossStart + 6} y={mid - 4} fontSize={9.5} fill={INK_3}>
            {label}
          </text>
        </g>
      ) : (
        <g key={`${g.startSerial}`} className="pointer-events-none">
          <line x1={mid} y1={crossStart} x2={mid} y2={svgH} stroke={INK_3} strokeWidth={1} strokeDasharray="2 4" />
          <text x={mid + 5} y={crossStart + 12} fontSize={9.5} fill={INK_3}>
            {label}
          </text>
        </g>
      );
    });

  const renderLinks = () =>
    visibleLinks.map((l) => {
      const a = anchors.get(l.fromEventId)!;
      const b = anchors.get(l.toEventId)!;
      if (vertical) {
        const sy = a.t2 + 2;
        const ty = b.t1 - 4;
        const bend = Math.max(30, Math.abs(ty - sy) / 2);
        return (
          <g key={l.id} className="pointer-events-none">
            <path
              d={`M ${a.c} ${sy} C ${a.c} ${sy + bend}, ${b.c} ${ty - bend}, ${b.c} ${ty}`}
              fill="none"
              stroke={INK_3}
              strokeWidth={1.4}
              strokeDasharray="4 3"
              markerEnd="url(#tl-arrow)"
            />
            {l.label && (
              <text x={(a.c + b.c) / 2 + 6} y={(sy + ty) / 2} fontSize={9.5} fill={INK_3}>
                {l.label}
              </text>
            )}
          </g>
        );
      }
      const sx = a.t2 + 2;
      const tx = b.t1 - 4;
      const bend = Math.max(30, Math.abs(tx - sx) / 2);
      return (
        <g key={l.id} className="pointer-events-none">
          <path
            d={`M ${sx} ${a.c} C ${sx + bend} ${a.c}, ${tx - bend} ${b.c}, ${tx} ${b.c}`}
            fill="none"
            stroke={INK_3}
            strokeWidth={1.4}
            strokeDasharray="4 3"
            markerEnd="url(#tl-arrow)"
          />
          {l.label && (
            <text x={(sx + tx) / 2} y={(a.c + b.c) / 2 - 4} fontSize={9.5} fill={INK_3} textAnchor="middle">
              {l.label}
            </text>
          )}
        </g>
      );
    });

  const renderEvents = () =>
    visibleEvents.map((ev) => {
      const c = eventCross(ev);
      if (c == null) return null;
      const color = ev.color ?? laneColorOf(ev.laneId);
      const t1 = T(ev.date);
      const t2 = ev.endDate != null ? Math.max(T(ev.endDate + 1), t1 + 5) : null;
      const tip = `${ev.title} — ${formatEventDate(ev, cal)}`;
      const dateLabel = compact ? formatEventDate(ev, cal) : null;
      const major = ev.importance === 'major';
      const badge = major ? 30 : 22;
      const iconSize = major ? 16 : 13;
      const Icon = eventIcon(ev.icon);

      /** badge com ícone (estilo LegendKeeper) centrado em (bx, by) */
      const badgeAt = (bx: number, by: number) => (
        <>
          <rect
            x={bx - badge / 2}
            y={by - badge / 2}
            width={badge}
            height={badge}
            rx={badge * 0.32}
            fill="var(--color-elevated)"
            stroke={color}
            strokeWidth={major ? 2.2 : 1.5}
          />
          <Icon
            x={bx - iconSize / 2}
            y={by - iconSize / 2}
            size={iconSize}
            color={color}
            strokeWidth={2}
            className="pointer-events-none"
          />
        </>
      );

      if (vertical) {
        const labelX = c + badge / 2 + 7;
        return (
          <g
            key={ev.id}
            className="cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEventClick(ev.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {t2 != null && <rect x={c - 4} y={t1} width={8} height={Math.max(5, t2 - t1)} rx={4} fill={color} opacity={0.5} />}
            {badgeAt(c, t1)}
            <text
              x={labelX}
              y={t1 + 4}
              fontSize={major ? 12.5 : 11}
              fontWeight={major ? 600 : 400}
              fill={INK_2}
              className="pointer-events-none"
            >
              {truncate(ev.title, LANE_W - badge - 26)}
            </text>
            {dateLabel && (
              <text x={labelX} y={t1 + 17} fontSize={9} fill={INK_3} className="pointer-events-none">
                {dateLabel}
              </text>
            )}
            <title>{tip}</title>
          </g>
        );
      }
      // em spans, o rótulo vai depois do fim da barra (ou do badge, o que for maior)
      const labelX = (t2 != null ? Math.max(t2, t1 + badge / 2) : t1 + badge / 2) + 7;
      return (
        <g
          key={ev.id}
          className="cursor-pointer"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEventClick(ev.id);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {t2 != null && <rect x={t1} y={c - 4} width={Math.max(5, t2 - t1)} height={8} rx={4} fill={color} opacity={0.5} />}
          {badgeAt(t1, c)}
          <text
            x={labelX}
            y={c + 4}
            fontSize={major ? 12.5 : 11}
            fontWeight={major ? 600 : 400}
            fill={INK_2}
            className="pointer-events-none"
          >
            {truncate(ev.title, 220)}
          </text>
          {dateLabel && (
            <text x={labelX} y={c + 17} fontSize={9} fill={INK_3} className="pointer-events-none">
              {dateLabel}
            </text>
          )}
          <title>{tip}</title>
        </g>
      );
    });

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={wrapRef}
        className={`h-full select-none bg-app ${vertical ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden'}`}
      >
        <svg
          width={svgW}
          height={svgH}
          className="block cursor-grab active:cursor-grabbing"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onDoubleClick={onDoubleClick}
        >
          <defs>
            <marker id="tl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill={INK_3} />
            </marker>
          </defs>

          {renderRuler()}
          {renderMoons()}
          {renderEras()}
          {renderLanes()}
          {renderGaps()}
          {renderLinks()}
          {renderEvents()}

          {/* estado vazio */}
          {events.length === 0 && (
            <text
              x={crossStart + Math.max(120, (svgW - crossStart) / 2)}
              y={vertical ? size.h / 2 : crossStart + 60}
              fontSize={13}
              fill={INK_3}
              textAnchor="middle"
              className="pointer-events-none"
            >
              Duplo clique para plotar o primeiro evento da história
            </text>
          )}
        </svg>
      </div>
      {renderMinimap()}
    </div>
  );
}
