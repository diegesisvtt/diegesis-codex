import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { DocNode } from '@shared/types';
import {
  dateToSerial,
  isEraDescendant,
  serialToDate,
  type TimelineCalendar,
  type TimelineData,
  type TimelineEra,
  type TimelineEvent,
  type TimelineLane,
  type TimelineLink,
  type TimelineMoon,
  type TimelineMonth,
} from '@shared/timeline';
import { CALENDAR_TEMPLATES } from '@shared/calendarTemplates';
import { EntityPicker } from './EntityPicker';
import { EVENT_ICONS, PALETTE, generateId } from './model';

// ---------- primitivos de UI ----------

const inputCls =
  'w-full bg-overlay border border-line rounded px-2 py-1.5 text-[12.5px] text-ink-1 outline-none focus:border-accent placeholder:text-ink-3';
const labelCls = 'block text-[11px] uppercase tracking-wide text-ink-3 mb-1';

function Modal({
  title,
  onClose,
  children,
  width = 440,
}: {
  title: string;
  onClose(): void;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        // só fecha clicando no próprio backdrop (um clique "vazado" de um
        // double-click no canvas não deve fechar o diálogo recém-aberto)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-elevated border border-line rounded-xl shadow-2xl max-h-[85vh] flex flex-col"
        style={{ width, maxWidth: '92vw' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="text-[14px] font-semibold text-ink-1">{title}</h2>
          <button className="text-ink-3 hover:text-ink-1" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-3 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ColorSwatches({ value, onChange }: { value: string; onChange(c: string): void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-5 h-5 rounded-full border-2 ${value === c ? 'border-ink-1' : 'border-transparent'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

/** data de calendário customizado: dia / mês / ano → serial */
export function DateInput({
  serial,
  calendar,
  onChange,
}: {
  serial: number;
  calendar: TimelineCalendar;
  onChange(serial: number): void;
}) {
  const d = serialToDate(serial, calendar);
  const emit = (year: number, month: number, day: number) => onChange(dateToSerial(year, month, day, calendar));
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={d.day}
        min={1}
        onChange={(e) => emit(d.year, d.month, Number(e.target.value) || 1)}
        className={inputCls}
        style={{ width: 60 }}
        title="Dia"
      />
      <select value={d.month} onChange={(e) => emit(d.year, Number(e.target.value), d.day)} className={inputCls}>
        {calendar.months.map((m, i) => (
          <option key={i} value={i}>
            {m.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={d.year}
        onChange={(e) => {
          const y = Number(e.target.value);
          // seriais negativos (anos anteriores ao ano 1) são válidos no modelo
          emit(Number.isFinite(y) && e.target.value !== '' ? Math.trunc(y) : d.year, d.month, d.day);
        }}
        className={inputCls}
        style={{ width: 80 }}
        title="Ano"
      />
      {calendar.yearLabel && <span className="text-[12px] text-ink-3">{calendar.yearLabel}</span>}
    </div>
  );
}

// ---------- evento ----------

export function EventDialog({
  draft,
  isNew,
  data,
  docs,
  excludeDocId,
  onSave,
  onDelete,
  onClose,
}: {
  draft: TimelineEvent;
  isNew: boolean;
  data: TimelineData;
  docs: DocNode[];
  excludeDocId?: string;
  onSave(event: TimelineEvent, links: TimelineLink[]): void;
  onDelete?(id: string): void;
  onClose(): void;
}) {
  const [ev, setEv] = useState<TimelineEvent>(draft);
  const [hasEnd, setHasEnd] = useState(draft.endDate != null);
  const [tagsText, setTagsText] = useState(draft.tags.join(', '));
  const [links, setLinks] = useState<TimelineLink[]>(
    data.links.filter((l) => l.fromEventId === draft.id || l.toEventId === draft.id)
  );
  const [linkTarget, setLinkTarget] = useState('');
  const [linkDir, setLinkDir] = useState<'out' | 'in'>('out');
  const [linkLabel, setLinkLabel] = useState('');

  const otherEvents = data.events.filter((e) => e.id !== draft.id);

  const addLink = () => {
    if (!linkTarget) return;
    const link: TimelineLink = {
      id: generateId(),
      fromEventId: linkDir === 'out' ? draft.id : linkTarget,
      toEventId: linkDir === 'out' ? linkTarget : draft.id,
      label: linkLabel.trim(),
    };
    setLinks([...links, link]);
    setLinkTarget('');
    setLinkLabel('');
  };

  const save = () => {
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({ ...ev, title: ev.title.trim() || 'Sem título', tags, endDate: hasEnd ? (ev.endDate ?? ev.date) : undefined }, links);
  };

  const titleOf = (id: string) => data.events.find((e) => e.id === id)?.title || '?';

  return (
    <Modal title={isNew ? 'Novo evento' : 'Editar evento'} onClose={onClose} width={480}>
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Título</label>
          <input autoFocus type="text" value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Descrição</label>
          <textarea
            value={ev.description}
            onChange={(e) => setEv({ ...ev, description: e.target.value })}
            rows={3}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Data</label>
          <DateInput
            serial={ev.date}
            calendar={data.calendar}
            onChange={(s) => setEv({ ...ev, date: s, endDate: ev.endDate != null ? Math.max(ev.endDate, s) : undefined })}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="ev-has-end"
            type="checkbox"
            checked={hasEnd}
            onChange={(e) => setHasEnd(e.target.checked)}
          />
          <label htmlFor="ev-has-end" className="text-[12.5px] text-ink-2">
            Evento com duração
          </label>
        </div>
        {hasEnd && (
          <div>
            <label className={labelCls}>Fim</label>
            <DateInput
              serial={ev.endDate ?? ev.date}
              calendar={data.calendar}
              onChange={(s) => setEv({ ...ev, endDate: Math.max(s, ev.date) })}
            />
          </div>
        )}
        <div>
          <label className={labelCls}>Storyline (lane)</label>
          <select
            value={ev.laneId ?? ''}
            onChange={(e) => setEv({ ...ev, laneId: e.target.value || null })}
            className={inputCls}
          >
            <option value="">Sem lane</option>
            {data.lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls}>Cor</label>
            <ColorSwatches value={ev.color ?? '#529cca'} onChange={(c) => setEv({ ...ev, color: c })} />
          </div>
          <div>
            <label className={labelCls}>Importância</label>
            <select
              value={ev.importance ?? 'minor'}
              onChange={(e) => setEv({ ...ev, importance: e.target.value === 'major' ? 'major' : 'minor' })}
              className={inputCls}
            >
              <option value="minor">Menor</option>
              <option value="major">Maior</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Ícone</label>
          <div className="flex flex-wrap gap-1">
            {EVENT_ICONS.map(({ id, Icon, label }) => (
              <button
                key={id}
                type="button"
                title={label}
                onClick={() => setEv({ ...ev, icon: id })}
                className={`p-1.5 rounded border ${
                  (ev.icon ?? 'flag') === id
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-ink-3 hover:text-ink-1 hover:bg-hover'
                }`}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelCls}>Data de exibição alternativa (opcional)</label>
          <input
            type="text"
            value={ev.displayDate ?? ''}
            onChange={(e) => setEv({ ...ev, displayDate: e.target.value || null })}
            className={inputCls}
            placeholder='Ex.: "Tempo imemorial" — substitui a data real'
          />
        </div>
        <div>
          <label className={labelCls}>Tags (separadas por vírgula)</label>
          <input type="text" value={tagsText} onChange={(e) => setTagsText(e.target.value)} className={inputCls} placeholder="guerra, dinastia, profecia…" />
        </div>
        <div>
          <label className={labelCls}>Entidades vinculadas</label>
          <EntityPicker docs={docs} excludeDocId={excludeDocId} selected={ev.entityIds} onChange={(ids) => setEv({ ...ev, entityIds: ids })} />
        </div>

        {!isNew && otherEvents.length > 0 && (
          <div>
            <label className={labelCls}>Causa e efeito</label>
            <div className="flex flex-col gap-1 mb-2">
              {links.map((l) => (
                <div key={l.id} className="flex items-center gap-1.5 text-[12px] text-ink-2 bg-overlay rounded px-2 py-1">
                  <span className="truncate">
                    {titleOf(l.fromEventId)} → {titleOf(l.toEventId)}
                    {l.label ? ` (${l.label})` : ''}
                  </span>
                  <button
                    type="button"
                    className="ml-auto text-ink-3 hover:text-danger shrink-0"
                    onClick={() => setLinks(links.filter((x) => x.id !== l.id))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <select value={linkDir} onChange={(e) => setLinkDir(e.target.value as 'out' | 'in')} className={inputCls} style={{ width: 110 }}>
                <option value="out">causa em</option>
                <option value="in">causado por</option>
              </select>
              <select value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)} className={inputCls}>
                <option value="">evento…</option>
                {otherEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="rótulo"
                className={inputCls}
                style={{ width: 90 }}
              />
              <button
                type="button"
                onClick={addLink}
                disabled={!linkTarget}
                className="shrink-0 px-2 py-1.5 text-[12px] rounded bg-active text-ink-1 hover:bg-hover disabled:opacity-40"
              >
                Adicionar
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={save} className="px-3 py-1.5 text-[12.5px] rounded bg-accent text-white hover:opacity-90">
            {isNew ? 'Criar evento' : 'Salvar'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-[12.5px] rounded bg-active text-ink-2 hover:bg-hover">
            Cancelar
          </button>
          {!isNew && onDelete && (
            <button
              onClick={() => onDelete(draft.id)}
              className="ml-auto flex items-center gap-1 px-2 py-1.5 text-[12px] rounded text-danger hover:bg-hover"
            >
              <Trash2 size={13} /> Excluir
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------- era ----------

export function EraDialog({
  draft,
  isNew,
  data,
  onSave,
  onDelete,
  onClose,
}: {
  draft: TimelineEra;
  isNew: boolean;
  data: TimelineData;
  onSave(era: TimelineEra): void;
  onDelete?(id: string): void;
  onClose(): void;
}) {
  const [era, setEra] = useState<TimelineEra>(draft);
  // mães válidas: qualquer era exceto ela mesma e suas descendentes (sem ciclos)
  const validParents = data.eras.filter((e) => e.id !== draft.id && !isEraDescendant(e.id, draft.id, data.eras));

  return (
    <Modal title={isNew ? 'Nova era' : 'Editar era'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Nome</label>
          <input autoFocus type="text" value={era.name} onChange={(e) => setEra({ ...era, name: e.target.value })} className={inputCls} />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={!!era.openStart}
              onChange={(e) => setEra({ ...era, openStart: e.target.checked || undefined })}
            />
            Era inicial (sem começo)
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={!!era.openEnd}
              onChange={(e) => setEra({ ...era, openEnd: e.target.checked || undefined })}
            />
            Era atual (sem fim)
          </label>
        </div>
        {!era.openStart && (
          <div>
            <label className={labelCls}>Início</label>
            <DateInput serial={era.start} calendar={data.calendar} onChange={(s) => setEra({ ...era, start: s, end: Math.max(era.end, s) })} />
          </div>
        )}
        {!era.openEnd && (
          <div>
            <label className={labelCls}>Fim</label>
            <DateInput serial={era.end} calendar={data.calendar} onChange={(s) => setEra({ ...era, end: Math.max(s, era.start) })} />
          </div>
        )}
        <div>
          <label className={labelCls}>Era-mãe (aninhamento)</label>
          <select
            value={era.parentEraId ?? ''}
            onChange={(e) => setEra({ ...era, parentEraId: e.target.value || null })}
            className={inputCls}
          >
            <option value="">Nenhuma (era raiz)</option>
            {validParents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Cor</label>
          <ColorSwatches value={era.color} onChange={(c) => setEra({ ...era, color: c })} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => onSave({ ...era, name: era.name.trim() || 'Era sem nome' })} className="px-3 py-1.5 text-[12.5px] rounded bg-accent text-white hover:opacity-90">
            {isNew ? 'Criar era' : 'Salvar'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-[12.5px] rounded bg-active text-ink-2 hover:bg-hover">
            Cancelar
          </button>
          {!isNew && onDelete && (
            <button onClick={() => onDelete(draft.id)} className="ml-auto flex items-center gap-1 px-2 py-1.5 text-[12px] rounded text-danger hover:bg-hover">
              <Trash2 size={13} /> Excluir
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------- lane ----------

export function LaneDialog({
  draft,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  draft: TimelineLane;
  isNew: boolean;
  onSave(lane: TimelineLane): void;
  onDelete?(id: string): void;
  onClose(): void;
}) {
  const [lane, setLane] = useState<TimelineLane>(draft);
  return (
    <Modal title={isNew ? 'Nova storyline' : 'Editar storyline'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Nome</label>
          <input autoFocus type="text" value={lane.name} onChange={(e) => setLane({ ...lane, name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Cor</label>
          <ColorSwatches value={lane.color} onChange={(c) => setLane({ ...lane, color: c })} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => onSave({ ...lane, name: lane.name.trim() || 'Storyline' })} className="px-3 py-1.5 text-[12.5px] rounded bg-accent text-white hover:opacity-90">
            {isNew ? 'Criar storyline' : 'Salvar'}
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-[12.5px] rounded bg-active text-ink-2 hover:bg-hover">
            Cancelar
          </button>
          {!isNew && onDelete && (
            <button onClick={() => onDelete(draft.id)} className="ml-auto flex items-center gap-1 px-2 py-1.5 text-[12px] rounded text-danger hover:bg-hover">
              <Trash2 size={13} /> Excluir
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------- calendário + luas ----------

export function CalendarDialog({
  calendar,
  moons,
  onSave,
  onClose,
}: {
  calendar: TimelineCalendar;
  moons: TimelineMoon[];
  onSave(calendar: TimelineCalendar, moons: TimelineMoon[]): void;
  onClose(): void;
}) {
  const [cal, setCal] = useState<TimelineCalendar>(() => JSON.parse(JSON.stringify(calendar)));
  const [moonList, setMoonList] = useState<TimelineMoon[]>(() => JSON.parse(JSON.stringify(moons)));
  const [templateId, setTemplateId] = useState('');
  // texto livre (vírgulas não são parseadas a cada tecla — só ao salvar)
  const [weekText, setWeekText] = useState(calendar.weekDayNames.join(', '));

  const setMonth = (i: number, patch: Partial<TimelineMonth>) =>
    setCal({ ...cal, months: cal.months.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  const setMoon = (id: string, patch: Partial<TimelineMoon>) =>
    setMoonList(moonList.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = CALENDAR_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setCal(JSON.parse(JSON.stringify(t.calendar)));
    setWeekText(t.calendar.weekDayNames.join(', '));
    setMoonList(t.moons.map((m) => ({ ...m, id: generateId() })));
  };

  return (
    <Modal title="Calendário e luas" onClose={onClose} width={520}>
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>Template (retcon seguro: as datas não mudam)</label>
          <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className={inputCls}>
            <option value="">Personalizado</option>
            {CALENDAR_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id} title={t.description}>
                {t.name}
              </option>
            ))}
          </select>
          {templateId && (
            <p className="text-[11px] text-ink-3 mt-1">{CALENDAR_TEMPLATES.find((t) => t.id === templateId)?.description}</p>
          )}
        </div>

        <div>
          <label className={labelCls}>Meses ({cal.months.length})</label>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
            {cal.months.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input type="text" value={m.name} onChange={(e) => setMonth(i, { name: e.target.value })} className={inputCls} />
                <input
                  type="number"
                  min={1}
                  value={m.days}
                  onChange={(e) => setMonth(i, { days: Math.max(1, Number(e.target.value) || 1) })}
                  className={inputCls}
                  style={{ width: 64 }}
                  title="Dias"
                />
                <button
                  type="button"
                  className="text-ink-3 hover:text-danger shrink-0"
                  onClick={() => setCal({ ...cal, months: cal.months.filter((_, j) => j !== i) })}
                  disabled={cal.months.length <= 1}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCal({ ...cal, months: [...cal.months, { name: `Mês ${cal.months.length + 1}`, days: 30 }] })}
            className="mt-1.5 text-[12px] text-accent hover:underline"
          >
            + Adicionar mês
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCls}>Dias da semana (vírgula; vazio = sem semana)</label>
            <input
              type="text"
              value={weekText}
              onChange={(e) => setWeekText(e.target.value)}
              className={inputCls}
              placeholder="Seg, Ter, Qua…"
            />
          </div>
          <div style={{ width: 90 }}>
            <label className={labelCls}>Rótulo do ano</label>
            <input
              type="text"
              value={cal.yearLabel}
              onChange={(e) => setCal({ ...cal, yearLabel: e.target.value })}
              className={inputCls}
              placeholder="CV"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Luas ({moonList.length})</label>
          <div className="flex flex-col gap-1.5">
            {moonList.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5">
                <input type="color" value={m.color} onChange={(e) => setMoon(m.id, { color: e.target.value })} className="w-7 h-7 rounded bg-overlay border border-line cursor-pointer" />
                <input type="text" value={m.name} onChange={(e) => setMoon(m.id, { name: e.target.value })} className={inputCls} placeholder="Nome" />
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  value={m.cycleDays}
                  onChange={(e) => setMoon(m.id, { cycleDays: Math.max(1, Number(e.target.value) || 1) })}
                  className={inputCls}
                  style={{ width: 76 }}
                  title="Ciclo (dias)"
                />
                <button type="button" className="text-ink-3 hover:text-danger shrink-0" onClick={() => setMoonList(moonList.filter((x) => x.id !== m.id))}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMoonList([...moonList, { id: generateId(), name: 'Lua', cycleDays: 30, offset: 0, color: '#c9d1d9' }])}
            className="mt-1.5 text-[12px] text-accent hover:underline"
          >
            + Adicionar lua
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() =>
              onSave(
                { ...cal, weekDayNames: weekText.split(',').map((s) => s.trim()).filter(Boolean) },
                moonList.filter((m) => m.name.trim())
              )
            }
            className="px-3 py-1.5 text-[12.5px] rounded bg-accent text-white hover:opacity-90"
          >
            Salvar calendário
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-[12.5px] rounded bg-active text-ink-2 hover:bg-hover">
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
}
