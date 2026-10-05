import {
  builtinSheetTemplates,
  defaultSheetLayout,
  monsterSheetLayout,
  parseSheetLayout,
  parseSheetTemplate,
  layoutRows,
  clampBlock,
  sheetTabs,
  SHEET_GRID,
} from './sheetLayout';

const def = defaultSheetLayout();
console.assert(parseSheetLayout(JSON.parse(JSON.stringify(def))) !== null, 'default layout deve fazer round-trip');
console.assert(parseSheetLayout(null) === null, 'null -> null');
console.assert(parseSheetLayout({ version: 2, blocks: [] }) === null, 'versao futura -> null');
console.assert(
  parseSheetLayout({ version: 1, blocks: [{ id: 'a', type: 'field', path: 'ca', label: 'CA', input: 'number', x: -3, y: 0, w: 2, h: 1 }] })!.blocks[0].x === 0,
  'x negativo clampado',
);
console.assert(
  parseSheetLayout({ version: 1, blocks: [{ id: 'a', type: 'wat', x: 0, y: 0, w: 1, h: 1 }] })!.blocks.length === 0,
  'tipo desconhecido descartado',
);
console.assert(layoutRows(def) >= 13, 'layout padrao cobre rolagens');
console.assert(
  sheetTabs({ version: 1, grid: SHEET_GRID, blocks: [] }).map((t) => t.id).join(',') === 'geral,efeitos',
  'abas fixas geral+efeitos sempre presentes',
);
console.assert(sheetTabs(def).some((t) => t.id === 'efeitos'), 'template padrao inclui aba fixa efeitos');
const clamped = clampBlock(def, { id: 'x', type: 'text', text: '', x: 10, y: 0, w: 8, h: 1 });
console.assert(clamped.x + clamped.w <= SHEET_GRID.cols, 'clamp dentro das colunas');

// modelos
const builtins = builtinSheetTemplates();
console.assert(builtins.length === 2 && builtins.every((t) => parseSheetTemplate(JSON.parse(JSON.stringify(t))) !== null), 'builtins fazem round-trip');
console.assert(parseSheetTemplate({ id: 'x', name: '', layout: def }) === null, 'nome vazio -> null');
console.assert(parseSheetTemplate({ id: 'x', name: 'X', layout: { version: 2 } }) === null, 'layout invalido -> null');
console.assert(parseSheetLayout(JSON.parse(JSON.stringify(monsterSheetLayout()))) !== null, 'monstro faz round-trip');
console.log('sheetLayout.test: OK');
