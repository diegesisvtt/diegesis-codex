# Design: Interface Tática (Modern Tactical VTT)

**Data:** 2026-10-04
**Status:** Aprovado
**Inspiração:** log de rolagens, cards táticos e dados facetados; e Linear Dark (chrome denso, bordas finas, acento ciano)

## Objetivo

Elevar o acabamento visual do Diegesis Codex ao padrão de ferramentas profissionais de
VTT, mantendo **toda a arquitetura e lógica funcional do Electron/SQLite intactas**. A
mudança é restrita a tokens de design, componentes de apresentação e uma camada de
micro-animações (framer-motion), sem alterar data model, IPC, plugins ou o player window.

Princípio central: **retema por tokens**. O app inteiro consome tokens semânticos
(`bg-app`, `bg-elevated`, `text-ink-1`, `bg-accent-soft`, `border-line`, `text-table`…);
remapear esses valores em `src/styles.css` re-tema a aplicação globalmente sem tocar em
dezenas de componentes.

## Decisões

- **Tailwind v4** (via `@tailwindcss/vite`): tokens ficam no bloco `@theme` em
  `styles.css` — **não** em `tailwind.config.js` (v4 não lê esse arquivo). O snippet JS
  proposto foi traduzido para `@theme`.
- **Motion**: `framer-motion` instalado (escolha do usuário) para interações táteis
  declarativas; CSS keyframes mantidos para chrome global (scrollbars, focus, boot).
- **Fontes**: `Plus Jakarta Sans` (UI) + `JetBrains Mono` (dados/logs), via `@fontsource`.
  `Cinzel` (`--font-display`) permanece para o tema de ficha (`.sheet-theme`).
- **Sem tags** no metadado: `DocNode` não tem campo `tags` e adicioná-lo exigiria migração
  de SQLite (fora do escopo). Os cartões de metadados mostram **tipo + tamanho + data**.
- **Sem agrupamento de seções** no Explorer: a árvore é composta por pastas arbitrárias do
  usuário. Reestilização apenas (indicador lateral ciano, linhas compactas).
- **`--color-table` → violeta** (`#818CF8`): alinha tabelas/lore ao acento secundário.

## Paleta (tokens `@theme`)

| Token | Valor | Uso |
|---|---|---|
| `--color-app` | `#090C12` | fundo da janela (ônix profundo) |
| `--color-sidebar` | `#0E131F` | painéis laterais (grafite azul-aço) |
| `--color-elevated` / `--color-overlay` | `#121826` / `#161D2E` | cartões / inputs |
| `--color-card` *(novo)* | `rgba(18,24,38,0.7)` | cartões com `backdrop-blur-md` |
| `--color-line` / `-strong` | `rgba(148,163,184,.10)` / `.18` | bordas de contêiner |
| `--color-ink-1/2/3` | `#E6EDF5` / `#94A3B8` / `#5B6B82` | texto |
| `--color-accent` / `-hover` / `-soft` / `-ink` | `#38BDF8` / `#0EA5E9` / `rgba(56,189,248,.14)` / `#7DD3FC` | ação/destaque (ciano) |
| `--color-neon` *(novo)* | `#00F2FE` | glow de crítico |
| `--color-violet` *(novo)* | `#818CF8` | lore/tags/títulos (secundário) |
| `--color-crimson` *(novo)* | `#F43F5E` | erro/falha crítica |
| `--color-danger` / `-soft` | `#F43F5E` / `rgba(244,63,94,.14)` | alertas |
| `--shadow-glow-cyan` *(novo)* | `0 0 15px rgba(56,189,248,.3)` | hover de dados |
| `--shadow-glow-crit` *(novo)* | `0 0 20px rgba(0,242,254,.5)` | crítico natural |
| `--font-ui` | `"Plus Jakarta Sans", Inter, …` | interface |
| `--font-mono` | `"JetBrains Mono", "Fira Code", …` | números/logs |

## Motion (micro-interações)

Durações 80–200ms, curva `ease-out`, zero atraso perceptível.

- **Dados (d4–d100)**: `whileTap scale .9` (75ms), `whileHover y -2` + `shadow-glow-cyan`;
  rotação 180° do ícone no disparo (250ms).
- **Histórico de rolagens**: `AnimatePresence` slide+fade (`y -8 → 0`, 150ms).
- **Crítico (20 nat)**: pulso ciano + micro-shake (2 quadros) + `shadow-glow-crit`.
- **Falha crítica (1 nat)**: flash `border-rose-500/80` com fade-out 300ms.
- **Menu `/`**: scale `.95 → 1` + fade 120ms.
- **Tabela (Rolar)**: varredura de 2–3 linhas (120ms) e linha sorteada
  `bg-cyan-500/15 border-l-2 border-cyan-400` com fade-in.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `package.json` | + `framer-motion`, `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono` |
| `src/styles.css` | Tokens `@theme`, fontes, shadows, keyframes, tema BlockNote, chrome FlexLayout, scrollbars |
| `src/components/Explorer.tsx` | Linhas compactas, ativo `border-l-2 border-cyan-400 bg-cyan-500/10`, header uppercase, popover `bg-card backdrop-blur-md` |
| `src/plugins/builtin/rollerPlugin.tsx` | Cards táticos, chip de dado, tag sucesso/falha, barra facetada, input terminal, motion |
| `src/components/editors/table/TableEditor.tsx` | "Rolar" neon, varredura de linhas, zebra ciano, cabeçalho nítido |
| `src/components/editors/table/TableCard.tsx` | Card `bg-card backdrop-blur-md`, botão Rolar neon |
| `src/components/editors/note/tableBlock.tsx` | "Inserir" tátil + confirmação, Rolar neon |
| `src/components/editors/NoteEditor.tsx` | Cartões de metadados (tipo/tamanho/data), título com `border-b border-cyan-500/20`, focus-within ciano |
| `src/components/ui.tsx` / `TitleBar.tsx` / `CommandPalette.tsx` / `SearchPalette.tsx` / `ui/PanelShell.tsx` / `dice3d/DiceControlsPanel.tsx` | Chrome consistente (majoritariamente automático via tokens) |

## Verificação

- `npm run typecheck` (tsc app + electron) sem erros
- `npm run build` (renderer + electron) OK
- Checagem visual via `npm run dev` (Explorer, editor, painel de rolagens, tabela, mesa 3D)
- Review com code-reviewer
