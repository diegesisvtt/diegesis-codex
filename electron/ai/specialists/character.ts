// Full character creation distilled from the guide: characters are shaped
// by (or deliberately contrast) their world, interesting means different in
// some way, stereotypes are clay to mold — not a final shape, flaws make
// genuine, contradictions intrigue, desire needs a why, quirks show emotion,
// and a character is never "finished".

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { CHARACTER_SCHEMA, parseCharacterProfile, type CharacterProfile } from './schemas';

export interface CharacterInput {
  /** free-form request, e.g. "uma aprendiz de ferreira que quer ver o mundo", "o mentor rabugento" */
  pedido: string;
}

export const characterSpecialist: Specialist<CharacterInput, CharacterProfile> = {
  id: 'character',
  description:
    'Cria personagens completos de ficção: encaixe/contraste com o mundo, diferencial, falha, contradição, desejo (o quê/por quê/como), história de origem, tiques e capacidade de mudança.',
  temperature: 0.8,
  maxTokens: 2560,
  schema: CHARACTER_SCHEMA,

  buildPrompt(input: CharacterInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em criação de personagens do Diegesis Codex. Personagens memoráveis são ' +
          'construídos como pessoas: aos poucos, com camadas.\n\n' +
          'Regras:\n' +
          '- O MUNDO MOLDA: somos formados pelo mundo em que vivemos. Encaixe o personagem no mundo — ' +
          'ou faça-o CONTRASTAR de propósito: num mundo de acomodados, quem luta pelo futuro é ' +
          'interessante. E o mundo define as medidas: o que é "rebelde" numa sociedade é normal noutra.\n' +
          '- DIFERENTE É INTERESSANTE: ninguém lê sobre uma pessoa comum fazendo coisas comuns. Basta ' +
          'uma diferença — curiosidade, imaginação rica, teimosia — ou um extremo: intelecto genial, ' +
          'transtorno incapacitante, espírito rebelde.\n' +
          '- ESTEREÓTIPO É ARGILA: comece do arquétipo mais próximo e molde — tire o bobo do "sidekick ' +
          'cômico", adicione ambição de ser herói, e ele ganha conflitos internos e externos.\n' +
          '- FALHA OBRIGATÓRIA: perfeição é previsível e chata. Falhas podem ser incapacitantes ou ' +
          'relatáveis — Tony Stark e a depressão, Batman e a obsessão. Vilões perfeitos demais no mal ' +
          'também empobrecem: dê-lhes um ponto mole.\n' +
          '- CONTRADIÇÃO: o mestre zen cuja paciência acaba num tópico específico; quem despreza roupas ' +
          'caras mas usa um cachecol caro (presente de um amor). A razão por trás é o que fascina.\n' +
          '- DESEJO COM PORQUÊ: todo mundo quer algo — o quê, POR QUE, e como vai conseguir, no estilo ' +
          'da personalidade dele. O porquê é o que faz o personagem parecer vivo.\n' +
          '- SEM COMPROMISSO: o personagem não se dobra ao enredo. O covarde não escolhe o caminho ' +
          'sombrio por vontade — a trama o empurra para lá por um desvio.\n' +
          '- HISTÓRIA DE ORIGEM: poucos parágrafos bastam — os grandes eventos que o formaram. É a base ' +
          'das reações consistentes, mesmo que nunca apareça na trama.\n' +
          '- TIQUES: hábitos revelam emoção sem nomeá-la — e quem conhece o personagem os reconhece, ' +
          'mostrando a força das relações.\n' +
          '- NUNCA PRONTO: pessoas mudam com o que vivem — grandes perdas e também uma semana ruim, um ' +
          'elogio de estranho. Em "mudanca", indique como este personagem responde a experiências.\n' +
          '- Respeite o cânone: o personagem deve caber no mundo estabelecido.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie o personagem chamando submit_result.`,
      },
    ];
  },

  parse: parseCharacterProfile,
};
