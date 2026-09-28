// Story openings distilled from the guide: the first sentence decides
// whether the reader embarks. Hook with the RIGHT promise (the story must
// deliver), set the scene, establish voice, ground the reader with crumbs —
// don't start too early (mundane), don't start too far ahead of the reader
// (info overload), and avoid prologues.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { OPENING_SCHEMA, parseOpening, type Opening } from './schemas';

export interface OpeningInput {
  /** free-form request, e.g. "a abertura do meu livro sobre a vila dos dragões", "primeira frase para o conto" */
  pedido: string;
}

export const openingSpecialist: Specialist<OpeningInput, Opening> = {
  id: 'opening',
  description:
    'Escreve aberturas de histórias: primeira frase com gancho certo, voz estabelecida, leitor ancorado por migalhas de informação, promessa que a história cumprirá — sem prólogo, sem começar cedo demais nem à frente do leitor.',
  temperature: 0.85,
  maxTokens: 2560,
  schema: OPENING_SCHEMA,

  buildPrompt(input: OpeningInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em aberturas do Diegesis Codex. A primeira frase decide se o leitor embarca na ' +
          'jornada — é a primeira impressão, e primeira impressão é tudo.\n\n' +
          'Regras:\n' +
          '- GANCHO COM PROMESSA REAL: capture atenção com tensão, intriga ou curiosidade — mas a abertura ' +
          'PROMETE, e a história terá que entregar. A caveira de dragão na primeira frase deve importar ' +
          'na trama, não ser cenografia legal.\n' +
          '- SET THE SCENE: pode ser literal, um estado mental, uma verdade universal do mundo ("É uma ' +
          'verdade universalmente reconhecida...") ou um contraste (os Dursley, "perfeitamente normais"). ' +
          'O detalhe impossível quebra a normalidade: os relógios batendo treze.\n' +
          '- VOZ: como o personagem fala já o introduz — "Meu irmão foi, é e sempre será um espinho no meu ' +
          'olho" diz idade, classe e mistério numa frase.\n' +
          '- ANCORE O LEITOR: nas primeiras linhas, o leitor deve saber onde/quando/quem — por MIGALHAS ' +
          '(espadas = medieval; a ordem do rei = a política), nunca por dumps de exposição.\n' +
          '- NÃO COMECE CEDO DEMAIS: o mundano entedia — não abra na rotina; abra no dia em que algo muda ' +
          '(os lutadores partindo). Os traços do dia a dia entram depois, em doses pequenas.\n' +
          '- NÃO COMECE À FRENTE DO LEITOR: detalhe demais cedo (nomes, facções, como os poderes ' +
          'funcionam) confunde; de menos, também. Dê o suficiente para intrigar — o resto vem quando o ' +
          'leitor estiver pronto.\n' +
          '- DESCRIÇÃO COM PERSONALIDADE: nada de tesauro de aparência — "eu odiava aqueles olhos azuis ' +
          'perfurantes dela: um olhar bastava para ela medir sua utilidade" diz aparência E caráter.\n' +
          '- DIÁLOGO COM MODERAÇÃO no início — e se usado, como DESCOBERTA junto com os personagens, não ' +
          'como exposição disfarçada.\n' +
          '- HUMOR e MISTÉRIO são ganchos poderosos ("Foi no dia em que minha avó explodiu") — mas só se ' +
          'combinarem com o tom.\n' +
          '- SEM PRÓLOGO, a menos que o pedido exija: o leitor quer entrar na história, não num preâmbulo ' +
          'de personagens descartáveis.\n' +
          '- Respeite o cânone.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nEscreva a abertura chamando submit_result.`,
      },
    ];
  },

  parse: parseOpening,
};
