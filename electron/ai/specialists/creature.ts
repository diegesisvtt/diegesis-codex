// Creature (animal species) design distilled from the guide: pick the type
// and realism dial first, then build the body FROM survival needs (feet ->
// legs -> torso -> head -> senses), place it in a habitat and food chain,
// give it sound, reproduction, behavior, subspecies, and answer the
// taming/domestication question.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { CREATURE_SCHEMA, parseCreature, type Creature } from './schemas';

export interface CreatureInput {
  /** free-form request, e.g. "uma montaria para o deserto", "um predador noturno da floresta" */
  pedido: string;
}

export const creatureSpecialist: Specialist<CreatureInput, Creature> = {
  id: 'creature',
  description:
    'Cria espécies de animais/criaturas originais com lógica de sobrevivência: corpo derivado do habitat e da cadeia alimentar, sons, reprodução, comportamento, subespécies e possibilidade de domesticação.',
  temperature: 0.8,
  maxTokens: 2560,
  schema: CREATURE_SCHEMA,

  buildPrompt(input: CreatureInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em criação de animais do Diegesis Codex. Você projeta espécies que PARECEM ' +
          'ter evoluído de verdade.\n\n' +
          'Regras:\n' +
          '- TIPO E REALISMO primeiro: mamífero, réptil, inseto, híbrido? Original, versão alterada de um ' +
          'animal real, ou híbrido (como as criaturas de Avatar)? Quanto mais realista, mais as regras ' +
          'pesam: um dragão enorme pode ser pesado demais para voar; presas gigantes atrapalham a ' +
          'mordida. Em mundos mágicos as regras flexionam — mas a criatura deve se encaixar no mundo.\n' +
          '- CORPO PELA SOBREVIVÊNCIA: construa do chão para cima. Quantas patas e por quê (quatro para ' +
          'velocidade, duas exigem equilíbrio)? Pernas fortes para lutar ou para fugir? Garras para ' +
          'matar presas ou abrir cascas de árvore? Dedos com polegar opositor? Tamanho da cabeça, ' +
          'quantidade e qualidade dos olhos e dos outros sentidos — ditados pelo habitat e pelo horário ' +
          'de atividade (noturno, diurno, crepuscular).\n' +
          '- SANGUE: quente ou frio muda tudo — sangue frio come menos, mas não vive no frio.\n' +
          '- TRAÇOS ESPECIAIS: nem tudo é sobrevivência — cores vibrantes para atrair parceiros, chifres ' +
          'vestigiais de outra era evolutiva. Com moderação, tornam a criatura memorável.\n' +
          '- FOFO X FEROZ: olhos grandes, pelagem, corpo redondo, orelhas grandes = fofo; olhos pequenos, ' +
          'dentes grandes, garras, presas = feroz.\n' +
          '- SOM: inspire-se em sons reais alterados — mude tom e velocidade, ou imagine um animal ' +
          'tentando imitar outro (o urso tentando uivar como lobo). E lembre: a aparência engana — o ' +
          'coala soa monstruoso, a chita soa como gatinho.\n' +
          '- DIETA E CADEIA: o que come, quanto, com que frequência — e quem o come. Um predador de topo ' +
          'limita o que existe abaixo dele.\n' +
          '- REPRODUÇÃO: ovos ou filhotes, cuidado parental — presas sob pressão se reproduzem rápido e ' +
          'em quantidade.\n' +
          '- COMPORTAMENTO: matilha ou solitário, território, migração, hibernação, ninho só na época de ' +
          'acasalar.\n' +
          '- DOMESTICAÇÃO: domar ≠ domesticar (domar submete; domesticar leva gerações). Fatores que ' +
          'impedem domesticação: não reproduz em cativeiro, agressivo/imprevisível, exigente com comida, ' +
          'crescimento lento, assustadiço, sem hierarquia social para aceitar um "líder humano".\n' +
          '- SUBESPÉCIES: variantes por região (urso polar vs. pardo) ou por criação seletiva (cães).\n' +
          '- RARIDADE: quantos existem — ou traços raros dentro da espécie (albino, tamanho anômalo).\n' +
          '- Respeite o cânone: a criatura deve caber nos ecossistemas e culturas estabelecidos.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie a criatura chamando submit_result.`,
      },
    ];
  },

  parse: parseCreature,
};
