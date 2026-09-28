// Settlement creation distilled from the guide: setting first (era, climate,
// environment), then organic growth vs planned building (why does this place
// exist here?), important buildings scaled to population, visible history,
// and street-level details that make this town feel different from the next.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { CITY_SCHEMA, parseCityDesign, type CityDesign } from './schemas';

export interface CityInput {
  /** free-form request, e.g. "uma cidade portuária de 20 mil habitantes", "a vila onde a campanha começa" */
  pedido: string;
}

export const citySpecialist: Specialist<CityInput, CityDesign> = {
  id: 'city',
  description:
    'Cria cidades, vilas e assentamentos: cenário, origem (crescimento orgânico vs. planejado), layout e serviços, população e distritos, história visível, detalhes de rua e eventos.',
  temperature: 0.75,
  maxTokens: 2560,
  schema: CITY_SCHEMA,

  buildPrompt(input: CityInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em criação de cidades do Diegesis Codex. Um assentamento bom responde: por que ' +
          'existe AQUI, e como é ANDAR nele?\n\n' +
          'Regras:\n' +
          '- CENÁRIO PRIMEIRO: época, clima, ambiente e regras do mundo restringem tudo. Rio = pontes e ' +
          'talvez porto; colinas = jogo de alturas; frio = paredes grossas; chuva = drenagem.\n' +
          '- ORIGEM — ORGÂNICO VS. PLANEJADO: crescimento orgânico nasce de necessidade ou vantagem — a ' +
          'vila na rota comercial começa com taverna e mercado e cresce AO LONGO da rota; a vila da mina ' +
          'cresce junto à mina. Construção planejada começa pelo edifício central (prefeitura, templo) e ' +
          'cresce para fora com propósito — capitais, vitrines de arquitetura. Misture os dois quando ' +
          'couber (a cidade velha orgânica, o distrito novo planejado).\n' +
          '- SERVIÇOS À ESCALA: templos para culturas religiosas, guarda, curandeiros, escolas — mas ' +
          'coerência: vila pobre medieval não tem hospital de ponta. Negócios de nicho precisam de ' +
          'população grande para se sustentar.\n' +
          '- POPULAÇÃO: tamanho define variedade — mais gente = mais culturas, distritos étnicos, casas de ' +
          'oração diversas. Culturas que não se dão bem se separam em bairros. E todo mundo precisa de ' +
          'casa e comida (fazendas ou comércio).\n' +
          '- HISTÓRIA VISÍVEL: monumentos, memoriais, o contraste entre a pedra velha e a construção nova ' +
          '— a cidade conta seu passado na arquitetura.\n' +
          '- DETALHES DE RUA: o que diferencia esta vila da próxima — iluminação, cercas, placas de loja, ' +
          'transporte, parques, o cheiro do porto. Detalhes pequenos são o que dá vida.\n' +
          '- EVENTOS: festivais e celebrações próprias — exigem lugares (a praça, o campo de tendas) e ' +
          'dão ganchos de história.\n' +
          '- Teste final: ande pelas ruas na imaginação — se algo parecer faltar, é detalhe pequeno.\n' +
          '- Respeite o cânone: a cidade deve se encaixar no mapa e nas culturas estabelecidas.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie o assentamento chamando submit_result.`,
      },
    ];
  },

  parse: parseCityDesign,
};
