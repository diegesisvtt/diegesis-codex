/* ============================================================
   Hexcrawl side panel — contextual inspectors:
   hex details/notes, style editors, layers & numbering, regions
   & modifiers, travel rules, terrain generator, map key, config.
   ============================================================ */

import React from 'react';
import { Plus, Upload, Download, ImagePlus, X, FileText } from 'lucide-react';
import { useStore, useRealmFonts } from '../../../state/store';
import { pixelToHex, type HexCoord } from './hexMath';
import {
  clipCells,
  createRegion,
  enterCost,
  generateId,
  geomOf,
  getCell,
  hexNumber,
  regionsAt,
  resolvePin,
  updateCell,
  type DistanceUnit,
  type FeatureDef,
  type HexMapDoc,
  type HexRegion,
  type LayerTag,
  type LineStyle,
  type TerrainDef,
  type TextStyle,
} from './model';
import { DEFAULT_GENERATOR, generateTerrain, terrainWizard } from './generator';
import { FEATURE_ICONS, TERRAIN_ICONS, getGlyph, type Glyph } from './icons';
import { ConfirmDeleteButton } from './ConfirmDelete';
import type { LayerVisibility } from './HexcrawlMap';
import type { HexTool, PanelTab } from './Toolbar';

export interface MeasureTotals {
  hexes: number;
  distance: number;
  rawDistance: number;
  time: number;
  unit: DistanceUnit;
  timeUnit: 'hour' | 'day';
  hasImpassable: boolean;
}

interface PanelProps {
  /** panel width in px (resizable via the drag handle in HexcrawlMap) */
  width: number;
  tab: PanelTab;
  setTab(t: PanelTab | null): void;
  map: HexMapDoc;
  setMap: React.Dispatch<React.SetStateAction<HexMapDoc>>;
  /** id of the map document (hex notes are created as child 'core/note' docs) */
  mapDocId: string;
  selectedHex: HexCoord | null;
  setSelectedHex(h: HexCoord | null): void;
  setTool(t: HexTool): void;
  activeTerrain: string;
  activeRegionId: string | null;
  setActiveRegionId(id: string | null): void;
  layers: LayerVisibility;
  setLayers: React.Dispatch<React.SetStateAction<LayerVisibility>>;
  showKey: boolean;
  setShowKey(v: boolean): void;
  measureMode: 'path' | 'straight';
  setMeasureMode(m: 'path' | 'straight'): void;
  measureTotals: MeasureTotals;
  clearMeasure(): void;
}

const TAGS: { id: LayerTag; label: string }[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'infrastructure', label: 'Infraestrutura' },
  { id: 'political', label: 'Política' },
];

const TITLES: Record<PanelTab, string> = {
  hex: 'Detalhes do hex',
  styles: 'Estilos',
  layers: 'Camadas & numeração',
  regions: 'Regiões',
  travel: 'Regras de viagem',
  generate: 'Gerador de terreno',
  key: 'Chave do mapa',
  config: 'Configurar',
};

/* ---------- small form helpers ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-[12px] text-ink-2">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full min-w-0 bg-overlay border border-line rounded px-1.5 py-1 text-[12px] text-ink-1 outline-none focus:border-accent';

function Num({ value, onChange, min, max, step, className }: { value: number; onChange(v: number): void; min?: number; max?: number; step?: number; className?: string }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => {
        if (e.target.value === '') return;
        const v = Number(e.target.value);
        if (!Number.isNaN(v)) onChange(v);
      }}
      className={`${inputCls} text-right ${className ?? 'w-16'}`}
    />
  );
}

function Color({ value, onChange }: { value: string; onChange(v: string): void }) {
  return <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-6 rounded border border-line bg-overlay cursor-pointer" />;
}

function Check({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#2383e2]" />
      {label}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3 mb-1">{title}</div>
      {children}
    </div>
  );
}

function uploadImage(cb: (dataUrl: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/svg+xml';
  input.onchange = () => {
    const f = input.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => cb(String(r.result));
    r.readAsDataURL(f);
  };
  input.click();
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ============================================================ */

export function HexSidePanel(props: PanelProps) {
  const { tab, setTab } = props;
  return (
    <div className="shrink-0 border-l border-line bg-sidebar flex flex-col min-h-0" style={{ width: props.width }}>
      <div className="h-9 px-3 border-b border-line flex items-center justify-between shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">{TITLES[tab]}</span>
        <button onClick={() => setTab(null)} className="text-ink-3 hover:text-ink-1 p-1 rounded hover:bg-hover">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {tab === 'hex' && <HexTab {...props} />}
        {tab === 'styles' && <StylesTab {...props} />}
        {tab === 'layers' && <LayersTab {...props} />}
        {tab === 'regions' && <RegionsTab {...props} />}
        {tab === 'travel' && <TravelTab {...props} />}
        {tab === 'generate' && <GenerateTab {...props} />}
        {tab === 'key' && <KeyTab {...props} />}
        {tab === 'config' && <ConfigTab {...props} />}
      </div>
    </div>
  );
}

/* ---------- hex details & notes ---------- */

function HexTab({ map, setMap, mapDocId, selectedHex }: PanelProps) {
  const { docs, createDocument, openDocument } = useStore();
  if (!selectedHex) {
    return <p className="text-[12px] text-ink-3">Clique em um hex com a ferramenta de seleção (V) para ver detalhes, notas e marcadores.</p>;
  }
  const cell = getCell(map, selectedHex.col, selectedHex.row);
  const regions = regionsAt(map, selectedHex.col, selectedHex.row);
  const cost = enterCost(map, selectedHex.col, selectedHex.row);
  const noteDoc = cell.noteDocId ? docs.find((d) => d.id === cell.noteDocId) : undefined;
  // pins whose position falls inside this hex
  const geom = geomOf(map);
  const pinsHere = map.pins.filter((p) => {
    const c = pixelToHex(geom, p.x, p.y);
    return c.col === selectedHex.col && c.row === selectedHex.row;
  });

  const createLinkedNote = async () => {
    const note = await createDocument('core/note', mapDocId, `Hex ${hexNumber(map, selectedHex.col, selectedHex.row)}`);
    setMap((m) => updateCell(m, selectedHex.col, selectedHex.row, { noteDocId: note.id }));
    openDocument(note.id);
  };
  const unlinkNote = () => setMap((m) => updateCell(m, selectedHex.col, selectedHex.row, { noteDocId: null }));

  return (
    <div>
      <Section title={`Hex ${hexNumber(map, selectedHex.col, selectedHex.row)} (${selectedHex.col},${selectedHex.row})`}>
        <Field label="Terreno">
          <select
            value={cell.terrain ?? ''}
            onChange={(e) => setMap((m) => updateCell(m, selectedHex.col, selectedHex.row, { terrain: e.target.value || null }))}
            className={inputCls}
          >
            <option value="">— vazio —</option>
            {map.terrains.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Custo de viagem">
          <span className="text-[12px] text-ink-1">{Number.isFinite(cost) ? `×${cost.toFixed(2)}` : 'intransitável'}</span>
        </Field>
        {regions.length > 0 && (
          <div className="py-1 text-[12px] text-ink-2">
            <span className="text-ink-3">Regiões: </span>
            {regions.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 mr-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: r.color }} />
                {r.name}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="Marcadores neste hex">
        {pinsHere.length === 0 ? (
          <p className="text-[11px] text-ink-3">Nenhum marcador. Use a ferramenta Pin (P) para criar um com nota vinculada.</p>
        ) : (
          pinsHere.map((pin) => {
            const r = resolvePin(map, pin);
            const Glyph = getGlyph(r.icon);
            return (
              <div key={pin.id} className="flex items-center gap-2 py-0.5 text-[12px]">
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {r.iconSrc ? <img src={r.iconSrc} alt="" className="w-4 h-4 object-contain" /> : Glyph ? <Glyph size={13} color={r.color} /> : null}
                </span>
                <span className="flex-1 truncate text-ink-1">{r.name}</span>
                {pin.docId && (
                  <button onClick={() => openDocument(pin.docId!)} className="text-[11px] text-accent hover:underline shrink-0">
                    abrir nota
                  </button>
                )}
              </div>
            );
          })
        )}
      </Section>

      <Section title="Nota do hex">
        {cell.noteDocId && noteDoc ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => openDocument(noteDoc.id)}
              className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md border border-line text-[12px] text-ink-1 hover:border-accent transition-colors"
              title="Abrir nota vinculada"
            >
              <FileText size={13} className="text-note shrink-0" />
              <span className="truncate">{noteDoc.title || 'Sem título'}</span>
            </button>
            <button
              title="Desvincular nota (o documento não é excluído)"
              onClick={unlinkNote}
              className="p-1.5 rounded-md text-ink-3 hover:text-danger hover:bg-hover"
            >
              <X size={13} />
            </button>
          </div>
        ) : cell.noteDocId ? (
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-[12px] text-ink-3 italic">A nota vinculada foi excluída.</span>
            <button onClick={unlinkNote} className="text-[11px] text-ink-3 hover:text-danger underline">
              limpar vínculo
            </button>
          </div>
        ) : (
          <button
            onClick={createLinkedNote}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-line text-[12px] text-ink-2 hover:border-accent hover:text-accent transition-colors"
          >
            <Plus size={13} /> Criar nota para este hex
          </button>
        )}
        <p className="text-[11px] text-ink-3 mt-1.5">
          A nota é um documento filho do mapa (aparece na árvore do Explorer) e o hex ganha um indicador — ocultável em
          Camadas.
        </p>
      </Section>
    </div>
  );
}

/* ---------- style editors ---------- */

function TagChecks({ value, onChange }: { value: LayerTag[]; onChange(tags: LayerTag[]): void }) {
  return (
    <div className="flex gap-2 flex-wrap py-0.5">
      {TAGS.map((t) => (
        <Check
          key={t.id}
          label={t.label}
          checked={value.includes(t.id)}
          onChange={(v) => onChange(v ? [...value, t.id] : value.filter((x) => x !== t.id))}
        />
      ))}
    </div>
  );
}

function StylesTab({ map, setMap }: PanelProps) {
  const realmFonts = useRealmFonts();
  const updateLineStyle = (id: string, patch: Partial<LineStyle>) =>
    setMap((m) => ({ ...m, lineStyles: m.lineStyles.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const updateTextStyle = (id: string, patch: Partial<TextStyle>) =>
    setMap((m) => ({ ...m, textStyles: m.textStyles.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  return (
    <div>
      <Section title="Estilos de linha">
        <p className="text-[11px] text-ink-3 mb-1">Editar um estilo atualiza todas as linhas do mapa que o usam.</p>
        {map.lineStyles.map((s) => (
          <div key={s.id} className="border border-line rounded-lg p-2 mb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <input value={s.name} onChange={(e) => updateLineStyle(s.id, { name: e.target.value })} className={inputCls} />
              <Color value={s.color} onChange={(color) => updateLineStyle(s.id, { color })} />
              <ConfirmDeleteButton
                title="Excluir estilo de linha"
                message={
                  <>
                    Excluir o estilo <strong className="text-ink-1">{s.name}</strong>? Todas as linhas do mapa que o usam serão removidas.
                  </>
                }
                onConfirm={() =>
                  setMap((m) => ({ ...m, lineStyles: m.lineStyles.filter((x) => x.id !== s.id), lines: m.lines.filter((l) => l.styleId !== s.id) }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Field label="Largura">
                <Num value={s.width} min={1} max={12} step={0.5} onChange={(width) => updateLineStyle(s.id, { width })} />
              </Field>
              <Check label="Tracejada" checked={s.dash} onChange={(dash) => updateLineStyle(s.id, { dash })} />
            </div>
            <Field label="Mult. viagem (vazio = sem efeito)">
              <input
                type="number"
                min={0.1}
                max={2}
                step={0.05}
                value={s.travelMultiplier ?? ''}
                placeholder="—"
                onChange={(e) => updateLineStyle(s.id, { travelMultiplier: e.target.value === '' ? undefined : Number(e.target.value) })}
                className={`${inputCls} w-16 text-right`}
              />
            </Field>
            <TagChecks value={s.tags} onChange={(tags) => updateLineStyle(s.id, { tags })} />
          </div>
        ))}
        <button
          onClick={() =>
            setMap((m) => ({
              ...m,
              lineStyles: [...m.lineStyles, { id: generateId(), name: 'Novo estilo', color: '#555555', width: 2, dash: false, tags: [] }],
            }))
          }
          className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-accent"
        >
          <Plus size={13} /> Novo estilo de linha
        </button>
      </Section>

      <Section title="Estilos de texto">
        {map.textStyles.map((s) => (
          <div key={s.id} className="border border-line rounded-lg p-2 mb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <input value={s.name} onChange={(e) => updateTextStyle(s.id, { name: e.target.value })} className={inputCls} />
              <Color value={s.color} onChange={(color) => updateTextStyle(s.id, { color })} />
              <ConfirmDeleteButton
                title="Excluir estilo de texto"
                message={
                  <>
                    Excluir o estilo <strong className="text-ink-1">{s.name}</strong>? Os rótulos que o usam passam a usar a aparência padrão.
                  </>
                }
                onConfirm={() => setMap((m) => ({ ...m, textStyles: m.textStyles.filter((x) => x.id !== s.id) }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Field label="Tamanho">
                <Num value={s.size} min={6} max={72} onChange={(size) => updateTextStyle(s.id, { size })} />
              </Field>
              <Field label="Espaço">
                <Num value={s.letterSpacing} min={0} max={12} step={0.5} onChange={(letterSpacing) => updateTextStyle(s.id, { letterSpacing })} />
              </Field>
            </div>
            <Field label="Fonte">
              <select value={s.font} onChange={(e) => updateTextStyle(s.id, { font: e.target.value })} className={inputCls}>
                <option value="inherit">UI (padrão)</option>
                <option value="Georgia, serif">Serifada</option>
                <option value="ui-monospace, monospace">Monoespaçada</option>
                <option value="'Palatino Linotype', 'Book Antiqua', serif">Fantasia</option>
                {realmFonts.map((f) => (
                  <option key={f.id} value={`"${f.name}"`}>
                    {f.name} (realm)
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-3 py-0.5">
              <Check label="Negrito" checked={s.bold} onChange={(bold) => updateTextStyle(s.id, { bold })} />
              <Check label="Itálico" checked={s.italic} onChange={(italic) => updateTextStyle(s.id, { italic })} />
              <Check label="MAIÚSC." checked={s.uppercase} onChange={(uppercase) => updateTextStyle(s.id, { uppercase })} />
            </div>
            <div className="flex items-center gap-2 py-0.5">
              <Check label="Sombra (contorno)" checked={s.halo} onChange={(halo) => updateTextStyle(s.id, { halo })} />
              {s.halo && <Color value={s.haloColor} onChange={(haloColor) => updateTextStyle(s.id, { haloColor })} />}
            </div>
            <TagChecks value={s.tags} onChange={(tags) => updateTextStyle(s.id, { tags })} />
          </div>
        ))}
        <button
          onClick={() =>
            setMap((m) => ({
              ...m,
              textStyles: [
                ...m.textStyles,
                {
                  id: generateId(),
                  name: 'Novo estilo',
                  font: 'inherit',
                  size: 13,
                  color: '#3d3630',
                  bold: false,
                  italic: false,
                  letterSpacing: 0,
                  uppercase: false,
                  halo: true,
                  haloColor: '#f0e6cd',
                  tags: [],
                },
              ],
            }))
          }
          className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-accent"
        >
          <Plus size={13} /> Novo estilo de texto
        </button>
      </Section>
    </div>
  );
}

/* ---------- layers & numbering ---------- */

function LayersTab({ map, setMap, layers, setLayers }: PanelProps) {
  const n = map.settings.numbering;
  const setNum = (patch: Partial<typeof n>) => setMap((m) => ({ ...m, settings: { ...m.settings, numbering: { ...m.settings.numbering, ...patch } } }));
  return (
    <div>
      <Section title="Camadas temáticas">
        <div className="flex flex-col gap-1">
          <Check label="Natural (rios, costas…)" checked={layers.natural} onChange={(v) => setLayers((l) => ({ ...l, natural: v }))} />
          <Check label="Infraestrutura (estradas, trilhas…)" checked={layers.infrastructure} onChange={(v) => setLayers((l) => ({ ...l, infrastructure: v }))} />
          <Check label="Política (fronteiras, rótulos…)" checked={layers.political} onChange={(v) => setLayers((l) => ({ ...l, political: v }))} />
          <Check label="Grade de hexes" checked={layers.grid} onChange={(v) => setLayers((l) => ({ ...l, grid: v }))} />
          <Check label="Marcadores (pins)" checked={layers.features} onChange={(v) => setLayers((l) => ({ ...l, features: v }))} />
          <Check label="Indicadores de nota" checked={layers.notes} onChange={(v) => setLayers((l) => ({ ...l, notes: v }))} />
          <Check label="Regiões" checked={layers.regions} onChange={(v) => setLayers((l) => ({ ...l, regions: v }))} />
          <Check label="Névoa de guerra" checked={layers.fog} onChange={(v) => setLayers((l) => ({ ...l, fog: v }))} />
        </div>
        {map.fog.length > 0 && (
          <button
            onClick={() => setMap((m) => ({ ...m, fog: [] }))}
            className="mt-1.5 text-[11px] text-ink-3 hover:text-accent underline"
          >
            Revelar o mapa inteiro ({map.fog.length} hexes sob névoa)
          </button>
        )}
      </Section>

      <Section title="Numeração dos hexes">
        <Check label="Mostrar números" checked={n.show} onChange={(show) => setNum({ show })} />
        <Field label="Posição">
          <select value={n.position} onChange={(e) => setNum({ position: e.target.value as 'top' | 'bottom' })} className={inputCls}>
            <option value="top">Topo</option>
            <option value="bottom">Base</option>
          </select>
        </Field>
        <Field label="Ordem">
          <select value={n.order} onChange={(e) => setNum({ order: e.target.value as 'row-col' | 'col-row' })} className={inputCls}>
            <option value="col-row">Coluna × Linha</option>
            <option value="row-col">Linha × Coluna</option>
          </select>
        </Field>
        <div className="flex gap-2">
          <Field label="Início col.">
            <Num value={n.startCol} min={0} onChange={(startCol) => setNum({ startCol })} />
          </Field>
          <Field label="Início lin.">
            <Num value={n.startRow} min={0} onChange={(startRow) => setNum({ startRow })} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Field label="Separador">
            <input value={n.separator} onChange={(e) => setNum({ separator: e.target.value })} className={`${inputCls} w-12 text-center`} />
          </Field>
          <Field label="Dígitos">
            <Num value={n.pad} min={1} max={4} onChange={(pad) => setNum({ pad })} />
          </Field>
        </div>
        <div className="flex gap-2 items-center">
          <Field label="Cor">
            <Color value={n.color} onChange={(color) => setNum({ color })} />
          </Field>
          <Field label="Tam.">
            <Num value={n.size} min={6} max={24} onChange={(size) => setNum({ size })} />
          </Field>
        </div>
        <div className="flex gap-3 py-0.5">
          <Check label="Negrito" checked={n.bold} onChange={(bold) => setNum({ bold })} />
          <Check label="Itálico" checked={n.italic} onChange={(italic) => setNum({ italic })} />
        </div>
      </Section>
    </div>
  );
}

/* ---------- regions ---------- */

function RegionsTab({ map, setMap, activeRegionId, setActiveRegionId, setTool }: PanelProps) {
  const update = (id: string, patch: Partial<HexRegion>) =>
    setMap((m) => ({ ...m, regions: m.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const updateMod = (id: string, patch: Partial<HexRegion['modifiers']>) =>
    setMap((m) => ({ ...m, regions: m.regions.map((r) => (r.id === id ? { ...r, modifiers: { ...r.modifiers, ...patch } } : r)) }));

  return (
    <div>
      <p className="text-[11px] text-ink-3 mb-2">
        Regiões agrupam hexes com modificadores próprios (como as Regions do Foundry): custo de viagem, encontros, clima e notas.
      </p>
      {map.regions.map((r) => (
        <div key={r.id} className={`border rounded-lg p-2 mb-2 ${activeRegionId === r.id ? 'border-accent' : 'border-line'}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Color value={r.color} onChange={(color) => update(r.id, { color })} />
            <input value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} className={inputCls} />
            <ConfirmDeleteButton
              title="Excluir região"
              message={
                <>
                  Excluir a região <strong className="text-ink-1">{r.name}</strong> ({r.hexes.length} hexes)? Os hexes não são alterados, apenas o
                  agrupamento e seus modificadores são removidos.
                </>
              }
              onConfirm={() => {
                setMap((m) => ({ ...m, regions: m.regions.filter((x) => x.id !== r.id) }));
                if (activeRegionId === r.id) setActiveRegionId(null);
              }}
            />
          </div>
          <div className="text-[11px] text-ink-3 mb-1">{r.hexes.length} hexes</div>
          <Field label="Legenda">
            <select value={r.labelMode} onChange={(e) => update(r.id, { labelMode: e.target.value as 'inside' | 'key' })} className={inputCls}>
              <option value="inside">Texto dentro da região</option>
              <option value="key">Na legenda do mapa</option>
            </select>
          </Field>
          <TagChecks value={r.tags} onChange={(tags) => update(r.id, { tags })} />
          <Field label="Mult. viagem">
            <Num value={r.modifiers.travelMultiplier} min={0.1} max={5} step={0.1} onChange={(travelMultiplier) => updateMod(r.id, { travelMultiplier })} />
          </Field>
          <Field label="Clima">
            <input value={r.modifiers.climate} onChange={(e) => updateMod(r.id, { climate: e.target.value })} placeholder="ex.: tempestades" className={inputCls} />
          </Field>
          <textarea
            value={r.modifiers.notes}
            onChange={(e) => updateMod(r.id, { notes: e.target.value })}
            placeholder="Notas da região…"
            rows={2}
            className={`${inputCls} mt-1 resize-y`}
          />
        </div>
      ))}
      <button
        onClick={() => {
          const region = createRegion(map.regions.length);
          setMap((m) => ({ ...m, regions: [...m.regions, region] }));
          setActiveRegionId(region.id);
          setTool('region');
        }}
        className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-accent"
      >
        <Plus size={13} /> Nova região
      </button>
    </div>
  );
}

/* ---------- travel rules ---------- */

function TravelTab({ map, setMap, measureMode, setMeasureMode, measureTotals, clearMeasure, setTool }: PanelProps) {
  const s = map.settings;
  const setSettings = (patch: Partial<typeof s>) => setMap((m) => ({ ...m, settings: { ...m.settings, ...patch } }));
  return (
    <div>
      <Section title="Escala & velocidade">
        <div className="flex gap-2 items-end">
          <Field label="Tamanho do hex">
            <Num value={s.hexSize.value} min={0.1} step={0.5} className="w-20" onChange={(value) => setSettings({ hexSize: { ...s.hexSize, value } })} />
          </Field>
          <select
            value={s.hexSize.unit}
            onChange={(e) => setSettings({ hexSize: { ...s.hexSize, unit: e.target.value as 'm' | 'km' | 'mi' } })}
            className={`${inputCls} w-16`}
          >
            <option value="m">m</option>
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
        </div>
        <div className="flex gap-2 items-end">
          <Field label="Velocidade">
            <Num value={s.travelSpeed.value} min={1} className="w-20" onChange={(value) => setSettings({ travelSpeed: { ...s.travelSpeed, value } })} />
          </Field>
          <select
            value={s.travelSpeed.unit}
            onChange={(e) => setSettings({ travelSpeed: { ...s.travelSpeed, unit: e.target.value as 'km' | 'mi' } })}
            className={`${inputCls} w-16`}
          >
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
          <select
            value={s.travelSpeed.per}
            onChange={(e) => setSettings({ travelSpeed: { ...s.travelSpeed, per: e.target.value as 'hour' | 'day' } })}
            className={`${inputCls} w-20`}
          >
            <option value="day">/dia</option>
            <option value="hour">/hora</option>
          </select>
        </div>
        <Field label="Exibir distâncias em">
          <select value={s.displayUnit} onChange={(e) => setSettings({ displayUnit: e.target.value as typeof s.displayUnit })} className={inputCls}>
            <option value="auto">Automático</option>
            <option value="m">Metros</option>
            <option value="km">Quilômetros</option>
            <option value="mi">Milhas</option>
          </select>
        </Field>
        <p className="text-[11px] text-ink-3 mt-1">
          Custos por terreno em Configurar → Terrenos. Estradas e trilhas aplicam seus multiplicadores (Estilos) quando o caminho as segue; regiões
          multiplicam o custo de entrada.
        </p>
      </Section>

      <Section title="Medição">
        <div className="flex gap-3 py-0.5">
          <Check label="Caminho (A*)" checked={measureMode === 'path'} onChange={() => setMeasureMode('path')} />
          <Check label="Linha reta" checked={measureMode === 'straight'} onChange={() => setMeasureMode('straight')} />
        </div>
        <button onClick={() => setTool('measure')} className="text-[12px] text-accent hover:underline mb-2">
          Ativar régua (M) — clique hexes para medir
        </button>
        {measureTotals.hexes > 0 && (
          <div className="border border-line rounded-lg p-2 text-[12px] space-y-0.5">
            <div className="flex justify-between">
              <span className="text-ink-3">Hexes</span>
              <span className="text-ink-1 font-medium">{measureTotals.hexes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Distância</span>
              <span className="text-ink-1 font-medium">
                {measureTotals.rawDistance.toFixed(measureTotals.unit === 'm' ? 0 : 1)} {measureTotals.unit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Dist. efetiva</span>
              <span className="text-ink-1 font-medium">
                {measureTotals.distance.toFixed(measureTotals.unit === 'm' ? 0 : 1)} {measureTotals.unit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">Viagem</span>
              <span className="text-accent font-semibold">
                ≈ {measureTotals.time.toFixed(1)} {measureTotals.timeUnit === 'day' ? 'dias' : 'horas'}
              </span>
            </div>
            <button onClick={clearMeasure} className="text-ink-3 hover:text-ink-1 text-[11px] underline mt-1">
              limpar medição
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------- generator ---------- */

function GenerateTab({ map, setMap }: PanelProps) {
  const [opts, setOpts] = React.useState({ ...DEFAULT_GENERATOR });
  const [fallback, setFallback] = React.useState('plains');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const pick = (needle: string, fallbackIndex: number) => map.terrains.find((t) => t.id.includes(needle))?.id ?? map.terrains[fallbackIndex]?.id ?? 'plains';
  const runGeneration = () => {
    setMap((m) =>
      generateTerrain(m, {
        ...opts,
        terrains: {
          water: pick('water', 12),
          plains: pick('plains', 0),
          forest: pick('forest', 1),
          hills: pick('hills', 4),
          mountains: pick('mountains', 5),
        },
      })
    );
    setConfirmOpen(false);
  };
  const terrainOptions = (
    <select value={fallback} onChange={(e) => setFallback(e.target.value)} className={inputCls}>
      {map.terrains.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
  return (
    <div>
      <Section title="Mapa aleatório">
        <p className="text-[11px] text-ink-3 mb-1">Sobrescreve o terreno de TODOS os hexes (features, linhas e notas são preservadas).</p>
        <Field label="Semente">
          <Num value={opts.seed} onChange={(seed) => setOpts({ ...opts, seed })} className="w-24" />
        </Field>
        <Field label="Escala (massas)">
          <Num value={opts.scale} min={2} max={30} onChange={(scale) => setOpts({ ...opts, scale })} />
        </Field>
        <Field label="Nível de água">
          <Num value={opts.waterLevel} min={0} max={0.9} step={0.05} onChange={(waterLevel) => setOpts({ ...opts, waterLevel })} />
        </Field>
        <Field label="Montanhas acima de">
          <Num value={opts.mountainLevel} min={0.5} max={1} step={0.05} onChange={(mountainLevel) => setOpts({ ...opts, mountainLevel })} />
        </Field>
        <Field label="Floresta acima de">
          <Num value={opts.forestLevel} min={0.2} max={0.9} step={0.05} onChange={(forestLevel) => setOpts({ ...opts, forestLevel })} />
        </Field>
        <button
          onClick={() => setConfirmOpen(true)}
          className="mt-2 w-full py-1.5 rounded-md bg-accent text-white text-[12px] font-medium hover:bg-accent-hover"
        >
          Gerar mapa aleatório
        </button>
      </Section>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45" onClick={() => setConfirmOpen(false)}>
          <div className="w-80 rounded-xl border border-line bg-sidebar shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-[14px] font-semibold text-ink-1 mb-1">Gerar mapa aleatório?</div>
            <p className="text-[12px] text-ink-2 mb-3">
              O terreno de <strong>todos os hexes</strong> será substituído pela geração procedural. Features, linhas, regiões e notas são
              preservadas.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} className="px-3 py-1.5 rounded-md border border-line text-[12px] text-ink-2 hover:bg-hover">
                Cancelar
              </button>
              <button onClick={runGeneration} className="px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-medium hover:bg-accent-hover">
                Gerar
              </button>
            </div>
          </div>
        </div>
      )}

      <Section title="Assistente de terreno (wizard)">
        <p className="text-[11px] text-ink-3 mb-1">
          Esboce o terreno em alguns hexes e o assistente preenche os hexes vazios a partir dos vizinhos pintados.
        </p>
        <Field label="Terreno padrão">{terrainOptions}</Field>
        <button
          onClick={() => setMap((m) => terrainWizard(m, fallback))}
          className="mt-2 w-full py-1.5 rounded-md border border-accent text-accent text-[12px] font-medium hover:bg-accent-soft"
        >
          Preencher a partir do esboço
        </button>
      </Section>
    </div>
  );
}

/* ---------- map key ---------- */

function KeyTab({ showKey, setShowKey }: PanelProps) {
  return (
    <div>
      <Check label="Mostrar chave sobre o mapa" checked={showKey} onChange={setShowKey} />
      <p className="text-[11px] text-ink-3 mt-2">
        A chave é gerada automaticamente com os terrenos, features e estilos de linha realmente usados no mapa, e aparece no canto inferior direito
        (incluída nas exportações PNG/SVG apenas como sobreposição de tela).
      </p>
    </div>
  );
}

/* ---------- config ---------- */

function DefEditor<T extends { id: string; name: string; color: string; icon: string | null; iconSrc?: string | null; custom?: boolean }>({
  defs,
  onChange,
  glyphPool,
  extra,
}: {
  defs: T[];
  onChange(defs: T[]): void;
  glyphPool: Record<string, Glyph>;
  extra?(def: T, update: (patch: Partial<T>) => void): React.ReactNode;
}) {
  const update = (id: string, patch: Partial<T>) => onChange(defs.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  return (
    <div>
      {defs.map((d) => {
        const Glyph = getGlyph(d.icon);
        return (
          <div key={d.id} className="border border-line rounded-lg p-2 mb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Color value={d.color} onChange={(color) => update(d.id, { color } as Partial<T>)} />
              <input value={d.name} onChange={(e) => update(d.id, { name: e.target.value } as Partial<T>)} className={inputCls} />
              <button
                title="Enviar PNG como ícone"
                onClick={() => uploadImage((iconSrc) => update(d.id, { iconSrc } as Partial<T>))}
                className="text-ink-3 hover:text-accent p-1 rounded hover:bg-hover"
              >
                <ImagePlus size={13} />
              </button>
              <ConfirmDeleteButton
                title={`Excluir ${d.name}`}
                message={
                  <>
                    Excluir <strong className="text-ink-1">{d.name}</strong>? Hexes que o utilizam ficam sem essa definição (terreno vazio ou feature
                    invisível).
                  </>
                }
                onConfirm={() => onChange(defs.filter((x) => x.id !== d.id))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Field label="Ícone">
                <select
                  value={d.iconSrc ? '__png' : (d.icon ?? '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__png') return;
                    update(d.id, { icon: v || null, iconSrc: null } as Partial<T>);
                  }}
                  className={inputCls}
                >
                  <option value="">— nenhum —</option>
                  {d.iconSrc && <option value="__png">PNG personalizado</option>}
                  {Object.keys(glyphPool).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              <span className="w-6 h-6 rounded-sm border border-line flex items-center justify-center shrink-0" style={{ background: d.color }}>
                {d.iconSrc ? <img src={d.iconSrc} alt="" className="w-5 h-5 object-contain" /> : Glyph ? <Glyph size={15} color="rgba(0,0,0,.6)" /> : null}
              </span>
            </div>
            {extra?.(d, (patch) => update(d.id, patch))}
          </div>
        );
      })}
    </div>
  );
}

function ConfigTab({ map, setMap }: PanelProps) {
  const g = map.grid;
  const setGrid = (patch: Partial<typeof g>) => setMap((m) => clipCells({ ...m, grid: { ...m.grid, ...patch } }));
  const bg = map.background;

  return (
    <div>
      <Section title="Dimensões do mapa">
        <div className="flex gap-2">
          <Field label="Largura (hexes)">
            <Num value={g.cols} min={1} max={250} onChange={(cols) => setGrid({ cols: Math.max(1, Math.min(250, cols)) })} />
          </Field>
          <Field label="Altura (hexes)">
            <Num value={g.rows} min={1} max={250} onChange={(rows) => setGrid({ rows: Math.max(1, Math.min(250, rows)) })} />
          </Field>
        </div>
        <p className="text-[11px] text-ink-3">Ampliar preserva o conteúdo; reduzir descarta o que ficar fora das novas bordas.</p>
        <Field label="Orientação">
          <select value={g.orientation} onChange={(e) => setGrid({ orientation: e.target.value as 'flat' | 'pointy' })} className={inputCls}>
            <option value="flat">Topo plano (colunas deslocadas)</option>
            <option value="pointy">Topo pontudo (linhas deslocadas)</option>
          </select>
        </Field>
        <Field label="Deslocamento">
          <select value={g.offset} onChange={(e) => setGrid({ offset: e.target.value as 'odd' | 'even' })} className={inputCls}>
            <option value="odd">Ímpar</option>
            <option value="even">Par</option>
          </select>
        </Field>
      </Section>

      <Section title="Imagem de fundo (trace)">
        {bg ? (
          <div>
            <Field label="Opacidade">
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={bg.opacity}
                onChange={(e) => setMap((m) => ({ ...m, background: { ...bg, opacity: Number(e.target.value) } }))}
                className="w-24 accent-[#2383e2]"
              />
            </Field>
            <Field label="Escala">
              <Num value={bg.scale} min={0.1} max={5} step={0.1} onChange={(scale) => setMap((m) => ({ ...m, background: { ...bg, scale } }))} />
            </Field>
            <button onClick={() => setMap((m) => ({ ...m, background: null }))} className="text-[12px] text-danger hover:underline">
              Remover imagem
            </button>
          </div>
        ) : (
          <button
            onClick={() => uploadImage((src) => setMap((m) => ({ ...m, background: { src, opacity: 0.5, x: 0, y: 0, scale: 1 } })))}
            className="flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-accent"
          >
            <Upload size={13} /> Importar imagem para redesenhar por cima
          </button>
        )}
      </Section>

      <Section title="Terrenos (Configure Hexes)">
        <DefEditor<TerrainDef>
          defs={map.terrains}
          onChange={(terrains) => setMap((m) => ({ ...m, terrains }))}
          glyphPool={TERRAIN_ICONS}
          extra={(d, update) => (
            <div className="flex items-center gap-2 mt-1">
              <Field label="Custo">
                <Num value={d.travelCost} min={0.25} max={6} step={0.25} onChange={(travelCost) => update({ travelCost })} />
              </Field>
              <Check label="Intransitável" checked={!!d.impassable} onChange={(impassable) => update({ impassable })} />
            </div>
          )}
        />
        <button
          onClick={() =>
            setMap((m) => ({
              ...m,
              terrains: [...m.terrains, { id: generateId(), name: 'Novo terreno', color: '#aaaaaa', travelCost: 1, icon: null, custom: true }],
            }))
          }
          className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-accent"
        >
          <Plus size={13} /> Novo terreno
        </button>
      </Section>

      <Section title="Marcadores (tipos de pin)">
        <DefEditor<FeatureDef>
          defs={map.features}
          onChange={(features) => setMap((m) => ({ ...m, features }))}
          glyphPool={FEATURE_ICONS}
        />
        <button
          onClick={() =>
            setMap((m) => ({
              ...m,
              features: [...m.features, { id: generateId(), name: 'Novo marcador', icon: 'landmark', color: '#efe9db', custom: true }],
            }))
          }
          className="flex items-center gap-1 text-[12px] text-ink-3 hover:text-accent"
        >
          <Plus size={13} /> Novo tipo de marcador
        </button>
      </Section>

      <Section title="Icon set">
        <div className="flex gap-2">
          <button
            onClick={() => downloadJson({ terrains: map.terrains, features: map.features, lineStyles: map.lineStyles, textStyles: map.textStyles }, 'hex-iconset.json')}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-line text-[12px] text-ink-2 hover:border-accent hover:text-accent"
          >
            <Download size={13} /> Exportar
          </button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'application/json';
              input.onchange = () => {
                const f = input.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  try {
                    const data = JSON.parse(String(r.result));
                    setMap((m) => ({
                      ...m,
                      terrains: Array.isArray(data.terrains) ? data.terrains : m.terrains,
                      features: Array.isArray(data.features) ? data.features : m.features,
                      lineStyles: Array.isArray(data.lineStyles) ? data.lineStyles : m.lineStyles,
                      textStyles: Array.isArray(data.textStyles) ? data.textStyles : m.textStyles,
                    }));
                  } catch {
                    window.alert('Arquivo de icon set inválido.');
                  }
                };
                r.readAsText(f);
              };
              input.click();
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-line text-[12px] text-ink-2 hover:border-accent hover:text-accent"
          >
            <Upload size={13} /> Importar
          </button>
        </div>
      </Section>

    </div>
  );
}
