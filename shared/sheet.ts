// Ficha de Personagem (diegesis/sheet): system pack padrão OSR alinhado aos
// FIELD_TEMPLATES de statblock (pdf/rpg.ts — DV/PV/CA/Atq/Moral…), helpers de
// parse/serialização do documento e conversão de ParsedStatblock → base.
// TS puro — usado pelo renderer (editor) e pelo main (extração de texto p/ FTS).
// O motor de efeitos é o SheetEngine do @diegesis/sheet.

import {
  createDocument as createSheetDocument,
  defineSystemPack,
  type CharacterDocument,
} from '@diegesis/sheet';
import { fromFormula } from '@diegesis/dice-notation';
import { parseSheetLayout, SHEET_TEMPLATE_MONSTRO, SHEET_TEMPLATE_PERSONAGEM, type SheetLayout } from './sheetLayout';

/** documento com layout/template opcionais (campos extras tolerados pelo SheetEngine) */
export type SheetDocumentWithLayout = CharacterDocument & { layout?: SheetLayout; templateId?: string };

export const SHEET_DOC_KIND = 'diegesis-sheet';
export const SHEET_DOC_TYPE = 'diegesis/sheet';

/**
 * System pack OSR. Base aninhada (pv.atual/max, desl.quad) para que paths
 * derivados não colidam com folhas; derived expõem valores calculados;
 * rollTemplates são as rolagens prontas (ataque 1d20+@atq, moral 2d6, dano
 * 1d6). Nenhuma definição de efeito é embutida — efeitos são criados pelo
 * usuário como globais do reino e registrados no motor em runtime.
 */
export const osrPack = defineSystemPack({
  id: 'diegesis/osr',
  version: '1.0.0',
  ordinals: {
    /** escada de dados para upgrade/downgrade (ex.: dado de vida) */
    dado: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'],
  },
  derived: {
    /** metade dos PV máximos — limiar comum de ferida grave */
    'pv.metade': 'floor(pv.max / 2)',
    /** deslocamento em pés (quadrados de 5') */
    'desl.pes': 'desl.quad * 5',
    /** deslocamento em metros (quadrados de 1,5 m) */
    'desl.m': 'desl.quad * 1.5',
  },
  rollTemplates: {
    ataque: { expr: fromFormula('1d20 + @atq'), tags: ['ataque', 'combate'] },
    dano: { expr: fromFormula('1d6'), tags: ['dano', 'combate'] },
    moral: { expr: fromFormula('2d6'), tags: ['moral'] },
    save: { expr: fromFormula('1d20'), tags: ['save'] },
  },
  // sem efeitos embutidos: todas as definições são criadas pelo usuário
  // (efeitos globais do reino — shared/sheetEffects.ts)
});

// ---------- parse / serialização ----------

/** documento novo e vazio para o pack padrão */
export function createDefaultSheet(): CharacterDocument {
  const doc = createSheetDocument(osrPack, {
    identity: { nome: '' },
    base: {
      dv: 1,
      dadoVida: 'd8',
      pv: { atual: 4, max: 4 },
      ca: 10,
      atq: 0,
      moral: 7,
      desl: { quad: 6 },
      save: 15,
    },
  });
  (doc as SheetDocumentWithLayout).templateId = SHEET_TEMPLATE_PERSONAGEM;
  return doc;
}

export function serializeSheet(doc: CharacterDocument): string {
  // kind por último: o discriminador vence mesmo se o documento ganhar um
  // campo `kind` no futuro
  return JSON.stringify({ ...doc, kind: SHEET_DOC_KIND });
}

/** entrada hostil (import de realm, versões futuras): valida a estrutura mínima */
export function parseSheet(content: string | null | undefined): CharacterDocument {
  if (!content) return createDefaultSheet();
  try {
    const raw = JSON.parse(content);
    if (!raw || typeof raw !== 'object') return createDefaultSheet();
    if (raw.kind !== SHEET_DOC_KIND) return createDefaultSheet();
    if (typeof raw.systemId !== 'string' || typeof raw.systemVersion !== 'string') return createDefaultSheet();
    if (raw.systemId !== osrPack.id) {
      // sistema estrangeiro: não rodar o pack OSR sobre dados de outro sistema
      console.warn(`[sheet] systemId desconhecido "${raw.systemId}" — usando ficha padrão`);
      return createDefaultSheet();
    }
    const doc: SheetDocumentWithLayout = {
      systemId: raw.systemId,
      systemVersion: raw.systemVersion,
      identity: raw.identity && typeof raw.identity === 'object' ? raw.identity : {},
      base: raw.base && typeof raw.base === 'object' ? raw.base : {},
      effects: Array.isArray(raw.effects) ? raw.effects : [],
    };
    const layout = parseSheetLayout(raw.layout);
    if (layout) doc.layout = layout;
    if (typeof raw.templateId === 'string' && raw.templateId) doc.templateId = raw.templateId;
    return doc;
  } catch {
    return createDefaultSheet();
  }
}

/** texto indexável (FTS/RAG): identidade + valores base + rótulos de efeitos */
export function extractSheetText(content: string): string {
  const doc = parseSheet(content);
  const parts: string[] = [];
  for (const v of Object.values(doc.identity)) if (typeof v === 'string' && v) parts.push(v);
  const walk = (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) {
      parts.push(k);
      if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
      else if (v && typeof v === 'object') walk(v as Record<string, unknown>);
    }
  };
  walk(doc.base);
  for (const fx of doc.effects) if (fx.ref) parts.push(fx.ref);
  return parts.join(' ');
}

// ---------- importação de statblock (PDF) ----------

/** campos de statblock que viram stats numéricos da ficha (path na base) */
const STATBLOCK_BASE_KEYS: Record<string, string> = {
  dv: 'dv',
  pv: 'pv',
  ca: 'ca',
  atq: 'atq',
  moral: 'moral',
  save: 'save',
  desl: 'desl',
  'desl.': 'desl',
};

function leadingNumber(value: string): number | null {
  const m = /^-?\d+/.exec(value.trim());
  return m ? Number(m[0]) : null;
}

/** grava um número de statblock no path da base, respeitando a estrutura aninhada */
function setBaseStat(base: Record<string, unknown>, path: string, num: number) {
  if (path === 'pv') base.pv = { atual: num, max: num };
  else if (path === 'desl') base.desl = { quad: num };
  else base[path] = num;
}

/**
 * Converte um statblock parseado do PDF (chaves originais em qualquer caixa,
 * valores texto) em base/identity de ficha. Stats conhecidos viram números na
 * base (quando o valor começa com dígito); o resto vai para identity.campos.
 */
export function statblockToSheet(parsed: {
  title: string;
  tag: 'monster' | 'npc';
  fields: { key: string; value: string }[];
  notes: string;
}): SheetDocumentWithLayout {
  const base: Record<string, unknown> = { ...createDefaultSheet().base };
  const campos: Record<string, string> = {};
  for (const f of parsed.fields) {
    const target = STATBLOCK_BASE_KEYS[f.key.toLowerCase()];
    const num = leadingNumber(f.value);
    if (target && num != null) setBaseStat(base, target, num);
    else campos[f.key] = f.value;
  }
  // DV textual ("3d8") alimenta o dado de vida quando reconhecível
  const dvText = parsed.fields.find((f) => f.key.toLowerCase() === 'dv')?.value ?? '';
  const dieMatch = /d(4|6|8|10|12|20)/i.exec(dvText);
  if (dieMatch) base.dadoVida = `d${dieMatch[1]}`;
  return {
    ...createSheetDocument(osrPack),
    templateId: SHEET_TEMPLATE_MONSTRO,
    identity: {
      nome: parsed.title,
      tipo: parsed.tag,
      notas: parsed.notes,
      campos,
    },
    base,
  };
}
