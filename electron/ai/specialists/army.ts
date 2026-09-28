// Army creation distilled from the guide: leadership first (the ruler's
// personality shapes everything), culture-appropriate ranks and divisions
// (including the non-obvious ones: veterinary, administration, anti-mage,
// morale), experience and tactics, special forces and the means to train
// them, armor/weapons vs. economy, logistics (population sustains armies),
// and recruitment — voluntary, wartime conscription, permanent draft or
// no standing army at all.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { ARMY_SCHEMA, parseArmyDesign, type ArmyDesign } from './schemas';

export interface ArmyInput {
  /** free-form request, e.g. "exército do império do norte", "guarda da cidade livre" */
  pedido: string;
}

export const armySpecialist: Specialist<ArmyInput, ArmyDesign> = {
  id: 'army',
  description:
    'Cria exércitos e forças militares: liderança, patentes e divisões próprias da cultura (incluindo as não óbvias), táticas e experiência, forças especiais, equipamento vs. economia, logística e recrutamento.',
  temperature: 0.8,
  maxTokens: 2560,
  schema: ARMY_SCHEMA,

  buildPrompt(input: ArmyInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em exércitos e forças militares do Diegesis Codex. Um exército bom é uma ' +
          'ORGANIZAÇÃO VIVA, não uma pilha de soldados.\n\n' +
          'Regras:\n' +
          '- LIDERANÇA PRIMEIRO: quem manda no exército? Sua personalidade, seus conselheiros, seu ' +
          'estilo — isso muda tudo abaixo. Um líder paranóico tem divisões de inteligência; um ' +
          'glorioso tem guarda de honra.\n' +
          '- PATENTES COM CARA PRÓPRIA: não copie soldado/sargento/capitão. Adapte à cultura: ' +
          'patentes por animal ("Capitão-Lobo"), por função ("Mestre de Cerco"), por mérito, por ' +
          'linhagem. Cada patente deve dizer algo sobre a sociedade.\n' +
          '- DIVISÕES ALÉM DO ÓBVIO: infantaria e cavalaria qualquer um tem. Pense nas outras: ' +
          'veterinária (quem cuida dos cavalos?), administração (quem paga e alimenta?), engenharia, ' +
          'inteligência, moral, anti-magos, capelães, bandos de guerra, logística. As divisões ' +
          '"invisíveis" são o que faz o exército parecer real.\n' +
          '- TÁTICAS E EXPERIÊNCIA: tropas verdes ou veteranos? Estilo de combate — formações ' +
          'disciplinadas, guerrilha, choque de cavalaria, magia de batalha? Isso deve combinar com ' +
          'o terreno e a história do povo.\n' +
          '- FORÇAS ESPECIAIS: existem? Quais os meios de treiná-las e equipá-las — e quem as controla?\n' +
          '- EQUIPAMENTO VS. ECONOMIA: armadura de placas completa é cara. O que esse mundo pode ' +
          'pagar? A qualidade do equipamento diz quanto o líder investe nas tropas — ou o contrário.\n' +
          '- LOGÍSTICA: exércitos marcham de estômago. Como a população e a economia sustentam essa ' +
          'força? Um exército grande demais para o país é um problema de trama pronto.\n' +
          '- RECRUTAMENTO: voluntários? Recrutamento temporário só em guerra? Alistamento permanente? ' +
          'Ou nenhum exército de pé — milícias, mercenários, guardas locais? Cada opção tem ' +
          'consequências sociais.\n' +
          '- Respeite o cânone: se o mundo já estabelece culturas, magia ou economia, o exército ' +
          'deve ser consequência disso.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie o exército chamando submit_result.`,
      },
    ];
  },

  parse: parseArmyDesign,
};
