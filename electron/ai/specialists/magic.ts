// Magic system creation distilled from the guide: source first (limited
// sources create conflict), materials, who wields (everyone vs. a few
// changes the whole society), how they wield (items = disarmable), the
// powers with relative costs, power growth with a ceiling, combining powers,
// and limitations — because limits are what create tension.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { MAGIC_SCHEMA, parseMagicSystem, type MagicSystem } from './schemas';

export interface MagicInput {
  /** free-form request, e.g. "magia de sangue das bruxas do pântano", "sistema de magia da campanha" */
  pedido: string;
}

export const magicSpecialist: Specialist<MagicInput, MagicSystem> = {
  id: 'magic',
  description:
    'Cria sistemas de magia: fonte (limitada ou não), materiais, quem empunha e como, poderes com custos relativos, ganho de poder com teto, combinação de poderes e as limitações que criam tensão.',
  temperature: 0.7,
  maxTokens: 2560,
  schema: MAGIC_SCHEMA,

  buildPrompt(input: MagicInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em sistemas de magia do Mythril. Magia boa é magia com REGRAS — as ' +
          'limitações são o que cria tensão.\n\n' +
          'Regras:\n' +
          '- FONTE PRIMEIRO: energia corporal, energia do ar, poder dos deuses, sangue, poços de magia, ' +
          'força vital mundial, artefatos — ou combinação. LIMITADA ou não muda tudo: fonte limitada cria ' +
          'conflito (o herói que gasta tudo antes de chegar ao vilão); ilimitada exige outros limites ' +
          '(habilidade, tipo). Escolha pela função na história.\n' +
          '- MATERIAIS: runas, cristais, artefatos, madeira especial, tatuagens — o que abriga ou canaliza ' +
          'poder.\n' +
          '- QUEM USA muda a sociedade: se todos usam, magia é cotidiano (guerra e lavar louça); se poucos ' +
          'usam, são elite ou pária — temidos ou cobiçados. Como um não-usuário luta contra um usuário? ' +
          'Espécies diferentes usam diferente (cultura, biologia, fontes distintas)? Quem não tem pode ' +
          'ganhar? Quem tem pode perder?\n' +
          '- COMO USA: gesto e fogo sai da mão, ou precisa de varinha/tomo/artefato? Item = usuário ' +
          'desarmado é impotente; corpo = dedos quebrados são uma fraqueza.\n' +
          '- PODERES COM CUSTOS RELATIVOS: não precisa de tabela exata, mas a lógica interna sim — a bola ' +
          'de fogo custa X, o teletransporte custa muito mais. Cuidado com o overpowered: feitiços ' +
          'absolutos geram furos de trama ("por que ele não usou isso antes?").\n' +
          '- GANHO DE PODER E TETO: treino, artefato, bênção, estudo — ok o herói crescer, mas defina o ' +
          'TETO: se no fim ele tem o dobro do mais forte do início, por que ninguém chegou lá antes?\n' +
          '- COMBINAÇÃO: poderes combinados em um só (luta como um único ser) ou coordenados sem fundir ' +
          '(timing, distração, cerco)? Rituais de invocação e teletransporte também mudam com isso.\n' +
          '- LIMITAÇÕES: sem limites, tudo pode acontecer — e nada importa. Custo, tipo oposto (fogo vs. ' +
          'água), energia corporal (fome, sono), nível de habilidade, maldições. Liste as deste sistema.\n' +
          '- Respeite o cânone: o sistema deve coexistir com o que as notas já estabelecem.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie o sistema de magia chamando submit_result.`,
      },
    ];
  },

  parse: parseMagicSystem,
};
