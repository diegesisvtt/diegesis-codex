// NPC generation — system-agnostic (no stats): concept, appearance, mannerism,
// goal, secret, and a hook into the adventure.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { NPC_SCHEMA, parseNpc, type Npc, type Scene } from './schemas';

export interface NpcInput {
  /** free-form request when standalone ("um ferreiro suspeito") */
  pedido: string;
  /** the scene this NPC belongs to, when inside an adventure pipeline */
  cena?: Scene;
  /** critic feedback, when re-running after review */
  revisao?: string;
}

export const npcSpecialist: Specialist<NpcInput, Npc> = {
  id: 'npc',
  description:
    'Cria NPCs memoráveis e agnósticos de sistema: conceito, aparência, maneirismo interpretável, objetivo, segredo e vínculo com a trama.',
  temperature: 0.8,
  maxTokens: 1536,
  schema: NPC_SCHEMA,

  buildPrompt(input: NpcInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em NPCs do Diegesis Codex. Você cria personagens não-jogadores que o mestre ' +
          'consegue interpretar em 30 segundos e que rendem história.\n\n' +
          'Regras:\n' +
          '- NÃO inclua estatísticas de jogo (PV, CA, atributos) — o conteúdo é agnóstico de sistema.\n' +
          '- O nome deve ser coerente com a cultura do NPC no mundo (veja o cânone e os nomes do dossiê).\n' +
          '- Maneirismo é para a mesa: algo físico/vocal que o mestre possa fazer (coça a cicatriz, fala em sussurros).\n' +
          '- Objetivo e segredo devem gerar atrito: o NPC quer algo e esconde algo — idealmente ligados.\n' +
          '- vinculoComAventura conecta o NPC à trama (aliado, obstáculo, vítima, informante). Deixe vazio ' +
          'apenas se o pedido for por um NPC avulso.\n' +
          '- Não repita NPCs já criados no dossiê.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content:
          (input.cena
            ? `Crie um NPC importante para a cena "${input.cena.nome}" (${input.cena.local}). ` +
              `Objetivo da cena: ${input.cena.objetivo}.\n` +
              (input.pedido ? `Orientação do mestre: ${input.pedido}\n` : '')
            : `Pedido: ${input.pedido}\n`) +
          (input.revisao ? `\nRevisão solicitada pelo crítico:\n${input.revisao}\n` : '') +
          '\nCrie o NPC chamando submit_result.',
      },
    ];
  },

  parse: parseNpc,
};
