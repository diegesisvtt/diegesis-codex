// Unique location design distilled from the location/city idea collections
// (40 RPG locations + 30 cities & towns): concept/theme first — a place is
// memorable when it has ONE strong idea (the City of Masks, Medusa's Lake,
// the city built in a dead titan) — then what life there is like, its
// peculiar challenges, and the story hooks it offers. Includes the "City of
// X" nickname pattern.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { LOCATION_SCHEMA, parseLocationDesign, type LocationDesign } from './schemas';

export interface LocationInput {
  /** free-form request, e.g. "uma cidade no deserto", "local estranho para uma sessão", "vila com segredo" */
  pedido: string;
}

export const locationSpecialist: Specialist<LocationInput, LocationDesign> = {
  id: 'location',
  description:
    'Cria locais únicos e memoráveis (cidades, vilas, ruínas, marcos): um conceito central forte, apelido no estilo "A Cidade de X", vida cotidiana, desafios peculiares e ganchos de história. Para a cidade realista completa (população, estrutura, economia), use city.',
  temperature: 0.9,
  maxTokens: 2048,
  schema: LOCATION_SCHEMA,

  buildPrompt(input: LocationInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em locais memoráveis do Mythril. Um lugar fica na memória por UMA ' +
          'ideia forte — o resto é consequência.\n\n' +
          'Regras:\n' +
          '- CONCEITO PRIMEIRO: ache a ideia central que ninguém esquece — a cidade construída num ' +
          'titã morto, o lago onde uma medusa petrifica quem olha, a vila que só existe à noite, o ' +
          'mercado onde se vendem memórias. Uma frase que vende o lugar.\n' +
          '- APELIDO NO ESTILO "A CIDADE DE X": todo lugar memorável tem um apelido que o mundo usa — ' +
          '"A Cidade das Máscaras", "A Cidade Dourada", "O Porto dos Náufragos". O apelido deve ' +
          'capturar o conceito.\n' +
          '- VIDA COTIDIANA: como é viver ou visitar ali? Rotina, costumes, atmosfera, o que surpreende ' +
          'um forasteiro. O conceito deve aparecer no dia a dia, não só no cartão-postal.\n' +
          '- DESAFIOS PECULIARES: regras estranhas, perigos próprios, preços a pagar — o que torna o ' +
          'lugar difícil ou perigoso de um jeito que só esse lugar é.\n' +
          '- GANCHOS DE HISTÓRIA: 3-5 ganchos que esse lugar oferece — o lugar deve gerar aventuras ' +
          'por si só, sem esforço do GM.\n' +
          '- CONSEQUÊNCIAS LÓGICAS: se a cidade é de ladrões, quem mantém a ordem? Se o lago ' +
          'petrifica, como pescam? Responda as perguntas óbvias que o conceito levanta.\n' +
          '- Respeite o cânone: encaixe o lugar na geografia e culturas já estabelecidas quando houver.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie o local chamando submit_result.`,
      },
    ];
  },

  parse: parseLocationDesign,
};
