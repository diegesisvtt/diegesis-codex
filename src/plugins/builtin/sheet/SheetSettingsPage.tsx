// Página de configurações do plugin de Ficha de Personagem: efeitos globais
// do reino ativo (definições aplicáveis em qualquer ficha, na aba "Efeitos").
import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { EffectDefinition } from '@diegesis/sheet';
import { parseEffectDefinitions } from '@shared/sheetEffects';
import { useStore } from '../../../state/store';
import { EffectsPanel } from '../../../components/editors/sheet/EffectsPanel';

export function SheetSettingsPage() {
  const { uiState, saveUiState, activeRealmId } = useStore();
  const rawRealmEffects = (activeRealmId ? uiState.realmSettings?.[activeRealmId]?.sheetEffects : undefined) ?? {};
  const customDefs = useMemo(() => parseEffectDefinitions(rawRealmEffects), [rawRealmEffects]);

  const writeRealmEffects = (map: Record<string, EffectDefinition>) => {
    if (!activeRealmId) return;
    saveUiState({
      realmSettings: {
        ...(uiState.realmSettings ?? {}),
        [activeRealmId]: { ...(uiState.realmSettings?.[activeRealmId] ?? {}), sheetEffects: map },
      },
    });
  };

  return (
    <section className="bg-elevated border border-line rounded-lg p-5">
      <h3 className="text-[14px] font-semibold text-ink-1 flex items-center gap-2 mb-1">
        <Sparkles size={15} className="text-accent-ink" />
        Efeitos globais do reino
      </h3>
      <p className="text-[12px] text-ink-3 mb-4 leading-relaxed">
        Definições de efeito disponíveis para qualquer ficha deste reino — aplique-as na aba Efeitos da ficha.
      </p>
      <EffectsPanel
        custom={customDefs}
        onSave={(def) => writeRealmEffects({ ...rawRealmEffects, [def.id]: def })}
        onDelete={(id) => {
          const map = { ...rawRealmEffects };
          delete map[id];
          writeRealmEffects(map);
        }}
      />
    </section>
  );
}
