// Settings do plugin de dungeon: padrões aplicados a NOVOS mapas
// (dimensões da grade). Mapas existentes mantêm as próprias configurações.

import React, { type ComponentType } from 'react';
import { Grid3x3, MousePointer2 } from 'lucide-react';
import type { SettingsPageProps } from '../../api/settings';
import { Toggle } from '../../../components/ui';
import { DEFAULT_DUNGEON_GRID } from '../../../components/editors/dungeon/model';

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
        className="w-24 text-right rounded-md border border-line bg-app px-2 py-1.5 text-[13px] text-ink-1 outline-none focus:border-accent"
      />
    </div>
  );
}

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

export function DungeonSettingsPage({ settings }: SettingsPageProps) {
  return (
    <>
      <Section
        title="Grade do mapa"
        icon={Grid3x3}
        description="Dimensões aplicadas a novos mapas de dungeon. Mapas já criados mantêm as próprias configurações."
      >
        <NumField
          label="Colunas"
          value={settings.get('gridCols', DEFAULT_DUNGEON_GRID.cols)}
          onChange={(v) => settings.set('gridCols', v)}
          min={16}
          max={128}
        />
        <NumField
          label="Linhas"
          value={settings.get('gridRows', DEFAULT_DUNGEON_GRID.rows)}
          onChange={(v) => settings.set('gridRows', v)}
          min={16}
          max={128}
        />
        <NumField
          label="Tamanho da célula (px)"
          description="Escala do mundo do mapa — afeta zoom e exportação."
          value={settings.get('cellSize', DEFAULT_DUNGEON_GRID.cellSize)}
          onChange={(v) => settings.set('cellSize', v)}
          min={16}
          max={96}
        />
      </Section>

      <div className="h-4" />

      <Section
        title="Navegação"
        icon={MousePointer2}
        description="Comportamento da viewport ao interagir com o painel lateral."
      >
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-[13px] text-ink-1">Centralizar ao selecionar</div>
            <div className="text-[12px] text-ink-3 mt-0.5 leading-snug">
              Move a viewport para a sala ou pin ao selecioná-lo na lista do painel.
            </div>
          </div>
          <Toggle
            checked={settings.get('panToSelection', true)}
            onChange={(v) => settings.set('panToSelection', v)}
          />
        </div>
      </Section>
    </>
  );
}
