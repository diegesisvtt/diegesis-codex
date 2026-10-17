// Gerador procedural de dungeons (inspirado no One Page Dungeon do watabou):
// salas retangulares sem overlap → MST entre centros → corredores em L →
// corredores extras por "looping" → portas nas transições corredor/sala →
// nomes e conteúdos por tema. Determinístico por seed (createRng do modelo).
// O resultado cai no mesmo DungeonMapDoc editável — gerar é só um atalho.

import {
  cellKey,
  cellIndex,
  createRng,
  generateDungeonId,
  plainTextDescription,
  ROOM_COLORS,
  type DungeonCell,
  type DungeonDoor,
  type DungeonGrid,
  type DungeonRoom,
} from './model';

export interface DungeonGenParams {
  seed: string;
  theme: DungeonTheme;
  roomCount: number;
  /** 0..1 — chance de corredores extras além da árvore mínima */
  looping: number;
}

export type DungeonTheme = 'dungeon' | 'crypt' | 'cave';

export const DUNGEON_THEMES: { id: DungeonTheme; label: string }[] = [
  { id: 'dungeon', label: 'Masmorra' },
  { id: 'crypt', label: 'Cripta' },
  { id: 'cave', label: 'Caverna' },
];

interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

const ROOM_NAMES: Record<DungeonTheme, string[]> = {
  dungeon: [
    'Salão Principal', 'Cela dos Esquecidos', 'Arsenal', 'Refeitório', 'Templo Profanado',
    'Câmara do Trono', 'Prisão', 'Depósito', 'Laboratório', 'Sala de Guarda',
    'Biblioteca Ruída', 'Forja Antiga', 'Salão dos Ecos', 'Tumba do Regente', 'Poço das Almas',
  ],
  crypt: [
    'Sarcófago Central', 'Ossuário', 'Capela Silente', 'Cripta dos Ancestrais', 'Altar Quebrado',
    'Corredor dos Velámos', 'Relicário', 'Tumba Selada', 'Nicho dos Acólitos', 'Câmara Funerária',
  ],
  cave: [
    'Gruta de Cristais', 'Lago Subterrâneo', 'Ninho de Morcegos', 'Passagem Estreita',
    'Câmara de Fungo', 'Abismo', 'Poço de Estalactites', 'Toca do Predador', 'Veio de Minério',
    'Galeria Ventosa',
  ],
};

const ROOM_CONTENTS: Record<DungeonTheme, string[]> = {
  dungeon: [
    'Armadilha de dardos no corredor de entrada.',
    'Baú trancado com moedas antigas.',
    'Grupo de goblins acampado.',
    'Altar dedicado a um deus esquecido.',
    'Estátua com olhos de gema (armadilha).',
    'Escadas para um nível inferior.',
    'Prisioneiro acorrentado disposto a negociar.',
    'Fungo luminescente cobre as paredes.',
    'Esqueletos de aventureiros saqueados.',
    'Portal rachado emana energia instável.',
    'Sala vazia, exceto por uma fonte seca.',
    'Tesouro guardado por um monstro adormecido.',
  ],
  crypt: [
    'Sarcófagos saqueados, tampas quebradas.',
    'Mortos-vivos patrolham em silêncio.',
    'Inscrições revelam uma maldição familiar.',
    'Velas eternas queimam sem consumir.',
    'Uma tumba jamais aberta — lacre intacto.',
    'Relíquia sagrada sob guarda espectral.',
    'Ossadas organizadas em padrões rituais.',
    'Sussurros respondem a quem fala alto.',
  ],
  cave: [
    'Colônia de cogumelos alucinógenos.',
    'Pegadas frescas de algo grande.',
    'Veio de cristal que pulsa com luz própria.',
    'Osso de criatura colossal atravessa o salão.',
    'Água goteja formando poças profundas.',
    'Ninho vazio, ovos recém-eclodidos.',
    'Corrente de ar frio sugere saída próxima.',
    'Pinturas rupestres de uma civilização perdida.',
  ],
};

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

/** centro da sala em células */
function center(r: RoomRect): { x: number; y: number } {
  return { x: r.cx, y: r.cy };
}

/** corredor em L entre dois pontos (horizontal depois vertical, ou vice-versa) */
function corridorPath(
  rng: () => number,
  a: { x: number; y: number },
  b: { x: number; y: number }
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let { x, y } = a;
  const xFirst = rng() < 0.5;
  const walkX = () => {
    while (x !== b.x) {
      x += Math.sign(b.x - x);
      out.push({ x, y });
    }
  };
  const walkY = () => {
    while (y !== b.y) {
      y += Math.sign(b.y - y);
      out.push({ x, y });
    }
  };
  if (xFirst) {
    walkX();
    walkY();
  } else {
    walkY();
    walkX();
  }
  return out;
}

/** MST de Prim sobre os centros das salas + arestas extras por looping */
function connectRooms(rng: () => number, rooms: RoomRect[], looping: number): [number, number][] {
  const n = rooms.length;
  if (n < 2) return [];
  const inTree = new Set([0]);
  const edges: [number, number][] = [];
  while (inTree.size < n) {
    let best: [number, number] | null = null;
    let bestDist = Infinity;
    for (const i of inTree) {
      for (let j = 0; j < n; j++) {
        if (inTree.has(j)) continue;
        const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy);
        if (d < bestDist) {
          bestDist = d;
          best = [i, j];
        }
      }
    }
    if (!best) break;
    edges.push(best);
    inTree.add(best[1]);
  }
  // arestas extras criam loops (rotas alternativas)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
      if (rng() < looping) edges.push([i, j]);
    }
  }
  return edges;
}

export function generateDungeon(
  params: DungeonGenParams,
  grid: DungeonGrid
): { cells: DungeonCell[]; rooms: DungeonRoom[]; doors: DungeonDoor[] } {
  const rng = createRng(`${params.seed}:${params.theme}:${params.roomCount}:${params.looping}`);

  // 1. posiciona salas sem overlap (margem de 1 célula entre elas)
  const rects: RoomRect[] = [];
  const maxW = Math.min(9, Math.floor(grid.cols / 3));
  const maxH = Math.min(9, Math.floor(grid.rows / 3));
  for (let attempt = 0; attempt < 300 && rects.length < params.roomCount; attempt++) {
    const w = 3 + Math.floor(rng() * (maxW - 2));
    const h = 3 + Math.floor(rng() * (maxH - 2));
    const x = 1 + Math.floor(rng() * (grid.cols - w - 2));
    const y = 1 + Math.floor(rng() * (grid.rows - h - 2));
    const overlaps = rects.some(
      (r) => x - 1 < r.x + r.w && x + w + 1 > r.x && y - 1 < r.y + r.h && y + h + 1 > r.y
    );
    if (!overlaps) rects.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
  }

  // 2. cria as salas e o chão
  const usedNames = new Set<string>();
  const rooms: DungeonRoom[] = rects.map((rect, i) => {
    const names = ROOM_NAMES[params.theme];
    let name = pick(rng, names);
    // esgotados os nomes únicos do tema, sufixa numerais romanos
    for (let attempt = 0; usedNames.has(name); attempt++) {
      const suffix = attempt > 0 ? ` ${'IIIII'.slice(0, attempt)}` : '';
      name = `${pick(rng, names)}${suffix}`;
    }
    usedNames.add(name);
    return {
      id: generateDungeonId(),
      number: i + 1,
      name,
      description: plainTextDescription(pick(rng, ROOM_CONTENTS[params.theme])),
      color: ROOM_COLORS[i % ROOM_COLORS.length],
    };
  });
  const cells: DungeonCell[] = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        cells.push({ x, y, kind: 'room', roomId: rooms[i].id });
  }

  // 3. corredores (MST + loops)
  for (const [i, j] of connectRooms(rng, rects, params.looping)) {
    for (const c of corridorPath(rng, center(rects[i]), center(rects[j]))) {
      if (c.x < 0 || c.y < 0 || c.x >= grid.cols || c.y >= grid.rows) continue;
      cells.push({ x: c.x, y: c.y, kind: 'corridor', roomId: null });
    }
  }
  // corredores que cruzam salas adotam a sala (primeira vence)
  const merged = new Map<string, DungeonCell>();
  for (const c of cells) {
    const key = cellKey(c.x, c.y);
    const prev = merged.get(key);
    if (!prev || prev.kind === 'corridor') merged.set(key, c);
  }
  const finalCells = [...merged.values()];

  // 4. portas: transição corredor → sala
  const floor = cellIndex(finalCells);
  const doors: DungeonDoor[] = [];
  const seen = new Set<string>();
  for (const c of finalCells) {
    if (c.kind !== 'room') continue;
    const sides = [
      { side: 'n' as const, dx: 0, dy: -1 },
      { side: 's' as const, dx: 0, dy: 1 },
      { side: 'e' as const, dx: 1, dy: 0 },
      { side: 'w' as const, dx: -1, dy: 0 },
    ];
    for (const { side, dx, dy } of sides) {
      const neighbor = floor.get(cellKey(c.x + dx, c.y + dy));
      if (neighbor?.kind !== 'corridor') continue;
      const key = `${c.x},${c.y},${side}`;
      if (seen.has(key)) continue;
      seen.add(key);
      doors.push({ id: generateDungeonId(), x: c.x, y: c.y, side, kind: 'normal' });
    }
  }

  return { cells: finalCells, rooms, doors };
}

/** seed aleatória legível */
export function randomSeed(): string {
  const words = ['dragao', 'cripta', 'pedra', 'sombra', 'chama', 'nevoa', 'ferro', 'runa'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 9000 + 1000)}`;
}
