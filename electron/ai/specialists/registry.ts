// Specialist registry — mirrors providers/registry.ts.

import type { Specialist } from './base';
import { premiseSpecialist } from './premise';
import { adventureStructureSpecialist } from './adventure-structure';
import { namesSpecialist } from './names';
import { narrativeSpecialist } from './narrative';
import { npcSpecialist } from './npc';
import { encounterSpecialist } from './encounter';
import { criticSpecialist } from './critic';
import { demonSpecialist } from './demon';
import { dialogueSpecialist } from './dialogue';
import { plotSpecialist } from './plot';
import { combatSpecialist } from './combat';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BUILTIN_SPECIALISTS: Specialist<any, any>[] = [
  premiseSpecialist,
  adventureStructureSpecialist,
  namesSpecialist,
  narrativeSpecialist,
  npcSpecialist,
  encounterSpecialist,
  criticSpecialist,
  demonSpecialist,
  dialogueSpecialist,
  plotSpecialist,
  combatSpecialist,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, Specialist<any, any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerSpecialist(spec: Specialist<any, any>): void {
  registry.set(spec.id, spec);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSpecialist(id: string): Specialist<any, any> | null {
  return registry.get(id) ?? null;
}

for (const s of BUILTIN_SPECIALISTS) registerSpecialist(s);
