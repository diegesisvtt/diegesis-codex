// Generation orchestrator: runs the specialist pipeline for a routed request,
// streams progress + final summary to the chat, and persists results as
// documents in the realm (which automatically feeds future RAG retrieval).

import * as db from '../../db';
import { generateId } from '../../db';
import { docEvents } from '../events';
import { markdownToBlocks } from '../../../shared/blockContent';
import type { ChatMessage, RetrievedChunk } from '../../../shared/types';
import {
  emptyDossier,
  runSpecialist,
  type LLMHandle,
  type SpecialistContext,
} from './base';
import { premiseSpecialist } from './premise';
import { adventureStructureSpecialist } from './adventure-structure';
import { namesSpecialist } from './names';
import { narrativeSpecialist } from './narrative';
import { npcSpecialist } from './npc';
import { encounterSpecialist } from './encounter';
import { criticSpecialist } from './critic';
import { demonSpecialist } from './demon';
import { dialogueSpecialist } from './dialogue';
import { plotSpecialist } from './plot';
import { combatSpecialist } from './combat';
import { painSpecialist } from './pain';
import { villainSpecialist } from './villain';
import { motivationSpecialist } from './motivation';
import { bodyLanguageSpecialist } from './body-language';
import { worldSpecialist } from './world';
import { societySpecialist } from './society';
import { creatureSpecialist } from './creature';
import { innerStorySpecialist } from './inner-story';
import { historySpecialist } from './history';
import { characterSpecialist } from './character';
import { citySpecialist } from './city';
import { titlesSpecialist } from './titles';
import { romanceSpecialist } from './romance';
import { scenerySpecialist } from './scenery';
import { sceneSpecialist } from './scene';
import { speechSpecialist } from './speech';
import { openingSpecialist } from './opening';
import { religionSpecialist } from './religion';
import { magicSpecialist } from './magic';
import { armySpecialist } from './army';
import { campaignStartSpecialist } from './campaign-start';
import { moodSpecialist } from './mood';
import { questSpecialist } from './quest';
import { locationSpecialist } from './location';
import { dungeonSpecialist } from './dungeon';
import type { RouteDecision } from './router';
import type {
  ArmyDesign,
  BodyLanguage,
  CampaignStart,
  CharacterDrive,
  CharacterProfile,
  CityDesign,
  CombatScene,
  Creature,
  DemonDescription,
  DialogueScene,
  DungeonDesign,
  Encounter,
  InnerStory,
  LocationDesign,
  MagicSystem,
  MoodPlan,
  NameList,
  Narrative,
  Npc,
  Opening,
  PainDescription,
  Plot,
  QuestList,
  Religion,
  RomanceDesign,
  Scene,
  SceneCraft,
  SceneryDescription,
  Society,
  Speech,
  TitleList,
  Villain,
  WorldHistory,
  WorldShape,
} from './schemas';

const MAX_TITLE = 200;
const MAX_CONTENT = 100_000;
const MAX_SCENES_DETAILED = 6;
const MAX_NPCS = 3;
const MAX_ENCOUNTERS = 2;
const MAX_CRITIC_CYCLES = 2;

export interface GenerationDeps {
  llm: LLMHandle;
  realmId: string;
  /** semantic retrieval over the realm's notes; null when the user disabled context */
  retrieve: ((query: string) => Promise<RetrievedChunk[]>) | null;
  send: (delta: string, done: boolean, error?: string) => void;
  /** surfaced as tool/progress events in the chat UI */
  onProgress: (summary: string) => void;
  signal?: AbortSignal;
}

// ---------- persistence ----------

function createFolder(realmId: string, parentId: string | null, title: string): string {
  return db.createDoc({
    id: generateId(),
    realmId,
    parentId,
    type: 'core/folder',
    title: title.slice(0, MAX_TITLE),
    content: null,
  }).id;
}

function createNote(realmId: string, parentId: string | null, title: string, markdown: string): void {
  db.createDoc({
    id: generateId(),
    realmId,
    parentId,
    type: 'core/note',
    title: title.slice(0, MAX_TITLE),
    content: markdownToBlocks(markdown.slice(0, MAX_CONTENT)),
  });
}

function npcMarkdown(npc: Npc): string {
  return [
    `# ${npc.nome}`,
    `> ${npc.conceito}`,
    '',
    `**Aparência:** ${npc.aparencia}`,
    `**Maneirismo:** ${npc.maneirismo}`,
    `**Objetivo:** ${npc.objetivo}`,
    `**Segredo:** ${npc.segredo}`,
    ...(npc.vinculoComAventura ? [`**Vínculo com a aventura:** ${npc.vinculoComAventura}`] : []),
  ].join('\n');
}

function encounterMarkdown(enc: Encounter): string {
  return [
    `# Encontro`,
    '',
    ...enc.monstros.flatMap((m) => [
      `## ${m.nome}`,
      m.descricao,
      '',
      `**Comportamento:** ${m.comportamento}`,
      `**Tática:** ${m.tatica}`,
      '',
    ]),
    `**Ameaça:** ${enc.ameaca}`,
    `**Ambiente:** ${enc.ambiente}`,
  ].join('\n');
}

function narrativeMarkdown(n: Narrative): string {
  return [`> ${n.textoReadAloud}`, '', `**Para o mestre:** ${n.descricaoGM}`, '', `**Atmosfera:** ${n.atmosfera}`].join('\n');
}

function demonMarkdown(d: DemonDescription): string {
  return [`# ${d.titulo}`, '', d.chegada, '', d.cabeca, '', d.corpo, '', d.movimento, '', d.presencaFinal].join('\n');
}

function dialogueMarkdown(d: DialogueScene): string {
  return [
    `# ${d.titulo}`,
    '',
    d.cena,
    '',
    '---',
    '',
    `**Propósito:** ${d.proposito}`,
    `**Subtexto:** ${d.subtexto}`,
    ...(d.vozes.length > 0
      ? ['', '**Vozes:**', ...d.vozes.map((v) => `- **${v.personagem}** — ${v.voz}`)]
      : []),
  ].join('\n');
}

function namesMarkdown(list: NameList): string {
  return list.nomes
    .map(
      (n) =>
        `- **${n.nome}** (${n.cultura})${n.estilo ? ` _${n.estilo}_` : ''}${n.significado ? ` — ${n.significado}` : ''}`
    )
    .join('\n');
}

function plotMarkdown(p: Plot): string {
  return [
    `# ${p.titulo}`,
    '',
    `> **${p.protagonista}** quer: ${p.desejo}`,
    '',
    `**Obstáculo:** ${p.obstaculo}`,
    `**Consequências da falha:** ${p.consequencias}`,
    `**Em risco:** ${p.emRisco}`,
    ...(p.lucros ? [`**Lucros da jornada:** ${p.lucros}`] : []),
    '',
    `**Tipo de final:** ${p.tipoFinal}`,
    '',
    ...(p.requisitos.length > 0 ? ['## Requisitos', ...p.requisitos.map((r) => `- ${r}`), ''] : []),
    ...(p.ameacas.length > 0 ? ['## Ameaças', ...p.ameacas.map((a) => `- ${a}`), ''] : []),
    '## Ação ascendente',
    ...p.acaoAscendente.map((e, i) => `${i + 1}. ${e}`),
    '',
    `**Clímax:** ${p.climax}`,
    ...(p.acaoDescendente ? [`**Ação descendente:** ${p.acaoDescendente}`] : []),
    '',
    `**Resolução:** ${p.resolucao}`,
  ].join('\n');
}

function combatMarkdown(c: CombatScene): string {
  return [
    `# ${c.titulo}`,
    '',
    c.cena,
    '',
    '---',
    '',
    `**Propósito:** ${c.proposito}`,
    `**Resultado planejado:** ${c.resultado}`,
    `**Notas técnicas:** ${c.notasTecnicas}`,
  ].join('\n');
}

function painMarkdown(p: PainDescription): string {
  return [
    `# ${p.titulo}`,
    '',
    `> ${[p.tipoDor, p.intensidade].filter(Boolean).join(' — ')}`,
    '',
    `**1. A sensação:** ${p.sensacaoInicial}`,
    '',
    `**2. A reação:** ${p.reacaoEmocional}`,
    '',
    `**3. A hesitação:** ${p.hesitacao}`,
    '',
    `**4. A luta:** ${p.luta}`,
    '',
    `**Desfecho — resiste:** ${p.desfechoResiste}`,
    '',
    `**Desfecho — cede:** ${p.desfechoCede}`,
  ].join('\n');
}

function villainMarkdown(v: Villain): string {
  return [
    `# ${v.nome}`,
    '',
    `> ${v.conceito}`,
    '',
    `**Motivação:** ${v.motivacao}`,
    `**Bússola moral:** ${v.bussolaMoral}`,
    `**Humanidade:** ${v.humanidade}`,
    `**Maldade em cena:** ${v.maldadeEmCena}`,
    `**Contraste com o herói:** ${v.contrasteComHeroi}`,
    `**Dano permanente:** ${v.danoPermanente}`,
    `**Arco:** ${v.arco}`,
  ].join('\n');
}

function driveMarkdown(d: CharacterDrive): string {
  return [
    `# ${d.nome}`,
    '',
    ...(d.conceito ? [`> ${d.conceito}`, ''] : []),
    `**Objetivo:** ${d.objetivo}`,
    `**Motivação externa:** ${d.motivacaoExterna}`,
    `**Motivação interna:** ${d.motivacaoInterna}`,
    `**Conflito externo:** ${d.conflitoExterno}`,
    `**Conflito interno:** ${d.conflitoInterno}`,
    ...(d.medos ? [`**Medos:** ${d.medos}`] : []),
    ...(d.consciencia ? [`**Consciência dos motivos:** ${d.consciencia}`] : []),
    ...(d.arco ? [`**Arco:** ${d.arco}`] : []),
  ].join('\n');
}

function bodyLanguageMarkdown(b: BodyLanguage): string {
  return [
    `# ${b.titulo}`,
    '',
    ...(b.emocao ? [`> ${b.emocao}`, ''] : []),
    b.descricao,
    '',
    ...(b.sinaisChave.length > 0
      ? ['**Sinais-chave:**', ...b.sinaisChave.map((s) => `- ${s}`), '']
      : []),
    ...(b.notas ? [`**Notas:** ${b.notas}`] : []),
  ].join('\n');
}

function worldMarkdown(w: WorldShape): string {
  return [
    `# ${w.nome}`,
    '',
    `> ${w.conceito}`,
    '',
    `**Geografia:** ${w.geografia}`,
    '',
    ...(w.climaEEstacoes ? [`**Clima e estações:** ${w.climaEEstacoes}`, ''] : []),
    `**Natureza:** ${w.natureza}`,
    '',
    `**Civilizações:** ${w.civilizacoes}`,
    '',
    ...(w.historia ? [`**História na paisagem:** ${w.historia}`, ''] : []),
    ...(w.fenomenos ? [`**Fenômenos:** ${w.fenomenos}`, ''] : []),
    ...(w.vidaCotidiana ? [`**Vida cotidiana:** ${w.vidaCotidiana}`] : []),
  ].join('\n');
}

function societyMarkdown(s: Society): string {
  return [
    `# ${s.nome}`,
    '',
    `**Razão de ser:** ${s.razaoDeSer}`,
    '',
    `**Governantes:** ${s.governantes}`,
    `**Lei e ordem:** ${s.leiEOrdem}`,
    ...(s.religiao ? [`**Religião:** ${s.religiao}`] : []),
    '',
    ...(s.tradicoes.length > 0 ? ['## Tradições', ...s.tradicoes.map((t) => `- ${t}`), ''] : []),
    ...(s.cultura ? [`**Cultura e lazer:** ${s.cultura}`, ''] : []),
    ...(s.conflitos.length > 0 ? ['## Conflitos', ...s.conflitos.map((c) => `- ${c}`), ''] : []),
    ...(s.custoEscondido ? [`**O custo escondido:** ${s.custoEscondido}`] : []),
  ].join('\n');
}

function creatureMarkdown(c: Creature): string {
  return [
    `# ${c.nome}`,
    '',
    `> ${c.tipo}`,
    '',
    `**Aparência:** ${c.aparencia}`,
    `**Habitat:** ${c.habitat}`,
    ...(c.som ? [`**Som:** ${c.som}`] : []),
    `**Dieta e cadeia alimentar:** ${c.dieta}`,
    `**Comportamento:** ${c.comportamento}`,
    ...(c.raridade ? [`**Raridade:** ${c.raridade}`] : []),
    ...(c.reproducao ? [`**Reprodução:** ${c.reproducao}`] : []),
    ...(c.domesticacao ? [`**Domesticação:** ${c.domesticacao}`] : []),
    ...(c.subespecies ? [`**Subespécies:** ${c.subespecies}`] : []),
  ].join('\n');
}

function innerStoryMarkdown(s: InnerStory): string {
  return [
    `# ${s.titulo}`,
    '',
    s.historia,
    '',
    '---',
    '',
    ...(s.proposito ? [`**Propósito:** ${s.proposito}`] : []),
    ...(s.moldura ? [`**Moldura:** ${s.moldura}`] : []),
    ...(s.narrador ? [`**Narrador:** ${s.narrador}`] : []),
    ...(s.verdade ? [`**Verdade vs. versão:** ${s.verdade}`] : []),
    ...(s.eco ? [`**Eco na trama:** ${s.eco}`] : []),
  ].join('\n');
}

function historyMarkdown(h: WorldHistory): string {
  return [
    `# ${h.nome}`,
    '',
    h.panorama,
    '',
    ...(h.eras.length > 0
      ? ['## Eras', ...h.eras.flatMap((e) => [`### ${e.nome}`, e.eventos, ''])]
      : []),
    ...(h.verdadeVsPerspectiva ? [`**Verdade vs. perspectiva:** ${h.verdadeVsPerspectiva}`, ''] : []),
    ...(h.reliquias ? [`**Relíquias do passado:** ${h.reliquias}`, ''] : []),
    ...(h.passadoNoPresente ? [`**O passado no presente:** ${h.passadoNoPresente}`] : []),
  ].join('\n');
}

function characterMarkdown(c: CharacterProfile): string {
  return [
    `# ${c.nome}`,
    '',
    `> ${c.conceito} — ${c.papel}`,
    '',
    ...(c.encaixeNoMundo ? [`**No mundo:** ${c.encaixeNoMundo}`] : []),
    ...(c.diferencial ? [`**Diferencial:** ${c.diferencial}`] : []),
    `**Falha:** ${c.falha}`,
    ...(c.contradicao ? [`**Contradição:** ${c.contradicao}`] : []),
    `**Desejo:** ${c.desejo}`,
    ...(c.historiaDeOrigem ? [`**História de origem:** ${c.historiaDeOrigem}`] : []),
    ...(c.tiques ? [`**Tiques e hábitos:** ${c.tiques}`] : []),
    ...(c.mudanca ? [`**Como muda:** ${c.mudanca}`] : []),
  ].join('\n');
}

function cityMarkdown(c: CityDesign): string {
  return [
    `# ${c.nome}`,
    '',
    `> ${c.tipo}`,
    '',
    `**Cenário:** ${c.cenario}`,
    '',
    `**Origem:** ${c.origem}`,
    '',
    `**Layout:** ${c.layout}`,
    '',
    ...(c.populacao ? [`**População:** ${c.populacao}`, ''] : []),
    ...(c.historia ? [`**História visível:** ${c.historia}`, ''] : []),
    ...(c.detalhes ? [`**Detalhes de rua:** ${c.detalhes}`, ''] : []),
    ...(c.eventos ? [`**Eventos:** ${c.eventos}`] : []),
  ].join('\n');
}

function titlesMarkdown(t: TitleList): string {
  return [
    `**Essência da história:** ${t.essencia}`,
    '',
    ...t.titulos.map((x) => `- **${x.titulo}** _(${x.estilo})_ — ${x.justificativa}`),
  ].join('\n');
}

function romanceMarkdown(r: RomanceDesign): string {
  return [
    `# ${r.titulo}`,
    '',
    `> ${r.premissa}`,
    '',
    '## O casal',
    ...r.casal.flatMap((p) => [
      `### ${p.nome}`,
      ...(p.conceito ? [p.conceito] : []),
      ...(p.pontoDePartida ? [`**No início:** ${p.pontoDePartida}`] : []),
      ...(p.crescimento ? [`**Crescimento:** ${p.crescimento}`] : []),
      '',
    ]),
    ...(r.obstaculos.length > 0 ? ['## Obstáculos', ...r.obstaculos.map((o) => `- ${o}`), ''] : []),
    ...(r.escolha ? [`**A escolha:** ${r.escolha}`, ''] : []),
    ...(r.coadjuvantes ? [`**Coadjuvantes:** ${r.coadjuvantes}`, ''] : []),
    ...(r.locacao ? [`**Locação:** ${r.locacao}`, ''] : []),
    ...(r.foco ? [`**Foco:** ${r.foco}`] : []),
  ].join('\n');
}

function sceneryMarkdown(s: SceneryDescription): string {
  return [
    `# ${s.titulo}`,
    '',
    s.descricao,
    '',
    '---',
    '',
    `**Foco:** ${s.foco}`,
    ...(s.pontoDeVista ? [`**Ponto de vista:** ${s.pontoDeVista}`] : []),
    ...(s.palavrasChave ? [`**Escolha de palavras:** ${s.palavrasChave}`] : []),
    ...(s.economia ? [`**Deixado de fora:** ${s.economia}`] : []),
  ].join('\n');
}

function sceneMarkdown(s: SceneCraft): string {
  return [
    `# ${s.titulo}`,
    '',
    s.cena,
    '',
    '---',
    '',
    `**Propósito:** ${s.proposito}`,
    ...(s.arcoDaCena ? [`**Arco da cena:** ${s.arcoDaCena}`] : []),
    ...(s.ritmo ? [`**Ritmo:** ${s.ritmo}`] : []),
    ...(s.notas ? [`**Notas:** ${s.notas}`] : []),
  ].join('\n');
}

function speechMarkdown(s: Speech): string {
  return [
    `# ${s.titulo}`,
    '',
    `> ${s.orador} — tese: ${s.tese}`,
    '',
    s.discurso,
    '',
    '---',
    '',
    ...(s.estrutura ? [`**Estrutura:** ${s.estrutura}`] : []),
    ...(s.persuasao ? [`**Persuasão:** ${s.persuasao}`] : []),
    ...(s.notas ? [`**Notas:** ${s.notas}`] : []),
  ].join('\n');
}

function openingMarkdown(o: Opening): string {
  return [
    `# ${o.titulo}`,
    '',
    `> ${o.primeiraFrase}`,
    '',
    o.abertura,
    '',
    '---',
    '',
    `**Promessa ao leitor:** ${o.promessa}`,
    ...(o.tecnica ? [`**Técnica:** ${o.tecnica}`] : []),
    ...(o.ancoragem ? [`**Ancoragem:** ${o.ancoragem}`] : []),
    ...(o.notas ? [`**Notas:** ${o.notas}`] : []),
  ].join('\n');
}

function religionMarkdown(r: Religion): string {
  return [
    `# ${r.nome}`,
    '',
    `> ${r.natureza}`,
    '',
    `**Deuses:** ${r.deuses}`,
    '',
    ...(r.poderes ? [`**Poderes:** ${r.poderes}`, ''] : []),
    ...(r.origem ? [`**Origem:** ${r.origem}`, ''] : []),
    ...(r.figuras ? [`**Figuras especiais:** ${r.figuras}`, ''] : []),
    ...(r.lugaresESimbolos ? [`**Lugares e símbolos:** ${r.lugaresESimbolos}`, ''] : []),
    ...(r.rituais.length > 0 ? ['## Rituais', ...r.rituais.map((x) => `- ${x}`), ''] : []),
    `**Doutrina:** ${r.doutrina}`,
    ...(r.rigorEVersoes ? ['', `**Rigor e versões:** ${r.rigorEVersoes}`] : []),
  ].join('\n');
}

function magicMarkdown(m: MagicSystem): string {
  return [
    `# ${m.nome}`,
    '',
    `**Fonte:** ${m.fonte}`,
    ...(m.materiais ? [`**Materiais:** ${m.materiais}`] : []),
    '',
    `**Quem usa:** ${m.quemUsa}`,
    ...(m.comoUsa ? [`**Como usa:** ${m.comoUsa}`] : []),
    '',
    `**Poderes:** ${m.poderes}`,
    '',
    ...(m.ganhoDePoder ? [`**Ganho de poder:** ${m.ganhoDePoder}`, ''] : []),
    ...(m.combinacao ? [`**Combinação:** ${m.combinacao}`, ''] : []),
    `**Limitações:** ${m.limitacoes}`,
  ].join('\n');
}

function armyMarkdown(a: ArmyDesign): string {
  return [
    `# ${a.nome}`,
    '',
    `**Liderança:** ${a.lideranca}`,
    '',
    ...(a.patentes.length > 0 ? ['## Patentes', ...a.patentes.map((x) => `- ${x}`), ''] : []),
    ...(a.divisoes.length > 0 ? ['## Divisões', ...a.divisoes.map((x) => `- ${x}`), ''] : []),
    ...(a.taticas ? [`**Táticas:** ${a.taticas}`, ''] : []),
    ...(a.forcasEspeciais ? [`**Forças especiais:** ${a.forcasEspeciais}`, ''] : []),
    ...(a.equipamento ? [`**Equipamento:** ${a.equipamento}`, ''] : []),
    ...(a.logistica ? [`**Logística:** ${a.logistica}`, ''] : []),
    `**Recrutamento:** ${a.recrutamento}`,
  ].join('\n');
}

function campaignStartMarkdown(c: CampaignStart): string {
  return [
    `# ${c.titulo}`,
    '',
    ...(c.proposito ? [`> ${c.proposito}`, ''] : []),
    '## A Abertura',
    c.abertura,
    '',
    `**Motivação do grupo:** ${c.motivacao}`,
    '',
    ...(c.caminhos.length > 0 ? ['## Caminhos ao final da sessão', ...c.caminhos.map((x) => `- ${x}`), ''] : []),
    ...(c.pressagio ? [`**Presságio da trama maior:** ${c.pressagio}`, ''] : []),
    ...(c.notas ? ['## Notas para o GM', c.notas] : []),
  ].join('\n');
}

function moodMarkdown(m: MoodPlan): string {
  const sceneBlock = (s: MoodPlan['cenas'][number]): string[] => [
    `## ${s.cena}`,
    ...(s.som ? [`- **Som:** ${s.som}`] : []),
    ...(s.aroma ? [`- **Aroma:** ${s.aroma}`] : []),
    ...(s.luz ? [`- **Luz:** ${s.luz}`] : []),
    ...(s.tato ? [`- **Tato:** ${s.tato}`] : []),
    ...(s.sabor ? [`- **Sabor:** ${s.sabor}`] : []),
    '',
  ];
  return [
    `# ${m.titulo}`,
    '',
    `> ${m.conceito}`,
    '',
    ...m.cenas.flatMap(sceneBlock),
    ...(m.notas ? ['## Notas práticas', m.notas] : []),
  ].join('\n');
}

function questListMarkdown(q: QuestList): string {
  return [
    `# Missões${q.tema ? ` — ${q.tema}` : ''}`,
    '',
    ...q.quests.flatMap((x) => [
      `## ${x.titulo}`,
      x.gancho,
      ...(x.complicacao ? ['', `**Complicação:** ${x.complicacao}`] : []),
      '',
    ]),
  ].join('\n');
}

function locationMarkdown(l: LocationDesign): string {
  return [
    `# ${l.nome}`,
    ...(l.apelido ? ['', `> *${l.apelido}*`] : []),
    '',
    `**Conceito:** ${l.conceito}`,
    '',
    ...(l.vida ? [`**Vida cotidiana:** ${l.vida}`, ''] : []),
    ...(l.desafios ? [`**Desafios:** ${l.desafios}`, ''] : []),
    ...(l.ganchos.length > 0 ? ['## Ganchos de história', ...l.ganchos.map((x) => `- ${x}`)] : []),
  ].join('\n');
}

function dungeonMarkdown(d: DungeonDesign): string {
  return [
    `# ${d.nome}`,
    '',
    `> ${d.conceito}`,
    '',
    ...(d.origem ? [`**Origem:** ${d.origem}`, ''] : []),
    `**Estrutura:** ${d.estrutura}`,
    '',
    ...(d.habitantes ? [`**Habitantes:** ${d.habitantes}`, ''] : []),
    `**Reviravolta:** ${d.reviravolta}`,
    ...(d.recompensas ? ['', `**Recompensas:** ${d.recompensas}`] : []),
  ].join('\n');
}

// ---------- pipeline ----------

async function buildContext(realmId: string, retrieve: GenerationDeps['retrieve'], query: string): Promise<SpecialistContext> {
  let canon: RetrievedChunk[] = [];
  if (retrieve) {
    try {
      canon = await retrieve(query);
    } catch {
      canon = []; // embeddings unavailable — generate without canon rather than fail
    }
  }
  return { realmId, canon, dossier: emptyDossier() };
}

function historicoDe(messages: ChatMessage[]): string {
  return messages
    .slice(-6, -1)
    .map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content.slice(0, 400)}`)
    .join('\n');
}

/**
 * Runs the full generation pipeline for a routed request.
 * Returns the assistant text streamed to the chat (for conversation persistence).
 */
export async function runGeneration(
  decision: RouteDecision,
  messages: ChatMessage[],
  deps: GenerationDeps
): Promise<string> {
  const { llm, realmId, retrieve, send, onProgress, signal } = deps;
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const pedido = decision.resumo ?? lastUser?.content ?? '';

  onProgress('Consultando o cânone do universo…');
  const ctx = await buildContext(realmId, retrieve, pedido);

  let out = '';
  const emit = (markdown: string) => {
    out += markdown;
    send(markdown, false);
  };

  switch (decision.task) {
    case 'names': {
      onProgress('Gerando nomes…');
      const list = await runSpecialist(namesSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.nomesUsados.push(...list.nomes.map((n) => n.nome));
      persistSingle(realmId, 'Nomes', `Nomes — ${pedido.slice(0, 60)}`, namesMarkdown(list));
      emit(namesMarkdown(list) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'npc': {
      onProgress('Criando NPC…');
      const npc = await runSpecialist(npcSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.npcs.push(npc);
      ctx.dossier.nomesUsados.push(npc.nome);
      persistSingle(realmId, 'NPCs', npc.nome, npcMarkdown(npc));
      emit(npcMarkdown(npc) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'encounter': {
      onProgress('Criando encontro…');
      const enc = await runSpecialist(encounterSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.encontros.push(enc);
      const title = enc.monstros.map((m) => m.nome).join(', ');
      persistSingle(realmId, 'Encontros', title, encounterMarkdown(enc));
      emit(encounterMarkdown(enc) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'demon': {
      onProgress('Descrevendo o demônio…');
      const d = await runSpecialist(demonSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Demônios', d.titulo, demonMarkdown(d));
      emit(demonMarkdown(d) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'dialogue': {
      onProgress('Escrevendo o diálogo…');
      const d = await runSpecialist(dialogueSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Diálogos', d.titulo, dialogueMarkdown(d));
      emit(dialogueMarkdown(d) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'plot': {
      onProgress('Desenhando a trama…');
      const p = await runSpecialist(plotSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Plots', p.titulo, plotMarkdown(p));
      emit(plotMarkdown(p) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'combat': {
      onProgress('Escrevendo a cena de combate…');
      const c = await runSpecialist(combatSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Combate', c.titulo, combatMarkdown(c));
      emit(combatMarkdown(c) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'pain': {
      onProgress('Escrevendo a descrição de dor…');
      const p = await runSpecialist(painSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Dor', p.titulo, painMarkdown(p));
      emit(painMarkdown(p) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'villain': {
      onProgress('Criando o vilão…');
      const v = await runSpecialist(villainSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.nomesUsados.push(v.nome);
      persistSingle(realmId, 'Vilões', v.nome, villainMarkdown(v));
      emit(villainMarkdown(v) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'motivation': {
      onProgress('Definindo objetivos e motivações…');
      const d = await runSpecialist(motivationSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.nomesUsados.push(d.nome);
      persistSingle(realmId, 'Motivações', d.nome, driveMarkdown(d));
      emit(driveMarkdown(d) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'body-language': {
      onProgress('Escrevendo a linguagem corporal…');
      const b = await runSpecialist(bodyLanguageSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Linguagem Corporal', b.titulo, bodyLanguageMarkdown(b));
      emit(bodyLanguageMarkdown(b) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'world': {
      onProgress('Desenhando o mundo…');
      const w = await runSpecialist(worldSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Mundos', w.nome, worldMarkdown(w));
      emit(worldMarkdown(w) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'society': {
      onProgress('Criando a sociedade…');
      const s = await runSpecialist(societySpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Sociedades', s.nome, societyMarkdown(s));
      emit(societyMarkdown(s) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'creature': {
      onProgress('Criando a criatura…');
      const c = await runSpecialist(creatureSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Criaturas', c.nome, creatureMarkdown(c));
      emit(creatureMarkdown(c) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'inner-story': {
      onProgress('Escrevendo a história aninhada…');
      const s = await runSpecialist(innerStorySpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Histórias Internas', s.titulo, innerStoryMarkdown(s));
      emit(innerStoryMarkdown(s) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'history': {
      onProgress('Escrevendo a história do mundo…');
      const h = await runSpecialist(historySpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'História', h.nome, historyMarkdown(h));
      emit(historyMarkdown(h) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'character': {
      onProgress('Criando o personagem…');
      const c = await runSpecialist(characterSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.nomesUsados.push(c.nome);
      persistSingle(realmId, 'Personagens', c.nome, characterMarkdown(c));
      emit(characterMarkdown(c) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'city': {
      onProgress('Criando a cidade…');
      const c = await runSpecialist(citySpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Cidades', c.nome, cityMarkdown(c));
      emit(cityMarkdown(c) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'titles': {
      onProgress('Gerando títulos…');
      const t = await runSpecialist(titlesSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.nomesUsados.push(...t.titulos.map((x) => x.titulo));
      persistSingle(realmId, 'Títulos', `Títulos — ${pedido.slice(0, 60)}`, titlesMarkdown(t));
      emit(titlesMarkdown(t) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'romance': {
      onProgress('Desenhando o romance…');
      const r = await runSpecialist(romanceSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.nomesUsados.push(...r.casal.map((p) => p.nome));
      persistSingle(realmId, 'Romances', r.titulo, romanceMarkdown(r));
      emit(romanceMarkdown(r) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'scenery': {
      onProgress('Descrevendo o cenário…');
      const s = await runSpecialist(scenerySpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Cenários', s.titulo, sceneryMarkdown(s));
      emit(sceneryMarkdown(s) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'scene': {
      onProgress('Escrevendo a cena…');
      const s = await runSpecialist(sceneSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Cenas', s.titulo, sceneMarkdown(s));
      emit(sceneMarkdown(s) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'speech': {
      onProgress('Escrevendo o discurso…');
      const s = await runSpecialist(speechSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Discursos', s.titulo, speechMarkdown(s));
      emit(speechMarkdown(s) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'opening': {
      onProgress('Escrevendo a abertura…');
      const o = await runSpecialist(openingSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Aberturas', o.titulo, openingMarkdown(o));
      emit(openingMarkdown(o) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'religion': {
      onProgress('Criando a religião…');
      const r = await runSpecialist(religionSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Religiões', r.nome, religionMarkdown(r));
      emit(religionMarkdown(r) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'magic': {
      onProgress('Criando o sistema de magia…');
      const m = await runSpecialist(magicSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Magia', m.nome, magicMarkdown(m));
      emit(magicMarkdown(m) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'army': {
      onProgress('Criando o exército…');
      const a = await runSpecialist(armySpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.nomesUsados.push(a.nome);
      persistSingle(realmId, 'Exércitos', a.nome, armyMarkdown(a));
      emit(armyMarkdown(a) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'campaign-start': {
      onProgress('Preparando a primeira sessão…');
      const c = await runSpecialist(campaignStartSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Inícios de Campanha', c.titulo, campaignStartMarkdown(c));
      emit(campaignStartMarkdown(c) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'mood': {
      onProgress('Planejando a ambientação sensorial…');
      const m = await runSpecialist(moodSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Ambientação', m.titulo, moodMarkdown(m));
      emit(moodMarkdown(m) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'quest': {
      onProgress('Gerando ideias de missões…');
      const q = await runSpecialist(questSpecialist, { pedido }, ctx, llm, signal);
      const titulo = q.tema ? `Missões — ${q.tema}` : `Missões — ${pedido.slice(0, 60)}`;
      persistSingle(realmId, 'Missões', titulo, questListMarkdown(q));
      emit(questListMarkdown(q) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'location': {
      onProgress('Criando o local…');
      const l = await runSpecialist(locationSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.nomesUsados.push(l.nome);
      persistSingle(realmId, 'Locais', l.nome, locationMarkdown(l));
      emit(locationMarkdown(l) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'dungeon': {
      onProgress('Criando a dungeon…');
      const d = await runSpecialist(dungeonSpecialist, { pedido }, ctx, llm, signal);
      ctx.dossier.nomesUsados.push(d.nome);
      persistSingle(realmId, 'Dungeons', d.nome, dungeonMarkdown(d));
      emit(dungeonMarkdown(d) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'narrative': {
      onProgress('Escrevendo descrição…');
      const n = await runSpecialist(narrativeSpecialist, { pedido }, ctx, llm, signal);
      persistSingle(realmId, 'Narrativas', `Descrição — ${pedido.slice(0, 60)}`, narrativeMarkdown(n));
      emit(narrativeMarkdown(n) + '\n\n_Salvo na pasta "Gerado pela IA"._\n');
      break;
    }

    case 'adventure': {
      await runAdventurePipeline(pedido, messages, ctx, deps, emit);
      break;
    }
  }

  return out;
}

/** Single generated pieces live under "Gerado pela IA / <subpasta>". */
function persistSingle(realmId: string, subfolder: string, title: string, markdown: string): void {
  const docs = db.listDocs(realmId);
  const rootId =
    docs.find((d) => d.type === 'core/folder' && d.title === 'Gerado pela IA' && !d.parentId)?.id ??
    createFolder(realmId, null, 'Gerado pela IA');
  const subId =
    db.listDocs(realmId).find((d) => d.type === 'core/folder' && d.title === subfolder && d.parentId === rootId)?.id ??
    createFolder(realmId, rootId, subfolder);
  createNote(realmId, subId, title, markdown);
  docEvents.emit('changed', realmId);
}

// ---------- adventure pipeline ----------

async function runAdventurePipeline(
  pedido: string,
  messages: ChatMessage[],
  ctx: SpecialistContext,
  deps: GenerationDeps,
  emit: (markdown: string) => void
): Promise<void> {
  const { llm, realmId, onProgress, signal } = deps;

  // 1. premise
  onProgress('Refinando a premissa…');
  const premissa = await runSpecialist(
    premiseSpecialist,
    { pedido, historico: historicoDe(messages) },
    ctx,
    llm,
    signal
  );
  if (premissa.pergunta) {
    emit(
      `Antes de gerar, preciso de um detalhe:\n\n**${premissa.pergunta}**\n\n` +
        `_(minha hipótese até aqui: tema "${premissa.tema}", tom ${premissa.tom}, escopo: ${premissa.escopo})_\n`
    );
    return;
  }
  ctx.dossier.premissa = premissa;

  // 2. structure
  onProgress('Criando a estrutura da aventura…');
  let estrutura = await runSpecialist(adventureStructureSpecialist, { pedido, premissa }, ctx, llm, signal);
  ctx.dossier.estrutura = estrutura;

  // 3. details per scene (narrative for all, NPCs/encounters for a subset).
  // A failed scene detail is skipped — one bad call must not kill the pipeline.
  const narrativas: { cena: Scene; narrativa: Narrative }[] = [];
  const npcs: { cena: Scene; npc: Npc }[] = [];
  const encontros: { cena: Scene; encontro: Encounter }[] = [];

  /** Short reason for progress messages; full detail goes to the console. */
  const why = (err: unknown) => {
    console.warn('[specialists] falha de geração:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
  };

  /** Reconciles detail arrays with the (possibly revised) structure:
   *  drops orphans, keeps matches by scene name, details new scenes. */
  const reconcileScenes = async () => {
    const cenas = estrutura.cenas.slice(0, MAX_SCENES_DETAILED);
    const valid = new Set(cenas.map((c) => c.nome.toLowerCase()));

    for (let i = narrativas.length - 1; i >= 0; i--) {
      if (!valid.has(narrativas[i].cena.nome.toLowerCase())) narrativas.splice(i, 1);
    }
    for (let i = npcs.length - 1; i >= 0; i--) {
      if (!valid.has(npcs[i].cena.nome.toLowerCase())) npcs.splice(i, 1);
    }
    for (let i = encontros.length - 1; i >= 0; i--) {
      if (!valid.has(encontros[i].cena.nome.toLowerCase())) encontros.splice(i, 1);
    }

    for (const cena of cenas) {
      if (signal?.aborted) return;
      if (narrativas.some((n) => n.cena.nome.toLowerCase() === cena.nome.toLowerCase())) continue;
      onProgress(`Escrevendo a cena "${cena.nome}"…`);
      try {
        narrativas.push({ cena, narrativa: await runSpecialist(narrativeSpecialist, { pedido, cena }, ctx, llm, signal) });
      } catch (err) {
        if (signal?.aborted) return;
        onProgress(`Falha ao escrever "${cena.nome}": ${why(err)}`);
      }
    }
  };

  const detailNpcsAndEncounters = async () => {
    const cenas = estrutura.cenas.slice(0, MAX_SCENES_DETAILED);
    for (const cena of cenas.slice(0, MAX_NPCS)) {
      if (signal?.aborted) return;
      if (npcs.some((n) => n.cena.nome.toLowerCase() === cena.nome.toLowerCase())) continue;
      onProgress(`Criando NPC para "${cena.nome}"…`);
      try {
        const npc = await runSpecialist(npcSpecialist, { pedido, cena }, ctx, llm, signal);
        npcs.push({ cena, npc });
      } catch (err) {
        if (!signal?.aborted) onProgress(`Falha ao criar NPC de "${cena.nome}": ${why(err)}`);
      }
    }
    // encounters favor the later (climactic) scenes
    for (const cena of cenas.slice(-MAX_ENCOUNTERS)) {
      if (signal?.aborted) return;
      if (encontros.some((e) => e.cena.nome.toLowerCase() === cena.nome.toLowerCase())) continue;
      onProgress(`Criando encontro para "${cena.nome}"…`);
      try {
        encontros.push({ cena, encontro: await runSpecialist(encounterSpecialist, { pedido, cena }, ctx, llm, signal) });
      } catch (err) {
        if (!signal?.aborted) onProgress(`Falha ao criar encontro de "${cena.nome}": ${why(err)}`);
      }
    }
  };

  /** Dossier mirrors the detail arrays — call before every specialist round. */
  const syncDossier = () => {
    ctx.dossier.estrutura = estrutura;
    ctx.dossier.npcs = npcs.map((n) => n.npc);
    ctx.dossier.encontros = encontros.map((e) => e.encontro);
    ctx.dossier.nomesUsados = [estrutura.titulo, ...npcs.map((n) => n.npc.nome)];
  };

  syncDossier();
  await reconcileScenes();
  await detailNpcsAndEncounters();
  if (signal?.aborted) return;

  // 4. critic + targeted revision. Revisions are best-effort: a valid version
  // already exists, so a failed re-run keeps the previous one.
  for (let cycle = 0; cycle < MAX_CRITIC_CYCLES; cycle++) {
    if (signal?.aborted) return;
    syncDossier();
    onProgress(cycle === 0 ? 'Revisando a aventura…' : `Revisando novamente (ciclo ${cycle + 1})…`);
    // review is best-effort: a failed critic must not kill a finished adventure
    let critique;
    try {
      critique = await runSpecialist(
        criticSpecialist,
        {
          pedido,
          estrutura,
          narrativas: narrativas.map((n) => ({ cena: n.cena.nome, narrativa: n.narrativa })),
          npcs: npcs.map((n) => n.npc),
          encontros: encontros.map((e) => e.encontro),
        },
        ctx,
        llm,
        signal
      );
    } catch (err) {
      if (signal?.aborted) return;
      onProgress(`Revisão falhou (${why(err)}) — salvando sem revisão.`);
      break;
    }
    if (critique.aprovado || critique.problemas.length === 0) break;
    // last cycle: revisions would be persisted blind — don't apply them
    if (cycle === MAX_CRITIC_CYCLES - 1) break;

    const feedback = (spec: string, alvo: string) =>
      critique.problemas
        .filter(
          (p) =>
            p.especialista === spec &&
            (p.alvo.toLowerCase().includes(alvo.toLowerCase()) || alvo.toLowerCase().includes(p.alvo.toLowerCase()))
        )
        .map((p) => `- ${p.descricao} → ${p.sugestao}`)
        .join('\n');

    // structure revision gets all structural/naming feedback (alvo-agnostic)
    const estruturaFb = critique.problemas
      .filter((p) => p.especialista === 'adventure-structure' || p.especialista === 'names')
      .map((p) => `- ${p.descricao} → ${p.sugestao}`)
      .join('\n');
    if (estruturaFb) {
      onProgress('Refazendo a estrutura conforme a revisão…');
      try {
        estrutura = await runSpecialist(
          adventureStructureSpecialist,
          { pedido, premissa, revisao: estruturaFb },
          ctx,
          llm,
          signal
        );
        // scenes may have been renamed/added/removed — reconcile before details
        syncDossier();
        await reconcileScenes();
        await detailNpcsAndEncounters();
      } catch {
        if (!signal?.aborted) onProgress('Falha ao revisar a estrutura — mantendo a versão anterior.');
      }
    }

    for (const entry of narrativas) {
      const fb = feedback('narrative', entry.cena.nome);
      if (!fb) continue;
      onProgress(`Reescrevendo a descrição de "${entry.cena.nome}"…`);
      try {
        entry.narrativa = await runSpecialist(
          narrativeSpecialist,
          { pedido, cena: entry.cena, revisao: fb },
          ctx,
          llm,
          signal
        );
      } catch {
        if (!signal?.aborted) onProgress(`Falha ao revisar "${entry.cena.nome}" — mantendo a versão anterior.`);
      }
    }

    for (const entry of npcs) {
      const fb = feedback('npc', entry.npc.nome);
      if (!fb) continue;
      onProgress(`Refazendo o NPC ${entry.npc.nome}…`);
      try {
        entry.npc = await runSpecialist(npcSpecialist, { pedido, cena: entry.cena, revisao: fb }, ctx, llm, signal);
      } catch {
        if (!signal?.aborted) onProgress(`Falha ao revisar o NPC ${entry.npc.nome} — mantendo a versão anterior.`);
      }
    }

    for (const entry of encontros) {
      const fb = feedback('encounter', entry.cena.nome);
      if (!fb) continue;
      onProgress(`Refazendo o encontro de "${entry.cena.nome}"…`);
      try {
        entry.encontro = await runSpecialist(
          encounterSpecialist,
          { pedido, cena: entry.cena, revisao: fb },
          ctx,
          llm,
          signal
        );
      } catch {
        if (!signal?.aborted) onProgress(`Falha ao revisar o encontro de "${entry.cena.nome}" — mantendo a versão anterior.`);
      }
    }
  }

  // 5. persist the adventure tree
  onProgress('Salvando a aventura nas notas…');
  const rootId = createFolder(realmId, null, `Aventura: ${estrutura.titulo}`);
  createNote(
    realmId,
    rootId,
    'Visão Geral',
    [
      `# ${estrutura.titulo}`,
      '',
      `> Tema: ${estrutura.tema}`,
      '',
      `**Premissa:** tema "${premissa.tema}", tom ${premissa.tom}, escopo: ${premissa.escopo}, ` +
        `ameaça ${premissa.nivelAmeaca}, duração ${premissa.duracaoEstimada}.`,
      '',
      '## Ganchos',
      ...estrutura.ganchos.map((g) => `- ${g}`),
      '',
      `**Relógio de tensão:** ${estrutura.relogioDeTensao}`,
      '',
      `**Consequências de falha:** ${estrutura.consequenciasDeFalha}`,
      '',
      `**Clímax:** ${estrutura.climax}`,
      '',
      `**Recompensas:** ${estrutura.recompensas}`,
    ].join('\n')
  );

  const cenasId = createFolder(realmId, rootId, 'Cenas');
  for (const { cena, narrativa } of narrativas) {
    createNote(
      realmId,
      cenasId,
      cena.nome,
      [
        `# ${cena.nome}`,
        '',
        `**Local:** ${cena.local}`,
        `**Objetivo:** ${cena.objetivo}`,
        `**Pré-requisitos:** ${cena.preRequisitos.join(', ') || 'nenhum (cena inicial)'}`,
        '',
        '---',
        '',
        narrativeMarkdown(narrativa),
      ].join('\n')
    );
  }

  if (npcs.length > 0) {
    const npcsId = createFolder(realmId, rootId, 'NPCs');
    for (const { npc } of npcs) createNote(realmId, npcsId, npc.nome, npcMarkdown(npc));
  }

  if (encontros.length > 0) {
    const encId = createFolder(realmId, rootId, 'Encontros');
    for (const { cena, encontro } of encontros) {
      createNote(realmId, encId, `${cena.nome} — ${encontro.monstros.map((m) => m.nome).join(', ')}`, encounterMarkdown(encontro));
    }
  }
  docEvents.emit('changed', realmId);

  // 6. chat summary
  emit(
    [
      `# ${estrutura.titulo}`,
      '',
      `_${premissa.tema} — tom ${premissa.tom}, ${premissa.duracaoEstimada}_`,
      '',
      '## Ganchos',
      ...estrutura.ganchos.map((g) => `- ${g}`),
      '',
      `**Relógio de tensão:** ${estrutura.relogioDeTensao}`,
      '',
      '## Cenas',
      ...narrativas.map(
        ({ cena }) =>
          `- **${cena.nome}** (${cena.local}): ${cena.objetivo}${cena.preRequisitos.length ? ` — após: ${cena.preRequisitos.join(', ')}` : ''}`
      ),
      '',
      npcs.length ? `**NPCs:** ${npcs.map((n) => n.npc.nome).join(', ')}` : '',
      encontros.length
        ? `**Encontros:** ${encontros.map((e) => e.encontro.monstros.map((m) => m.nome).join(', ')).join(' | ')}`
        : '',
      '',
      `Aventura completa salva na pasta **"Aventura: ${estrutura.titulo}"** — as notas já entram na busca do universo.`,
      '',
    ]
      .filter((l) => l !== '')
      .join('\n')
  );
}
