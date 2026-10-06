// Efeitos customizados globais do reino: definições criadas pelo usuário no
// painel da ficha, persistidas em RealmSettings.sheetEffects e registradas
// no SheetEngine em runtime (registerDefinition) — aplicáveis em qualquer
// ficha do reino, ao lado das definições embutidas do pack.
import { parseFormula } from '@diegesis/formula';
import type { Change, EffectDefinition } from '@diegesis/sheet';

/** valida entrada hostil (realm settings, imports); descarta defs inválidas */
export function parseEffectDefinitions(raw: unknown): EffectDefinition[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  const out: EffectDefinition[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const d = item as Record<string, unknown>;
    if (typeof d.id !== 'string' || !d.id) continue;
    if (typeof d.label !== 'string' || !d.label) continue;
    const changes = Array.isArray(d.changes) ? (d.changes.filter(isChange) as Change[]) : [];
    if (changes.length === 0) continue;
    out.push({ id: d.id, label: d.label, changes });
  }
  return out;
}

/** uma definição de efeito é íntegra se tem rótulo e todas as alterações são
 *  válidas (fórmulas parseáveis). Usada também para sanear efeitos INLINE do
 *  documento antes de construir o SheetEngine (cujo construtor computa e
 *  lançaria com fórmula inválida). */
export function isValidEffectDefinition(def: unknown): def is EffectDefinition {
  if (!def || typeof def !== 'object') return false;
  const d = def as Record<string, unknown>;
  if (typeof d.label !== 'string' || !d.label) return false;
  if (!Array.isArray(d.changes) || d.changes.length === 0) return false;
  return d.changes.every(isChange);
}

function isChange(c: unknown): boolean {
  if (!c || typeof c !== 'object') return false;
  const k = (c as Record<string, unknown>).kind;
  if (k !== 'value' && k !== 'roll' && k !== 'flag') return false;
  if (k !== 'value') return true;
  // alterações de valor com op aritmético têm que ser fórmulas válidas —
  // senão o defineSystemPack (validação completa do pack) explode no render
  const row = c as Record<string, unknown>;
  const op = row.op;
  if (op === 'upgrade' || op === 'downgrade' || op === 'append' || op === 'remove') return typeof row.value === 'string';
  return isFormula(String(row.value ?? ''));
}

function isFormula(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  try {
    parseFormula(s);
    return true;
  } catch {
    return false;
  }
}

/** id estável a partir do rótulo (prefixo custom: evita colisão com o pack) */
export function newEffectId(label: string): string {
  const slug =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'efeito';
  return `custom:${slug}-${Math.random().toString(36).slice(2, 6)}`;
}

/** resumo curto de uma alteração para listagens */
export function summarizeChange(c: Change): string {
  if (c.kind === 'value') return `${c.path} ${c.op} ${c.value}`;
  if (c.kind === 'roll') return `rolagem[${c.target}]${c.transform.bonus ? ` ${c.transform.bonus.startsWith('-') ? '' : '+'}${c.transform.bonus}` : ''}`;
  return `${c.path} = ${String(c.value)}`;
}
