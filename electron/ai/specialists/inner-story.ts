// Stories within stories, distilled from the guide: the nested story must
// have a PURPOSE (character exposition, background, pace change, parallel),
// a delivery frame that fits it, a narrator whose telling reveals them, and
// a truth that can be questioned. Distinct from a frame story, which wraps
// the whole narrative.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { INNER_STORY_SCHEMA, parseInnerStory, type InnerStory } from './schemas';

export interface InnerStoryInput {
  /** free-form request, e.g. "o velho do bar conta a queda do castelo", "uma lenda que ensina como matar o dragão" */
  pedido: string;
}

export const innerStorySpecialist: Specialist<InnerStoryInput, InnerStory> = {
  id: 'inner-story',
  description:
    'Escreve histórias dentro da história (lendas, contos de fogueira, peças, confissões) com propósito claro, narrador revelado pelo modo de contar, verdade questionável e paralelos com a trama principal.',
  temperature: 0.85,
  maxTokens: 2560,
  schema: INNER_STORY_SCHEMA,

  buildPrompt(input: InnerStoryInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em histórias dentro da história do Mythril. Uma história aninhada não é ' +
          'enfeite — é uma ferramenta.\n\n' +
          'Regras:\n' +
          '- PROPÓSITO ANTES DE TUDO: por que contar como história em vez de resumir em duas frases? ' +
          'Os grandes usos: revelar o personagem que CONTA (o que ele altera, omite, embeleza), dar ' +
          'background com peso emocional (o velho no bar vs. a narração neutra), mudar o ritmo da trama ' +
          '(a canção da poeta em The Witcher 3), ou preparar um paralelo.\n' +
          '- A MOLDURA CERTA: a forma nasce do propósito. Opinião pública sobre eventos = peça de teatro ' +
          'ou show de fantoches. Revelar um personagem = confissão após um momento de vulnerabilidade. ' +
          'Lição para os heróis = lenda de um contador viajante, tomo empoeirado na biblioteca.\n' +
          '- O NARRADOR SE REVELA: como conta (a voz, as pausas, os detalhes que exagera) diz tanto sobre ' +
          'ele quanto a história em si. A plateia também existe: reações, silêncios, interrupções.\n' +
          '- VERDADE QUESTIONÁVEL: quando um personagem conta, ouvimos só UM lado. O narrador pode ' +
          'exagerar, mentir ou se omitir — e essa dúvida é material para revelações futuras. Em "verdade", ' +
          'deixe claro para o escritor/mestre o que é exagerado, omitido ou falso.\n' +
          '- ECO NA TRAMA: a história aninhada reflete ou pressagia a principal — a lenda do mal antigo ' +
          'ensina como derrotar o dragão de agora. Pode ser sutil, mas deve existir.\n' +
          '- HISTÓRIA-MOLDURA é outra coisa: envolve a trama inteira (Bilbo escrevendo o livro). Se o ' +
          'pedido pedir moldura, entregue a abertura do narrador externo.\n' +
          '- Em "historia", entregue a cena completa: a moldura, a história contada e as reações.\n' +
          '- Respeite o cânone: a história aninhada deve caber no mundo estabelecido.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nEscreva a história aninhada chamando submit_result.`,
      },
    ];
  },

  parse: parseInnerStory,
};
