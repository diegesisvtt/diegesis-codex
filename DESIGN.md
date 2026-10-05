# Design — Diegesis Codex

Convenções de UI do aplicativo. O objetivo é uma interface consistente: antes
de criar um controle novo, verifique se já existe uma primitiva.

## Base visual

- Tailwind CSS v4 com tokens de tema em `src/styles.css` (`bg-app`,
  `bg-sidebar`, `bg-elevated`, `bg-overlay`, `bg-card`, `text-ink-1/2/3`,
  `border-line`, `text-accent-ink`, `bg-accent-soft`, `text-neon`,
  `text-violet`, `text-crimson`, `shadow-glow-cyan`, `shadow-glow-crit`…).
  Use os tokens, nunca cores cruas.
- Superfícies: use `<Surface variant="base | panel | card | elevated">` — não
  repita manualmente `bg-elevated border-line` etc.
- Rótulos de seção: `text-xs font-semibold uppercase tracking-wider text-slate-500`.
- Ícones: `lucide-react`, tamanhos 12–17.

## Design system (Camadas 1–3)

### Primitivas de superfície e ação — `src/components/ui/`

| Componente | Uso |
|---|---|
| `Surface` | contêiner de superfície (`base` \| `panel` \| `card` \| `elevated`) |
| `TacticalCard` | card tático com `.Header`/`.Body`/`.Actions` e estados `default` \| `interactive` \| `selected` |
| `Badge` | pílula de metadados (`tactical` \| `success` \| `danger` \| `arcane` \| `neutral`) |
| `Button` | ações (`tactical` \| `ghost` \| `outline` \| `danger`; aliases legados `primary`/`secondary`) |
| `IconButton` | ação só com ícone; `active` para estado ligado |
| `TacticalInput` / `CommandInput` | inputs com ícone prefixado / prompt + ação de envio |
| `Tabs` / `TabItem` | abas React-controladas (ícone, dirty, fechar, barra ativa ciano) |
| `Modal` | diálogos modais (usa `Surface elevated`) |
| `Toggle` | **todo booleano em tela de configuração** |
| `ui/fields.tsx` | `Field`, `Section`, `Num`, `Color`, `Check`, `TextInput`, `Select` (painéis densos) |
| `ui/PanelShell.tsx` | chrome de painel lateral (usa `Surface` + `Tabs`) |

### Componentes TTRPG — `src/components/codex/`

| Componente | Uso |
|---|---|
| `StatMetric` | número/atributo universal (rótulo + valor mono + barra + rolagem opcional) |
| `DiceButton` / `DiceBar` | dado facetado + barra de dados rápidos (d4–d100) |
| `RollResultCard` | resultado no feed de rolagens (crítico/falha) |
| `CalloutBlock` | destaque `rule` \| `lore` \| `secret` \| `quote` (bloco BlockNote `/callout`) |
| `InteractiveRollTable` | tabela inline tática (cabeçalho + fórmula + rolagem + linha sorteada) |

### Toggle — regra de uso

Booleanos em telas de configuração **sempre** usam `<Toggle>`, nunca
`<input type="checkbox">`:

```tsx
import { Toggle } from './components/ui';

<Toggle checked={enabled} onChange={setEnabled} title="Ativar recurso" />
```

Exceções (checkbox é aceitável):

- **Seleção múltipla em listas** — ex.: escolher universos na sincronização.
- **Painéis de propriedades densos** (padrão visual do hexmap) — usam o
  `Check` compacto de `src/components/ui/fields.tsx`, junto com `Field`,
  `Section`, `Num`, `Color`, `TextInput` e `Select`.

## Páginas de configuração de plugins

Dois caminhos (ver `docs/plans/2026-10-04-plugin-settings-pages-design.md`):

1. **Schema declarativo (preferido)** — `ctx.settings.registerAll([...])`.
   O formulário é gerado pelo host e já renderiza booleanos como `Toggle`,
   selects, sliders e cores com o padrão visual acima. Zero código de UI.
2. **Página custom** — `ctx.settingsPages.add({ component })`. Use as
   primitivas de `ui/` (`Toggle`, `Button`…) e o markup de card/label
   descrito aqui, para que a página seja indistinguível das geradas.

Deep-link para a página de um plugin: `app.openSettings('plugin:<pluginId>')`.

## Tema "Interface Tática"

Paleta e motion documentados em `docs/plans/2026-10-04-tactical-vtt-ui-design.md`.
Resumo: acento primário ciano (`#38BDF8`/`#00F2FE`), secundário violeta
(`#818CF8`), erro carmesim (`#F43F5E`); micro-animações via `framer-motion`
(botões de dado, histórico de rolagens) + keyframes táticos em `styles.css`.

## Header premium (`TitleBar`)

O header global usa classes `hd-*` em `src/styles.css` e **ecoa o boot screen**
para continuidade de marca:

- **Atmosfera** (`.hd-atmosphere`): auroras ciano/violeta + grade de pontos
  desvanecida, sobre `bg-sidebar`.
- **Hairline de assinatura** (`.hd-hairline`): linha de 1px ciano→violeta→ciano
  na base, no lugar de `border-b border-line`.
- **Marca** (`.hd-brand`): emblema de cristal em SVG inline (`.hd-gem`, mesmo
  glifo do boot) + wordmark "Diegesis **Codex**" com gradiente ciano→violeta
  (`.hd-wordmark span`).
- **Ribbon** (`.hd-btn` / `.hd-btn--active`): botões de 28px com sheen de hover
  (`.hd-btn::after`) e estado ativo com glow interno.
- **Seletor de universo** (`.hd-realm`): cantos retos (`5px`) + borda gradiente
  ciano→violeta, dot de status com glow, chevron que gira ao abrir.
- **Busca centralizada** (`.hd-search` / `.hd-search-center`): barra centrada
  com cantos retos (`5px`) e borda gradiente; cresce no hover (`scale 1.03`) e
  abre a paleta global, que entra com `animate-grow`.
- **Sincronização** (`.hd-sync`): nuvem com cor por estado + dot de status no
  canto + arco giratório (`hd-sync-arc`) durante o sync.

A lógica (ribbon de plugins, seletor de universo, modais, fontes por universo)
não muda — o redesign é só de apresentação.

## Abas premium

- **Horizontais (workspace — FlexLayout)** (`.flexlayout__tab_button`): cantos
  retos (`0`); aba ativa com filete superior ciano + gradiente sutil + glow
  interno (`--selected`).
- **Horizontais (painéis — `ui/Tabs`)** (`TabItem`): sublinhado gradiente
  ciano→transparente com glow no estado ativo.
- **Verticais (borda esquerda — FlexLayout)** (`.flexlayout__border_button`):
  cantos retos (`0`), indicador lateral ciano (`inset 2px`) + texto `accent-ink`
  no ativo.
- **Verticais (faixa de painéis à direita)** (`App.tsx`): botões 28px com cantos
  retos, borda e glow ciano no estado ativo.
