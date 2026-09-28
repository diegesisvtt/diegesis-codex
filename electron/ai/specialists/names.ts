// Name generation, inspired by the breadth of fantasynamegenerators.com:
// cultures/races (elf, dwarf, orc, dragonborn...), places (tavern, dungeon,
// city, kingdom...), things (guilds, artifacts, ships...). Names must match
// the world's established cultures when the canon defines them.
//
// The prompt also distills a naming-styles guide: fictional species shouldn't
// all default to "first name + last name". Real cultures use patronymics,
// titles, caste/profession names, meaning-based, birth-order, event-based,
// deity-based and protection names — naming systems are worldbuilding.

import type { ProviderMessage } from '../providers/base';
import { contextBlock, type Specialist, type SpecialistContext } from './base';
import { NAMES_SCHEMA, parseNameList, type NameList } from './schemas';

export interface NamesInput {
  /** free-form request, e.g. "5 nomes élficos femininos" or "nomes para as tavernas da cidade" */
  pedido: string;
}

export const namesSpecialist: Specialist<NamesInput, NameList> = {
  id: 'names',
  description:
    'Gera nomes de personagens, lugares e coisas (tavernas, cidades, guildas, artefatos), coerentes com cultura/raça e com o cânone do mundo.',
  temperature: 0.9,
  maxTokens: 2048,
  schema: NAMES_SCHEMA,

  buildPrompt(input: NamesInput, ctx: SpecialistContext): ProviderMessage[] {
    return [
      {
        role: 'system',
        content:
          'Você é o especialista em nomes do Diegesis Codex, com a variedade de um grande gerador de nomes de fantasia: ' +
          'personagens (elfos, anões, orcs, humanos de culturas diversas, dracônicos, feéricos...), ' +
          'lugares (tavernas, cidades, dungeons, reinos, rios...), organizações (guildas, cultos, ordens) ' +
          'e coisas (artefatos, navios, espadas lendárias).\n\n' +
          'Regras:\n' +
          '- Nomes bons têm fonética consistente com a cultura de origem: decida a cultura e mantenha o padrão sonoro.\n' +
          '- Se o cânone do universo define culturas/idiomas, os nomes DEVEM segui-los.\n' +
          '- Inclua significado/conotação quando agregar evocação.\n' +
          '- Nunca repita nomes já usados no dossiê.\n\n' +
          'SISTEMAS DE NOMENCLATURA (nomes são worldbuilding):\n' +
          '- NÃO padronize tudo como "nome + sobrenome" — culturas e espécies diferentes usam sistemas ' +
          'diferentes. Ao gerar, escolha (ou infira do cânone) um sistema e declare-o no campo "estilo".\n' +
          '- Baseados em ancestral: sobrenome herdado do pai/mãe; patronímicos ("filho de"/"filha de", ' +
          'como Ericsson, bin Omar, ben David); nome de pais/avós como nome próprio ou do meio.\n' +
          '- Baseados em sexo: formas masculinas/femininas distintas, às vezes sutis (Eli/Elle); ' +
          'sobrenomes sexo-específicos em sistemas patronímicos.\n' +
          '- Cortesia e afeto: formas do mesmo nome para polidez, amizade e intimidade (quanto mais ' +
          'íntimo, mais curto); títulos que marcam relação e respeito (-san, -sama, -dono).\n' +
          '- Casta e profissão: nomes de ofício (Ferreiro, Arqueiro, Chapman) ou de feitos ' +
          '(Punho-de-Trovão, Guarda-de-Honra, Monta-Lobos) — muito comuns em fantasia.\n' +
          '- Baseados em significado: nomes-desejo dados pelos pais (Esperança, Verão); nomes do ' +
          'ambiente (Foca, Rio) — também funcionam como apelidos de personagens poderosos.\n' +
          '- Baseados em nascimento: ordem de nascimento (primogênito = Wayan, segundo = Made); ' +
          'eventos do parto ("nascido durante uma jornada"); horóscopo/constelações — ótimo para ' +
          'seres espirituais em mundos com estrelas fictícias.\n' +
          '- Baseados em deuses: nomes de textos sagrados; nomes de divindades como nomes próprios; ' +
          'significados religiosos ("servo de Deus"); nomes PROTETIVOS depreciativos ("não este", ' +
          '"não é humano") para enganar espíritos malignos.\n' +
          '- Eventos de vida: mudança de sobrenome no casamento, nomes novos em ritos de passagem.\n' +
          '- Lei e ordem: nomes proibidos, sobrenomes obrigatórios, ordem "sobrenome + nome" (Ásia) ' +
          'em vez de "nome + sobrenome" (Ocidente).\n' +
          '- Uma cultura pode misturar sistemas. O que importa é coerência INTERNA: nomes da mesma ' +
          'cultura seguem a mesma lógica.\n\n' +
          '- Responda no idioma do usuário.\n\n' +
          contextBlock(ctx),
      },
      {
        role: 'user',
        content: `Pedido: ${input.pedido}\n\nGere os nomes chamando submit_result.`,
      },
    ];
  },

  parse: parseNameList,
};
