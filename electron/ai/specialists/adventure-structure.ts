// Adventure skeleton: hooks, tension clock, prerequisite-linked scenes, climax.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { ADVENTURE_STRUCTURE_SCHEMA, parseAdventureStructure, type AdventureStructure, type Premise } from './schemas';

export interface AdventureStructureInput {
  pedido: string;
  premissa: Premise;
  /** critic feedback, when re-running after review */
  revisao?: string;
}

export const adventureStructureSpecialist: Specialist<AdventureStructureInput, AdventureStructure> = {
  id: 'adventure-structure',
  description: 'Cria o esqueleto de uma aventura: ganchos, relógio de tensão, cenas interligadas, clímax e recompensas.',
  temperature: 0.7,
  maxTokens: 4096,
  schema: ADVENTURE_STRUCTURE_SCHEMA,

  buildPrompt(input: AdventureStructureInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em estrutura de aventuras do Mythril. Você cria esqueletos de aventura ' +
          'empolgantes e jogáveis para RPG de mesa.\n\n' +
          'Regras:\n' +
          '- Ganchos devem se conectar ao cânone do universo (facções, NPCs, eventos das notas) sempre que possível.\n' +
          '- O relógio de tensão cria urgência: o mundo piora se os personagens hesitarem.\n' +
          '- Cenas NÃO são uma fila linear: use preRequisitos para indicar dependências, permitindo que o mestre ' +
          'as aborde em ordens diferentes. 3 a 6 cenas.\n' +
          '- Cada cena precisa de um objetivo claro para os jogadores e um local evocativo.\n' +
          '- Consequências de falha devem ser interessantes (falhar move a história, não a encerra).\n' +
          '- O clímax deve colocar o tema da premissa em jogo.\n' +
          '- Recompensas: narrativas primeiro (aliados, acesso, reputação), materiais depois.\n' +
          '- Nomes próprios novos: use nomes provisórios simples; outro especialista cuidará dos nomes.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content:
          `Pedido do mestre: ${input.pedido}\n\n` +
          `Premissa refinada: tema "${input.premissa.tema}", tom ${input.premissa.tom}, ` +
          `escopo: ${input.premissa.escopo}, ameaça ${input.premissa.nivelAmeaca}, ` +
          `duração ${input.premissa.duracaoEstimada}.\n\n` +
          (input.revisao ? `Revisão solicitada pelo crítico (corrija estes pontos):\n${input.revisao}\n\n` : '') +
          'Crie a estrutura chamando submit_result.',
      },
    ];
  },

  parse: parseAdventureStructure,
};
