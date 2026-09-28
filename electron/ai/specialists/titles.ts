// Book title generation distilled from the guide: a title is a marketing
// decision — it must grab attention, be memorable (unique + simple), and
// capture the essence of the story. Length doesn't matter; what the title
// conveys does. Generate diverse candidates with rationale.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { TITLES_SCHEMA, parseTitleList, type TitleList } from './schemas';

export interface TitlesInput {
  /** free-form request, e.g. "títulos para meu livro sobre uma ladina aposentada", "título da campanha" */
  pedido: string;
}

export const titlesSpecialist: Specialist<TitlesInput, TitleList> = {
  id: 'titles',
  description:
    'Gera títulos para livros, campanhas e histórias: identifica a essência da obra e oferece candidatos variados que chamam atenção, são memoráveis e capturam a essência.',
  temperature: 0.9,
  maxTokens: 1536,
  schema: TITLES_SCHEMA,

  buildPrompt(input: TitlesInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em títulos do Diegesis Codex. Um título é uma decisão de MARKETING: são as ' +
          'poucas palavras que decidem se alguém lê as outras milhares.\n\n' +
          'Regras:\n' +
          '- ESSÊNCIA PRIMEIRO: identifique o elemento central da história (o antagonista ameaçador, o ' +
          'traço único do protagonista, o evento, o mundo) — os títulos giram ao redor dele. Um título é ' +
          'uma promessa ao leitor, como a primeira frase: a história terá que cumprir.\n' +
          '- CHAMAR ATENÇÃO: o título compete com milhares. Controvérsia, mistério, humor, uma pergunta — ' +
          '"Deitando com os monstros sob minha cama" vence "Monstros da cama".\n' +
          '- MEMORÁVEL = ÚNICO + SIMPLES: único o bastante para não se perder numa busca (adjetivos e ' +
          'frases curtas salvam nomes genéricos: "Nova York Deliciosa" > "Nova York"); simples o bastante ' +
          'para dizer em voz alta sem vergonha e lembrar dias depois. Evite palavras rebuscadas ' +
          '("ignomínia" < "desgraça").\n' +
          '- COMPRIMENTO NÃO IMPORTA: "O Senhor dos Anéis" e "Catch-22" funcionam igual — o que importa é ' +
          'o que o título comunica.\n' +
          '- VARIE OS ESTILOS: nome de personagem, nome alternativo/título de personagem, imagem, emoção, ' +
          'perspectiva do personagem, diálogo da história, mistério, jogo de palavras, humor, metáfora, ' +
          'traço único. Não repita o mesmo estilo duas vezes.\n' +
          '- Em "justificativa", diga por que cada candidato funciona nos três eixos: atenção, ' +
          'memorabilidade, essência.\n' +
          '- Respeite o cânone: nomes próprios e termos do mundo são matéria-prima.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nGere os títulos chamando submit_result.`,
      },
    ];
  },

  parse: parseTitleList,
};
