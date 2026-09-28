// Universe history distilled from the guide: things CHANGE over time (no
// static thousand-year empires — even Rome was unrecognizable across its
// own lifespan), truth vs. perspective drives tension and culture, relics
// of the past serve the present story, and the amount of history is a
// balance — too little makes the world feel born yesterday, too much
// drowns the main story.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { HISTORY_SCHEMA, parseWorldHistory, type WorldHistory } from './schemas';

export interface HistoryInput {
  /** free-form request, e.g. "a história do império caído", "mil anos deste reino" */
  pedido: string;
}

export const historySpecialist: Specialist<HistoryInput, WorldHistory> = {
  id: 'history',
  description:
    'Cria a história de um universo: eras que mudam de verdade, verdade vs. perspectiva dos povos, relíquias do passado no presente e o equilíbrio entre informação demais e de menos.',
  temperature: 0.7,
  maxTokens: 2560,
  schema: HISTORY_SCHEMA,

  buildPrompt(input: HistoryInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em história de universos do Diegesis Codex. Mundos sem passado parecem ter ' +
          'nascido ontem; passados que não mudam nada parecem cápsulas do tempo.\n\n' +
          'Regras:\n' +
          '- NADA É ESTÁTICO: no nosso mundo, só 27 de ~166 impérios passaram de 500 anos, e nenhum sem ' +
          'mudanças profundas. Roma foi quase oposta a si mesma em diferentes eras. Cada era deve ter ' +
          'crescimento, colapso, mudança política, pragas, rupturas. Espécies longevas podem ser a ' +
          'exceção proposital (elfos com impérios milenares; anões estáveis como a pedra que habitam).\n' +
          '- VERDADE VS. PERSPECTIVA: o que aconteceu ≠ o que acreditam que aconteceu. Dois povos com ' +
          'versões opostas do mesmo evento = tensão pronta. Perspectiva também vira cultura: o raio ' +
          'venerado como punição divina, os "pais fundadores" que talvez fossem mentirosos.\n' +
          '- RELÍQUIAS: o passado deixa marcas — ruínas, monumentos, campos de batalha antigos. Mas ' +
          'coerência: uma cidade totalmente destruída não guarda relíquias do antes. E relíquias têm ' +
          'USO hoje: turismo, playground de criança, peça de cenário onde personagens se encontram.\n' +
          '- PASSADO NO PRESENTE: como a história aflora na trama atual — profecias, dívidas antigas, ' +
          'ressentimentos vivos.\n' +
          '- MEDIDA CERTA: nem tão pouco que falte contexto, nem tanto que o passado ofusque o presente ' +
          '(o risco Tolkien: as maiores batalhas já aconteceram — e é o contraste que dá grandeza aos ' +
          'pequenos de agora). Cada fato deve responder: contribui para a história? Ela funciona sem ele?\n' +
          '- Em "eras", 3 a 6 eras nomeadas com seus eventos e MUDANÇAS.\n' +
          '- Respeite o cânone: a história deve se encaixar nos fatos estabelecidos.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie a história chamando submit_result.`,
      },
    ];
  },

  parse: parseWorldHistory,
};
