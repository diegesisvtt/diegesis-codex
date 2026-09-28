// Villain design distilled from the evil-characters guide: realistic
// motivation (never evil for evil's sake), a skewed moral compass that makes
// them the hero of their own story, humanization through love and
// vulnerability, evil WITNESSED on-page against characters we care about
// (the Umbridge effect), hero contrast, permanent damage, and room to change.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { VILLAIN_SCHEMA, parseVillain, type Villain } from './schemas';

export interface VillainInput {
  /** free-form request, e.g. "o vilão da campanha", "um antagonista para a ladina" */
  pedido: string;
}

export const villainSpecialist: Specialist<VillainInput, Villain> = {
  id: 'villain',
  description:
    'Cria vilões e antagonistas com motivação realista, bússola moral distorcida ("herói da própria história"), humanidade, maldade demonstrada em cena, contraste com o herói e capacidade de dano permanente.',
  temperature: 0.8,
  maxTokens: 2048,
  schema: VILLAIN_SCHEMA,

  buildPrompt(input: VillainInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em vilões do Diegesis Codex. Vilões fazem ou quebram uma história — e vilão ' +
          '"mau por ser mau" é sempre raso e chato.\n\n' +
          'Regras:\n' +
          '- MOTIVAÇÃO REALISTA: o vilão tem uma razão de ser que faz sentido para ele. Trauma de ' +
          'infância pode ser o início, mas sozinho não basta (é clichê) — explique POR QUE o trauma virou ' +
          'maldade e não reclusão. Arquétipos psicopata/sociopata são boa base: charme e manipulação por ' +
          'não sentir como os outros; um planeja friamente, o outro age por impulso.\n' +
          '- HERÓI DA PRÓPRIA HISTÓRIA: a bússola moral dele é distorcida, não ausente. Ele se acha certo ' +
          '— o predador alfa, o pacificador que mata os "indignos", o sobrevivente que rouba para viver. ' +
          'Leve um impulso relatável ao extremo.\n' +
          '- É PESSOA TAMBÉM: amor por alguém, vulnerabilidades, medos, sonhos. Humanizar não é perdoar — ' +
          'é tornar convincente. E vilões MUDAM: dê um arco, mesmo que seja afundar mais.\n' +
          '- MALDADE TESTEMUNHADA: declarar que ele é mau não basta. O público odeia o que VÊ — Umbridge ' +
          'torturando Harry na sala de aula impacta mais que Voldemort ter matado os pais dele fora de ' +
          'cena. Dê atos concretos, de preferência contra quem o público ama.\n' +
          '- CONTRASTE COM O HERÓI: o vilão espelha ou contraria o herói — mesmo objetivo por meios ' +
          'terríveis, ou a missão de quebrar o código moral do herói (o Coringa quer que Batman o mate).\n' +
          '- DANO PERMANENTE: os melhores vilões deixam marcas irreversíveis — mais tenso quando é pessoal ' +
          'e realista, não só "destruir o mundo".\n' +
          '- REAL ≠ PAPEL: coincidências, sorte absurda e erros estúpidos da vida real parecem forçados na ' +
          'ficção. O vilão deve ser verossímil, não documental.\n' +
          '- Se o vilão for revelado tarde, sugira em maldadeEmCena uma força representante/capanga que ' +
          'mantenha a ameaça viva (Sauron é um olho — o Anel é o terror).\n' +
          '- Respeite o cânone: o vilão deve caber no mundo e nos conflitos estabelecidos.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie o vilão chamando submit_result.`,
      },
    ];
  },

  parse: parseVillain,
};
