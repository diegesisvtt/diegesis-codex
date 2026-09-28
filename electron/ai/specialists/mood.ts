// Mood/sensory immersion distilled from the guide: tabletop immersion is
// built through the five senses — music and sound, smells, lighting, touch
// (props), taste (themed food and drink) — used with moderation (allergies,
// sparing use, safety) so the mood supports the story instead of
// overwhelming the table.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { MOOD_SCHEMA, parseMoodPlan, type MoodPlan } from './schemas';

export interface MoodInput {
  /** free-form request, e.g. "sessão de terror na mansão assombrada", "clima de festival na capital" */
  pedido: string;
}

export const moodSpecialist: Specialist<MoodInput, MoodPlan> = {
  id: 'mood',
  description:
    'Cria planos de imersão sensorial para sessões de RPG de mesa: som/música, aromas, iluminação, elementos táteis e sabores por cena — com notas práticas de moderação e segurança.',
  temperature: 0.8,
  maxTokens: 2048,
  schema: MOOD_SCHEMA,

  buildPrompt(input: MoodInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em ambientação sensorial do Diegesis Codex. Imersão à mesa se constrói ' +
          'pelos CINCO SENTIDOS — com comedimento.\n\n' +
          'Regras:\n' +
          '- SOM: música de fundo por cena (trilhas, ambiências), efeitos pontuais (trovão na hora ' +
          'certa), e o SILÊNCIO como ferramenta — abaixar ou cortar o som marca tensão melhor que ' +
          'qualquer trilha.\n' +
          '- AROMA: velas aromáticas, incenso, cheiros temáticos (pinho para floresta, fumaça para ' +
          'cidade em guerra). Sempre com moderação e perguntando sobre alergias antes.\n' +
          '- LUZ: luz baixa, velas (reais ou falsas — segurança primeiro), cores por ambiente. A luz ' +
          'muda quando a cena muda: ritual à luz de velas, revelação com a luz acesa de repente.\n' +
          '- TATO: props físicos que os jogadores tocam — moedas de verdade, cartas envelhecidas, ' +
          'mapas de papel, um objeto que a cena gira em torno. O que a mão toca, a memória guarda.\n' +
          '- SABOR: comidas e bebidas temáticas ligadas à cena — o banquete do rei com algo doce na ' +
          'mesa, a ração de viagem que os jogadores provam de verdade.\n' +
          '- MENOS É MAIS: dois ou três sentidos bem usados por cena bastam; cinco sentidos o tempo ' +
          'todo vira circo e distrai da história. Marque nos planos qual sentido é o protagonista de ' +
          'cada cena.\n' +
          '- PRÁTICA: nas notas, inclua preparação (o que montar antes), custo (barato primeiro) e ' +
          'segurança (velas falsas onde houver risco, alergias, comida opcional).\n' +
          '- O clima serve à história, nunca o contrário.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie o plano de ambientação sensorial chamando submit_result.`,
      },
    ];
  },

  parse: parseMoodPlan,
};
