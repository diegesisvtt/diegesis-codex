// Narrative prose: read-aloud text for the players + GM-facing detail.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { NARRATIVE_SCHEMA, parseNarrative, type Narrative, type Scene } from './schemas';

export interface NarrativeInput {
  /** free-form request when standalone ("descreva a taverna") */
  pedido: string;
  /** the scene being described, when inside an adventure pipeline */
  cena?: Scene;
  /** critic feedback, when re-running after review */
  revisao?: string;
}

export const narrativeSpecialist: Specialist<NarrativeInput, Narrative> = {
  id: 'narrative',
  description: 'Escreve descrições evocativas: texto para ler em voz alta, detalhes para o mestre e atmosfera de cenas e locais.',
  temperature: 0.8,
  maxTokens: 1536,
  schema: NARRATIVE_SCHEMA,

  buildPrompt(input: NarrativeInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em descrição narrativa do Mythril. Você escreve prosa de RPG que ' +
          'o mestre lê em voz alta e notas de bastidores.\n\n' +
          'Regras:\n' +
          '- textoReadAloud: segunda pessoa ("vocês..."), sensorial (visão, som, cheiro, textura), ' +
          '2 a 4 frases — longo o bastante para evocar, curto o bastante para não perder a mesa.\n' +
          '- descricaoGM: o que está além do óbvio — detalhes investigáveis, segredos do local, ' +
          'como o lugar reage aos personagens.\n' +
          '- atmosfera: o clima emocional e como mantê-lo (ritmo, luz, silêncio).\n' +
          '- Mantenha o tom da premissa e coerência absoluta com o cânone e o dossiê.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content:
          (input.cena
            ? `Cena a descrever: "${input.cena.nome}" — local: ${input.cena.local}. Objetivo da cena: ${input.cena.objetivo}.\n\n`
            : `Pedido: ${input.pedido}\n\n`) +
          (input.revisao ? `Revisão solicitada pelo crítico:\n${input.revisao}\n\n` : '') +
          'Escreva a descrição chamando submit_result.',
      },
    ];
  },

  parse: parseNarrative,
};
