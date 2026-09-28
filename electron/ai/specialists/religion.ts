// Religion creation distilled from the guide: first decide if the religion
// is REAL, FAKE or UNKNOWN (it changes everything), then gods (or none —
// Buddhism), powers, origins, special figures, sacred places, rituals, dress,
// symbols, doctrine (good/evil, life's goal, afterlife, spirits), strictness
// and sects.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { RELIGION_SCHEMA, parseReligion, type Religion } from './schemas';

export interface ReligionInput {
  /** free-form request, e.g. "a religião do povo do deserto", "um culto à deusa da maré" */
  pedido: string;
}

export const religionSpecialist: Specialist<ReligionInput, Religion> = {
  id: 'religion',
  description:
    'Cria religiões fictícias: natureza (real/falsa/incerta), deuses e seres divinos, poderes, origem, figuras especiais, lugares e símbolos, rituais, doutrina (bem/mal, meta de vida, além), rigor e seitas.',
  temperature: 0.75,
  maxTokens: 3072,
  schema: RELIGION_SCHEMA,

  buildPrompt(input: ReligionInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em criação de religiões do Diegesis Codex. Nem todo mundo precisa de uma — mas ' +
          'uma religião boa torna o mundo autêntico como poucos elementos.\n\n' +
          'Regras:\n' +
          '- NATUREZA PRIMEIRO: a religião é REAL (os deuses existem e agem), FALSA (inventada por alguém ' +
          '— poder, dinheiro, atenção) ou INCERTA (só fé, sem evidência)? Isso muda tudo. Se incerta e ' +
          'houver "milagres", eles devem ter leitura ambígua (a cura que talvez fosse coincidência).\n' +
          '- DEUSES — OU NÃO: quantos? Um, vários, nenhum (budismo = caminho de vida sem deus). Se houver: ' +
          'criaram o povo? gostam uns dos outros? se importam? Cruéis ou gentis? E outros seres divinos: ' +
          'anjos, demônios, montarias divinas, protetores antigos.\n' +
          '- PODERES: quem recebe — todos os fiéis ou só os devotos? Curam, matam, escalam com a devoção? ' +
          'Podem ser corrompidos? Defina cedo para não abrir furos de trama.\n' +
          '- ORIGEM: mitos e história — em textos sagrados, tradição oral, ou ausência (religião real não ' +
          'precisa explicar o que veio antes: o loop "e antes disso?" é infinito).\n' +
          '- FIGURAS ESPECIAIS: líder eleito (integridade questionável), escolhido por deus (legitimidade ' +
          'inquestionável, aptidão nem tanto), filho de deus (hercúleo). COMO são escolhidos é matéria de ' +
          'intriga: o primogênito após a morte do líder? A marca de nascença?\n' +
          '- LUGARES E SÍMBOLOS: templos, a árvore-mundo, a cidade santa — lugares grandes pedem história ' +
          '("por que AQUI?"). Vestimentas com razão de ser. Símbolos que condensam o que a religião ' +
          'celebra (vida+morte = água+fogo, sol+lua).\n' +
          '- RITUAIS: do pequeno (o gole derramado para os deuses) ao grande (festivais, casamentos) — e ' +
          'os sombrios quando couber: sacrifícios, punições religiosas.\n' +
          '- DOUTRINA: existe bem vs. mal tangível (demônios, deus rival) ou "mal" é quem não crê? Meta de ' +
          'vida: iluminação, paraíso, servir o deus na guerra dos deuses? Além: um, vários por mérito, ' +
          'reencarnação, nada? E espíritos: existem? presos? com propósito?\n' +
          '- RIGOR E SEITAS: o que acontece com quem crê parcialmente, interpreta diferente, não veste o ' +
          'traje? Regras criam fricção — ótimo para histórias. E quase toda religião real tem VERSÕES: ' +
          'ortodoxos e moderados da mesma fé.\n' +
          '- Respeite o cânone: a religião deve caber nas culturas e na história estabelecidas.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nCrie a religião chamando submit_result.`,
      },
    ];
  },

  parse: parseReligion,
};
