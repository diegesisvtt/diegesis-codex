// Encounter/monster generation — system-agnostic (no stats): narrative threat,
// behavior, tactics and environment.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { ENCOUNTER_SCHEMA, parseEncounter, type Encounter, type Scene } from './schemas';

export interface EncounterInput {
  /** free-form request when standalone ("um encontro num pântano") */
  pedido: string;
  /** the scene this encounter belongs to, when inside an adventure pipeline */
  cena?: Scene;
  /** critic feedback, when re-running after review */
  revisao?: string;
}

export const encounterSpecialist: Specialist<EncounterInput, Encounter> = {
  id: 'encounter',
  description:
    'Cria encontros e monstros agnósticos de sistema: descrição, comportamento, tática narrativa e uso do ambiente.',
  temperature: 0.7,
  maxTokens: 1536,
  schema: ENCOUNTER_SCHEMA,

  buildPrompt(input: EncounterInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em encontros do Diegesis Codex. Você cria confrontos e criaturas para RPG de mesa.\n\n' +
          'Regras:\n' +
          '- NÃO inclua estatísticas de jogo (PV, CA, dados de dano) — o mestre adapta ao sistema dele.\n' +
          '- Encontros bons não são só "monstros atacam": dê aos monstros um desejo (território, fome, ordens) ' +
          'e uma tática que reflita quem eles são (emboscada, fuga, negociação, sacrifício).\n' +
          '- ameaca: descreva o perigo narrativamente ("mortal para um grupo desprevenido") e sugira saídas ' +
          'não-violentas quando couber.\n' +
          '- ambiente: como o cenário entra na luta (terreno, perigos, oportunidades).\n' +
          '- Respeite o cânone: criaturas devem caber no mundo estabelecido.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content:
          (input.cena
            ? `Crie um encontro para a cena "${input.cena.nome}" (${input.cena.local}). ` +
              `Objetivo da cena: ${input.cena.objetivo}.\n` +
              (input.pedido ? `Orientação do mestre: ${input.pedido}\n` : '')
            : `Pedido: ${input.pedido}\n`) +
          (input.revisao ? `\nRevisão solicitada pelo crítico:\n${input.revisao}\n` : '') +
          '\nCrie o encontro chamando submit_result.',
      },
    ];
  },

  parse: parseEncounter,
};
