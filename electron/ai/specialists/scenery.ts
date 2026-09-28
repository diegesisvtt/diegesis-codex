// Scenery description distilled from the guide: focus on 1-2 elements and
// guide the reader's eye smoothly, involve multiple senses, let a point of
// view filter what's noticed (and what isn't), pick evocative words, and be
// economical — the reader fills the blanks.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { SCENERY_SCHEMA, parseSceneryDescription, type SceneryDescription } from './schemas';

export interface SceneryInput {
  /** free-form request, e.g. "a cordilheira nevada", "a biblioteca abandonada" */
  pedido: string;
}

export const scenerySpecialist: Specialist<SceneryInput, SceneryDescription> = {
  id: 'scenery',
  description:
    'Descreve cenários e paisagens em prosa com foco em 1-2 elementos, múltiplos sentidos, ponto de vista que filtra a cena, escolha de palavras evocativa e economia — o leitor preenche os vazios.',
  temperature: 0.8,
  maxTokens: 2048,
  schema: SCENERY_SCHEMA,

  buildPrompt(input: SceneryInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em descrição de cenários do Diegesis Codex. Descrever é guiar o olho do leitor ' +
          '— não despejar o inventário.\n\n' +
          'Regras:\n' +
          '- FOCO: 1-2 elementos por vez. Bombardear com detalhes faz o leitor não absorver nenhum. Como ' +
          'numa pintura: primeiro o esboço do palco, depois um detalhe de cada vez.\n' +
          '- MOVIMENTO SUAVE DO OLHAR: guie o olhar num fluxo (os picos sobem até as nuvens; lá embaixo, ' +
          'a floresta se agarra à base) — não pule de elemento em elemento. E corte redundâncias: que ' +
          'criaturas vivem numa floresta normal é óbvio.\n' +
          '- MÚLTIPLOS SENTIDOS: vista sozinha é pouco. Temperatura, cheiro, som — o enxofre que cede ao ' +
          'fedor de guano diz mais que três parágrafos de cores.\n' +
          '- PONTO DE VISTA FILTRA: a cena vista por alguém revela essa pessoa — quem reencontra o amor ' +
          'não nota as velas acesas. E o cenário pode ser personagem: a caverna "abandonada pelo magma ' +
          'que a pariu" está viva. Em "pontoDeVista", diga de quem é o olhar e o que ele NÃO nota.\n' +
          '- ESCOLHA DE PALAVRAS: cada palavra evoca uma imagem — marrom pode ser mogno, cáqui, tijolo, ' +
          'canela, ferrugem; cada um é outra cena. Flores de "esmeralda e rubi" são luxo; de "azul e ' +
          'coral", são mar.\n' +
          '- ECONOMIA: o que não serve à cena fica fora. Se houver muito a descrever, quebre com ação ou ' +
          'diálogo. Em "economia", diga o que você deliberadamente omitiu.\n' +
          '- Em "foco" e "palavrasChave", explique as decisões para o escritor/mestre.\n' +
          '- Respeite o cânone: o cenário deve caber no mundo estabelecido.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nDescreva o cenário chamando submit_result.`,
      },
    ];
  },

  parse: parseSceneryDescription,
};
