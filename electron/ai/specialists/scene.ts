// Scene writing distilled from the guide: an engaged character driving the
// scene, diversity of action verbs (observed/counted/studied/wrote — not
// saw/saw/saw), "to be" replaced by evocative verbs, the scene's own
// beginning-middle-end, grounding in a location, and deliberate pacing.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { SCENE_SCHEMA, parseSceneCraft, type SceneCraft } from './schemas';

export interface SceneInput {
  /** free-form request, e.g. "a ladina observando a mansão antes do roubo", "a erupção vista da vila" */
  pedido: string;
}

export const sceneSpecialist: Specialist<SceneInput, SceneCraft> = {
  id: 'scene',
  description:
    'Escreve cenas de ficção completas: personagem engajado dirigindo a cena, verbos de ação variados, arco próprio (começo-meio-fim), ancoragem no local e ritmo deliberado.',
  temperature: 0.8,
  maxTokens: 2560,
  schema: SCENE_SCHEMA,

  buildPrompt(input: SceneInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em cenas do Diegesis Codex. Uma cena é coisas acontecendo num tempo e lugar ' +
          'específicos, idealmente COM personagens — e ela é uma mini-história.\n\n' +
          'Regras:\n' +
          '- PERSONAGEM ENGAJADO: cenas com alguém envolvido superam espetáculo vazio (a erupção vista ' +
          'por quem sente medo e perde o equilíbrio > a erupção em si). Alguém deve DIRIGIR a cena — não ' +
          'espectador passivo. Se o personagem está entediado, o leitor está.\n' +
          '- VARIEDADE DE AÇÃO: ninguém faz uma coisa só. "Observou, contou, estudou, anotou, descobriu, ' +
          'vigiou" — não "viu, viu, viu". Verbos repetidos = imagens mentais repetidas = tédio.\n' +
          '- CUIDADO COM "SER/ESTAR": "a montanha era alta" não evoca nada; "a montanha se erguia sobre o ' +
          'deserto" / "vigiava o deserto do alto" evoca. O verbo certo carrega informação extra de graça.\n' +
          '- ARCO PRÓPRIO: toda cena tem começo, meio e fim, com ação ascendente e descendente — mesmo ' +
          'que seja só "uma pergunta é respondida". Se a história não avança do início ao fim da cena, ' +
          'há um problema.\n' +
          '- EXPOSIÇÃO COM REAÇÃO: cena só de backstory é exposição forçada. Mas um personagem lendo o ' +
          'tomo na biblioteca funciona — o que ele PENSA do que descobre, como reage, o que decide fazer.\n' +
          '- LOCAL ANCORADO: o leitor precisa saber onde está, senão a cena flutua no vazio. E a escolha ' +
          'do que descrever do local define o clima — o mesmo dia de verão pode ser raio quente na pele ' +
          'ou flor murchando no sol.\n' +
          '- RITMO DELIBERADO: rápido e cirúrgico, ou arrastado segundo a segundo, ou analítico (o lutador ' +
          'dissecando os movimentos do oponente). O ritmo serve ao que a cena quer fazer sentir.\n' +
          '- CORAÇÃO DA HISTÓRIA: a cena deve contribuir para o conflito/questão central — informação de ' +
          'personagem pode ser dada ENQUANTO a trama avança, nunca pausando-a.\n' +
          '- Respeite o cânone.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nEscreva a cena chamando submit_result.`,
      },
    ];
  },

  parse: parseSceneCraft,
};
