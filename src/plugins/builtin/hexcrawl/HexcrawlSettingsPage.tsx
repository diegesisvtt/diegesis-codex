// Settings page do plugin Hexcrawl (contributed via ctx.settingsPages):
// padrões aplicados a NOVOS mapas (grade, medidas e viagem). Mapas existentes
// não são alterados — estas são preferências de plugin, não de documento.
import { Download, Footprints, Grid3x3, RotateCcw, Ruler, Shapes, Upload } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { DEFAULT_GRID, DEFAULT_SETTINGS, defaultIconSet, parseIconSet, type HexIconSet } from '../../../components/editors/hexcrawl/model';
import type { SettingsPageProps } from '../../api/settings';

const inputCls =
  'bg-sidebar border border-line rounded-md px-3 py-1.5 text-[13px] text-ink-1 outline-none focus:border-accent transition-colors';

interface Option {
  value: string;
  label: string;
}

const ORIENTATION_OPTIONS: Option[] = [
  { value: 'flat', label: 'Flat (topo achatado)' },
  { value: 'pointy', label: 'Pointy (topo pontudo)' },
];

const OFFSET_OPTIONS: Option[] = [
  { value: 'odd', label: 'Ímpar (odd)' },
  { value: 'even', label: 'Par (even)' },
];

const UNIT_OPTIONS: Option[] = [
  { value: 'm', label: 'Metros (m)' },
  { value: 'km', label: 'Quilômetros (km)' },
  { value: 'mi', label: 'Milhas (mi)' },
];

const DISPLAY_UNIT_OPTIONS: Option[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'm', label: 'Metros (m)' },
  { value: 'km', label: 'Quilômetros (km)' },
  { value: 'mi', label: 'Milhas (mi)' },
];

const SPEED_UNIT_OPTIONS: Option[] = [
  { value: 'km', label: 'km' },
  { value: 'mi', label: 'mi' },
];

const SPEED_PER_OPTIONS: Option[] = [
  { value: 'hour', label: 'hora' },
  { value: 'day', label: 'dia' },
];

function Section({
  title,
  icon: Icon,
  description,
  children,
}: {
  title: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <div className="mb-4">
        <h3 className="text-[14px] font-semibold text-ink-1 flex items-center gap-2">
          <Icon size={15} className="text-accent-ink" />
          {title}
        </h3>
        <p className="text-[12px] text-ink-3 mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="flex flex-col divide-y divide-line">{children}</div>
    </section>
  );
}

function NumField({
  label,
  description,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  description?: string;
  value: number;
  onChange(v: number): void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[13px] text-ink-1">{label}</div>
        {description && <div className="text-[12px] text-ink-3 mt-0.5 leading-snug">{description}</div>}
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          if (!Number.isNaN(v)) onChange(v);
        }}
        className={`${inputCls} w-24 text-right`}
      />
    </div>
  );
}

function SelectField({
  label,
  description,
  value,
  onChange,
  options,
}: {
  label: string;
  description?: string;
  value: string;
  onChange(v: string): void;
  options: Option[];
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[13px] text-ink-1">{label}</div>
        {description && <div className="text-[12px] text-ink-3 mt-0.5 leading-snug">{description}</div>}
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} max-w-[220px]`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
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

/** Icon set padrão de novos mapas: import/export fica nas settings do plugin. */
function IconSetSection({ settings }: SettingsPageProps) {
  const custom = settings.get<HexIconSet | null>('iconSet', null);
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const importSet = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const parsed = parseIconSet(JSON.parse(String(r.result)));
          if (!parsed) {
            setError('Arquivo inválido: esperado { terrains, features, lineStyles, textStyles } com id e nome.');
            return;
          }
          settings.set('iconSet', parsed);
          setError(null);
          bump((v) => v + 1);
        } catch {
          setError('Arquivo de icon set inválido (JSON malformado).');
        }
      };
      r.readAsText(f);
    };
    input.click();
  };

  return (
    <Section
      title="Icon set"
      icon={Shapes}
      description="Terrenos, marcadores e estilos de linha/texto usados como padrão em mapas novos. Mapas existentes guardam a própria cópia e não são alterados."
    >
      <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
        <div className="min-w-0">
          <div className="text-[13px] text-ink-1">{custom ? 'Icon set personalizado ativo' : 'Icon set padrão do plugin'}</div>
          <div className="text-[12px] text-ink-3 mt-0.5 leading-snug">
            {custom
              ? `${custom.terrains.length} terrenos · ${custom.features.length} marcadores · ${custom.lineStyles.length} estilos de linha · ${custom.textStyles.length} estilos de texto`
              : 'Exporte para editar, importe para substituir o padrão de novos mapas.'}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => downloadJson(custom ?? defaultIconSet(), 'hex-iconset.json')}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-line text-[12px] text-ink-2 hover:border-accent hover:text-accent"
          >
            <Download size={13} /> Exportar
          </button>
          <button
            onClick={importSet}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-line text-[12px] text-ink-2 hover:border-accent hover:text-accent"
          >
            <Upload size={13} /> Importar
          </button>
          {custom && (
            <button
              onClick={() => {
                settings.set('iconSet', null);
                bump((v) => v + 1);
              }}
              title="Voltar ao icon set padrão do plugin"
              className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-line text-[12px] text-ink-2 hover:border-accent hover:text-accent"
            >
              <RotateCcw size={13} /> Restaurar
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-[12px] text-danger py-1">{error}</p>}
    </Section>
  );
}

export function HexcrawlSettingsPage({ settings }: SettingsPageProps) {
  return (
    <>
      <IconSetSection settings={settings} />
      <Section
        title="Grade do mapa"
        icon={Grid3x3}
        description="Dimensões e orientação aplicadas a novos mapas. Mapas já criados mantêm as próprias configurações."
      >
        <NumField
          label="Colunas"
          value={settings.get('gridCols', DEFAULT_GRID.cols)}
          onChange={(v) => settings.set('gridCols', v)}
          min={5}
          max={200}
        />
        <NumField
          label="Linhas"
          value={settings.get('gridRows', DEFAULT_GRID.rows)}
          onChange={(v) => settings.set('gridRows', v)}
          min={5}
          max={200}
        />
        <SelectField
          label="Orientação do hex"
          value={settings.get('hexOrientation', DEFAULT_GRID.orientation)}
          onChange={(v) => settings.set('hexOrientation', v)}
          options={ORIENTATION_OPTIONS}
        />
        <SelectField
          label="Offset das linhas"
          value={settings.get('hexOffset', DEFAULT_GRID.offset)}
          onChange={(v) => settings.set('hexOffset', v)}
          options={OFFSET_OPTIONS}
        />
      </Section>

      <Section
        title="Medidas"
        icon={Ruler}
        description="Tamanho real de cada hex (entre faces planas) e a unidade usada para exibir distâncias."
      >
        <NumField
          label="Tamanho do hex"
          value={settings.get('hexSizeValue', DEFAULT_SETTINGS.hexSize.value)}
          onChange={(v) => settings.set('hexSizeValue', v)}
          min={1}
          max={1000}
        />
        <SelectField
          label="Unidade do tamanho"
          value={settings.get('hexSizeUnit', DEFAULT_SETTINGS.hexSize.unit)}
          onChange={(v) => settings.set('hexSizeUnit', v)}
          options={UNIT_OPTIONS}
        />
        <SelectField
          label="Unidade de exibição"
          description="Automático escolhe pela magnitude da distância."
          value={settings.get('displayUnit', DEFAULT_SETTINGS.displayUnit)}
          onChange={(v) => settings.set('displayUnit', v)}
          options={DISPLAY_UNIT_OPTIONS}
        />
      </Section>

      <Section
        title="Viagem"
        icon={Footprints}
        description="Velocidade usada no cálculo de tempo de deslocamento entre hexes."
      >
        <NumField
          label="Velocidade"
          value={settings.get('travelSpeedValue', DEFAULT_SETTINGS.travelSpeed.value)}
          onChange={(v) => settings.set('travelSpeedValue', v)}
          min={1}
          max={200}
        />
        <SelectField
          label="Unidade"
          value={settings.get('travelSpeedUnit', DEFAULT_SETTINGS.travelSpeed.unit)}
          onChange={(v) => settings.set('travelSpeedUnit', v)}
          options={SPEED_UNIT_OPTIONS}
        />
        <SelectField
          label="Por"
          value={settings.get('travelSpeedPer', DEFAULT_SETTINGS.travelSpeed.per)}
          onChange={(v) => settings.set('travelSpeedPer', v)}
          options={SPEED_PER_OPTIONS}
        />
      </Section>
    </>
  );
}
