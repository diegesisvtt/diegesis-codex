// World shaping distilled from the guide: geography-first method. Plan the
// overall shape, lay down natural elements (mountains, rivers with logical
// flow, height/depth), derive weather and seasons, place nature that matches
// climate, add civilizations with infrastructure and neighbor relations,
// scatter visible history, phenomena, and daily-life traces. Rules may be
// broken — but broken elements must still fit the world.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { WORLD_SCHEMA, parseWorldShape, type WorldShape } from './schemas';

export interface WorldInput {
  /** free-form request, e.g. "um continente para a campanha", "a região ao redor da capital" */
  pedido: string;
}

export const worldSpecialist: Specialist<WorldInput, WorldShape> = {
  id: 'world',
  description:
    'Desenha mundos e regiões com método geografia-primeiro: relevo, rios lógicos, clima e estações, natureza coerente, civilizações, história visível na paisagem, fenômenos e traços de vida cotidiana.',
  temperature: 0.75,
  maxTokens: 2560,
  schema: WORLD_SCHEMA,

  buildPrompt(input: WorldInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em criação de mundos do Diegesis Codex. Você constrói geografias que PARECEM ' +
          'naturais porque cada elemento afeta os outros.\n\n' +
          'Método (geografia-primeiro):\n' +
          '1. GEOGRAFIA: comece pela forma da terra — costas (praias? penhascos? mangues?), montanhas, ' +
          'rios com fluxo LÓGICO (nascem nas montanhas, deságuam no mar), lagos junto às cordilheiras, ' +
          'altos e baixos (penhascos, fiordes, ravinas, vulcões, a montanha solitária visível a léguas). ' +
          'Relevo é ferramenta de história: exércitos se encontram em planície ou colina?\n' +
          '2. CLIMA E ESTAÇÕES: o relevo cria o clima — a tempestade do noroeste sobe a cordilheira e vira ' +
          'neve; os mangues são quentes e úmidos porque a chuva chega lá. Defina as estações de cada ' +
          'região: quantas? suaves ou monções? A primavera é alívio ou inverno menos frio?\n' +
          '3. NATUREZA: plantas e animais coerentes com o clima — árvores de raiz profunda e folhas ' +
          'pequenas na terra dos ventos; sem animais de sangue frio na tundra (a menos que haja fontes ' +
          'termais). Inclua CADEIAS ALIMENTARES: uma região só de predadores não se sustenta.\n' +
          '4. CIVILIZAÇÕES: assentamentos + o que os sustenta (fazendas, minas, estradas, portos, ' +
          'fronteiras). RELAÇÕES ENTRE VIZINHOS marcam a paisagem: guerra = muralhas, postos avançados, ' +
          'crateras e campos de destroços; paz = rotas comerciais, pontes, embaixadas.\n' +
          '5. HISTÓRIA VISÍVEL: a paisagem conta o passado — a torre destruída que virou playground das ' +
          'crianças, o campo de espadas enferrujadas, as ruínas que ninguém sabe explicar.\n' +
          '6. FENÔMENOS: desastres naturais moldam a arquitetura (casas fortes ou descartáveis); fenômenos ' +
          '(eclipses, cometas, auroras) viram religião ou espetáculo. Elementos que QUEBRAM AS REGRAS ' +
          '(ilhas flutuantes, árvore-mundo, lua próxima demais) são bem-vindos — mas devem se encaixar ' +
          'no mundo como os elementos realistas.\n' +
          '7. VIDA COTIDIANA: os pequenos traços — a toca do urso na colina, o lago onde os animais ' +
          'bebem, o ponto no alto do morro onde os jovens se encontram, a caverna atrás da cachoeira.\n\n' +
          'Regras:\n' +
          '- Coerência causal acima de tudo: cada região deve fazer sentido à luz das vizinhas.\n' +
          '- Escala conforme o pedido: um reino ou um continente — o método é o mesmo.\n' +
          '- Respeite o cânone: se as notas já mapeiam partes do mundo, integre-as, não as contradiga.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nDesenhe o mundo chamando submit_result.`,
      },
    ];
  },

  parse: parseWorldShape,
};
