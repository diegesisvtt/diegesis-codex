// Character goals & motivations distilled from the guide: goal (future, what)
// vs motivation (past, why); internal vs external motivation; internal vs
// external conflict — the 5-point checklist that must resolve by the end.
// Motives rooted in backstory, fears tied to the goal, unconscious motives,
// and motives that belong to the character, not the author.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { DRIVE_SCHEMA, parseCharacterDrive, type CharacterDrive } from './schemas';

export interface DriveInput {
  /** free-form request, e.g. "as motivações de uma ladina órfã", "o que move o rei" */
  pedido: string;
}

export const motivationSpecialist: Specialist<DriveInput, CharacterDrive> = {
  id: 'motivation',
  description:
    'Define objetivos e motivações de um personagem: objetivo, motivações interna/externa, conflitos interno/externo, medos, consciência dos próprios motivos e arco de mudança.',
  temperature: 0.75,
  maxTokens: 2048,
  schema: DRIVE_SCHEMA,

  buildPrompt(input: DriveInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em objetivos e motivações do Mythril. Sem objetivo e motivação, um ' +
          'personagem é uma marionete; com eles, é uma pessoa.\n\n' +
          'O CHECKLIST DE 5 PONTOS (todos resolvidos — ou satisfatoriamente encerrados — até o fim da história):\n' +
          '1. objetivo: o que o personagem quer — voltado ao FUTURO, algo a alcançar.\n' +
          '2. motivacaoExterna: a razão pública — o que todos veem (verdadeira ou fachada).\n' +
          '3. motivacaoInterna: a razão verdadeira, enraizada no PASSADO — a individual, que diferencia ' +
          'este personagem de qualquer outro. O advogado diz "justiça"; quer fama.\n' +
          '4. conflitoExterno: o obstáculo do mundo entre ele e o objetivo.\n' +
          '5. conflitoInterno: a guerra interna que as motivações geram (culpa, ganância, dúvida).\n\n' +
          'Regras:\n' +
          '- MOTIVAÇÃO NASCE DA HISTÓRIA: ancore a motivacaoInterna nos grandes eventos formativos do ' +
          'personagem (perdas, sonhos de infância, humilhações). O órfão que busca pertencer; o ladrão ' +
          'que descobriu que ama a adrenalina.\n' +
          '- MEDOS: ligados ao objetivo — o que ele teme que bloqueie o caminho (ou o que teme descobrir ' +
          'sobre si mesmo se conseguir).\n' +
          '- CONSCIÊNCIA: o personagem pode não saber seus próprios motivos. Frodo aceitou levar o Anel ' +
          '"por dever" — mas já não conseguia se separar dele. Motivações inconscientes são as mais ricas.\n' +
          '- MOTIVOS SÃO DO PERSONAGEM, não do autor: cada motivo deve fazer sentido para QUEM ele é, ' +
          'não para a conveniência da trama.\n' +
          '- Se o pedido envolver um GRUPO: dê motivações que CONTRASTEM (um quer o ouro, outro quer ' +
          'justiça, outro quer só sair vivo) — contraste gera conflito, conflito gera história.\n' +
          '- NÃO ÓBVIO: bons motivos se revelam aos poucos. Em "consciencia" e "arco", sugira o que fica ' +
          'oculto para uma revelação posterior.\n' +
          '- ARCO: o personagem termina diferente de como começou — mesmo que a mudança seja apenas ' +
          'endurecer naquilo que já era.\n' +
          '- "Nem sempre se consegue o que se quer": o objetivo pode ser inalcançável — sugira no arco ' +
          'o que acontece se falhar.\n' +
          '- Respeite o cânone: se o personagem existe nas notas, os motivos devem ser coerentes com ele.\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nDefina os objetivos e motivações chamando submit_result.`,
      },
    ];
  },

  parse: parseCharacterDrive,
};
