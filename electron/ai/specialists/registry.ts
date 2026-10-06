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
import { painSpecialist } from './pain';
import { villainSpecialist } from './villain';
import { motivationSpecialist } from './motivation';
import { bodyLanguageSpecialist } from './body-language';
import { worldSpecialist } from './world';
import { societySpecialist } from './society';
import { creatureSpecialist } from './creature';
import { innerStorySpecialist } from './inner-story';
import { historySpecialist } from './history';
import { characterSpecialist } from './character';
import { citySpecialist } from './city';
import { titlesSpecialist } from './titles';
import { romanceSpecialist } from './romance';
import { scenerySpecialist } from './scenery';
import { sceneSpecialist } from './scene';
import { speechSpecialist } from './speech';
import { openingSpecialist } from './opening';
import { religionSpecialist } from './religion';
import { magicSpecialist } from './magic';
import { armySpecialist } from './army';
import { campaignStartSpecialist } from './campaign-start';
import { moodSpecialist } from './mood';
import { questSpecialist } from './quest';
import { locationSpecialist } from './location';
import { dungeonSpecialist } from './dungeon';
import { tableExtractSpecialist } from './table-extract';
import { sheetEffectSpecialist } from './sheet-effect';

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
  painSpecialist,
  villainSpecialist,
  motivationSpecialist,
  bodyLanguageSpecialist,
  worldSpecialist,
  societySpecialist,
  creatureSpecialist,
  innerStorySpecialist,
  historySpecialist,
  characterSpecialist,
  citySpecialist,
  titlesSpecialist,
  romanceSpecialist,
  scenerySpecialist,
  sceneSpecialist,
  speechSpecialist,
  openingSpecialist,
  religionSpecialist,
  magicSpecialist,
  armySpecialist,
  campaignStartSpecialist,
  moodSpecialist,
  questSpecialist,
  locationSpecialist,
  dungeonSpecialist,
  tableExtractSpecialist,
  sheetEffectSpecialist,
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
