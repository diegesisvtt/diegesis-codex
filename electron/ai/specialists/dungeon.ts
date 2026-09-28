// Dungeon design distilled from the 40 dungeon location ideas: every good
// dungeon has a concept (not just "a hole with monsters"), an origin (who
// built it and why — or what nature carved), a structure, inhabitants, a
// twist that redefines the place, and rewards that cost something.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { DUNGEON_SCHEMA, parseDungeonDesign, type DungeonDesign } from './schemas';

export interface DungeonInput {
  /** free-form request, e.g. "dungeon submersa", "tumba de um rei louco", "dungeon de nível alto no vulcão" */
  pedido: string;
}

export const dungeonSpecialist: Specialist<DungeonInput, DungeonDesign> = {
  id: 'dungeon',
  description:
    'Cria dungeons e lugares de exploração: conceito central, origem (quem construiu e por quê), estrutura e salas notáveis, habitantes e encontros, a reviravolta que a torna única e as recompensas (e seu custo).',
  temperature: 0.85,
  maxTokens: 2560,
  schema: DUNGEON_SCHEMA,

  buildPrompt(input: DungeonInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em dungeons do Mythril. Dungeon boa tem CONCEITO e REVIRAVOLTA — ' +
          'buraco cheio de monstro qualquer um faz.\n\n' +
          'Regras:\n' +
          '- CONCEITO CENTRAL: a dungeon em uma frase que a diferencia de todas as outras — a mina ' +
          'onde os anões cavaram fundo demais, o farol que guia navios para as rochas, o templo ' +
          'afogado onde os sacerdotes ainda cantam.\n' +
          '- ORIGEM: quem construiu e para quê? Ou o que a natureza escavou? A função original ' +
          'define o layout e o que sobrou — e quase nunca é "ser dungeon".\n' +
          '- ESTRUTURA: salas e níveis notáveis, não lista exaustiva. Cada área deve ter uma ideia ' +
          'própria (a sala onde X acontece). Mapeie o fluxo: entrada, o coração do lugar, o fundo.\n' +
          '- HABITANTES: quem vive ali AGORA e por quê? Não só monstros soltos — facções, ecologias, ' +
          'prisioneiros, cultos. O que eles fazem quando os intrusos não estão olhando?\n' +
          '- REVIRAVOLTA: o que ressignifica o lugar — o vilão da dungeon é quem pediu ajuda, o ' +
          'tesouro é a prisão de algo, os monstros são os guardiões originais. A melhor dungeon muda ' +
          'de significado quando explorada de verdade.\n' +
          '- RECOMPENSAS COM PESO: o que vale a pena levar — e o que custa. Tesouro amaldiçoado, ' +
          'conhecimento proibido, aliado inesperado. Recompensa sem custo é esquecível.\n' +
          '- Respeite o cânone: encaixe a dungeon na história e geografia já estabelecidas quando houver.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie a dungeon chamando submit_result.`,
      },
    ];
  },

  parse: parseDungeonDesign,
};
