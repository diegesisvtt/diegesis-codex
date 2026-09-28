// Campaign opening distilled from the guide: session one has a job to do —
// establish the world, give the characters motivation, and end with clear
// paths forward. Classic openings (tavern, ship, prison, in medias res,
// campfire) work when they get a twist and a hint of the greater plot.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { CAMPAIGN_START_SCHEMA, parseCampaignStart, type CampaignStart } from './schemas';

export interface CampaignStartInput {
  /** free-form request, e.g. "primeira sessão da campanha pirata", "como começar a campanha do reino caído" */
  pedido: string;
}

export const campaignStartSpecialist: Specialist<CampaignStartInput, CampaignStart> = {
  id: 'campaign-start',
  description:
    'Cria a primeira sessão de uma campanha: cena de abertura com toque próprio (taberna, navio, prisão, in medias res, fogueira), motivação para o grupo, caminhos claros ao final e presságio da trama maior.',
  temperature: 0.85,
  maxTokens: 2048,
  schema: CAMPAIGN_START_SCHEMA,

  buildPrompt(input: CampaignStartInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em aberturas de campanha do Mythril. A primeira sessão tem TRABALHO ' +
          'a fazer: apresentar o mundo, dar motivação aos personagens e terminar com caminhos claros.\n\n' +
          'Regras:\n' +
          '- PROPÓSITO CLARO: session one não é só "começar". Ela deve estabelecer (1) o tom e a cara ' +
          'do mundo, (2) por que esses personagens estão juntos e se importam, (3) para onde podem ir.\n' +
          '- ABERTURAS CLÁSSICAS FUNCIONAM — com um toque próprio: a taberna (mas por que essa ' +
          'taberna, essa noite?), o navio (viagem forçada, destino incerto), a prisão (os personagens ' +
          'começam capturados — por quê?), in medias res (começa no meio da ação, explica depois), ' +
          'a fogueira (histórias contadas que escondem ganchos). Escolha a que serve ao tom da campanha ' +
          'e dê um twist que a torne desta campanha, não de qualquer uma.\n' +
          '- MOTIVAÇÃO CONCRETA: "vocês são aventureiros" não basta. Dinheiro, vingança, dívida, ' +
          'juramento, sobrevivência, um segredo em comum — algo que prende cada personagem ao grupo ' +
          'mesmo quando as coisas apertam.\n' +
          '- CAMINHOS CLAROS, NÃO TRILHOS: ao final da sessão, ofereça 2-3 direções distintas e ' +
          'concretas (o contrato no quadro, o rumor do taverneiro, a carta no bolso do morto). O ' +
          'jogador escolhe; o GM prepara.\n' +
          '- PRESSÁGIO DA TRAMA MAIOR: plante sinais do perigo principal — boatos, um símbolo, um ' +
          'nome sussurrado. Sutil: a primeira sessão vende o mundo, não resolve a campanha.\n' +
          '- NÃO TRANQUE OS JOGADORES: evite aberturas que forcem escolhas ("vocês aceitam a missão, ' +
          'gostem ou não"). Dê a cena, não o script.\n' +
          '- Respeite o cânone: use lugares, facções e tensões já estabelecidos nas notas quando houver.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie a abertura da campanha chamando submit_result.`,
      },
    ];
  },

  parse: parseCampaignStart,
};
