# Fichas Customizáveis via Drag and Drop — Plano de Implementação

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans para implementar este plano tarefa por tarefa.

**Goal:** Tornar as fichas de personagem (`diegesis/sheet`) totalmente customizáveis via drag and drop: grid livre com blocos arrastáveis/redimensionáveis, paleta de novos campos, modo edição vs. jogo, e layout salvo por ficha com herança de um padrão por sistema (realm).

**Architecture:** O layout vira um campo `layout` no JSON serializado da ficha (pass-through em `parseSheet`/`serializeSheet`, ignorado pelo `SheetEngine` headless). O `SheetEditor` é reescrito para renderizar um canvas de grid (`SheetCanvas`) com blocos posicionados por coordenadas `{x, y, w, h}` em colunas de grid. DnD via **dnd-kit** (`@dnd-kit/core` + `modifiers` para snap-to-grid). Herança: layout efetivo = `doc.layout` ?? `RealmSettings.sheetLayouts[systemId]` ?? `defaultLayout()`. Modo edição (lápis) habilita drag/resize/paleta; modo jogo trava o layout e só edita valores.

**Tech Stack:** React 18 + Tailwind 4 (tokens `--color-*` em `src/styles.css`), dnd-kit (novo), `@diegesis/sheet` (motor), better-sqlite3 (persistência via `documents.content` JSON), UiState/RealmSettings para padrão por sistema.

**Verificação:** não há runner de testes configurado (sem vitest/jest). Validar com `npm run typecheck` (`tsc -b --pretty`) e QA manual via `npm run dev`. Helpers puros de layout podem ter teste ad-hoc com `npx tsx` (padrão de `table-migration.test.ts`).

---

## Modelo de dados (referência para todas as tarefas)

```ts
// shared/sheetLayout.ts
export interface SheetLayout {
  version: 1;
  grid: { cols: number; rowHeight: number; gap: number };
  blocks: SheetBlock[];
}

export type BlockInput = 'number' | 'die' | 'text' | 'checkbox';

export type SheetBlock =
  | { id: string; type: 'title';    x: number; y: number; w: number; h: number }
  | { id: string; type: 'field';    x: number; y: number; w: number; h: number; path: string; label: string; input: BlockInput }
  | { id: string; type: 'derived';  x: number; y: number; w: number; h: number; path: string; label: string }
  | { id: string; type: 'identity'; x: number; y: number; w: number; h: number; key: string; label: string; multiline?: boolean }
  | { id: string; type: 'rolls';    x: number; y: number; w: number; h: number; templates: string[] }
  | { id: string; type: 'effects';  x: number; y: number; w: number; h: number }
  | { id: string; type: 'text';     x: number; y: number; w: number; h: number; text: string }
  | { id: string; type: 'section';  x: number; y: number; w: number; h: number; title: string };
```

Layout efetivo (resolução de herança), a implementar no `SheetEditor`:

```ts
const effectiveLayout =
  docLayout ?? realmSettings?.sheetLayouts?.[osrPack.id] ?? defaultSheetLayout();
```

---

## Task 1: Dependências dnd-kit

**Files:**
- Modify: `package.json`

**Step 1: Instalar**

```powershell
npm install @dnd-kit/core @dnd-kit/utilities @dnd-kit/modifiers
```

Esperado: 3 pacotes em `dependencies`. (`@dnd-kit/sortable` NÃO é necessário — grid livre usa só `useDraggable`/`useDroppable`.)

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dnd-kit for draggable sheet layouts"
```

---

## Task 2: Modelo de layout + helpers puros

**Files:**
- Create: `shared/sheetLayout.ts`
- Test: `shared/sheetLayout.test.ts` (ad-hoc, `npx tsx`)

**Step 1: Escrever `shared/sheetLayout.ts`**

Conteúdo completo:

```ts
// Layout customizável da ficha (diegesis/sheet): grid livre de blocos
// posicionados por {x, y, w, h} em unidades de grid. TS puro — usado pelo
// renderer (canvas) e pelo main (parse tolerante). O SheetEngine ignora o
// campo `layout`; ele viaja no JSON serializado do documento.

export interface SheetGrid {
  cols: number;
  rowHeight: number;
  gap: number;
}

export interface SheetLayout {
  version: 1;
  grid: SheetGrid;
  blocks: SheetBlock[];
}

export type BlockInput = 'number' | 'die' | 'text' | 'checkbox';

interface BlockBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SheetBlock =
  | (BlockBase & { type: 'title' })
  | (BlockBase & { type: 'field'; path: string; label: string; input: BlockInput })
  | (BlockBase & { type: 'derived'; path: string; label: string })
  | (BlockBase & { type: 'identity'; key: string; label: string; multiline?: boolean })
  | (BlockBase & { type: 'rolls'; templates: string[] })
  | (BlockBase & { type: 'effects' })
  | (BlockBase & { type: 'text'; text: string })
  | (BlockBase & { type: 'section'; title: string });

export const SHEET_GRID: SheetGrid = { cols: 12, rowHeight: 44, gap: 8 };

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `blk-${Date.now().toString(36)}-${counter}`;
}

/** layout padrão reproduzindo a ficha OSR atual (nome, atributos, derivados, rolagens, efeitos) */
export function defaultSheetLayout(): SheetLayout {
  const g = SHEET_GRID;
  const field = (path: string, label: string, input: BlockInput, x: number, y: number, w = 3): SheetBlock => ({
    id: newBlockId(), type: 'field', path, label, input, x, y, w, h: 2,
  });
  return {
    version: 1,
    grid: g,
    blocks: [
      { id: newBlockId(), type: 'title', x: 0, y: 0, w: 12, h: 2 },
      { id: newBlockId(), type: 'section', title: 'Atributos', x: 0, y: 2, w: 12, h: 1 },
      field('dv', 'DV', 'number', 0, 3),
      field('dadoVida', 'Dado de Vida', 'die', 3, 3),
      field('pv.atual', 'PV', 'number', 6, 3),
      field('pv.max', 'PV Máx', 'number', 9, 3),
      field('ca', 'CA', 'number', 0, 5),
      field('atq', 'Atq', 'number', 3, 5),
      field('moral', 'Moral', 'number', 6, 5),
      field('desl.quad', 'Desl.', 'number', 9, 5),
      field('save', 'Save', 'number', 0, 7),
      { id: newBlockId(), type: 'derived', path: 'pv.metade', label: 'pv.metade', x: 3, y: 7, w: 3, h: 2 },
      { id: newBlockId(), type: 'derived', path: 'desl.pes', label: 'desl.pes', x: 6, y: 7, w: 3, h: 2 },
      { id: newBlockId(), type: 'derived', path: 'desl.m', label: 'desl.m', x: 9, y: 7, w: 3, h: 2 },
      { id: newBlockId(), type: 'section', title: 'Rolagens', x: 0, y: 9, w: 12, h: 1 },
      { id: newBlockId(), type: 'rolls', templates: ['ataque', 'dano', 'moral', 'save'], x: 0, y: 10, w: 12, h: 2 },
      { id: newBlockId(), type: 'section', title: 'Efeitos', x: 0, y: 12, w: 12, h: 1 },
      { id: newBlockId(), type: 'effects', x: 0, y: 13, w: 12, h: 4 },
    ],
  };
}

const BLOCK_TYPES = new Set(['title', 'field', 'derived', 'identity', 'rolls', 'effects', 'text', 'section']);

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** valida entrada hostil (realm import, versões futuras); retorna null se irreconhecível */
export function parseSheetLayout(raw: unknown): SheetLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  const grid = (r.grid && typeof r.grid === 'object' ? r.grid : {}) as Record<string, unknown>;
  const g: SheetGrid = {
    cols: isNum(grid.cols) && grid.cols > 0 ? grid.cols : SHEET_GRID.cols,
    rowHeight: isNum(grid.rowHeight) && grid.rowHeight > 0 ? grid.rowHeight : SHEET_GRID.rowHeight,
    gap: isNum(grid.gap) && grid.gap >= 0 ? grid.gap : SHEET_GRID.gap,
  };
  if (!Array.isArray(r.blocks)) return null;
  const blocks: SheetBlock[] = [];
  for (const b of r.blocks) {
    if (!b || typeof b !== 'object') continue;
    const blk = b as Record<string, unknown>;
    if (typeof blk.id !== 'string' || typeof blk.type !== 'string' || !BLOCK_TYPES.has(blk.type)) continue;
    if (![blk.x, blk.y, blk.w, blk.h].every(isNum)) continue;
    blocks.push({ ...blk, x: Math.max(0, Math.round(blk.x)), y: Math.max(0, Math.round(blk.y)), w: Math.max(1, Math.round(blk.w)), h: Math.max(1, Math.round(blk.h)) } as SheetBlock);
  }
  return { version: 1, grid: g, blocks };
}

/** altura total do canvas em unidades de grid (última linha ocupada + margem) */
export function layoutRows(layout: SheetLayout): number {
  return layout.blocks.reduce((max, b) => Math.max(max, b.y + b.h), 0) + 1;
}

/** clamp de posição/tamanho dentro das colunas do grid */
export function clampBlock(layout: SheetLayout, b: SheetBlock): SheetBlock {
  const cols = layout.grid.cols;
  const w = Math.min(Math.max(1, b.w), cols);
  const x = Math.min(Math.max(0, b.x), cols - w);
  return { ...b, x, w, y: Math.max(0, b.y), h: Math.max(1, b.h) };
}
```

**Step 2: Escrever teste ad-hoc `shared/sheetLayout.test.ts`**

```ts
import { defaultSheetLayout, parseSheetLayout, layoutRows, clampBlock, SHEET_GRID } from './sheetLayout';

const def = defaultSheetLayout();
console.assert(parseSheetLayout(JSON.parse(JSON.stringify(def))) !== null, 'default layout deve fazer round-trip');
console.assert(parseSheetLayout(null) === null, 'null → null');
console.assert(parseSheetLayout({ version: 2, blocks: [] }) === null, 'versão futura → null');
console.assert(parseSheetLayout({ version: 1, blocks: [{ id: 'a', type: 'field', path: 'ca', label: 'CA', input: 'number', x: -3, y: 0, w: 2, h: 1 }] })!.blocks[0].x === 0, 'x negativo clampado');
console.assert(parseSheetLayout({ version: 1, blocks: [{ id: 'a', type: 'wat', x: 0, y: 0, w: 1, h: 1 }] })!.blocks.length === 0, 'tipo desconhecido descartado');
console.assert(layoutRows(def) >= 17, 'layout padrão cobre efeitos');
const clamped = clampBlock(def, { id: 'x', type: 'text', text: '', x: 10, y: 0, w: 8, h: 1 });
console.assert(clamped.x + clamped.w <= SHEET_GRID.cols, 'clamp dentro das colunas');
console.log('sheetLayout.test: OK');
```

**Step 3: Rodar o teste**

```powershell
npx tsx shared/sheetLayout.test.ts
```

Esperado: `sheetLayout.test: OK`

**Step 4: Commit**

```bash
git add shared/sheetLayout.ts shared/sheetLayout.test.ts
git commit -m "feat(sheet): layout model with grid blocks and validation"
```

---

## Task 3: Layout no parse/serialize da ficha

**Files:**
- Modify: `shared/sheet.ts:7-13,93-122`

**Step 1: Importar e estender o tipo de documento**

Em `shared/sheet.ts`, adicionar ao topo:

```ts
import { parseSheetLayout, type SheetLayout } from './sheetLayout';

/** documento com layout opcional (campo extra tolerado pelo SheetEngine) */
export type SheetDocumentWithLayout = CharacterDocument & { layout?: SheetLayout };
```

**Step 2: `parseSheet` passa a carregar `layout` (sem quebrar o engine)**

Trocar o retorno final de `parseSheet` (linhas 112-118) por:

```ts
    const doc: SheetDocumentWithLayout = {
      systemId: raw.systemId,
      systemVersion: raw.systemVersion,
      identity: raw.identity && typeof raw.identity === 'object' ? raw.identity : {},
      base: raw.base && typeof raw.base === 'object' ? raw.base : {},
      effects: Array.isArray(raw.effects) ? raw.effects : [],
    };
    const layout = parseSheetLayout(raw.layout);
    if (layout) doc.layout = layout;
    return doc;
```

Manter a assinatura `parseSheet(...): CharacterDocument` (o tipo com layout é compatível por extensão). O `SheetEngine` recebe o objeto com `layout` extra — `structuredClone` interno preserva a chave e `serializeSheet` (spread) a reemite automaticamente.

**Step 3: Verificar serialização round-trip**

O editor atualiza o layout via `engine.loadDocument({ ...engine.document, layout })` — o campo flui por `serializeSheet(engine.document)` sem mudanças em `serializeSheet`.

**Step 4: Typecheck**

```powershell
npm run typecheck
```

Esperado: sem erros.

**Step 5: Commit**

```bash
git add shared/sheet.ts
git commit -m "feat(sheet): carry optional layout through parse/serialize"
```

---

## Task 4: Padrão por sistema em RealmSettings

**Files:**
- Modify: `shared/types.ts:114-117`

**Step 1: Estender `RealmSettings`**

```ts
import type { SheetLayout } from './sheetLayout'; // (type-only, sem ciclo)

export interface RealmSettings {
  /** custom fonts uploaded for this realm */
  fonts?: CustomFont[];
  /** layout padrão de ficha por systemId (ex.: 'diegesis/osr') */
  sheetLayouts?: Record<string, SheetLayout>;
}
```

(Se o import circular incomodar o bundler do main, declarar `sheetLayouts?: Record<string, unknown>` e cast no renderer — preferir o type import primeiro e validar com `npm run build:electron`.)

**Step 2: Typecheck + commit**

```powershell
npm run typecheck
git add shared/types.ts
git commit -m "feat(sheet): per-system default layouts in realm settings"
```

---

## Task 5: SheetCanvas — renderização por blocos (modo jogo)

**Files:**
- Create: `src/components/editors/sheet/SheetCanvas.tsx`
- Create: `src/components/editors/sheet/blocks.tsx`

**Contexto:** `SheetCanvas` recebe o layout efetivo, `computed`, callbacks de edição de valores e a flag `editing`. Nesta tarefa só o modo jogo: blocos absolutos em grid, sem DnD ainda. O resultado visual deve equivaler ao `SheetEditor` atual.

**Step 1: `SheetCanvas.tsx`**

```tsx
import { useMemo, useRef, useState, useEffect } from 'react';
import { layoutRows, type SheetLayout, type SheetBlock } from '@shared/sheetLayout';

export interface SheetCanvasProps {
  layout: SheetLayout;
  editing: boolean;
  renderBlock: (block: SheetBlock) => React.ReactNode;
  // DnD entra na Task 6
  children?: React.ReactNode;
}

export function SheetCanvas({ layout, renderBlock }: SheetCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { cols, rowHeight, gap } = layout.grid;
  const colW = width > 0 ? (width - gap * (cols - 1)) / cols : 0;
  const px = (b: SheetBlock) => ({
    left: b.x * (colW + gap),
    top: b.y * (rowHeight + gap),
    width: b.w * colW + (b.w - 1) * gap,
    height: b.h * rowHeight + (b.h - 1) * gap,
  });
  const rows = layoutRows(layout);

  return (
    <div ref={ref} className="relative w-full" style={{ height: rows * (rowHeight + gap) }}>
      {width > 0 && layout.blocks.map((b) => (
        <div key={b.id} className="absolute" style={px(b)}>
          {renderBlock(b)}
        </div>
      ))}
    </div>
  );
}
```

**Step 2: `blocks.tsx`** — renderers por tipo, extraindo o JSX atual do `SheetEditor` (field number/die, derived com audit click, rolls, effects, title = input de nome, section = heading, text = texto estático editável no modo edição, identity = input de texto livre ligado a `identity[key]`).

Assinatura sugerida:

```tsx
export interface BlockRenderCtx {
  computed: ComputedSheet | null;
  nome: string;
  editing: boolean;
  auditPath: string | null;
  setAuditPath: (p: string | null) => void;
  setBaseValue: (path: string, value: unknown) => void;
  setIdentity: (key: string, value: unknown) => void;
  rollTemplate: (id: string) => void;
  applyEffect: (defId: string) => void;
  setEffectEnabled: (id: string, on: boolean) => void;
  removeEffect: (id: string) => void;
  effectLabel: (fx: EffectInstance) => string;
}

export function renderSheetBlock(block: SheetBlock, ctx: BlockRenderCtx): React.ReactNode;
```

Mapear visual 1:1 com as classes Tailwind já usadas no `SheetEditor` (`rounded-lg border border-line bg-elevated/60`, `text-[10.5px] text-ink-3`, etc.). Bloco `field` com `input: 'text'` edita `base[path]` como string; `'checkbox'` edita boolean.

**Step 3: Typecheck + commit**

```powershell
npm run typecheck
git add src/components/editors/sheet/
git commit -m "feat(sheet): grid canvas rendering blocks (play mode)"
```

---

## Task 6: SheetEditor reescrito — modos edição/jogo + herança de layout

**Files:**
- Modify: `src/components/editors/sheet/SheetEditor.tsx`

**Step 1: Estado de layout e modo**

```tsx
const [editing, setEditing] = useState(false);
const [layout, setLayout] = useState<SheetLayout>(() => {
  const parsed = parseSheet(doc.content) as SheetDocumentWithLayout;
  return parsed.layout ?? realmDefault ?? defaultSheetLayout();
});
```

- `realmDefault` vem de `uiState.realmSettings?.[activeRealmId]?.sheetLayouts?.[osrPack.id]` (via `useStore()`), parseado com `parseSheetLayout`.
- No effect do engine (existente), ao persistir, injetar layout atual: manter `layoutRef.current = layout` sincronizado e trocar `serializeSheet(engine.document)` por `serializeSheet({ ...engine.document, layout: layoutRef.current })`. No `subscribeExternalDocChange`, recarregar layout se vier externo e diferente.

**Step 2: Mutações de layout (modo edição)**

```ts
const mutateLayout = (fn: (l: SheetLayout) => SheetLayout) => {
  setLayout((prev) => {
    const next = fn(prev);
    layoutRef.current = next;
    dirty.current = true;           // reutiliza o save debounced do engine
    scheduleSave();                  // extrair o setTimeout do 'computed' para função reutilizável
    return next;
  });
};
```

Extrair o save debounced do callback `bus.on('computed')` para `scheduleSave()` usado por ambos.

**Step 3: Toolbar do editor**

Topo do editor (acima do canvas): botão toggle `editing` (ícones `Pencil`/`Check` do lucide), e no modo edição: "Salvar como padrão do sistema" (grava em `realmSettings.sheetLayouts[osrPack.id]` via `saveUiState`, seguindo o padrão de `TitleBar.tsx:305-311`) e "Restaurar padrão" (remove `doc.layout` → volta a herdar).

**Step 4: Render**

Substituir todo o JSX estático por:

```tsx
<div className="h-full overflow-y-auto custom-scrollbar bg-app">
  <div className="max-w-[860px] mx-auto px-6 py-5">
    <Toolbar ... />
    <SheetCanvas layout={layout} editing={editing} renderBlock={(b) => renderSheetBlock(b, ctx)} />
    {auditPath && <AuditPanel ... />}  {/* seção de audit trail permanece abaixo do canvas */}
  </div>
</div>
```

**Step 5: Typecheck + QA manual + commit**

```powershell
npm run typecheck
npm run dev
```

QA: abrir ficha existente → visual idêntico ao anterior; editar valores/rolar/efeitos funcionam; toggle de modo não persiste nada ainda.

```bash
git add src/components/editors/sheet/SheetEditor.tsx
git commit -m "feat(sheet): rewrite editor on layout canvas with edit/play modes"
```

---

## Task 7: Drag and drop de blocos (mover com snap-to-grid)

**Files:**
- Modify: `src/components/editors/sheet/SheetCanvas.tsx`

**Step 1: DndContext + snap modifier**

Envolver o canvas em `DndContext` (só quando `editing`). Cada bloco vira `useDraggable({ id: block.id, disabled: !editing })`. Modifier de snap: `createSnapModifier` de `@dnd-kit/modifiers` requer tamanho fixo — como a coluna é fluida, implementar modifier custom:

```ts
const snapToGrid: Modifier = ({ transform }) => {
  const stepX = colW + gap, stepY = rowHeight + gap;
  return { ...transform, x: Math.round(transform.x / stepX) * stepX, y: Math.round(transform.y / stepY) * stepY };
};
```

**Step 2: onDragEnd → mutateLayout**

```ts
const onDragEnd = (e: DragEndEvent) => {
  const dx = Math.round(e.delta.x / (colW + gap));
  const dy = Math.round(e.delta.y / (rowHeight + gap));
  onMoveBlock(String(e.active.id), dx, dy); // prop nova: (id, dx, dy) => mutateLayout(...)
};
```

`onMoveBlock` no `SheetEditor`: `clampBlock(layout, { ...b, x: b.x + dx, y: b.y + dy })`. Sem colisão/compactação — grid livre, sobreposição permitida (z-index do arrastado por cima via `useDraggable` + `transform`).

**Step 3: Handle de arraste**

No modo edição, cada bloco ganha overlay: borda tracejada `border-dashed border-accent/40`, handle `GripVertical` no canto superior esquerdo (listeners do draggable no handle, não no bloco inteiro, para inputs continuarem clicáveis), e botão `X` (remover bloco → `mutateLayout` filtrando).

**Step 4: QA manual + commit**

Arrastar blocos, soltar com snap; valores persistem após reload da ficha.

```bash
git commit -am "feat(sheet): drag blocks with grid snap in edit mode"
```

---

## Task 8: Resize de blocos

**Files:**
- Modify: `src/components/editors/sheet/SheetCanvas.tsx`

**Step 1: Grip de resize (canto inferior direito, só no modo edição)**

Pointer events nativos (sem dnd-kit — resize é contínuo): `onPointerDown` captura, `onPointerMove` calcula `dw/dh` em unidades de grid (mesma matemática de snap), preview em estado local, `onPointerUp` → `onResizeBlock(id, w, h)` → `mutateLayout` + `clampBlock`. Classe do grip: `absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize` com ícone `GripHorizontal` rotacionado ou canto visual via border.

**Step 2: QA + commit**

```bash
git commit -am "feat(sheet): resize blocks on grid"
```

---

## Task 9: Paleta de novos blocos + campos customizados

**Files:**
- Create: `src/components/editors/sheet/SheetPalette.tsx`
- Modify: `src/components/editors/sheet/SheetEditor.tsx`, `SheetCanvas.tsx`

**Step 1: `SheetPalette.tsx`**

Barra lateral (ou barra horizontal acima do canvas) visível só no modo edição. Itens arrastáveis (`useDraggable` com id `palette:<kind>`):

- Campo numérico (`field`, input number) — path padrão `custom.campo1`, editável depois
- Campo de texto (`field`, input text)
- Checkbox (`field`, input checkbox)
- Dado (`field`, input die)
- Valor derivado (`derived`, path `pv.metade`)
- Rolagens (`rolls`, todos os templates do pack)
- Efeitos (`effects`)
- Anotação (`text`)
- Seção (`section`)
- Campo de identidade (`identity`, key `notas`)

**Step 2: Drop no canvas**

Canvas como `useDroppable({ id: 'canvas' })`. Em `onDragEnd`, se `e.active.id` começa com `palette:` e `e.over?.id === 'canvas'`: posição = `(activatorEvent.clientX/Y + delta)` relativo ao `getBoundingClientRect()` do canvas, convertida para célula de grid → `mutateLayout` adicionando bloco novo (`newBlockId()`, tamanhos padrão: field 3x2, section 12x1, text 4x3, effects 12x4).

**Step 3: Popover de configuração do bloco (modo edição)**

Clique no bloco (modo edição) seleciona → popover inline com inputs: `label`, `path` (para field/derived), `key` (identity), `text` (text), `input` (select de tipo). Mudanças via `mutateLayout`. Usar posicionamento absoluto simples ancorado ao bloco; fechar ao clicar fora.

**Step 4: QA + commit**

Arrastar "Campo numérico" da paleta, renomear label/path para `iniciativa`, preencher valor, recarregar → persiste.

```bash
git commit -am "feat(sheet): block palette and custom fields"
```

---

## Task 10: Polish + verificação final

**Step 1:** Garantir que o PDF import (`PdfReader.tsx`/`HighlightLayer.tsx`) continua criando fichas sem `layout` → herdam o padrão. Nada a mudar se Tasks 3/6 estiverem corretas; validar manualmente.

**Step 2:** `npm run typecheck` limpo; `npm run build` completo (renderer + electron) para pegar erro de bundling do main com o novo import em `shared/types.ts`.

**Step 3:** QA manual checklist:
- [ ] Ficha antiga (sem layout) abre com layout padrão
- [ ] Mover/redimensionar/adicionar/remover blocos persiste após reabrir
- [ ] "Salvar como padrão do sistema" → nova ficha herda o layout
- [ ] "Restaurar padrão" remove layout da ficha e volta a herdar
- [ ] Rolagens, efeitos e audit trail funcionam no modo jogo
- [ ] Sync externa (mudança via IA/outra aba) não é sobrescrita pelo save debounced

**Step 4: Commit final**

```bash
git commit -am "feat(sheet): customizable drag-and-drop character sheets"
```
