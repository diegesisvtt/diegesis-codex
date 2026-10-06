/* ============================================================
   Hexcrawl side panel — contextual inspectors:
   hex details/notes, style editors, layers & numbering, regions
   & modifiers, travel rules, terrain generator, map key, config.
   ============================================================ */

import React from 'react';
import { Plus, Upload, ImagePlus, X, FileText, ChevronDown, Ruler } from 'lucide-react';
import { useStore, useRealmFonts } from '../../../state/store';
import { pixelToHex, type HexCoord } from './hexMath';
import {
  allTags,
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
  type LineStyle,
  type TerrainDef,
  type TextStyle,
} from './model';
import { DEFAULT_GENERATOR, generateTerrain, randomSeed, terrainWizard, type GeneratorShape } from './generator';
import { FEATURE_ICONS, TERRAIN_ICONS, getGlyph, type Glyph } from './icons';
import { pinIcon } from '../pdf/rpg';
import { ConfirmDeleteButton } from './ConfirmDelete';
import type { HexTool, PanelTab } from './Toolbar';
import { PanelShell } from '../../ui/PanelShell';
import { TagInput } from '../../ui/TagInput';
import { Toggle } from '../../ui/Toggle';
import { Color, Field, Num, Section, inputCls } from '../../ui/fields';

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
  showKey: boolean;
  setShowKey(v: boolean): void;
  measureMode: 'path' | 'straight';
  setMeasureMode(m: 'path' | 'straight'): void;
  measureTotals: MeasureTotals;
  clearMeasure(): void;
}

const TITLES: Record<PanelTab, string> = {
  hex: 'Detalhes do hex',
  lineStyles: 'Estilos de linha',
  textStyles: 'Estilos de texto',
  regions: 'Regiões',
  travel: 'Regras de viagem',
  generate: 'Gerador de terreno',
  config: 'Configurar',
};

/* ---------- small form helpers (compartilhados em ui/fields) ---------- */

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

/* ============================================================ */

export function HexSidePanel(props: PanelProps) {
  const { tab, setTab } = props;
  return (
    <PanelShell title={TITLES[tab]} width={props.width} onClose={() => setTab(null)}>
      {tab === 'hex' && <HexTab {...props} />}
      {tab === 'lineStyles' && <LineStylesTab {...props} />}
      {tab === 'textStyles' && <TextStylesTab {...props} />}
      {tab === 'regions' && <RegionsTab {...props} />}
      {tab === 'travel' && <TravelTab {...props} />}
      {tab === 'generate' && <GenerateTab {...props} />}
      {tab === 'config' && <ConfigTab {...props} />}
    </PanelShell>
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
            const docIcon = pin.docId ? docs.find((d) => d.id === pin.docId)?.icon : undefined;
            const Glyph = docIcon ? pinIcon(docIcon) : getGlyph(r.icon);
            return (
              <div key={pin.id} className="flex items-center gap-2 py-0.5 text-[12px]">
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {r.iconSrc && !docIcon ? (
                    <img src={r.iconSrc} alt="" className="w-4 h-4 object-contain" />
                  ) : Glyph ? (
                    <Glyph size={13} color={r.color} />
                  ) : null}
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

/** tags livres com autocomplete a partir das tags já usadas no mapa */
function MapTags({ map, value, onChange }: { map: HexMapDoc; value: string[]; onChange(tags: string[]): void }) {
  return <TagInput value={value} onChange={onChange} suggestions={allTags(map)} placeholder="Adicionar tag…" />;
}

/** card colapsável: header com preview + nome; corpo com os campos do estilo */
function StyleCard({
  preview,
  name,
  onRename,
  expanded,
  onToggle,
  actions,
  children,
}: {
  preview: React.ReactNode;
  name: string;
  onRename(name: string): void;
  expanded: boolean;
  onToggle(): void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-line rounded-lg mb-2 overflow-hidden">
      <div className={`flex items-center gap-2 px-2 py-1.5 ${expanded ? 'border-b border-line bg-elevated/60' : ''}`}>
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left" title={expanded ? 'Recolher' : 'Expandir'}>
          <span className="w-10 shrink-0 flex items-center justify-center">{preview}</span>
          <span className="truncate text-[12px] text-ink-1 font-medium">{name}</span>
          <ChevronDown size={13} className={`shrink-0 text-ink-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {actions}
      </div>
      {expanded && (
        <div className="p-2">
          <Field label="Nome">
            <input value={name} onChange={(e) => onRename(e.target.value)} className={inputCls} />
          </Field>
          {children}
        </div>
      )}
    </div>
  );
}

function LineStylesTab({ map, setMap }: PanelProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));
  const updateLineStyle = (id: string, patch: Partial<LineStyle>) =>
    setMap((m) => ({ ...m, lineStyles: m.lineStyles.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  return (
    <div>
      <p className="text-[11px] text-ink-3 mb-2">Editar um estilo atualiza todas as linhas do mapa que o usam.</p>
      {map.lineStyles.map((s) => (
        <StyleCard
          key={s.id}
          name={s.name}
          onRename={(name) => updateLineStyle(s.id, { name })}
          expanded={expandedId === s.id}
          onToggle={() => toggle(s.id)}
          preview={
            <svg width="34" height="10">
              <line x1="2" y1="5" x2="32" y2="5" stroke={s.color} strokeWidth={Math.min(s.width, 6)} strokeDasharray={s.dash ? '5 4' : undefined} strokeLinecap="round" />
            </svg>
          }
          actions={
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
          }
        >
          <div className="flex items-center gap-2">
            <Field label="Cor">
              <Color value={s.color} onChange={(color) => updateLineStyle(s.id, { color })} />
            </Field>
            <Field label="Largura">
              <Num value={s.width} min={1} max={12} step={0.5} onChange={(width) => updateLineStyle(s.id, { width })} />
            </Field>
          </div>
          <ToggleField label="Tracejada" checked={s.dash} onChange={(dash) => updateLineStyle(s.id, { dash })} />
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
          <Field label="Tags">
            <span className="flex-1 min-w-0">
              <MapTags map={map} value={s.tags} onChange={(tags) => updateLineStyle(s.id, { tags })} />
            </span>
          </Field>
        </StyleCard>
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
    </div>
  );
}

function TextStylesTab({ map, setMap }: PanelProps) {
  const realmFonts = useRealmFonts();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));
  const updateTextStyle = (id: string, patch: Partial<TextStyle>) =>
    setMap((m) => ({ ...m, textStyles: m.textStyles.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  return (
    <div>
      <p className="text-[11px] text-ink-3 mb-2">Editar um estilo atualiza todos os rótulos do mapa que o usam.</p>
      {map.textStyles.map((s) => (
        <StyleCard
          key={s.id}
          name={s.name}
          onRename={(name) => updateTextStyle(s.id, { name })}
          expanded={expandedId === s.id}
          onToggle={() => toggle(s.id)}
          preview={
            <span
              style={{
                fontFamily: s.font === 'inherit' ? undefined : s.font,
                fontWeight: s.bold ? 700 : 400,
                fontStyle: s.italic ? 'italic' : 'normal',
                letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
                color: s.color,
                fontSize: 13,
              }}
            >
              Aa
            </span>
          }
          actions={
            <ConfirmDeleteButton
              title="Excluir estilo de texto"
              message={
                <>
                  Excluir o estilo <strong className="text-ink-1">{s.name}</strong>? Os rótulos que o usam passam a usar a aparência padrão.
                </>
              }
              onConfirm={() => setMap((m) => ({ ...m, textStyles: m.textStyles.filter((x) => x.id !== s.id) }))}
            />
          }
        >
          <div className="flex items-center gap-2">
            <Field label="Cor">
              <Color value={s.color} onChange={(color) => updateTextStyle(s.id, { color })} />
            </Field>
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
          <FlagPills
            flags={[
              { key: 'bold', label: <strong>B</strong>, title: 'Negrito', active: s.bold, onToggle: () => updateTextStyle(s.id, { bold: !s.bold }) },
              { key: 'italic', label: <em>I</em>, title: 'Itálico', active: s.italic, onToggle: () => updateTextStyle(s.id, { italic: !s.italic }) },
              { key: 'upper', label: 'AA', title: 'Maiúsculas', active: s.uppercase, onToggle: () => updateTextStyle(s.id, { uppercase: !s.uppercase }) },
            ]}
          />
          <div className="flex items-center gap-2">
            <span className="flex-1">
              <ToggleField label="Sombra (contorno)" checked={s.halo} onChange={(halo) => updateTextStyle(s.id, { halo })} />
            </span>
            {s.halo && <Color value={s.haloColor} onChange={(haloColor) => updateTextStyle(s.id, { haloColor })} />}
          </div>
          <Field label="Tags">
            <span className="flex-1 min-w-0">
              <MapTags map={map} value={s.tags} onChange={(tags) => updateTextStyle(s.id, { tags })} />
            </span>
          </Field>
        </StyleCard>
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
        Regiões agrupam hexes com modificadores próprios: custo de viagem e notas. Tags livres controlam a visibilidade em Camadas.
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
          <div className="py-1">
            <MapTags map={map} value={r.tags} onChange={(tags) => update(r.id, { tags })} />
          </div>
          <Field label="Mult. viagem">
            <Num value={r.modifiers.travelMultiplier} min={0.1} max={5} step={0.1} onChange={(travelMultiplier) => updateMod(r.id, { travelMultiplier })} />
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

/** linha de configuração: rótulo (+ dica) à esquerda, controle à direita */
function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 first:pt-3 last:pb-3">
      <div className="min-w-0">
        <div className="text-[12px] text-ink-1">{label}</div>
        {hint && <div className="text-[11px] text-ink-3 mt-0.5 leading-snug">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center">{children}</div>
    </div>
  );
}

/** controle composto: número + unidade num único grupo visual */
function UnitNum({
  value,
  onValue,
  min,
  step,
  unit,
  onUnit,
  units,
}: {
  value: number;
  onValue(v: number): void;
  min?: number;
  step?: number;
  unit: string;
  onUnit(u: string): void;
  units: string[];
}) {
  return (
    <div className="flex items-stretch rounded-md border border-line bg-overlay overflow-hidden focus-within:border-accent transition-colors">
      <input
        type="number"
        value={value}
        min={min}
        step={step ?? 1}
        onChange={(e) => {
          if (e.target.value === '') return;
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onValue(v);
        }}
        className="w-16 bg-transparent px-2 py-1.5 text-[12px] text-ink-1 text-right outline-none tabular-nums"
      />
      <select value={unit} onChange={(e) => onUnit(e.target.value)} className="bg-elevated border-l border-line px-1.5 py-1.5 text-[12px] text-ink-2 outline-none cursor-pointer">
        {units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}

/** seletor segmentado (alternativa aos checkboxes para escolhas exclusivas) */
function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange(v: T): void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-md border border-line bg-overlay p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-2 py-1 rounded text-[11px] transition-colors ${
            value === o.value ? 'bg-accent-soft text-accent font-medium' : 'text-ink-3 hover:text-ink-1'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** linha compacta de booleano: rótulo à esquerda, Toggle (ui) à direita */
function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[12px] text-ink-2 cursor-pointer select-none" onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

/** grupo de pills para flags de formatação (B / I / AA…) — mais premium que checkboxes */
function FlagPills({ flags }: { flags: { key: string; label: React.ReactNode; title: string; active: boolean; onToggle(): void }[] }) {
  return (
    <div className="flex gap-1 py-1">
      {flags.map((f) => (
        <button
          key={f.key}
          title={f.title}
          onClick={f.onToggle}
          className={`min-w-[26px] px-1.5 py-1 rounded-md border text-[11px] transition-colors ${
            f.active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-3 hover:text-ink-1 hover:border-ink-3'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function TravelTab({ map, setMap, measureMode, setMeasureMode, measureTotals, clearMeasure, setTool }: PanelProps) {
  const s = map.settings;
  const setSettings = (patch: Partial<typeof s>) => setMap((m) => ({ ...m, settings: { ...m.settings, ...patch } }));
  const speedSummary = `${s.travelSpeed.value} ${s.travelSpeed.unit} por ${s.travelSpeed.per === 'day' ? 'dia' : 'hora'}`;
  return (
    <div>
      <Section title="Escala do mapa">
        <div className="border border-line rounded-lg divide-y divide-line mb-2">
          <SettingRow label="Tamanho do hex" hint="largura real de um hex (face a face)">
            <UnitNum
              value={s.hexSize.value}
              min={0.1}
              step={0.5}
              unit={s.hexSize.unit}
              units={['m', 'km', 'mi']}
              onValue={(value) => setSettings({ hexSize: { ...s.hexSize, value } })}
              onUnit={(unit) => setSettings({ hexSize: { ...s.hexSize, unit: unit as 'm' | 'km' | 'mi' } })}
            />
          </SettingRow>
          <SettingRow label="Exibir distâncias em" hint="automático escolhe pela magnitude">
            <select
              value={s.displayUnit}
              onChange={(e) => setSettings({ displayUnit: e.target.value as typeof s.displayUnit })}
              className={`${inputCls} w-28`}
            >
              <option value="auto">Automático</option>
              <option value="m">Metros</option>
              <option value="km">Quilômetros</option>
              <option value="mi">Milhas</option>
            </select>
          </SettingRow>
        </div>
        <p className="text-[11px] text-ink-3 leading-snug">
          Custos por terreno em Configurar → Terrenos. Estradas e trilhas aplicam seus multiplicadores (Estilos) quando o caminho as segue; regiões
          multiplicam o custo de entrada.
        </p>
      </Section>

      <Section title="Velocidade de viagem">
        <div className="border border-line rounded-lg divide-y divide-line">
          <SettingRow label="Deslocamento" hint={speedSummary}>
            <UnitNum
              value={s.travelSpeed.value}
              min={1}
              unit={s.travelSpeed.unit}
              units={['km', 'mi']}
              onValue={(value) => setSettings({ travelSpeed: { ...s.travelSpeed, value } })}
              onUnit={(unit) => setSettings({ travelSpeed: { ...s.travelSpeed, unit: unit as 'km' | 'mi' } })}
            />
          </SettingRow>
          <SettingRow label="Período">
            <div className="w-36">
              <Segmented
                value={s.travelSpeed.per}
                onChange={(per) => setSettings({ travelSpeed: { ...s.travelSpeed, per } })}
                options={[
                  { value: 'day', label: 'por dia' },
                  { value: 'hour', label: 'por hora' },
                ]}
              />
            </div>
          </SettingRow>
        </div>
      </Section>

      <Section title="Medição">
        <div className="border border-line rounded-lg p-3 mb-2 space-y-2.5">
          <Segmented
            value={measureMode}
            onChange={setMeasureMode}
            options={[
              { value: 'path', label: 'Caminho (A*)' },
              { value: 'straight', label: 'Linha reta' },
            ]}
          />
          <button
            onClick={() => setTool('measure')}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-accent text-white text-[12px] font-medium hover:bg-accent-hover transition-colors"
          >
            <Ruler size={13} /> Ativar régua (M)
          </button>
          <p className="text-[11px] text-ink-3 leading-snug">Com a régua ativa, clique nos hexes do mapa para traçar o caminho.</p>
        </div>
        {measureTotals.hexes > 0 && (
          <div className="border border-line rounded-lg p-2">
            <div className="grid grid-cols-2 gap-1.5 text-center mb-1.5">
              <div className="rounded-md bg-overlay py-1.5">
                <div className="text-[15px] font-semibold text-ink-1 tabular-nums">{measureTotals.hexes}</div>
                <div className="text-[10px] uppercase tracking-wide text-ink-3">hexes</div>
              </div>
              <div className="rounded-md bg-overlay py-1.5">
                <div className="text-[15px] font-semibold text-ink-1 tabular-nums">
                  {measureTotals.rawDistance.toFixed(measureTotals.unit === 'm' ? 0 : 1)} {measureTotals.unit}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-ink-3">distância</div>
              </div>
              <div className="rounded-md bg-overlay py-1.5">
                <div className="text-[15px] font-semibold text-ink-1 tabular-nums">
                  {measureTotals.distance.toFixed(measureTotals.unit === 'm' ? 0 : 1)} {measureTotals.unit}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-ink-3">efetiva</div>
              </div>
              <div className="rounded-md bg-overlay py-1.5">
                <div className="text-[15px] font-semibold text-accent tabular-nums">
                  ≈ {measureTotals.time.toFixed(1)} {measureTotals.timeUnit === 'day' ? 'dias' : 'h'}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-ink-3">viagem</div>
              </div>
            </div>
            <button onClick={clearMeasure} className="text-ink-3 hover:text-ink-1 text-[11px] underline">
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
  // the wizard fallback may dangle after an icon-set switch — use the first def instead
  const effectiveFallback = map.terrains.some((t) => t.id === fallback) ? fallback : (map.terrains[0]?.id ?? '');
  const runGeneration = () => {
    setMap((m) => {
      // match by id or name (accent/case-tolerant); custom terrains get random ids
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const pick = (needle: string, fallbackIndex: number) =>
        m.terrains.find((t) => t.id.includes(needle) || norm(t.name).includes(needle))?.id ?? m.terrains[fallbackIndex]?.id ?? m.terrains[0]?.id ?? needle;
      return generateTerrain(m, {
        ...opts,
        seed: randomSeed(),
        terrains: {
          water: pick('water', 12),
          ocean: pick('ocean', 13),
          plains: pick('plains', 0),
          forest: pick('forest', 2),
          jungle: pick('jungle', 3),
          hills: pick('hills', 4),
          mountains: pick('mountains', 5),
          snowpeaks: pick('snow', 6),
          swamp: pick('swamp', 7),
          desert: pick('desert', 8),
          tundra: pick('tundra', 9),
        },
      });
    });
    setConfirmOpen(false);
  };
  const terrainOptions = (
    <select value={effectiveFallback} onChange={(e) => setFallback(e.target.value)} className={inputCls}>
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
        <p className="text-[11px] text-ink-3 mb-1">
          {opts.respectPainted
            ? 'Preenche apenas os hexes vazios; o terreno pintado à mão é preservado.'
            : 'Sobrescreve o terreno de TODOS os hexes (features, linhas e notas são preservadas).'}
        </p>
        <Field label="Forma do mapa">
          <select value={opts.shape} onChange={(e) => setOpts({ ...opts, shape: e.target.value as GeneratorShape })} className={inputCls}>
            <option value="continent">Continente</option>
            <option value="island">Ilha</option>
            <option value="archipelago">Arquipélago</option>
            <option value="inland">Interior (sem mar)</option>
          </select>
        </Field>
        <Field label="Escala (massas)">
          <Num value={opts.scale} min={2} max={30} onChange={(scale) => setOpts({ ...opts, scale })} />
        </Field>
        <Field label="Detalhe (octavas)">
          <Num value={opts.octaves} min={1} max={6} onChange={(octaves) => setOpts({ ...opts, octaves })} />
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
        <Field label="Temperatura">
          <Num value={opts.temperature} min={-0.3} max={0.3} step={0.05} onChange={(temperature) => setOpts({ ...opts, temperature })} />
        </Field>
        <Field label="Rios">
          <Num value={opts.rivers} min={0} max={12} onChange={(rivers) => setOpts({ ...opts, rivers })} />
        </Field>
        <Field label="Pontos de interesse">
          <Num value={opts.poi} min={0} max={10} onChange={(poi) => setOpts({ ...opts, poi })} />
        </Field>
        <ToggleField label="Preservar hexes pintados" checked={opts.respectPainted} onChange={(respectPainted) => setOpts({ ...opts, respectPainted })} />
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
              {opts.respectPainted ? (
                <>
                  Os <strong>hexes vazios</strong> serão preenchidos pela geração procedural; o terreno pintado à mão é preservado.
                </>
              ) : (
                <>
                  O terreno de <strong>todos os hexes</strong> será substituído pela geração procedural.
                </>
              )}{' '}
              Features, notas e desenhos manuais são preservados; rios e marcadores gerados anteriormente são substituídos.
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
          onClick={() => setMap((m) => terrainWizard(m, effectiveFallback))}
          className="mt-2 w-full py-1.5 rounded-md border border-accent text-accent text-[12px] font-medium hover:bg-accent-soft"
        >
          Preencher a partir do esboço
        </button>
      </Section>
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

function ConfigTab({ map, setMap, showKey, setShowKey }: PanelProps) {
  const g = map.grid;
  const setGrid = (patch: Partial<typeof g>) => setMap((m) => clipCells({ ...m, grid: { ...m.grid, ...patch } }));
  const bg = map.background;
  const n = map.settings.numbering;
  const setNum = (patch: Partial<typeof n>) => setMap((m) => ({ ...m, settings: { ...m.settings, numbering: { ...m.settings.numbering, ...patch } } }));

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

      <Section title="Numeração dos hexes">
        <ToggleField label="Mostrar números" checked={n.show} onChange={(show) => setNum({ show })} />
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
        <FlagPills
          flags={[
            { key: 'bold', label: <strong>B</strong>, title: 'Negrito', active: n.bold, onToggle: () => setNum({ bold: !n.bold }) },
            { key: 'italic', label: <em>I</em>, title: 'Itálico', active: n.italic, onToggle: () => setNum({ italic: !n.italic }) },
          ]}
        />
      </Section>

      <Section title="Chave do mapa">
        <ToggleField label="Mostrar chave sobre o mapa" checked={showKey} onChange={setShowKey} />
        <p className="text-[11px] text-ink-3 mt-1">
          A chave é gerada automaticamente com os terrenos, features e estilos de linha realmente usados no mapa, e aparece no canto inferior direito
          (incluída nas exportações PNG/SVG apenas como sobreposição de tela).
        </p>
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
                className="w-24 accent-[#38bdf8]"
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
            <div className="flex items-center gap-3 mt-1">
              <Field label="Custo">
                <Num value={d.travelCost} min={0.25} max={6} step={0.25} onChange={(travelCost) => update({ travelCost })} />
              </Field>
              <span className="flex-1">
                <ToggleField label="Intransitável" checked={!!d.impassable} onChange={(impassable) => update({ impassable })} />
              </span>
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

      <p className="text-[11px] text-ink-3 mt-3">
        Importar/exportar o icon set padrão agora é feito em Configurações → Hexcrawl (aplicado a mapas novos).
      </p>

    </div>
  );
}
