// Body language writing distilled from the guide: up to 55% of communication
// is body language, so emotions should be SHOWN through the body, never
// named. Right action verbs (run/scurry/sprint), universal cues only,
// moderation, and character-unique habits grounded in real body language.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { BODY_LANGUAGE_SCHEMA, parseBodyLanguage, type BodyLanguage } from './schemas';

export interface BodyLanguageInput {
  /** free-form request, e.g. "um veterano escondendo o medo", "ela percebendo que está sendo seguida" */
  pedido: string;
}

export const bodyLanguageSpecialist: Specialist<BodyLanguageInput, BodyLanguage> = {
  id: 'body-language',
  description:
    'Escreve emoções expressas puramente por linguagem corporal (mostrar, não nomear): prosa sensorial mais a lista de sinais corporais usados, com moderação e tiques de personagem.',
  temperature: 0.8,
  maxTokens: 1536,
  schema: BODY_LANGUAGE_SCHEMA,

  buildPrompt(input: BodyLanguageInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em linguagem corporal do Diegesis Codex. Mais da metade da comunicação humana é ' +
          'corporal — sua tarefa é MOSTRAR emoção pelo corpo, jamais nomeá-la.\n\n' +
          'Regras:\n' +
          '- SHOW, DON\'T TELL absoluto: nunca "ela estava nervosa" — sim "os olhos dela varreram a sala, ' +
          'ela parou um instante e atravessou a ponte apressada". A emoção emerge dos sinais.\n' +
          '- VERBOS DE AÇÃO precisos: correr, escapar correndo (escurvar-se apressado) e disparar em ' +
          'velocidade são emoções diferentes. Escolha o verbo que carrega o sentimento.\n' +
          '- SINAIS UNIVERSAIS apenas: use sinais que o leitor reconhece (punhos cerrados, evitar olhar, ' +
          'morder o lábio, ombros caídos, mexer em joias/roupas, cruzar os braços, inclinar-se para ' +
          'perto/longe). Evite sinais obscuros ou ambíguos (dilatação de pupilas) — confundem.\n' +
          '- MODERAÇÃO: detalhe demais enterra a emoção. "Ela corou e cobriu o rosto com as mãos" basta — ' +
          'não descreva a posição exata dos dedos. Cada sinal deve carregar peso.\n' +
          '- CONTEXTO IMPORTA: o mesmo gesto muda de sentido pela cena (esfregar os olhos = irritação, ' +
          'exaustão, dor ou esconder lágrimas). Faça o contexto carregar a interpretação certa.\n' +
          '- HÁBITOS: se o pedido indicar um personagem recorrente, dê a ele um tique próprio — baseado ' +
          'em linguagem real, mas distinto (o polegar sob o lábio do L). Use com parcimônia: repetido ' +
          'demais, vira caricatura.\n' +
          '- Em "sinaisChave", liste os sinais usados (referência rápida para o escritor/mestre).\n' +
          '- Em "notas", indique escolhas de craft: o que foi omitido, o tique do personagem, o ritmo.\n' +
          '- Respeite o cânone: o corpo reage dentro da cena e do personagem estabelecidos.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nEscreva a linguagem corporal chamando submit_result.`,
      },
    ];
  },

  parse: parseBodyLanguage,
};
