// Stage 0: refines a raw user request into a strong creative premise.
// May instead return a `pergunta` when the request is too vague — the
// orchestrator then asks the user and stops (the next message re-enters
// the pipeline with the answer in the conversation history).

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { parsePremise, PREMISE_SCHEMA, type Premise } from './schemas';

export interface PremiseInput {
  /** the user's request, restated by the router */
  pedido: string;
  /** recent conversation, so answers to previous questions are visible */
  historico: string;
}

export const premiseSpecialist: Specialist<PremiseInput, Premise> = {
  id: 'premise',
  description: 'Refina um pedido vago de criação em uma premissa forte (tema, tom, escopo, ameaça, duração).',
  temperature: 0.7,
  maxTokens: 1024,
  schema: PREMISE_SCHEMA,

  buildPrompt(input: PremiseInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em premissas do Mythril, um estúdio de worldbuilding de RPG. ' +
          'Sua função é transformar o pedido do mestre em uma PREMISSA FORTE para uma aventura: ' +
          'um conflito central com stakes claros, um tom definido e um escopo jogável.\n\n' +
          'Regras:\n' +
          '- Premissas boas nascem de tensão ("o preço da lealdade", "a natureza revida"), não de sinopses.\n' +
          '- Use o cânone do universo: ancora a premissa em facções, locais ou eventos que já existem nas notas.\n' +
          '- Se o pedido for vago demais para gerar algo bom (ex.: "crie uma aventura" sem nenhum detalhe e sem ' +
          'contexto no cânone), preencha o campo "pergunta" com UMA pergunta curta e útil ao mestre (sobre tom, ' +
          'tema ou escopo) e preencha os demais campos com sua melhor hipótese.\n' +
          '- Se o pedido (ou o histórico da conversa) já trouxer direção suficiente, NÃO pergunte — refine direto.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content:
          `Pedido do mestre: ${input.pedido}\n\n` +
          (input.historico ? `Histórico recente da conversa:\n${input.historico}\n\n` : '') +
          'Refine em uma premissa chamando submit_result.',
      },
    ];
  },

  parse: parsePremise,
};
