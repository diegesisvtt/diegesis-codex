// Demon descriptions as a 5-paragraph reveal arc, inspired by the classic
// random-generator structure (a sound in the dark, the reveal, the head, the
// body, the approach, the final stare) but improved: the generator stitches
// random fragments together, so the creature contradicts itself — a "little"
// beast with "titanic" wings, fire hair on a frozen body. Here every paragraph
// describes the SAME demon, and the menace escalates logically toward the
// closing stare. Written read-aloud in second person, present tense.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { DEMON_SCHEMA, parseDemonDescription, type DemonDescription } from './schemas';

export interface DemonInput {
  /** free-form request, e.g. "um demônio menor das cinzas", "um lorde demoníaco colossal" */
  pedido: string;
}

export const demonSpecialist: Specialist<DemonInput, DemonDescription> = {
  id: 'demon',
  description:
    'Escreve descrições de demônios como uma revelação progressiva em 5 parágrafos (som na escuridão, olhos, cabeça, corpo, avanço e encarada final), em segunda pessoa, para o mestre ler em voz alta quando os personagens encontram a criatura.',
  temperature: 0.85,
  maxTokens: 2048,
  schema: DEMON_SCHEMA,

  buildPrompt(input: DemonInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em descrição de demônios do Mythril. Você escreve a REVELAÇÃO de um ' +
          'demônio como um arco de 5 parágrafos, em SEGUNDA PESSOA ("você") e PRESENTE, para o mestre ' +
          'ler em voz alta no momento do encontro.\n\n' +
          'Estrutura (cada parágrafo = 2 a 4 frases):\n' +
          '1. chegada: comece com um SOM na escuridão/névoa/cenário, depois a revelação súbita — "e de ' +
          'repente você está cara a cara com uma criatura de X e Y" (dois elementos infernais: cinzas e ' +
          'fúria, sombras e sangue...). Termine com os olhos que encaram o observador e um segundo som ' +
          'escapando da boca da criatura, como aviso ou desafio.\n' +
          '2. cabeca: o que coroa a cabeça (chifres, juba de fogo, sombras, penas de osso), o formato e ' +
          'textura do rosto, e o que escapa de suas narinas (fumaça, calor, cheiro de morte).\n' +
          '3. corpo: a cabeça sobre o corpo — porte, musculatura, e os detalhes do torso (cicatrizes, ' +
          'correntes fundidas na carne, runas brilhantes, rostos estranhos sob a pele) com uma nota de ' +
          'mistério sobre a origem ("talvez um resquício de tempos mais estranhos...").\n' +
          '4. movimento: a criatura AVANÇA — quantas pernas, como se movem, a energia do corpo ' +
          '(frenética, serena, ameaçadora). Opcionalmente uma cauda e o que ela faz.\n' +
          '5. presencaFinal: opcionalmente asas se abrindo com efeito (rajada de ar, sombra total), e o ' +
          'OLHAR FINAL: a criatura encara, ignora, se aproxima ou perde o interesse — o gancho de tensão ' +
          'que entrega a cena ao mestre.\n\n' +
          'Regras:\n' +
          '- COERÊNCIA ABSOLUTA entre os parágrafos: é UMA criatura só. Se é colossal no corpo, não é ' +
          'minúscula nas asas; se é de fogo, não emite frio. O tamanho, o elemento e o temperamento ' +
          'definidos na chegada ecoam até o final. É o que diferencia este texto de fragmentos aleatórios.\n' +
          '- Sensorial e específico: sons, cheiros, calor, texturas. Mostre, não nomeie — "o estalo de ' +
          'um chicote a cada movimento da cauda" em vez de "a cauda é perigosa".\n' +
          '- Varie o ritmo: frases curtas nos picos de ameaça, longas na descrição do corpo.\n' +
          '- O demônio é PRESENÇA, não stat block: nada de números, regras ou nome de sistema.\n' +
          '- Se o pedido indicar tamanho, elemento, hierarquia infernal ou papel (servo, lorde, isca, ' +
          'guardião), respeite; senão, invente.\n' +
          '- Respeite o cânone: a criatura deve caber no mundo estabelecido.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nEscreva a descrição do demônio chamando submit_result.`,
      },
    ];
  },

  parse: parseDemonDescription,
};
