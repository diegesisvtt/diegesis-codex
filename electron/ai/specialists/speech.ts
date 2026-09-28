// Speech writing distilled from the guide: a speech exists to convince —
// single message, intro that grabs, body with strongest point first (weakest
// hidden in the middle), conclusion; persuasion via credibility/emotion/
// logic; inclusive terms ("we"); and the text broken by audience reactions
// so pauses exist without writing "pause".

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { SPEECH_SCHEMA, parseSpeech, type Speech } from './schemas';

export interface SpeechInput {
  /** free-form request, e.g. "o discurso da general antes da batalha", "o charlatão vendendo a cura" */
  pedido: string;
}

export const speechSpecialist: Specialist<SpeechInput, Speech> = {
  id: 'speech',
  description:
    'Escreve discursos persuasivos para personagens: tese única, estrutura introdução-corpo-conclusão (ponto mais forte primeiro), credibilidade/emoção/lógica, termos inclusivos e reações da plateia.',
  temperature: 0.75,
  maxTokens: 2560,
  schema: SPEECH_SCHEMA,

  buildPrompt(input: SpeechInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em discursos do Diegesis Codex. Confiança sozinha não faz discurso — discurso ' +
          'é persuasão estruturada.\n\n' +
          'Regras:\n' +
          '- TESE ÚNICA: o discurso existe para CONVENCER de uma coisa (o exército de que vencerá; os ' +
          'aldeões de que precisam da "cura"). Se a resposta for "porque é legal ter um discurso", não há ' +
          'discurso. Foco total: faça os pontos e siga — quem divaga perde a plateia.\n' +
          '- ESTRUTURA: introdução que agarra (uma declaração grande, que promete mudar a situação de ' +
          'quem ouve); corpo com poucos pontos fortes — o MAIS FORTE PRIMEIRO, o mais fraco escondido no ' +
          'meio (a plateia esquece as falhas do meio); conclusão que fecha — somar os pontos ou repetir a ' +
          'declaração de abertura (repetição é poderosa, não obrigatória).\n' +
          '- PERSUASÃO — três vias: CREDIBILIDADE (quem apoia, provas, um poder maior — textos sagrados ' +
          'são reinterpretáveis), EMOÇÃO (forte, mas situacional: depende do estado da plateia e do ' +
          'carisma do orador) e LÓGICA (a verdade pode ser curvada: "cada minuto de luta é um minuto a ' +
          'mais para suas famílias fugirem").\n' +
          '- PLATEIA REAL: escreva o discurso pensando se VOCÊ seria convencido. A plateia pode resistir ' +
          '— e se o personagem PRECISA falhar, a falha deve estar no discurso, não numa plateia ' +
          'convenientemente apática.\n' +
          '- TERMOS INCLUSIVOS: "nós", "juntos" — nunca "vocês são os filhos da luz", sempre "NÓS somos ' +
          'os filhos da luz", mesmo que o orador não vá lutar.\n' +
          '- PAUSAS SEM ESCREVER "pausa": quebre o discurso com reações da plateia, pensamentos do orador, ' +
          'gestos — cada bloco de fala é seguido de uma batida. Assim a energia cresce gradualmente até o ' +
          'pico de aplausos (ou o silêncio do fracasso).\n' +
          '- Respeite o cânone: o orador fala com a voz e os fatos do mundo estabelecido.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nEscreva o discurso chamando submit_result.`,
      },
    ];
  },

  parse: parseSpeech,
};
