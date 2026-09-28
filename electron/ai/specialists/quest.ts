// Quest idea generation distilled from the two prompt collections (150 quest
// ideas + 40 campaign/quest prompts): each quest is a hook the party hears
// plus a complication/twist that makes it more than it seems — adaptable,
// open-ended, and never a scripted railroad.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { QUEST_LIST_SCHEMA, parseQuestList, type QuestList } from './schemas';

export interface QuestInput {
  /** free-form request, e.g. "missões de cidade portuária", "ganchos para o arco do culto", "quests de nível baixo" */
  pedido: string;
  /** how many quest ideas to generate (default 6) */
  quantidade?: number;
}

export const questSpecialist: Specialist<QuestInput, QuestList> = {
  id: 'quest',
  description:
    'Gera listas de ideias de missões/ganchos de aventura: cada uma com a premissa como chega aos personagens e a complicação ou reviravolta que a torna mais do que parece. Para missões avulsas, não aventuras completas.',
  temperature: 0.9,
  maxTokens: 2560,
  schema: QUEST_LIST_SCHEMA,

  buildPrompt(input: QuestInput, ctx: SpecialistContext): ProviderMessage[] {
    const qtd = input.quantidade && input.quantidade > 0 ? Math.min(input.quantidade, 12) : 6;
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em ideias de missões do Mythril. Uma boa quest é um GANCHO com uma ' +
          'COMPLICAÇÃO — nunca um script fechado.\n\n' +
          'Regras:\n' +
          '- GANCHO COMO O MUNDO APRESENTA: escreva a premissa como ela chega aos personagens — o ' +
          'pedido desesperado, o contrato no quadro, o rumor no porto. Concreta, com nomes e lugares.\n' +
          '- COMPLICAÇÃO OU REVIRAVOLTA: toda missão boa é mais do que parece. O monstro do poço é ' +
          'o que a cidade joga lá; o resgate é um sequestro voluntário; o artefato amaldiçoado é a ' +
          'única coisa segurando algo pior. A reviravolta deve ressignificar o gancho, não anulá-lo.\n' +
          '- VARIEDADE: misture tipos — resgate, escolta, investigação, roubo, caça, defesa, mistério, ' +
          'diplomacia, horror, moral cinzenta. Evite repetir estrutura entre as missões da lista.\n' +
          '- ABERTAS, NÃO ENGRENADAS: cada ideia deve admitir múltiplas soluções (luta, lábia, ' +
          'esperteza) e múltiplos desfechos. Não prescreva o que os jogadores "devem" fazer.\n' +
          '- ESCALÁVEIS: ideias que funcionem para grupos fracos ou fortes com ajuste de escala.\n' +
          '- AMARRADAS AO MUNDO: quando houver cânone, puxe facções, lugares e tensões existentes — ' +
          'a missão deve parecer deste mundo, não genérica.\n' +
          '- Títulos curtos e evocativos. Gancho em 2-4 frases. Complicação em 1-3 frases.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content:
          `Pedido: ${input.pedido}\n\nGere ${qtd} ideias de missões chamando submit_result.`,
      },
    ];
  },

  parse: parseQuestList,
};
