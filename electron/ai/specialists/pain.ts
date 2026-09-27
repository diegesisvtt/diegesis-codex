// Pain descriptions as a coherent 5-beat arc, inspired by the classic
// random-generator structure (sensation -> despair -> hesitation -> struggle
// -> outcome) but improved: the same pain escalates logically across beats
// (the random version jumps body parts and intensity), and the GM gets two
// alternate endings to pick based on what happens at the table.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { PAIN_SCHEMA, parsePainDescription, type PainDescription } from './schemas';

export interface PainInput {
  /** free-form request, e.g. "dor de uma flechada no ombro", "exaustão após dias sem dormir" */
  pedido: string;
}

export const painSpecialist: Specialist<PainInput, PainDescription> = {
  id: 'pain',
  description:
    'Escreve descrições de dor e sofrimento físico como um arco narrativo progressivo (sensação, desespero, hesitação, luta, desfecho), para o mestre narrar ferimentos, exaustão, tortura ou maldições.',
  temperature: 0.85,
  maxTokens: 2048,
  schema: PAIN_SCHEMA,

  buildPrompt(input: PainInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em descrição de dor do Mythril. Você escreve sofrimento físico como um ' +
          'ARCO NARRATIVO PROGRESSIVO para o mestre ler ou adaptar em voz alta.\n\n' +
          'Estrutura (cada batida = 1 a 3 frases):\n' +
          '1. sensacaoInicial: a dor se instalando — sensorial e ESPECÍFICA (local do corpo, qualidade da dor: ' +
          'aguda, latejante, queimante, dilacerante, entorpecente).\n' +
          '2. reacaoEmocional: o impacto mental — vontade de parar, pânico, pensamentos catastróficos.\n' +
          '3. hesitacao: o momento de pausa — o personagem pondera desistir ou continuar.\n' +
          '4. luta: a tentativa de seguir em frente — ranger de dentes, truques de foco, respiração.\n' +
          '5. dois desfechos alternativos: desfechoResiste (segue em frente, a custo) e desfechoCede ' +
          '(o corpo vence, o personagem cai ou para).\n\n' +
          'Regras:\n' +
          '- COERÊNCIA ABSOLUTA entre as batidas: mesma parte do corpo, mesma qualidade de dor, intensidade ' +
          'que escala logicamente. É o que diferencia um arco de frases aleatórias.\n' +
          '- TIPOS DE DOR têm qualidades próprias — use o vocabulário certo: dor de tecido (nociceptiva) é ' +
          'aguda, latejante, queimante, cortante, surda; dor de nervo (neuropática) é choque, formigamento, ' +
          'queimação que corre; dor psicogênica tem textura emocional. Aguda é súbita; crônica é o peso ' +
          'que nunca vai embora. Uma dor de cabeça lateja; uma punhalada corta.\n' +
          '- INTENSIDADE com lógica (escala 0-10): leve (1-3) é ignorável; moderada (3-5) interfere em ' +
          'tarefas; (5-7) rouba a concentração; severa (7-9) interfere em comer e dormir; (9-10) é tortura. ' +
          'A intensidade vale pela SENSAÇÃO do personagem, não pela lesão — respeite a tolerância dele ' +
          '(músculos não são tolerância à dor) e mantenha-a consistente com o que o pedido indicar.\n' +
          '- COMO O PERSONAGEM LIDA é personalidade: ignorar e seguir, extrair força da dor, fingir que ' +
          'está bem para não parecer fraco, ou exagerar por piedade — mostre isso nas batidas quando couber.\n' +
          '- TERMOS RELATÁVEIS > metáforas elaboradas: "dor aguda no peito" funciona melhor que "como se ' +
          'uma faca o atravessasse" (ninguém sabe como é ser esfaqueado). Metáforas só com sensações ' +
          'universais — queimação ("pulmões em chamas") todos conhecem. Nada de metáforas empilhadas que ' +
          'desviam o foco da dor.\n' +
          '- Mostre, não nomeie: "as unhas cravaram na parede" em vez de "sentiu muita dor".\n' +
          '- Use o corpo inteiro como palco: respiração, suor, visão, audição, equilíbrio, mãos trêmulas.\n' +
          '- CONSEQUÊNCIAS físicas quando relevante: ferimentos limitam movimento, pontos estouram, ' +
          'pernas machucadas mancam — a dor não acaba quando a cena acaba.\n' +
          '- Varie o ritmo das frases: curtas nos picos de dor, longas na exaustão.\n' +
          '- Padrão: terceira pessoa ("ele/ela", ajustável ao pedido). Se o pedido indicar um personagem ' +
          'dos jogadores, use segunda pessoa ("você").\n' +
          '- Dor crônica/mágica/psíquica quando pedida: adapte as sensações (ex.: dor mágica pode ter ' +
          'textura sobrenatural — frio que queima, peso que puxa para baixo).\n' +
          '- Sem gore gratuito: visceral, não gratuito. A dor serve à história.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nEscreva a descrição de dor chamando submit_result.`,
      },
    ];
  },

  parse: parsePainDescription,
};
