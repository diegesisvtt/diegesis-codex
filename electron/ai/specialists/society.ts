// Society creation distilled from the guide: every society needs a reason
// for being the way it is, rulers with a believable path to power, law &
// order that reflects daily life, religion, traditions (including dark ones),
// culture, struggles (even utopias have them) and the hidden cost behind
// the positives. Absence is meaningful too — a society without art says
// something.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { SOCIETY_SCHEMA, parseSociety, type Society } from './schemas';

export interface SocietyInput {
  /** free-form request, e.g. "a sociedade dos clãs do norte", "uma distopia teocrática" */
  pedido: string;
}

export const societySpecialist: Specialist<SocietyInput, Society> = {
  id: 'society',
  description:
    'Cria sociedades fictícias completas: razão de ser histórica, governantes e como chegaram ao poder, lei e ordem, religião, tradições, cultura, conflitos internos e o custo escondido das coisas boas.',
  temperature: 0.75,
  maxTokens: 2560,
  schema: SOCIETY_SCHEMA,

  buildPrompt(input: SocietyInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em sociedades do Mythril. Sociedades fictícias parecem vazias quando ' +
          'faltam as camadas que respondem "como é VIVER aqui?".\n\n' +
          'Regras:\n' +
          '- RAZÃO DE SER: toda sociedade é assim por uma CAUSA histórica. Orcs brutais porque matar o ' +
          'líder é o único caminho ao poder; a distopia nasceu de corporações que compraram o governo; ' +
          'os elfos gentis se creem os primogênitos dos deuses. "É assim porque a história precisa" é ' +
          'proibido.\n' +
          '- GOVERNANTES: quem manda e COMO chegou lá — linhagem, voto, força bruta, conspiração. O tipo ' +
          'de líder reflete a sociedade que o produziu (ou que o teme).\n' +
          '- LEI E ORDEM: como a lei é aplicada diz como é viver ali. Rigor? Corrupção — e por quê (sem ' +
          'recursos ou sem freio)? O público respeita ou teme? Guarda visível ou agentes infiltrados? ' +
          'As pessoas fazem justiça com as próprias mãos?\n' +
          '- RELIGIÃO: como afeta a vida diária, a lei e o trono — e o que acontece com quem não segue, ' +
          'ou quando religiões rivais dividem influência.\n' +
          '- TRADIÇÕES: revelam valores — feriados, gestos de saudação, ritos de casamento e passagem. ' +
          'Inclua as sombrias quando couber: sacrifícios, duelos para resolver disputas.\n' +
          '- CULTURA E LAZER: música, comida, arte, esportes. A recreação REFLETE o estado da sociedade — ' +
          'jogos amistosos em tempos calmos, arenas de gladiadores nas brutais, megaeventos para ' +
          'distrair o povo nas distopias.\n' +
          '- CONFLITOS: toda sociedade tem tensões — desigualdade, guerras, ou só "esta tecnologia nova ' +
          'deve substituir a antiga?" numa utopia. Sociedade sem conflito é sociedade morta.\n' +
          '- O CUSTO ESCONDIDO: por trás de cada coisa boa, um preço. Os monumentos foram erguidos por ' +
          'mãos honestas ou escravas? A segurança custa tortura? Responda "a que custo?".\n' +
          '- AUSÊNCIA TAMBÉM É RESPOSTA: se a sociedade não tem arte, música ou festa — diga o porquê ' +
          '(proibido? considerado desperdício?).\n' +
          '- Respeite o cânone: a sociedade deve encaixar no mundo e nas culturas estabelecidas.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie a sociedade chamando submit_result.`,
      },
    ];
  },

  parse: parseSociety,
};
