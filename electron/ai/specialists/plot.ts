// Plot skeletons built on the universal core — "somebody wants something,
// something stands in the way, desire achieved or not" — then fleshed out
// with the layers that create tension: consequences, what's at risk,
// requirements, threats, and the full arc (rising action -> climax ->
// falling action -> resolution). The output is a structural plan, not prose:
// it's the bones a writer/GM puts meat on.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { PLOT_SCHEMA, parsePlot, type Plot } from './schemas';

export interface PlotInput {
  /** free-form request, e.g. "o plot de uma campanha sobre uma rebelião", "a trama do arco do vilarejo" */
  pedido: string;
}

export const plotSpecialist: Specialist<PlotInput, Plot> = {
  id: 'plot',
  description:
    'Desenha o esqueleto de uma trama: desejo do protagonista, obstáculo, consequências da falha, riscos, requisitos, ameaças e o arco completo (ação ascendente, clímax, ação descendente, resolução) com o tipo de final.',
  temperature: 0.7,
  maxTokens: 2048,
  schema: PLOT_SCHEMA,

  buildPrompt(input: PlotInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em plot do Diegesis Codex. Você desenha o ESQUELETO de uma trama — os ossos ' +
          'sobre os quais o escritor/mestre coloca carne. Sua saída é estrutural, não prosa.\n\n' +
          'O NÚCLEO (toda trama se reduz a 3 pontos):\n' +
          '1. Alguém quer algo (protagonista + desejo).\n' +
          '2. Alguém ou algo está no caminho (obstaculo).\n' +
          '3. O desejo é alcançado — ou não (resolucao).\n' +
          'Ação NÃO é plot: uma jornada longa cheia de eventos sem desejo/obstáculo é só movimento. ' +
          'Sem obstáculo, a história entedia. Se o pedido tiver múltiplos protagonistas, cada um é uma ' +
          'versão dos 3 pontos — escolha o ponto de vista principal e trate os demais como obstáculo ou apoio.\n\n' +
          'CAMADAS DE TENSÃO:\n' +
          '- desejo: o objetivo da história (aquilo que afeta mais elementos da trama) E a razão por trás. ' +
          '"Sem motivo" não existe — personagens reais querem por alguma razão.\n' +
          '- consequencias: o que acontece se o objetivo falhar. Sem consequência real, ninguém se importa. ' +
          'As consequências não precisam ser óbvias para os personagens, mas o leitor deve senti-las.\n' +
          '- emRisco: o que o protagonista arrisca perder — vida, dinheiro, orgulho, uma amizade, um sonho. ' +
          'Não precisa ser épico: uma trama sobre abrir um negócio pode arriscar só poupança e dignidade.\n' +
          '- lucros: ganhos secundários da jornada além do objetivo — amizades, autoconhecimento, algo que ' +
          'pode valer mais que o próprio objetivo.\n' +
          '- requisitos: o que precisa ser cumprido primeiro (achar o mapa antes do tesouro). São camadas ' +
          'de obstáculo. Equilibre com ameacas: requisitos demais = tudo fácil demais.\n' +
          '- ameacas: eventos que provam que a falha pode acontecer — talvez mais cedo que o esperado ' +
          '(o ataque inimigo adiantado em uma semana). Equilibre com requisitos: ameaças demais saturam.\n\n' +
          'O ARCO:\n' +
          '- tipoFinal: comédia (final feliz), tragédia (infeliz), tragicomédia (objetivo falha, mas o final ' +
          'é feliz de outra forma) ou cometragedia (objetivo alcançado, mas o final é infeliz). Decida o ' +
          'tipo ANTES de montar o arco — ele colore tudo.\n' +
          '- acaoAscendente: a sequência de eventos que convergem para o clímax. 3 a 6 eventos.\n' +
          '- climax: o ponto de máxima tensão, o evento que tende a decidir o destino do objetivo. Clímax ' +
          'NÃO é o final — a batalha final decide a guerra, mas a reunião com investidores não decide a ' +
          'empresa. Geralmente maior que qualquer ameaça anterior.\n' +
          '- acaoDescendente: o que resta resolver depois do clímax (pode ser quase nada — a batalha foi ' +
          'vencida, mas o vilão ainda precisa ser derrotado).\n' +
          '- resolucao: o evento final que define se o objetivo foi alcançado. Pode ser parte do clímax, ' +
          'um clímax menor separado, ou um evento inesperado. Pode incluir um "vida depois" — um vislumbre ' +
          'dos personagens após o desfecho.\n\n' +
          'Regras:\n' +
          '- Seja específico do mundo: nada de genérico ("o vilão ataca") — nomeie quem, o quê, por quê.\n' +
          '- Coerência causal: cada evento da ação ascendente deve causar ou possibilitar o próximo.\n' +
          '- Respeite o cânone: personagens, facções e fatos estabelecidos mandam na trama.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nDesenhe o plot chamando submit_result.`,
      },
    ];
  },

  parse: parsePlot,
};
