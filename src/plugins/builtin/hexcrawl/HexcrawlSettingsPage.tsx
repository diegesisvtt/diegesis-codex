// Settings page do plugin Hexcrawl (contributed via ctx.settingsPages):
// padrões aplicados a NOVOS mapas (grade, medidas e viagem). Mapas existentes
// não são alterados — estas são preferências de plugin, não de documento.
import { Footprints, Grid3x3, Ruler } from 'lucide-react';
import type { ComponentType } from 'react';
import { DEFAULT_GRID, DEFAULT_SETTINGS } from '../../../components/editors/hexcrawl/model';
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

export function HexcrawlSettingsPage({ settings }: SettingsPageProps) {
  return (
    <>
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
