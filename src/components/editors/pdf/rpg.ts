// RPG annotation helpers: tag/icon registry, field templates ("rubrics") and
// the statblock auto-parser.
import type { PdfPinTag, PdfPinField } from './model';
import {
  Pencil,
  BookOpen,
  Scroll,
  Skull,
  Swords,
  Shield,
  Star,
  Key,
  Eye,
  Flag,
  Bell,
  Gem,
  Flame,
  FlaskConical,
  Package,
  Zap,
  MapPin,
  DoorOpen,
  Table,
  Link2,
  User,
  Ghost,
  Bookmark,
  type LucideIcon,
} from 'lucide-react';
import { pinId } from './model';

export const PIN_ICONS: Record<string, LucideIcon> = {
  pencil: Pencil,
  book: BookOpen,
  scroll: Scroll,
  skull: Skull,
  swords: Swords,
  shield: Shield,
  star: Star,
  key: Key,
  eye: Eye,
  flag: Flag,
  bell: Bell,
  gem: Gem,
  flame: Flame,
  flask: FlaskConical,
  chest: Package,
  zap: Zap,
  'map-pin': MapPin,
  door: DoorOpen,
  table: Table,
  link: Link2,
  user: User,
  ghost: Ghost,
  bookmark: Bookmark,
};

export const PIN_ICON_NAMES = Object.keys(PIN_ICONS);

export function pinIcon(name: string): LucideIcon {
  return PIN_ICONS[name] ?? Pencil;
}

export const TAG_DEFAULT_ICON: Record<NonNullable<PdfPinTag>, string> = {
  monster: 'ghost',
  npc: 'user',
  trap: 'zap',
  treasure: 'gem',
  clue: 'key',
  room: 'door',
  table: 'table',
};

// ---------- field templates ----------

export const FIELD_TEMPLATES: Record<string, { label: string; fields: { key: string; multiline?: boolean }[] }> = {
  room: {
    label: 'Sala',
    fields: [
      { key: 'Leitura em voz alta', multiline: true },
      { key: 'Saídas' },
      { key: 'Situação & Ecossistema', multiline: true },
    ],
  },
  trap: {
    label: 'Armadilha',
    fields: [{ key: 'Sinais' }, { key: 'CD' }, { key: 'Gatilho' }, { key: 'Desarmar' }, { key: 'Rearmar' }],
  },
  monster: {
    label: 'Monstro',
    fields: [
      { key: 'DV' },
      { key: 'PV' },
      { key: 'CA' },
      { key: 'Desl.' },
      { key: 'Atq' },
      { key: 'Moral' },
      { key: 'Save' },
      { key: 'Leitura em voz alta', multiline: true },
      { key: 'Traços & Resistências', multiline: true },
      { key: 'Motivação' },
    ],
  },
  npc: {
    label: 'NPC',
    fields: [
      { key: 'DV' },
      { key: 'PV' },
      { key: 'CA' },
      { key: 'Aparência / Trejeito' },
      { key: 'Objetivo / Motivação', multiline: true },
      { key: 'Segredo / Alavanca', multiline: true },
    ],
  },
};

/** numeric-ish keys get ▲/▼ steppers */
export const STEPPER_KEYS = new Set(['ca', 'pv', 'nv', 'atq', 'desl', 'cd', 'slots', 'timer', 'moral', 'dv', 'ac', 'hp', 'lv', 'atk', 'mv', 'dc', 'morale']);

export function makeField(key: string, value = '', multiline = false): PdfPinField {
  return { id: pinId(), key, value, multiline };
}

// ---------- statblock parser ----------

const STAT_KEYS = new Set([
  'ac', 'armor class', 'ca', 'mv', 'move', 'speed', 'desl', 'hp', 'hit points', 'pv',
  'hd', 'hit dice', 'dv', '#at', 'at', 'att', 'attacks', 'atq', 'dmg', 'damage', 'dano',
  'thac0', 'al', 'align', 'alignment', 'ml', 'morale', 'moral', 'lvl', 'level', 'cr',
  'init', 'initiative', 'iniciativa', 'save', 'str', 'dex', 'con', 'int', 'wis', 'cha',
  'for', 'des', 'con', 'int', 'sab', 'car', 'xp', 'slots', 'timer',
]);
const EQUIPMENT_WORDS = new Set(['armor', 'armadura', 'sword', 'espada', 'potion', 'poção', 'scroll', 'pergaminho', 'wand', 'varinha', 'staff', 'cajado', 'shield', 'escudo', 'ring', 'anel', 'cloak', 'capa']);
const MONSTER_HINTS = new Set(['ac', 'ca', 'hp', 'pv', 'hd', 'dv', 'thac0', 'damage', 'dano', 'morale', 'moral', 'cr']);
const NPC_HINTS = new Set(['role', 'papel', 'disposition', 'disposição', 'voice', 'voz', 'quirk', 'trejeito', 'faction', 'facção']);

export interface ParsedStatblock {
  title: string;
  tag: 'monster' | 'npc';
  fields: { key: string; value: string }[];
  notes: string;
}

/** Heuristically parses selected PDF text into structured stat fields. */
export function parseStatblock(text: string): ParsedStatblock {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const raw = lines.join(' ');
  const segments = raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);

  let title = '';
  const fields: { key: string; value: string }[] = [];
  const notes: string[] = [];
  let monsterScore = 0;
  let npcScore = 0;

  const nameMatch = /^(?:name|nome)\s*:\s*(.+)$/i.exec(segments[0] ?? '');
  if (nameMatch) {
    title = nameMatch[1].trim();
    segments.shift();
  } else if (lines[0] && !/[:–-]/.test(lines[0])) {
    title = lines[0].slice(0, 60);
  }

  for (const seg of segments) {
    const kv = /^([A-Za-zÀ-ÿ# ]{1,16})\s*[:–-]\s*(.+)$/.exec(seg);
    if (kv) {
      const key = kv[1].trim();
      const value = kv[2].trim();
      const lk = key.toLowerCase();
      if (EQUIPMENT_WORDS.has(lk)) {
        notes.push(`${key}: ${value}`);
        continue;
      }
      if (STAT_KEYS.has(lk) || (key.length <= 4 && /[\dd]/.test(value))) {
        fields.push({ key: key.toUpperCase(), value });
        if (MONSTER_HINTS.has(lk)) monsterScore++;
        if (NPC_HINTS.has(lk)) npcScore++;
        continue;
      }
      if (/^[FM]\d+$/i.test(value)) {
        fields.push({ key: 'Classe/Nível', value });
        npcScore++;
        continue;
      }
      fields.push({ key, value });
      continue;
    }
    notes.push(seg);
  }

  return {
    title: title || 'Ficha extraída',
    tag: monsterScore >= npcScore ? 'monster' : 'npc',
    fields,
    notes: notes.join('. '),
  };
}
