// Settings page do plugin de geração de imagens: configuração do backend
// (ComfyUI) reutilizando o form genérico de providers da página de IA.
// Segredos (API keys) são criptografados no main via IPC `imagegen:*`.
import { useCallback, useEffect, useState } from 'react';
import type { AISettings, ProviderInfo } from '@shared/types';
import { ProviderSection } from './AiSettingsPage';

export function ImageGenSettingsPage() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [settings, setSettings] = useState<AISettings | null>(null);

  const reload = useCallback(async () => {
    const [p, s] = await Promise.all([window.diegesis.imagegen.providers(), window.diegesis.ai.getSettings()]);
    setProviders(p);
    setSettings(s);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!settings) return null;

  return (
    <ProviderSection
      key={settings.imagegen?.providerId ?? 'none'}
      title="Backend de geração de imagens"
      description="Usado pelo bloco “Imagem gerada (IA)” nas notas e pela ferramenta generate_image do assistente. ComfyUI: basta a URL do servidor — modelos e LoRAs são listados automaticamente. O workflow customizado (formato API) é opcional, para pipelines avançados."
      emptyLabel="— Desativado —"
      providers={providers}
      saved={settings.imagegen}
      onSave={async (cfg) => {
        await window.diegesis.imagegen.setProvider(cfg);
        await reload();
      }}
      onTest={(id, cfg) => window.diegesis.imagegen.testProvider(id, cfg)}
    />
  );
}
