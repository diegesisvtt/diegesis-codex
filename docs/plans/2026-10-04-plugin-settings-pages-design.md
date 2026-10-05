# Design: Páginas de Configuração de Plugins

**Data:** 2026-10-04
**Status:** Aprovado
**Inspiração:** Obsidian (páginas de settings por plugin + deep-link) e schema declarativo com formulário auto-gerado

## Objetivo

Permitir que plugins (built-in e externos) tenham páginas de configuração acessíveis pela tela de Settings, com dois mecanismos complementares (modelo híbrido):

- **Schema declarativo:** o plugin declara campos tipados e o host gera o formulário automaticamente.
- **Página custom (Obsidian):** o plugin contribui um componente React inteiro como sua aba de configuração.

**Regra de precedência:** página custom substitui o formulário auto-gerado do schema.

## API do plugin

### Schema declarativo

```ts
export interface SettingDeclaration {
  key: string;
  type: 'string' | 'text' | 'number' | 'boolean' | 'select' | 'color';
  label: string;
  description?: string;
  default: unknown;
  choices?: { value: string; label: string }[]; // 'select'
  min?: number; max?: number;                    // 'number'
}

ctx.settings.registerAll(declarations: SettingDeclaration[]): Disposable
```

### Página custom

```ts
ctx.settingsPages.add({
  id: 'dice3d',
  title: 'Dados 3D',
  icon: Dices,
  order: 10,
  component: Dice3DSettings, // recebe { settings: PluginSettings } como prop
});
```

### Reatividade

`PluginSettings` ganha `subscribe(listener): () => void` — `set` passa a notificar subscribers (resolve a falta de reatividade que hoje força bridges manuais como a do dice3d). Implementado via version counter no `SettingsAdapter` do manager.

## UI do SettingsPanel

- `SECTIONS` deixa de ser união fechada: built-ins (`general`, `ai`, `plugins`) + páginas contribuídas via `useSettingsPages()`, agrupadas após divisor com label "Plugins" (estilo Obsidian).
- Novo componente `PluginSettingsForm` renderiza o schema declarado (toggle, select, slider, color, text) seguindo o precedente do `ProviderSection`.
- **Deep-link:** `PluginRow` ganha ícone de engrenagem que abre Settings na página do plugin. Novo campo no store (não persistido) `settingsSection: string | null` + `app.openSettings(sectionId?)` no facade.
- **Plugin desativado/falho:** a página permanece na nav, mas mostra placeholder com botão "Ativar plugin" (comportamento do Obsidian). O host não ativa o plugin só para mostrar settings.

## Sandbox e ciclo de vida

- `gateContext` (`external/sandbox.ts`): `settingsPages` explicitamente gated — exige permissões `'ui'` **e** `'settings'`, com latch `isLive()` revogado no deactivate. Aproveitar para trocar spread por lista branca (campos futuros não vazam por padrão).
- Registries seguem o padrão existente: "first wins", version counter + `subscribe`, `Disposable` coletado em `record.disposables` (desativar remove a página automaticamente).
- **Persistência:** nenhum IPC novo — continua via `uiState.plugins.settings[pluginId]` → `ui:save` (debounce 500ms). `default` do schema só se aplica quando a chave não existe.
- **Migração:** nenhuma.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/plugins/api/settings.ts` | Novo: tipos + `SettingsPageRegistry` + `SettingsSchemaRegistry` |
| `src/plugins/api/types.ts` | `PluginContext.settingsPages`, `PluginSettings.registerAll/subscribe` |
| `src/plugins/manager.tsx` | Wiring dos registries, `SettingsAdapter` reativo, hook `useSettingsPages` |
| `src/state/store.tsx` | Campo `settingsSection` + ação |
| `src/components/SettingsPanel.tsx` | Nav dinâmica, `PluginSettingsForm`, deep-link ⚙️ no `PluginRow` |
| `src/plugins/external/sandbox.ts` | Gate de `settingsPages`, lista branca |
| `src/plugins/builtin/dice3dPlugin.tsx` | Migrado como referência (schema declarativo) |
| `examples/word-count/` | Demo do schema declarativo |

## Verificação

- `tsc` (app + electron) sem erros
- Build Vite OK
- Review com code-reviewer
