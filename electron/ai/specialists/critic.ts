// Final review pass: checks the assembled adventure against the canon and
// narrative quality, naming the specialist responsible for each problem so
// the orchestrator can re-run only the affected parts.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { CRITIQUE_SCHEMA, parseCritique, type AdventureStructure, type Critique, type Encounter, type Narrative, type Npc } from './schemas';

export interface CriticInput {
  pedido: string;
  estrutura: AdventureStructure;
  narrativas: { cena: string; narrativa: Narrative }[];
  npcs: Npc[];
  encontros: Encounter[];
}

export const criticSpecialist: Specialist<CriticInput, Critique> = {
  id: 'critic',
  description: 'Revisa a aventura montada: coerência com o cânone, stakes, furos de trama e qualidade narrativa.',
  temperature: 0.2,
  maxTokens: 4096,
  schema: CRITIQUE_SCHEMA,

  buildPrompt(input: CriticInput, ctx: SpecialistContext): ProviderMessage[] {
    const e = input.estrutura;
    const adventure = [
      `TÍTULO: ${e.titulo}\nTEMA: ${e.tema}\nGANCHOS: ${e.ganchos.join(' | ')}\nRELÓGIO DE TENSÃO: ${e.relogioDeTensao}`,
      'CENAS:\n' +
        e.cenas
          .map((c) => `- ${c.nome} (${c.local}): ${c.objetivo} [pré-requisitos: ${c.preRequisitos.join(', ') || 'nenhum'}]`)
          .join('\n'),
      `CLÍMAX: ${e.climax}\nCONSEQUÊNCIAS DE FALHA: ${e.consequenciasDeFalha}\nRECOMPENSAS: ${e.recompensas}`,
      input.npcs.length
        ? 'NPCS:\n' + input.npcs.map((n) => `- ${n.nome}: ${n.conceito} | quer: ${n.objetivo} | esconde: ${n.segredo}`).join('\n')
        : '',
      input.encontros.length
        ? 'ENCONTROS:\n' +
          input.encontros
            .map((x) => `- ${x.monstros.map((m) => m.nome).join(', ')} (${x.ambiente}): ${x.ameaca}`)
            .join('\n')
        : '',
      input.narrativas.length
        ? 'NARRATIVAS:\n' +
          input.narrativas.map((n) => `- ${n.cena}: "${n.narrativa.textoReadAloud.slice(0, 300)}"`).join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return [
      {
        role: 'system',
        content:
          'Você é o crítico do Diegesis Codex: um editor implacável e construtivo de aventuras de RPG. ' +
          'Revise a aventura abaixo contra o cânone do universo e a qualidade narrativa.\n\n' +
          'Procure, nesta ordem:\n' +
          '1. Contradições com o cânone (nomes, culturas, fatos, geografia).\n' +
          '2. Incoerências internas (NPC que age sem motivo, cena que exige algo impossível, ' +
          'pré-requisitos circulares, clímax que não paga o tema).\n' +
          '3. Stakes fracos (cena sem nada em jogo, relógio de tensão que não morde).\n' +
          '4. Clichês genéricos que poderiam existir em qualquer mundo (sinal de que o cânone foi ignorado).\n\n' +
          'Regras:\n' +
          '- Seja cirúrgico: aponte no máximo os 5 problemas mais importantes, cada um com o especialista ' +
          'responsável por corrigi-lo.\n' +
          '- Pequenos deslizes de estilo NÃO reprovam a aventura.\n' +
          '- aprovado=true quando a aventura estiver coesa e jogável, mesmo que não perfeita.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido original do mestre: ${input.pedido}\n\nAVENTURA MONTADA:\n\n${adventure}\n\nRevise chamando submit_result.`,
      },
    ];
  },

  parse: parseCritique,
};
