// Structured output types + JSON Schemas + hand-rolled validators for each specialist.
// Every specialist returns its result via a forced `submit_result` tool call
// (see base.ts), with a ```json fallback for providers without tool support.

// ---------- types ----------

export interface Premise {
  tema: string;
  tom: string;
  escopo: string;
  nivelAmeaca: string;
  duracaoEstimada: string;
  /** when present, the pipeline pauses and asks the user this question */
  pergunta?: string;
}

export interface Scene {
  nome: string;
  objetivo: string;
  local: string;
  preRequisitos: string[];
}

export interface AdventureStructure {
  titulo: string;
  tema: string;
  ganchos: string[];
  relogioDeTensao: string;
  cenas: Scene[];
  consequenciasDeFalha: string;
  climax: string;
  recompensas: string;
}

export interface NameEntry {
  nome: string;
  cultura: string;
  significado?: string;
  /** naming convention used (patronymic, title, birth-order, epithet...), when relevant */
  estilo?: string;
}

export interface NameList {
  nomes: NameEntry[];
}

export interface Narrative {
  textoReadAloud: string;
  descricaoGM: string;
  atmosfera: string;
}

export interface Npc {
  nome: string;
  conceito: string;
  aparencia: string;
  maneirismo: string;
  objetivo: string;
  segredo: string;
  vinculoComAventura: string;
}

export interface Monster {
  nome: string;
  descricao: string;
  comportamento: string;
  tatica: string;
}

export interface Encounter {
  monstros: Monster[];
  ameaca: string;
  ambiente: string;
}

/**
 * Demon description as a 5-paragraph reveal arc, in the style of the classic
 * random generator (sound in the dark -> eyes -> head -> body -> approach ->
 * final stare), but coherent: one single creature escalating logically.
 */
export interface DemonDescription {
  titulo: string;
  /** paragraph 1: the sound, the reveal of the creature, its eyes and its voice */
  chegada: string;
  /** paragraph 2: head adornments (horns/hair/quills), face and breath */
  cabeca: string;
  /** paragraph 3: body and torso details, with a hint of mystery */
  corpo: string;
  /** paragraph 4: how it advances — legs, energy, optional tail */
  movimento: string;
  /** paragraph 5: optional wings + the final stare/interaction with the observer */
  presencaFinal: string;
}

/** How to play one character's voice — keeps speakers distinct. */
export interface DialogueVoice {
  personagem: string;
  /** rhythm, vocabulary, verbal tic — how this character sounds */
  voz: string;
}

/**
 * A dialogue scene written with proper fiction craft (tags, action beats,
 * subtext), plus the writer/GM-facing layers: purpose, subtext and voices.
 */
export interface DialogueScene {
  titulo: string;
  /** the scene itself, as formatted prose */
  cena: string;
  /** what the scene accomplishes: plot advance, character reveal, worldbuilding */
  proposito: string;
  /** the hidden layer — what is really at stake beneath the words */
  subtexto: string;
  vozes: DialogueVoice[];
}

/**
 * Plot skeleton following the universal 3-beat core (somebody wants something,
 * something stands in the way, desire achieved or not) plus the optional
 * layers that add tension: stakes, requirements, threats and the full arc
 * (rising action -> climax -> falling action -> resolution).
 */
export interface Plot {
  titulo: string;
  /** who wants it — the point-of-view character */
  protagonista: string;
  /** the story goal AND the desire/reason behind it */
  desejo: string;
  /** who or what stands in the way */
  obstaculo: string;
  /** what happens if the goal fails — the tension engine */
  consequencias: string;
  /** what the protagonist risks losing ("at all costs") */
  emRisco: string;
  /** side profits of the journey, beyond the goal itself */
  lucros: string;
  /** requirements: what must be fulfilled first (layers of obstacles) */
  requisitos: string[];
  /** threats: events proving failure might happen, perhaps sooner */
  ameacas: string[];
  /** comédia, tragédia, tragicomédia (final feliz inesperado), cometragedia (final infeliz inesperado) */
  tipoFinal: string;
  /** events that build toward the climax */
  acaoAscendente: string[];
  /** the highest-tension event everything led up to (not the same as the ending) */
  climax: string;
  /** what still needs resolving after the climax (may be very short) */
  acaoDescendente: string;
  /** final outcome — goal achieved or not + optional "life after" */
  resolucao: string;
}

/**
 * A combat scene with the craft layers a writer/GM needs: why the fight
 * exists, the intended result (and how it's set up), the scene itself in
 * prose, and technique notes.
 */
export interface CombatScene {
  titulo: string;
  /** why this fight exists: motives, what's at stake, what it reveals */
  proposito: string;
  /** the intended result and how the scene sets it up (wounds, escapes, deaths don't come from nowhere) */
  resultado: string;
  /** the fight itself, as formatted prose */
  cena: string;
  /** craft notes: perspective, pacing choices, sensory anchors, realism basis */
  notasTecnicas: string;
}

/**
 * Villain design following the evil-character guide: realistic motivation,
 * skewed moral compass ("hero of their own story"), humanization, evil
 * witnessed on-page, hero contrast and the capacity for permanent damage.
 */
export interface Villain {
  nome: string;
  conceito: string;
  /** realistic drive — never "evil for evil's sake" */
  motivacao: string;
  /** how they see themselves as right — the skewed moral compass */
  bussolaMoral: string;
  /** what makes them a person: love, vulnerabilities, the human remnant */
  humanidade: string;
  /** how the audience WITNESSES the evil — deeds, preferably against beloved characters */
  maldadeEmCena: string;
  /** how the villain counters/mirrors the hero */
  contrasteComHeroi: string;
  /** what permanent damage they can inflict */
  danoPermanente: string;
  /** how they can change — villains progress too */
  arco: string;
}

/**
 * A character's goals & motivations as the guide's 5-point checklist:
 * goal + internal/external motivation + internal/external conflict,
 * rooted in backstory, plus fears, self-awareness and the arc.
 */
export interface CharacterDrive {
  nome: string;
  conceito: string;
  /** what they want — future-facing */
  objetivo: string;
  /** the public reason — what everybody sees */
  motivacaoExterna: string;
  /** the true reason, rooted in the past — may be hidden from the character themselves */
  motivacaoInterna: string;
  conflitoExterno: string;
  conflitoInterno: string;
  medos: string;
  /** how aware the character is of their own true motives */
  consciencia: string;
  /** how the character changes by the end */
  arco: string;
}

/** An emotion shown purely through body language — show, don't tell. */
export interface BodyLanguage {
  titulo: string;
  /** the emotion(s) being conveyed */
  emocao: string;
  /** the prose — the emotion never named, only shown */
  descricao: string;
  /** the cues used, as a reference list */
  sinaisChave: string[];
  /** craft notes: moderation, habits, character-unique tics */
  notas: string;
}

/**
 * World shape following the geography-first method: overall vision, landmass,
 * climate/seasons, nature, civilizations, visible history, phenomena and
 * daily-life traces.
 */
export interface WorldShape {
  nome: string;
  conceito: string;
  /** landmass, shorelines, mountains, rivers, height/depth */
  geografia: string;
  /** weather patterns and seasons per region */
  climaEEstacoes: string;
  /** plants, wildlife and food chains per region */
  natureza: string;
  /** settlements, infrastructure, relations between neighbors */
  civilizacoes: string;
  /** remnants of the past visible in the landscape */
  historia: string;
  /** natural disasters, phenomena and rule-breaking elements */
  fenomenos: string;
  /** bits and pieces: traces of daily life */
  vidaCotidiana: string;
}

/**
 * Society design: reason for being, rulers, law & order, religion,
 * traditions, culture, struggles and the hidden cost behind the positives.
 */
export interface Society {
  nome: string;
  /** why the society is the way it is — its historical cause */
  razaoDeSer: string;
  /** who rules and how they reached power */
  governantes: string;
  leiEOrdem: string;
  religiao: string;
  tradicoes: string[];
  cultura: string;
  /** struggles — every society has them, even utopias */
  conflitos: string[];
  /** what the good things cost — "at what price?" */
  custoEscondido: string;
}

/**
 * Original creature design built from survival logic: type/realism dial,
 * body derived from habitat and food chain, sounds, reproduction, behavior
 * and domestication.
 */
export interface Creature {
  nome: string;
  /** type (mammal, insect, hybrid...), originality and realism level */
  tipo: string;
  /** appearance derived from survival needs, cute/fierce dials */
  aparencia: string;
  /** where it lives; nocturnal/diurnal/crepuscular */
  habitat: string;
  som: string;
  /** diet and position in the food chain */
  dieta: string;
  /** pack/solitary, territory, migration, hibernation */
  comportamento: string;
  raridade: string;
  reproducao: string;
  /** tamable? domesticable? why (not) */
  domesticacao: string;
  subespecies: string;
}

/** A story within a story — purpose-driven nested narrative. */
export interface InnerStory {
  titulo: string;
  /** why nested instead of summarized: exposition, character reveal, pace change */
  proposito: string;
  /** how it's delivered: campfire tale, play, dusty tome, confession; frame story or mid-story */
  moldura: string;
  /** who tells it and what the telling reveals about THEM */
  narrador: string;
  /** the nested story itself, with the frame around it */
  historia: string;
  /** perception of truth — is the teller reliable? what's exaggerated or hidden? */
  verdade: string;
  /** parallels/foreshadowing to the main story — the lesson the characters can use */
  eco: string;
}

export interface HistoryEra {
  nome: string;
  eventos: string;
}

/** Universe history: change over time, truth vs perspective, relics in the present. */
export interface WorldHistory {
  nome: string;
  /** the broad sweep of the timeline */
  panorama: string;
  eras: HistoryEra[];
  /** what really happened vs what people believe happened */
  verdadeVsPerspectiva: string;
  /** ruins, monuments and relics still visible — and their use today */
  reliquias: string;
  /** how the past surfaces in the present story */
  passadoNoPresente: string;
}

/** Full character profile following the character-creation guide. */
export interface CharacterProfile {
  nome: string;
  /** role in the story */
  papel: string;
  conceito: string;
  /** how the character fits — or deliberately contrasts — the world */
  encaixeNoMundo: string;
  /** what makes them interesting: the small or extreme difference from the ordinary */
  diferencial: string;
  /** the flaw — nobody is perfect */
  falha: string;
  /** contradictory traits and the reason behind them */
  contradicao: string;
  /** what they want, why they want it, how they'll get it */
  desejo: string;
  /** short origin story — the foundation of consistent reactions */
  historiaDeOrigem: string;
  /** habits and quirks that reveal emotion without naming it */
  tiques: string;
  /** how the character changes with experience — never "finished" */
  mudanca: string;
}

/** Settlement design: setting, organic vs planned growth, population, history, details. */
export interface CityDesign {
  nome: string;
  /** village, town, city, metropolis + rough population */
  tipo: string;
  /** era, climate, environment, world rules (magic, physics) */
  cenario: string;
  /** organic growth or planned — and WHY the settlement exists here */
  origem: string;
  /** structure and the important buildings/services */
  layout: string;
  /** size, diversity, districts, separation or mixing of cultures */
  populacao: string;
  /** visible marks of history: monuments, old vs new architecture */
  historia: string;
  /** street-level details that bring it alive and set it apart from other towns */
  detalhes: string;
  /** celebrations, festivals, events */
  eventos: string;
}

export interface TitleOption {
  titulo: string;
  /** the style used (character name, imagery, question, wordplay...) */
  estilo: string;
  /** why it works: attention, memorability, essence */
  justificativa: string;
}

/** Book title candidates with the story's identified essence. */
export interface TitleList {
  essencia: string;
  titulos: TitleOption[];
}

export interface RomanceLead {
  nome: string;
  conceito: string;
  /** who they are at the start — the imperfection that must grow */
  pontoDePartida: string;
  /** how they grow to be better together than alone */
  crescimento: string;
}

/** Romance design: two imperfect leads, obstacles, choices, supporting cast, location. */
export interface RomanceDesign {
  titulo: string;
  premissa: string;
  casal: RomanceLead[];
  obstaculos: string[];
  /** the love triangle or choice structure — stakes require a real choice */
  escolha: string;
  coadjuvantes: string;
  /** location shapes dates, moods and problems */
  locacao: string;
  /** what the story is about — its focus */
  foco: string;
}

/** Scenery description with the craft layers explained. */
export interface SceneryDescription {
  titulo: string;
  /** the prose itself */
  descricao: string;
  /** the 1-2 focused elements and why */
  foco: string;
  /** whose point of view filters the scene — and what they DON'T notice */
  pontoDeVista: string;
  /** word-choice decisions (evocative words, sensory palette) */
  palavrasChave: string;
  /** what was deliberately left out */
  economia: string;
}

/** A scene written with craft: purpose, arc, pacing, verb variety. */
export interface SceneCraft {
  titulo: string;
  /** the scene itself, in prose */
  cena: string;
  /** how it advances the heart of the story */
  proposito: string;
  /** the scene's own beginning/middle/end — rising and falling action */
  arcoDaCena: string;
  /** pacing decisions: fast/slow, sentence rhythm */
  ritmo: string;
  /** verb variety, location grounding, POV choices */
  notas: string;
}

/** A persuasive speech with its structure and persuasion methods exposed. */
export interface Speech {
  titulo: string;
  orador: string;
  /** the single message the speech must convey */
  tese: string;
  /** intro (attention) / body (strongest point first, weakest in the middle) / conclusion */
  estrutura: string;
  /** the speech itself, broken by audience/speaker reaction beats */
  discurso: string;
  /** persuasion methods used: credibility, emotion, logic */
  persuasao: string;
  /** inclusive terms, pauses, word-choice notes */
  notas: string;
}

/** A story opening: first sentence + opening paragraphs, with the promise made explicit. */
export interface Opening {
  titulo: string;
  primeiraFrase: string;
  /** the opening paragraphs */
  abertura: string;
  /** the technique used: hook, voice, mystery, humor, contrast */
  tecnica: string;
  /** the promise the opening makes to the reader — the story must deliver on it */
  promessa: string;
  /** the grounding crumbs: where/when/who, woven in without exposition dumps */
  ancoragem: string;
  /** craft notes: why not a prologue, info pacing, what was held back */
  notas: string;
}

/** Religion design: nature, gods, powers, doctrine, rituals, strictness. */
export interface Religion {
  nome: string;
  /** real, fake or unknown — and what that means in-world */
  natureza: string;
  /** gods and other divine beings, their character and relations */
  deuses: string;
  /** divine powers and who wields them */
  poderes: string;
  /** origin myths and history */
  origem: string;
  /** leaders, chosen ones, prophets — and how they're chosen */
  figuras: string;
  /** sacred places, dress code, symbols */
  lugaresESimbolos: string;
  rituais: string[];
  /** good vs evil, goal in life, afterlife, spirits */
  doutrina: string;
  /** strictness and the different versions/sects */
  rigorEVersoes: string;
}

/** Magic system: source, wielders, powers, growth, combination, limitations. */
export interface MagicSystem {
  nome: string;
  /** the source — and whether it's limited (limits create conflict) */
  fonte: string;
  /** materials that house or channel power */
  materiais: string;
  /** who/what can wield it — everyone, a lucky few, specific species; elite or outcast */
  quemUsa: string;
  /** how it's wielded — gestures, items, body parts; what happens when disarmed */
  comoUsa: string;
  /** the powers themselves, with relative costs */
  poderes: string;
  /** how power is gained — and the ceiling (why hasn't anyone reached it before?) */
  ganhoDePoder: string;
  /** can powers be combined? what does that change? */
  combinacao: string;
  /** the limitations that create tension */
  limitacoes: string;
}

/** Army design: leadership, ranks, divisions, tactics, equipment, logistics, recruitment. */
export interface ArmyDesign {
  nome: string;
  /** who leads the army, their personality and advisers — and what that changes */
  lideranca: string;
  /** military ranks, customized to the culture (not just private/sergeant/captain) */
  patentes: string[];
  /** divisions — including non-obvious ones (veterinary, administration, anti-mage, morale) */
  divisoes: string[];
  /** experience level and preferred combat style */
  taticas: string;
  /** special forces and the means to train/equip them */
  forcasEspeciais: string;
  /** armor and weapons — quality vs. what the economy can afford */
  equipamento: string;
  /** how the population and economy sustain this army */
  logistica: string;
  /** voluntary, temporary conscription, permanent draft — or no standing army at all */
  recrutamento: string;
}

/** Campaign opening (session one): purpose, first scene, motivation, paths, foreshadowing. */
export interface CampaignStart {
  titulo: string;
  /** what session one must establish: the world, motivation, clear paths */
  proposito: string;
  /** the opening scene itself — tavern, ship, prison, in medias res, campfire — with a twist */
  abertura: string;
  /** why the characters care and stay together */
  motivacao: string;
  /** clear paths offered at the end of session one */
  caminhos: string[];
  /** hints of the main plot / the greater danger */
  pressagio: string;
  /** GM notes: how to run it, what to improvise */
  notas: string;
}

/** One scene of a sensory immersion plan. */
export interface MoodScene {
  cena: string;
  som: string;
  aroma: string;
  luz: string;
  tato: string;
  sabor: string;
}

/** Sensory immersion plan for a tabletop session: sound, smell, light, touch, taste. */
export interface MoodPlan {
  titulo: string;
  /** overall mood/concept being aimed at */
  conceito: string;
  cenas: MoodScene[];
  /** practical GM notes: allergies, sparing use, real vs. fake candles, moderation */
  notas: string;
}

/** One quest idea: the hook as the party hears it + the twist behind it. */
export interface Quest {
  titulo: string;
  /** the hook/setup as presented to the party */
  gancho: string;
  /** the complication or twist that makes it more than it seems */
  complicacao: string;
}

/** A list of quest/prompt ideas. */
export interface QuestList {
  tema: string;
  quests: Quest[];
}

/** A unique themed location: memorable concept first, details second. */
export interface LocationDesign {
  nome: string;
  /** nickname in the style "The City of Masks", "The Golden City" */
  apelido: string;
  /** the central concept that makes this place unique */
  conceito: string;
  /** what visiting or living there is like */
  vida: string;
  /** peculiar rules, dangers, challenges */
  desafios: string;
  ganchos: string[];
}

/** Dungeon concept: origin, structure, inhabitants, twist, reward. */
export interface DungeonDesign {
  nome: string;
  conceito: string;
  /** why it exists — built by whom, for what purpose, or natural */
  origem: string;
  /** layout and notable rooms/levels */
  estrutura: string;
  /** inhabitants and encounters */
  habitantes: string;
  /** the twist that makes this dungeon different from a hole full of monsters */
  reviravolta: string;
  /** what's worth taking — or what it costs to take it */
  recompensas: string;
}

export interface CritiqueProblem {
  /** what is affected: scene name, NPC name, 'estrutura', 'consistencia', ... */
  alvo: string;
  /** specialist responsible for the affected part */
  especialista: 'adventure-structure' | 'names' | 'narrative' | 'npc' | 'encounter';
  descricao: string;
  sugestao: string;
}

export interface Critique {
  aprovado: boolean;
  problemas: CritiqueProblem[];
}

/** Pain description as a 5-beat arc with two alternate endings. */
export interface PainDescription {
  titulo: string;
  tipoDor: string;
  intensidade: string;
  /** beat 1: the physical sensation takes hold */
  sensacaoInicial: string;
  /** beat 2: emotional reaction — the urge to stop, despair, panic */
  reacaoEmocional: string;
  /** beat 3: hesitation — pausing, weighing giving up vs. going on */
  hesitacao: string;
  /** beat 4: the struggle — gritting through, coping attempts */
  luta: string;
  /** ending A: the character pushes through */
  desfechoResiste: string;
  /** ending B: the character gives in */
  desfechoCede: string;
}

// ---------- JSON Schemas (sent to the model as submit_result parameters) ----------

const str = (description: string) => ({ type: 'string', description });
const strArray = (description: string) => ({ type: 'array', items: { type: 'string' }, description });

export const PREMISE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    tema: str('conflito ou ideia central da aventura'),
    tom: str('ex.: sombrio, heroico, investigativo, pulp'),
    escopo: str('ex.: uma dungeon, uma cidade, uma região'),
    nivelAmeaca: str('ex.: baixo, médio, mortal'),
    duracaoEstimada: str('ex.: one-shot, 2-3 sessões, arco longo'),
    pergunta: str('pergunta de refinamento ao usuário — use SOMENTE se o pedido for vago demais para gerar algo bom'),
  },
  required: ['tema', 'tom', 'escopo', 'nivelAmeaca', 'duracaoEstimada'],
  additionalProperties: false,
};

export const ADVENTURE_STRUCTURE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str('título evocativo da aventura'),
    tema: str('tema central'),
    ganchos: strArray('ganchos que conectam a aventura aos personagens/facções do mundo'),
    relogioDeTensao: str('o que avança/piora se os personagens demorarem ou falharem'),
    cenas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: str(''),
          objetivo: str('o que os personagens podem conseguir aqui'),
          local: str(''),
          preRequisitos: strArray('nomes de outras cenas que devem acontecer antes; vazio = cena inicial'),
        },
        required: ['nome', 'objetivo', 'local', 'preRequisitos'],
        additionalProperties: false,
      },
    },
    consequenciasDeFalha: str(''),
    climax: str(''),
    recompensas: str(''),
  },
  required: ['titulo', 'tema', 'ganchos', 'relogioDeTensao', 'cenas', 'consequenciasDeFalha', 'climax', 'recompensas'],
  additionalProperties: false,
};

export const NAMES_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nomes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: str(''),
          cultura: str('cultura/raça/tipo que originou o nome (ex.: elfo, anão, taverna, cidade)'),
          significado: str('significado ou conotação, quando fizer sentido'),
          estilo: str('convenção de nomenclatura usada (patronímico, título, ordem de nascimento, epíteto...), quando relevante'),
        },
        required: ['nome', 'cultura'],
        additionalProperties: false,
      },
    },
  },
  required: ['nomes'],
  additionalProperties: false,
};

export const NARRATIVE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    textoReadAloud: str('texto para ler em voz alta aos jogadores, em segunda pessoa, sensorial'),
    descricaoGM: str('detalhes para o mestre: o que há além do óbvio, segredos do local'),
    atmosfera: str('sensações, sons, cheiros, clima emocional'),
  },
  required: ['textoReadAloud', 'descricaoGM', 'atmosfera'],
  additionalProperties: false,
};

export const NPC_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str('nome coerente com a cultura do personagem no mundo'),
    conceito: str('quem é em uma frase'),
    aparencia: str('aparência e um traço físico marcante'),
    maneirismo: str('tique, gesto ou jeito de falar que o mestre pode interpretar'),
    objetivo: str('o que este NPC quer'),
    segredo: str('o que ele esconde e que pode ser alavanca narrativa'),
    vinculoComAventura: str('como se conecta à trama; vazio se for um NPC avulso'),
  },
  required: ['nome', 'conceito', 'aparencia', 'maneirismo', 'objetivo', 'segredo', 'vinculoComAventura'],
  additionalProperties: false,
};

export const ENCOUNTER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    monstros: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: str(''),
          descricao: str('aparência e presença'),
          comportamento: str('como age, o que quer'),
          tatica: str('como luta ou reage a confronto, sem números de regras'),
        },
        required: ['nome', 'descricao', 'comportamento', 'tatica'],
        additionalProperties: false,
      },
    },
    ameaca: str('quão perigoso é, descrito narrativamente (sem stats de sistema)'),
    ambiente: str('como o terreno/cenário entra no encontro'),
  },
  required: ['monstros', 'ameaca', 'ambiente'],
  additionalProperties: false,
};

export const PAIN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str('título curto da descrição (ex.: "Punhalada no flanco", "Exaustão total")'),
    tipoDor: str('ferida, cólica, cabeça, muscular, mágica, exaustão...'),
    intensidade: str('leve, moderada, aguda, insuportável'),
    sensacaoInicial: str('batida 1 — a sensação física se instalando, sensorial e específica'),
    reacaoEmocional: str('batida 2 — reação emocional: vontade de parar, pânico, desespero'),
    hesitacao: str('batida 3 — o momento de pausa: ponderar desistir ou continuar'),
    luta: str('batida 4 — a tentativa de seguir em frente apesar da dor'),
    desfechoResiste: str('desfecho A — o personagem resiste e segue em frente'),
    desfechoCede: str('desfecho B — o personagem cede à dor'),
  },
  required: ['titulo', 'tipoDor', 'intensidade', 'sensacaoInicial', 'reacaoEmocional', 'hesitacao', 'luta', 'desfechoResiste', 'desfechoCede'],
  additionalProperties: false,
};

export const DEMON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str('título evocativo do demônio (ex.: "O Emissário das Cinzas", "Aquele que Uiva no Poço")'),
    chegada: str(
      'parágrafo 1 — um som na escuridão, a revelação súbita da criatura ("criatura de X e Y"), ' +
        'os olhos que encaram o observador e um segundo som que escapa de sua boca'
    ),
    cabeca: str(
      'parágrafo 2 — o que adorna a cabeça (chifres, juba, chamas, sombras), o formato da cabeça, ' +
        'a textura do rosto e o que escapa de suas narinas'
    ),
    corpo: str(
      'parágrafo 3 — a cabeça sobre o corpo (porte, musculatura), detalhes do torso (cicatrizes, correntes, ' +
        'runas, armadura fundida) com um toque de mistério sobre a origem'
    ),
    movimento: str(
      'parágrafo 4 — a criatura avança: quantas pernas, como se movem, a energia do corpo; ' +
        'opcionalmente uma cauda e o que ela faz'
    ),
    presencaFinal: str(
      'parágrafo 5 — opcionalmente asas se abrindo, e o olhar final: a criatura encara, ignora, ' +
        'se aproxima ou perde o interesse pelo observador'
    ),
  },
  required: ['titulo', 'chegada', 'cabeca', 'corpo', 'movimento', 'presencaFinal'],
  additionalProperties: false,
};

export const DIALOGUE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str('título da cena de diálogo'),
    cena: str(
      'a cena de diálogo completa, em prosa formatada: falas, tags de diálogo, batidas de ação e ' +
        'parágrafos de narração que ancoram a cena no espaço'
    ),
    proposito: str('o que a cena realiza na história: avanço de trama, revelação de personagem, worldbuilding'),
    subtexto: str('a camada oculta — o que os personagens realmente querem, escondem ou manipulam sob as palavras'),
    vozes: {
      type: 'array',
      description: 'uma entrada por personagem que fala na cena',
      items: {
        type: 'object',
        properties: {
          personagem: str(''),
          voz: str('como interpretar a voz: ritmo, vocabulário, tique verbal, postura'),
        },
        required: ['personagem', 'voz'],
        additionalProperties: false,
      },
    },
  },
  required: ['titulo', 'cena', 'proposito', 'subtexto', 'vozes'],
  additionalProperties: false,
};

export const PLOT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str('título da história/aventura'),
    protagonista: str('quem quer algo — o personagem de ponto de vista'),
    desejo: str('o objetivo da história E o porquê — a razão que torna o desejo real'),
    obstaculo: str('quem ou o que está no caminho do desejo'),
    consequencias: str('o que acontece se o objetivo falhar — o motor da tensão'),
    emRisco: str('o que o protagonista arrisca perder (vida, orgulho, amizade, um sonho...)'),
    lucros: str('ganhos secundários da jornada, além do objetivo (amizades, autoconhecimento...)'),
    requisitos: strArray('o que precisa ser cumprido primeiro — camadas de obstáculos (ex.: achar o mapa antes do tesouro)'),
    ameacas: strArray('eventos que mostram que a falha pode acontecer, talvez mais cedo que o esperado'),
    tipoFinal: str('comédia (feliz), tragédia (infeliz), tragicomédia (feliz inesperado) ou cometragedia (infeliz inesperado)'),
    acaoAscendente: strArray('eventos que escalam em direção ao clímax'),
    climax: str('o evento de máxima tensão para o qual tudo convergiu (não é o final)'),
    acaoDescendente: str('o que ainda precisa ser resolvido após o clímax (pode ser curto)'),
    resolucao: str('o desfecho — objetivo alcançado ou não + opcional "vida depois"'),
  },
  required: [
    'titulo',
    'protagonista',
    'desejo',
    'obstaculo',
    'consequencias',
    'emRisco',
    'tipoFinal',
    'acaoAscendente',
    'climax',
    'resolucao',
  ],
  additionalProperties: false,
};

export const COMBAT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str('título da cena de combate'),
    proposito: str('por que a luta existe: motivos de quem luta, o que está em jogo, o que a luta revela sobre os personagens'),
    resultado: str('o resultado pretendido e como a cena o prepara (ferimentos, fugas e mortes não surgem do nada)'),
    cena: str(
      'a luta completa, em prosa: contorno do cenário/armas no início, ritmo rápido, frases curtas nos ' +
        'picos, voz ativa, uma ação por linha, sentidos do personagem de ponto de vista'
    ),
    notasTecnicas: str('notas de craft: perspectiva escolhida, ritmo, âncoras sensoriais, base de realismo (armas, estilos, criaturas)'),
  },
  required: ['titulo', 'proposito', 'resultado', 'cena', 'notasTecnicas'],
  additionalProperties: false,
};

export const VILLAIN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    conceito: str('quem é em uma frase'),
    motivacao: str('a razão realista de ser mau — nunca "mau por ser mau"; trauma pode ser o início, mas precisa de um porquê'),
    bussolaMoral: str('como o vilão é o herói da própria história — a visão distorcida que justifica seus atos aos próprios olhos'),
    humanidade: str('o que o torna pessoa: amor por alguém, vulnerabilidades, o humano que resta'),
    maldadeEmCena: str('como o público TESTEMUNHA a maldade — atos concretos, de preferência contra personagens queridos'),
    contrasteComHeroi: str('como o vilão espelha ou contraria o herói (mesmo objetivo por meios terríveis, ou design para quebrar o código moral do herói)'),
    danoPermanente: str('que dano irreversível o vilão pode causar — ameaça real e pessoal'),
    arco: str('como o vilão pode mudar — vilões também progridem'),
  },
  required: ['nome', 'conceito', 'motivacao', 'bussolaMoral', 'maldadeEmCena'],
  additionalProperties: false,
};

export const DRIVE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    conceito: str('quem é em uma frase'),
    objetivo: str('o que o personagem quer — voltado ao futuro'),
    motivacaoExterna: str('a razão pública — a que todos veem (verdadeira ou não)'),
    motivacaoInterna: str('a razão verdadeira, enraizada no passado — a individual, às vezes oculta do próprio personagem'),
    conflitoExterno: str('o obstáculo externo entre o personagem e o objetivo'),
    conflitoInterno: str('o conflito interno gerado pelas motivações (culpa, ganância, dúvida)'),
    medos: str('medos ligados ao objetivo — os obstáculos que ele teme que bloqueiem o caminho'),
    consciencia: str('o quanto o personagem sabe dos próprios motivos — motivações inconscientes valem ouro'),
    arco: str('como o personagem muda do início ao fim'),
  },
  required: ['nome', 'objetivo', 'motivacaoExterna', 'motivacaoInterna', 'conflitoExterno', 'conflitoInterno'],
  additionalProperties: false,
};

export const BODY_LANGUAGE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str(''),
    emocao: str('a(s) emoção(ões) transmitida(s)'),
    descricao: str('a prosa — a emoção NUNCA nomeada, apenas mostrada através do corpo'),
    sinaisChave: strArray('os sinais corporais usados, como lista de referência'),
    notas: str('notas de craft: moderação, hábitos do personagem, tiques únicos'),
  },
  required: ['titulo', 'emocao', 'descricao', 'sinaisChave'],
  additionalProperties: false,
};

export const WORLD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    conceito: str('a visão geral do mundo/região em uma ou duas frases'),
    geografia: str('forma da terra, costas, montanhas, rios (água flui com lógica), altos e baixos — penhascos, fiordes, vulcões'),
    climaEEstacoes: str('padrões de clima por região e como as estações mudam cada uma'),
    natureza: str('plantas e animais por região, coerentes com o clima; cadeias alimentares'),
    civilizacoes: str('assentamentos, infraestrutura (fazendas, minas, estradas, portos) e relações entre vizinhos (guerra marca a paisagem; paz cria rotas comerciais)'),
    historia: str('resquícios do passado visíveis na paisagem (ruínas, torres destruídas, campos de batalha antigos) e como são usados hoje'),
    fenomenos: str('desastres naturais, fenômenos (eclipses, auroras) e elementos que quebram as regras — com encaixe interno'),
    vidaCotidiana: str('traços de vida diária: tocas, pontos de encontro, lugares de significado pessoal'),
  },
  required: ['nome', 'conceito', 'geografia', 'natureza', 'civilizacoes'],
  additionalProperties: false,
};

export const SOCIETY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    razaoDeSer: str('por que a sociedade é assim — a causa histórica que a formou'),
    governantes: str('quem governa e como chegou ao poder (linhagem, voto, força, conspiração)'),
    leiEOrdem: str('como a lei é aplicada: rigor, corrupção, respeito público, quem vigia os vigilantes'),
    religiao: str('papel da religião na vida, na lei e no poder — e o que acontece com quem não segue'),
    tradicoes: strArray('tradições que revelam valores — incluindo as sombrias (sacrifícios, duelos)'),
    cultura: str('música, arte, comida, esportes, lazer — e o que a recreação revela sobre o estado da sociedade'),
    conflitos: strArray('as tensões internas — toda sociedade as tem, até utopias'),
    custoEscondido: str('o preço por trás das coisas boas: os monumentos foram erguidos por quem? A segurança custa o quê?'),
  },
  required: ['nome', 'razaoDeSer', 'governantes', 'leiEOrdem'],
  additionalProperties: false,
};

export const CREATURE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str('nome da espécie'),
    tipo: str('tipo (mamífero, inseto, híbrido...), grau de originalidade (original/híbrido/alterado) e nível de realismo'),
    aparencia: str('corpo derivado das necessidades de sobrevivência (pés→pernas→torso→cabeça→sentidos); traços especiais; fofura x ferocidade'),
    habitat: str('onde vive; noturno/diurno/crepuscular; sangue quente ou frio'),
    som: str('como soa — inspire-se em sons reais alterados (tom, velocidade, imitação imperfeita de outro animal)'),
    dieta: str('o que come, quanto, e sua posição na cadeia alimentar'),
    comportamento: str('matilha ou solitário, território, migração, hibernação, construção de ninho'),
    raridade: str('quão raro é — números ou traços raros (albinismo, tamanho anômalo)'),
    reproducao: str('ovos ou filhotes, cuidado parental, pressão reprodutiva (presas se reproduzem rápido)'),
    domesticacao: str('pode ser domado? domesticado? por quê (não) — hierarquia social, agressividade, dieta, ciclo de vida'),
    subespecies: str('variantes por região ou por criação seletiva'),
  },
  required: ['nome', 'tipo', 'aparencia', 'habitat', 'dieta', 'comportamento'],
  additionalProperties: false,
};

export const INNER_STORY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str(''),
    proposito: str('por que contar como história aninhada em vez de resumir: exposição de personagem, background, mudança de ritmo'),
    moldura: str('como é entregue: conto ao redor da fogueira, peça de teatro, tomo empoeirado, confissão; história-moldura ou no meio da trama'),
    narrador: str('quem conta e o que a forma de contar revela sobre ELE'),
    historia: str('a história aninhada em si, com a moldura ao redor (reações dos ouvintes, pausas)'),
    verdade: str('percepção da verdade — o narrador é confiável? o que foi exagerado, omitido ou distorcido?'),
    eco: str('paralelos com a trama principal — a lição que os personagens podem usar, o presságio'),
  },
  required: ['titulo', 'proposito', 'historia'],
  additionalProperties: false,
};

export const HISTORY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str('nome da era, império ou período coberto'),
    panorama: str('o panorama geral da linha do tempo'),
    eras: {
      type: 'array',
      items: {
        type: 'object',
        properties: { nome: str(''), eventos: str('o que aconteceu e o que MUDOU') },
        required: ['nome', 'eventos'],
        additionalProperties: false,
      },
    },
    verdadeVsPerspectiva: str('o que realmente aconteceu vs. o que os povos acreditam — e a tensão que isso gera'),
    reliquias: str('ruínas, monumentos e relíquias ainda visíveis — e seu uso hoje'),
    passadoNoPresente: str('como o passado aflora na história presente'),
  },
  required: ['nome', 'panorama', 'eras'],
  additionalProperties: false,
};

export const CHARACTER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    papel: str('papel na história (protagonista, aliado, mentor...)'),
    conceito: str('quem é em uma frase'),
    encaixeNoMundo: str('como se encaixa — ou contrasta de propósito — com o mundo em que vive'),
    diferencial: str('o que o torna interessante: a pequena (ou extrema) diferença em relação ao comum'),
    falha: str('a falha — ninguém é perfeito; falhas tornam genuíno'),
    contradicao: str('traços contraditórios e a razão por trás deles'),
    desejo: str('o que quer, por que quer, como vai conseguir'),
    historiaDeOrigem: str('história de origem curta — a fundação das reações consistentes'),
    tiques: str('hábitos e tiques que revelam emoção sem nomeá-la'),
    mudanca: str('como o personagem muda com as experiências — nunca "pronto"'),
  },
  required: ['nome', 'papel', 'conceito', 'falha', 'desejo'],
  additionalProperties: false,
};

export const CITY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    tipo: str('vila, cidade, metrópole + população aproximada'),
    cenario: str('época, clima, ambiente ao redor, regras do mundo (magia, física)'),
    origem: str('crescimento orgânico ou construção planejada — e POR QUE o assentamento existe aqui'),
    layout: str('estrutura e os edifícios/serviços importantes'),
    populacao: str('tamanho, diversidade, distritos, mistura ou separação de culturas'),
    historia: str('marcas visíveis da história: monumentos, arquitetura velha vs. nova'),
    detalhes: str('detalhes de rua que dão vida e diferenciam de outras cidades'),
    eventos: str('celebrações, festivais, eventos'),
  },
  required: ['nome', 'tipo', 'cenario', 'origem', 'layout'],
  additionalProperties: false,
};

export const TITLES_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    essencia: str('a essência da história — o elemento central ao redor do qual os títulos giram'),
    titulos: {
      type: 'array',
      description: '6 a 10 candidatos variados',
      items: {
        type: 'object',
        properties: {
          titulo: str(''),
          estilo: str('o estilo usado (nome de personagem, imagem, pergunta, jogo de palavras, emoção...)'),
          justificativa: str('por que funciona: chama atenção, memorável, captura a essência'),
        },
        required: ['titulo', 'estilo', 'justificativa'],
        additionalProperties: false,
      },
    },
  },
  required: ['essencia', 'titulos'],
  additionalProperties: false,
};

export const ROMANCE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str(''),
    premissa: str('a premissa do romance em uma ou duas frases'),
    casal: {
      type: 'array',
      description: 'os dois (ou mais) pombinhos',
      items: {
        type: 'object',
        properties: {
          nome: str(''),
          conceito: str(''),
          pontoDePartida: str('quem é no início — a imperfeição que precisa crescer'),
          crescimento: str('como cresce para ser melhor junto do que sozinho'),
        },
        required: ['nome', 'conceito', 'pontoDePartida', 'crescimento'],
        additionalProperties: false,
      },
    },
    obstaculos: strArray('obstáculos realistas e proporcionais ao amor — superá-los dá peso à relação'),
    escolha: str('o triângulo amoroso ou estrutura de escolha — stakes exigem escolha real'),
    coadjuvantes: str('personagens de apoio que sustentam a história, não só ombros para chorar'),
    locacao: str('a locação molda encontros, clima e problemas'),
    foco: str('sobre o que é a história — o foco a manter'),
  },
  required: ['titulo', 'premissa', 'casal', 'obstaculos'],
  additionalProperties: false,
};

export const SCENERY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str(''),
    descricao: str('a descrição do cenário em prosa — 1-2 elementos em foco, múltiplos sentidos, movimento suave do olhar'),
    foco: str('os elementos focados e por quê'),
    pontoDeVista: str('de quem é o olhar que filtra a cena — e o que essa pessoa NÃO nota'),
    palavrasChave: str('decisões de escolha de palavras (evocação, paleta sensorial)'),
    economia: str('o que foi deixado de fora de propósito'),
  },
  required: ['titulo', 'descricao', 'foco'],
  additionalProperties: false,
};

export const SCENE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str(''),
    cena: str('a cena completa em prosa: personagem engajado, verbos variados, local ancorado, começo-meio-fim'),
    proposito: str('como a cena avança o coração da história'),
    arcoDaCena: str('o arco da própria cena — ação ascendente e descendente'),
    ritmo: str('decisões de ritmo: rápido/lento, cadência das frases'),
    notas: str('variedade de verbos, ancoragem no local, escolhas de ponto de vista'),
  },
  required: ['titulo', 'cena', 'proposito'],
  additionalProperties: false,
};

export const SPEECH_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str(''),
    orador: str(''),
    tese: str('a mensagem única que o discurso precisa convencer'),
    estrutura: str('introdução (atenção) / corpo (ponto mais forte primeiro, o mais fraco no meio) / conclusão'),
    discurso: str('o discurso em si, quebrado por batidas de reação da plateia e do orador'),
    persuasao: str('métodos de persuasão usados: credibilidade, emoção, lógica'),
    notas: str('termos inclusivos ("nós"), pausas, escolhas de palavras'),
  },
  required: ['titulo', 'orador', 'tese', 'discurso'],
  additionalProperties: false,
};

export const OPENING_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str('título da história'),
    primeiraFrase: str('a primeira frase — a que decide se o leitor embarca'),
    abertura: str('os primeiros parágrafos'),
    tecnica: str('a técnica usada: gancho, voz, mistério, humor, contraste'),
    promessa: str('a promessa que a abertura faz ao leitor — a história terá que cumprir'),
    ancoragem: str('as migalhas de ambientação: onde/quando/quem, sem dumps de exposição'),
    notas: str('notas de craft: por que não prólogo, ritmo da informação, o que foi segurado para depois'),
  },
  required: ['titulo', 'primeiraFrase', 'abertura', 'promessa'],
  additionalProperties: false,
};

export const RELIGION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    natureza: str('real, falsa ou incerta — e o que isso significa dentro do mundo'),
    deuses: str('deuses e outros seres divinos, seu caráter e relações; ou a ausência deles (religião sem deus)'),
    poderes: str('poderes divinos e quem os empunha — ou "milagres" ambíguos se a natureza for incerta'),
    origem: str('mitos de origem e história'),
    figuras: str('líderes religiosos, escolhidos, profetas — e como são escolhidos'),
    lugaresESimbolos: str('lugares sagrados, código de vestimenta, símbolos'),
    rituais: strArray('tradições e rituais — incluindo os sombrios quando couber'),
    doutrina: str('bem vs. mal, meta de vida, vida após a morte, espíritos'),
    rigorEVersoes: str('o rigor da fé e as diferentes versões/seitas'),
  },
  required: ['nome', 'natureza', 'deuses', 'doutrina'],
  additionalProperties: false,
};

export const MAGIC_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    fonte: str('a fonte da magia — e se é limitada (limites criam conflito)'),
    materiais: str('materiais que abrigam ou canalizam poder (runas, cristais, artefatos, tatuagens)'),
    quemUsa: str('quem/o que pode empunhar — todos, poucos escolhidos, espécies específicas; elite ou pária'),
    comoUsa: str('como se empunha — gestos, itens, corpo; o que acontece quando desarmado'),
    poderes: str('os poderes em si, com custos relativos entre si'),
    ganhoDePoder: str('como se ganha poder — e o teto (por que ninguém chegou lá antes?)'),
    combinacao: str('poderes podem ser combinados? o que isso muda nas batalhas e rituais'),
    limitacoes: str('as limitações que criam tensão'),
  },
  required: ['nome', 'fonte', 'quemUsa', 'poderes', 'limitacoes'],
  additionalProperties: false,
};

export const ARMY_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str('nome do exército ou da força militar'),
    lideranca: str('quem lidera o exército, sua personalidade e conselheiros — e o que isso muda na prática'),
    patentes: strArray('patentes militares adaptadas à cultura — nomes próprios, não só soldado/sargento/capitão'),
    divisoes: strArray('divisões do exército — incluindo as não óbvias: veterinária, administração, anti-magos, moral, engenharia'),
    taticas: str('nível de experiência das tropas e estilo de combate preferido'),
    forcasEspeciais: str('forças especiais existem? quais os meios de treiná-las e equipá-las?'),
    equipamento: str('armaduras e armas — qualidade ideal vs. o que a economia pode pagar'),
    logistica: str('como a população e a economia sustentam esse exército — ou as consequências de não sustentar'),
    recrutamento: str('voluntários, recrutamento temporário em guerra, alistamento permanente — ou nenhum exército de pé'),
  },
  required: ['nome', 'lideranca', 'divisoes', 'recrutamento'],
  additionalProperties: false,
};

export const CAMPAIGN_START_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str('título da campanha ou da sessão de abertura'),
    proposito: str('o que a primeira sessão deve estabelecer: o mundo, a motivação, caminhos claros'),
    abertura: str('a cena de abertura em si — taberna, navio, prisão, in medias res, fogueira — com um toque próprio'),
    motivacao: str('por que os personagens se importam e permanecem juntos'),
    caminhos: strArray('caminhos claros oferecidos ao final da primeira sessão'),
    pressagio: str('sinais da trama principal / do perigo maior a caminho'),
    notas: str('notas para o GM: como conduzir, o que improvisar'),
  },
  required: ['titulo', 'abertura', 'motivacao', 'caminhos'],
  additionalProperties: false,
};

export const MOOD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    titulo: str(''),
    conceito: str('o clima/atmosfera geral que se busca criar à mesa'),
    cenas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cena: str('nome ou descrição curta da cena'),
          som: str('música e sons — trilha, efeitos, silêncio estratégico'),
          aroma: str('cheiros — velas, incenso, comidas temáticas'),
          luz: str('iluminação — velas, luz baixa, cores'),
          tato: str('elementos táteis — props, temperatura, texturas'),
          sabor: str('comidas e bebidas temáticas'),
        },
        required: ['cena', 'som', 'aroma', 'luz', 'tato', 'sabor'],
        additionalProperties: false,
      },
    },
    notas: str('notas práticas: alergias, uso comedido, velas reais vs. falsas, menos é mais'),
  },
  required: ['titulo', 'conceito', 'cenas'],
  additionalProperties: false,
};

export const QUEST_LIST_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    tema: str('tema ou contexto que amarra as missões'),
    quests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: str(''),
          gancho: str('a premissa como chega aos ouvidos dos personagens'),
          complicacao: str('a reviravolta ou complicação que torna a missão mais do que parece'),
        },
        required: ['titulo', 'gancho', 'complicacao'],
        additionalProperties: false,
      },
    },
  },
  required: ['quests'],
  additionalProperties: false,
};

export const LOCATION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    apelido: str('apelido no estilo "A Cidade das Máscaras", "A Cidade Dourada"'),
    conceito: str('o conceito/tema central que torna o lugar único e memorável'),
    vida: str('como é visitar ou viver ali — rotina, costumes, atmosfera'),
    desafios: str('regras peculiares, perigos, desafios do lugar'),
    ganchos: strArray('ganchos de história que esse lugar oferece'),
  },
  required: ['nome', 'conceito'],
  additionalProperties: false,
};

export const DUNGEON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    nome: str(''),
    conceito: str('o conceito central da dungeon em uma frase'),
    origem: str('por que existe — construída por quem, para quê, ou formação natural'),
    estrutura: str('layout, salas e níveis notáveis'),
    habitantes: str('habitantes e encontros'),
    reviravolta: str('a reviravolta que diferencia esta dungeon de um buraco cheio de monstros'),
    recompensas: str('o que vale a pena levar — ou o que custa levá-lo'),
  },
  required: ['nome', 'conceito', 'estrutura', 'reviravolta'],
  additionalProperties: false,
};

export const CRITIQUE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    aprovado: { type: 'boolean', description: 'true se a aventura está coesa e pronta' },
    problemas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          alvo: str('o que está com problema (nome da cena, do NPC, "estrutura", "consistência"...)'),
          especialista: {
            type: 'string',
            enum: ['adventure-structure', 'names', 'narrative', 'npc', 'encounter'],
            description: 'quem deve refazer a parte afetada',
          },
          descricao: str('qual é o problema'),
          sugestao: str('como corrigir'),
        },
        required: ['alvo', 'especialista', 'descricao', 'sugestao'],
        additionalProperties: false,
      },
    },
  },
  required: ['aprovado', 'problemas'],
  additionalProperties: false,
};

// ---------- validators ----------

type Obj = Record<string, unknown>;

function asObj(v: unknown, what: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${what}: esperado objeto`);
  return v as Obj;
}

function reqStr(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`campo "${key}" ausente ou vazio`);
  return v.trim();
}

function optStr(o: Obj, key: string): string | undefined {
  const v = o[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function reqStrArray(o: Obj, key: string): string[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`campo "${key}": esperado array`);
  return v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim());
}

export function parsePremise(v: unknown): Premise {
  const o = asObj(v, 'premise');
  return {
    tema: reqStr(o, 'tema'),
    tom: reqStr(o, 'tom'),
    escopo: reqStr(o, 'escopo'),
    nivelAmeaca: reqStr(o, 'nivelAmeaca'),
    duracaoEstimada: reqStr(o, 'duracaoEstimada'),
    pergunta: optStr(o, 'pergunta'),
  };
}

export function parseAdventureStructure(v: unknown): AdventureStructure {
  const o = asObj(v, 'adventure-structure');
  const cenas = o.cenas;
  if (!Array.isArray(cenas) || cenas.length === 0) throw new Error('"cenas": esperado array não vazio');
  // cap scenes so a runaway model can't bloat the pipeline; detailing slices further
  const capped = cenas.slice(0, 8);
  return {
    titulo: reqStr(o, 'titulo'),
    tema: reqStr(o, 'tema'),
    ganchos: reqStrArray(o, 'ganchos'),
    relogioDeTensao: reqStr(o, 'relogioDeTensao'),
    cenas: capped.map((c, i) => {
      const s = asObj(c, `cena ${i + 1}`);
      return {
        nome: reqStr(s, 'nome'),
        objetivo: reqStr(s, 'objetivo'),
        local: reqStr(s, 'local'),
        preRequisitos: Array.isArray(s.preRequisitos) ? reqStrArray(s as Obj, 'preRequisitos') : [],
      };
    }),
    consequenciasDeFalha: reqStr(o, 'consequenciasDeFalha'),
    climax: reqStr(o, 'climax'),
    recompensas: reqStr(o, 'recompensas'),
  };
}

export function parseNameList(v: unknown): NameList {
  const o = asObj(v, 'names');
  const nomes = o.nomes;
  if (!Array.isArray(nomes) || nomes.length === 0) throw new Error('"nomes": esperado array não vazio');
  return {
    nomes: nomes.map((n, i) => {
      const e = asObj(n, `nome ${i + 1}`);
      return {
        nome: reqStr(e, 'nome'),
        cultura: reqStr(e, 'cultura'),
        significado: optStr(e, 'significado'),
        estilo: optStr(e, 'estilo'),
      };
    }),
  };
}

export function parseNarrative(v: unknown): Narrative {
  const o = asObj(v, 'narrative');
  return {
    textoReadAloud: reqStr(o, 'textoReadAloud'),
    descricaoGM: reqStr(o, 'descricaoGM'),
    atmosfera: reqStr(o, 'atmosfera'),
  };
}

export function parseNpc(v: unknown): Npc {
  const o = asObj(v, 'npc');
  // core identity is required; flavor fields degrade to empty rather than fail
  return {
    nome: reqStr(o, 'nome'),
    conceito: reqStr(o, 'conceito'),
    aparencia: optStr(o, 'aparencia') ?? '',
    maneirismo: optStr(o, 'maneirismo') ?? '',
    objetivo: optStr(o, 'objetivo') ?? '',
    segredo: optStr(o, 'segredo') ?? '',
    vinculoComAventura: optStr(o, 'vinculoComAventura') ?? '',
  };
}

export function parseEncounter(v: unknown): Encounter {
  const o = asObj(v, 'encounter');
  const monstros = o.monstros;
  if (!Array.isArray(monstros) || monstros.length === 0) throw new Error('"monstros": esperado array não vazio');
  return {
    monstros: monstros.map((m, i) => {
      const mO = asObj(m, `monstro ${i + 1}`);
      return {
        nome: reqStr(mO, 'nome'),
        descricao: optStr(mO, 'descricao') ?? '',
        comportamento: optStr(mO, 'comportamento') ?? '',
        tatica: optStr(mO, 'tatica') ?? '',
      };
    }),
    ameaca: optStr(o, 'ameaca') ?? '',
    ambiente: optStr(o, 'ambiente') ?? '',
  };
}

export function parsePainDescription(v: unknown): PainDescription {
  const o = asObj(v, 'pain');
  return {
    titulo: reqStr(o, 'titulo'),
    tipoDor: optStr(o, 'tipoDor') ?? '',
    intensidade: optStr(o, 'intensidade') ?? '',
    sensacaoInicial: reqStr(o, 'sensacaoInicial'),
    reacaoEmocional: optStr(o, 'reacaoEmocional') ?? '',
    hesitacao: optStr(o, 'hesitacao') ?? '',
    luta: optStr(o, 'luta') ?? '',
    desfechoResiste: optStr(o, 'desfechoResiste') ?? '',
    desfechoCede: optStr(o, 'desfechoCede') ?? '',
  };
}

export function parseDemonDescription(v: unknown): DemonDescription {
  const o = asObj(v, 'demon');
  return {
    titulo: reqStr(o, 'titulo'),
    chegada: reqStr(o, 'chegada'),
    cabeca: reqStr(o, 'cabeca'),
    corpo: reqStr(o, 'corpo'),
    movimento: reqStr(o, 'movimento'),
    presencaFinal: reqStr(o, 'presencaFinal'),
  };
}

export function parseDialogueScene(v: unknown): DialogueScene {
  const o = asObj(v, 'dialogue');
  const vozes = Array.isArray(o.vozes) ? o.vozes : [];
  return {
    titulo: reqStr(o, 'titulo'),
    cena: reqStr(o, 'cena'),
    proposito: optStr(o, 'proposito') ?? '',
    subtexto: optStr(o, 'subtexto') ?? '',
    vozes: vozes
      .map((x) => asObj(x, 'voz'))
      .map((x) => ({ personagem: optStr(x, 'personagem') ?? '', voz: optStr(x, 'voz') ?? '' }))
      .filter((x) => x.personagem && x.voz),
  };
}

export function parsePlot(v: unknown): Plot {
  const o = asObj(v, 'plot');
  return {
    titulo: reqStr(o, 'titulo'),
    protagonista: reqStr(o, 'protagonista'),
    desejo: reqStr(o, 'desejo'),
    obstaculo: reqStr(o, 'obstaculo'),
    consequencias: reqStr(o, 'consequencias'),
    emRisco: reqStr(o, 'emRisco'),
    lucros: optStr(o, 'lucros') ?? '',
    requisitos: Array.isArray(o.requisitos) ? reqStrArray(o, 'requisitos') : [],
    ameacas: Array.isArray(o.ameacas) ? reqStrArray(o, 'ameacas') : [],
    tipoFinal: reqStr(o, 'tipoFinal'),
    acaoAscendente: reqStrArray(o, 'acaoAscendente'),
    climax: reqStr(o, 'climax'),
    acaoDescendente: optStr(o, 'acaoDescendente') ?? '',
    resolucao: reqStr(o, 'resolucao'),
  };
}

export function parseCombatScene(v: unknown): CombatScene {
  const o = asObj(v, 'combat');
  return {
    titulo: reqStr(o, 'titulo'),
    proposito: optStr(o, 'proposito') ?? '',
    resultado: optStr(o, 'resultado') ?? '',
    cena: reqStr(o, 'cena'),
    notasTecnicas: optStr(o, 'notasTecnicas') ?? '',
  };
}

export function parseVillain(v: unknown): Villain {
  const o = asObj(v, 'villain');
  return {
    nome: reqStr(o, 'nome'),
    conceito: reqStr(o, 'conceito'),
    motivacao: reqStr(o, 'motivacao'),
    bussolaMoral: optStr(o, 'bussolaMoral') ?? '',
    humanidade: optStr(o, 'humanidade') ?? '',
    maldadeEmCena: reqStr(o, 'maldadeEmCena'),
    contrasteComHeroi: optStr(o, 'contrasteComHeroi') ?? '',
    danoPermanente: optStr(o, 'danoPermanente') ?? '',
    arco: optStr(o, 'arco') ?? '',
  };
}

export function parseCharacterDrive(v: unknown): CharacterDrive {
  const o = asObj(v, 'drive');
  return {
    nome: reqStr(o, 'nome'),
    conceito: optStr(o, 'conceito') ?? '',
    objetivo: reqStr(o, 'objetivo'),
    motivacaoExterna: reqStr(o, 'motivacaoExterna'),
    motivacaoInterna: reqStr(o, 'motivacaoInterna'),
    conflitoExterno: optStr(o, 'conflitoExterno') ?? '',
    conflitoInterno: optStr(o, 'conflitoInterno') ?? '',
    medos: optStr(o, 'medos') ?? '',
    consciencia: optStr(o, 'consciencia') ?? '',
    arco: optStr(o, 'arco') ?? '',
  };
}

export function parseBodyLanguage(v: unknown): BodyLanguage {
  const o = asObj(v, 'body-language');
  return {
    titulo: reqStr(o, 'titulo'),
    emocao: optStr(o, 'emocao') ?? '',
    descricao: reqStr(o, 'descricao'),
    sinaisChave: Array.isArray(o.sinaisChave) ? reqStrArray(o, 'sinaisChave') : [],
    notas: optStr(o, 'notas') ?? '',
  };
}

export function parseWorldShape(v: unknown): WorldShape {
  const o = asObj(v, 'world');
  return {
    nome: reqStr(o, 'nome'),
    conceito: reqStr(o, 'conceito'),
    geografia: reqStr(o, 'geografia'),
    climaEEstacoes: optStr(o, 'climaEEstacoes') ?? '',
    natureza: reqStr(o, 'natureza'),
    civilizacoes: reqStr(o, 'civilizacoes'),
    historia: optStr(o, 'historia') ?? '',
    fenomenos: optStr(o, 'fenomenos') ?? '',
    vidaCotidiana: optStr(o, 'vidaCotidiana') ?? '',
  };
}

export function parseSociety(v: unknown): Society {
  const o = asObj(v, 'society');
  return {
    nome: reqStr(o, 'nome'),
    razaoDeSer: reqStr(o, 'razaoDeSer'),
    governantes: reqStr(o, 'governantes'),
    leiEOrdem: reqStr(o, 'leiEOrdem'),
    religiao: optStr(o, 'religiao') ?? '',
    tradicoes: Array.isArray(o.tradicoes) ? reqStrArray(o, 'tradicoes') : [],
    cultura: optStr(o, 'cultura') ?? '',
    conflitos: Array.isArray(o.conflitos) ? reqStrArray(o, 'conflitos') : [],
    custoEscondido: optStr(o, 'custoEscondido') ?? '',
  };
}

export function parseCreature(v: unknown): Creature {
  const o = asObj(v, 'creature');
  return {
    nome: reqStr(o, 'nome'),
    tipo: reqStr(o, 'tipo'),
    aparencia: reqStr(o, 'aparencia'),
    habitat: reqStr(o, 'habitat'),
    som: optStr(o, 'som') ?? '',
    dieta: reqStr(o, 'dieta'),
    comportamento: reqStr(o, 'comportamento'),
    raridade: optStr(o, 'raridade') ?? '',
    reproducao: optStr(o, 'reproducao') ?? '',
    domesticacao: optStr(o, 'domesticacao') ?? '',
    subespecies: optStr(o, 'subespecies') ?? '',
  };
}

export function parseInnerStory(v: unknown): InnerStory {
  const o = asObj(v, 'inner-story');
  return {
    titulo: reqStr(o, 'titulo'),
    proposito: optStr(o, 'proposito') ?? '',
    moldura: optStr(o, 'moldura') ?? '',
    narrador: optStr(o, 'narrador') ?? '',
    historia: reqStr(o, 'historia'),
    verdade: optStr(o, 'verdade') ?? '',
    eco: optStr(o, 'eco') ?? '',
  };
}

export function parseWorldHistory(v: unknown): WorldHistory {
  const o = asObj(v, 'history');
  const eras = Array.isArray(o.eras) ? o.eras : [];
  return {
    nome: reqStr(o, 'nome'),
    panorama: reqStr(o, 'panorama'),
    eras: eras
      .map((e) => asObj(e, 'era'))
      .map((e) => ({ nome: optStr(e, 'nome') ?? '', eventos: optStr(e, 'eventos') ?? '' }))
      .filter((e) => e.nome && e.eventos),
    verdadeVsPerspectiva: optStr(o, 'verdadeVsPerspectiva') ?? '',
    reliquias: optStr(o, 'reliquias') ?? '',
    passadoNoPresente: optStr(o, 'passadoNoPresente') ?? '',
  };
}

export function parseCharacterProfile(v: unknown): CharacterProfile {
  const o = asObj(v, 'character');
  return {
    nome: reqStr(o, 'nome'),
    papel: reqStr(o, 'papel'),
    conceito: reqStr(o, 'conceito'),
    encaixeNoMundo: optStr(o, 'encaixeNoMundo') ?? '',
    diferencial: optStr(o, 'diferencial') ?? '',
    falha: reqStr(o, 'falha'),
    contradicao: optStr(o, 'contradicao') ?? '',
    desejo: reqStr(o, 'desejo'),
    historiaDeOrigem: optStr(o, 'historiaDeOrigem') ?? '',
    tiques: optStr(o, 'tiques') ?? '',
    mudanca: optStr(o, 'mudanca') ?? '',
  };
}

export function parseCityDesign(v: unknown): CityDesign {
  const o = asObj(v, 'city');
  return {
    nome: reqStr(o, 'nome'),
    tipo: reqStr(o, 'tipo'),
    cenario: reqStr(o, 'cenario'),
    origem: reqStr(o, 'origem'),
    layout: reqStr(o, 'layout'),
    populacao: optStr(o, 'populacao') ?? '',
    historia: optStr(o, 'historia') ?? '',
    detalhes: optStr(o, 'detalhes') ?? '',
    eventos: optStr(o, 'eventos') ?? '',
  };
}

export function parseTitleList(v: unknown): TitleList {
  const o = asObj(v, 'titles');
  const titulos = o.titulos;
  if (!Array.isArray(titulos) || titulos.length === 0) throw new Error('"titulos": esperado array não vazio');
  return {
    essencia: reqStr(o, 'essencia'),
    titulos: titulos
      .map((t) => asObj(t, 'titulo'))
      .map((t) => ({
        titulo: optStr(t, 'titulo') ?? '',
        estilo: optStr(t, 'estilo') ?? '',
        justificativa: optStr(t, 'justificativa') ?? '',
      }))
      .filter((t) => t.titulo),
  };
}

export function parseRomanceDesign(v: unknown): RomanceDesign {
  const o = asObj(v, 'romance');
  const casal = o.casal;
  if (!Array.isArray(casal) || casal.length < 2) throw new Error('"casal": esperado array com 2+ personagens');
  return {
    titulo: reqStr(o, 'titulo'),
    premissa: reqStr(o, 'premissa'),
    casal: casal.map((c) => {
      const cO = asObj(c, 'pessoa do casal');
      return {
        nome: reqStr(cO, 'nome'),
        conceito: optStr(cO, 'conceito') ?? '',
        pontoDePartida: optStr(cO, 'pontoDePartida') ?? '',
        crescimento: optStr(cO, 'crescimento') ?? '',
      };
    }),
    obstaculos: reqStrArray(o, 'obstaculos'),
    escolha: optStr(o, 'escolha') ?? '',
    coadjuvantes: optStr(o, 'coadjuvantes') ?? '',
    locacao: optStr(o, 'locacao') ?? '',
    foco: optStr(o, 'foco') ?? '',
  };
}

export function parseSceneryDescription(v: unknown): SceneryDescription {
  const o = asObj(v, 'scenery');
  return {
    titulo: reqStr(o, 'titulo'),
    descricao: reqStr(o, 'descricao'),
    foco: reqStr(o, 'foco'),
    pontoDeVista: optStr(o, 'pontoDeVista') ?? '',
    palavrasChave: optStr(o, 'palavrasChave') ?? '',
    economia: optStr(o, 'economia') ?? '',
  };
}

export function parseSceneCraft(v: unknown): SceneCraft {
  const o = asObj(v, 'scene');
  return {
    titulo: reqStr(o, 'titulo'),
    cena: reqStr(o, 'cena'),
    proposito: reqStr(o, 'proposito'),
    arcoDaCena: optStr(o, 'arcoDaCena') ?? '',
    ritmo: optStr(o, 'ritmo') ?? '',
    notas: optStr(o, 'notas') ?? '',
  };
}

export function parseSpeech(v: unknown): Speech {
  const o = asObj(v, 'speech');
  return {
    titulo: reqStr(o, 'titulo'),
    orador: reqStr(o, 'orador'),
    tese: reqStr(o, 'tese'),
    estrutura: optStr(o, 'estrutura') ?? '',
    discurso: reqStr(o, 'discurso'),
    persuasao: optStr(o, 'persuasao') ?? '',
    notas: optStr(o, 'notas') ?? '',
  };
}

export function parseOpening(v: unknown): Opening {
  const o = asObj(v, 'opening');
  return {
    titulo: reqStr(o, 'titulo'),
    primeiraFrase: reqStr(o, 'primeiraFrase'),
    abertura: reqStr(o, 'abertura'),
    tecnica: optStr(o, 'tecnica') ?? '',
    promessa: reqStr(o, 'promessa'),
    ancoragem: optStr(o, 'ancoragem') ?? '',
    notas: optStr(o, 'notas') ?? '',
  };
}

export function parseReligion(v: unknown): Religion {
  const o = asObj(v, 'religion');
  return {
    nome: reqStr(o, 'nome'),
    natureza: reqStr(o, 'natureza'),
    deuses: reqStr(o, 'deuses'),
    poderes: optStr(o, 'poderes') ?? '',
    origem: optStr(o, 'origem') ?? '',
    figuras: optStr(o, 'figuras') ?? '',
    lugaresESimbolos: optStr(o, 'lugaresESimbolos') ?? '',
    rituais: Array.isArray(o.rituais) ? reqStrArray(o, 'rituais') : [],
    doutrina: reqStr(o, 'doutrina'),
    rigorEVersoes: optStr(o, 'rigorEVersoes') ?? '',
  };
}

export function parseMagicSystem(v: unknown): MagicSystem {
  const o = asObj(v, 'magic');
  return {
    nome: reqStr(o, 'nome'),
    fonte: reqStr(o, 'fonte'),
    materiais: optStr(o, 'materiais') ?? '',
    quemUsa: reqStr(o, 'quemUsa'),
    comoUsa: optStr(o, 'comoUsa') ?? '',
    poderes: reqStr(o, 'poderes'),
    ganhoDePoder: optStr(o, 'ganhoDePoder') ?? '',
    combinacao: optStr(o, 'combinacao') ?? '',
    limitacoes: reqStr(o, 'limitacoes'),
  };
}

export function parseArmyDesign(v: unknown): ArmyDesign {
  const o = asObj(v, 'army');
  return {
    nome: reqStr(o, 'nome'),
    lideranca: reqStr(o, 'lideranca'),
    patentes: Array.isArray(o.patentes) ? reqStrArray(o, 'patentes') : [],
    divisoes: reqStrArray(o, 'divisoes'),
    taticas: optStr(o, 'taticas') ?? '',
    forcasEspeciais: optStr(o, 'forcasEspeciais') ?? '',
    equipamento: optStr(o, 'equipamento') ?? '',
    logistica: optStr(o, 'logistica') ?? '',
    recrutamento: reqStr(o, 'recrutamento'),
  };
}

export function parseCampaignStart(v: unknown): CampaignStart {
  const o = asObj(v, 'campaign-start');
  return {
    titulo: reqStr(o, 'titulo'),
    proposito: optStr(o, 'proposito') ?? '',
    abertura: reqStr(o, 'abertura'),
    motivacao: reqStr(o, 'motivacao'),
    caminhos: reqStrArray(o, 'caminhos'),
    pressagio: optStr(o, 'pressagio') ?? '',
    notas: optStr(o, 'notas') ?? '',
  };
}

export function parseMoodPlan(v: unknown): MoodPlan {
  const o = asObj(v, 'mood');
  const cenas = Array.isArray(o.cenas) ? o.cenas : [];
  return {
    titulo: reqStr(o, 'titulo'),
    conceito: reqStr(o, 'conceito'),
    cenas: cenas
      .map((c) => asObj(c, 'cena de mood'))
      .filter((c) => optStr(c, 'cena'))
      .map((c) => ({
        cena: reqStr(c, 'cena'),
        som: optStr(c, 'som') ?? '',
        aroma: optStr(c, 'aroma') ?? '',
        luz: optStr(c, 'luz') ?? '',
        tato: optStr(c, 'tato') ?? '',
        sabor: optStr(c, 'sabor') ?? '',
      })),
    notas: optStr(o, 'notas') ?? '',
  };
}

export function parseQuestList(v: unknown): QuestList {
  const o = asObj(v, 'quests');
  const quests = Array.isArray(o.quests) ? o.quests : [];
  return {
    tema: optStr(o, 'tema') ?? '',
    quests: quests
      .map((q) => asObj(q, 'quest'))
      .filter((q) => optStr(q, 'titulo') && optStr(q, 'gancho'))
      .map((q) => ({
        titulo: reqStr(q, 'titulo'),
        gancho: reqStr(q, 'gancho'),
        complicacao: optStr(q, 'complicacao') ?? '',
      })),
  };
}

export function parseLocationDesign(v: unknown): LocationDesign {
  const o = asObj(v, 'location');
  return {
    nome: reqStr(o, 'nome'),
    apelido: optStr(o, 'apelido') ?? '',
    conceito: reqStr(o, 'conceito'),
    vida: optStr(o, 'vida') ?? '',
    desafios: optStr(o, 'desafios') ?? '',
    ganchos: Array.isArray(o.ganchos) ? reqStrArray(o, 'ganchos') : [],
  };
}

export function parseDungeonDesign(v: unknown): DungeonDesign {
  const o = asObj(v, 'dungeon');
  return {
    nome: reqStr(o, 'nome'),
    conceito: reqStr(o, 'conceito'),
    origem: optStr(o, 'origem') ?? '',
    estrutura: reqStr(o, 'estrutura'),
    habitantes: optStr(o, 'habitantes') ?? '',
    reviravolta: reqStr(o, 'reviravolta'),
    recompensas: optStr(o, 'recompensas') ?? '',
  };
}

export function parseCritique(v: unknown): Critique {
  const o = asObj(v, 'critique');
  const problemas = Array.isArray(o.problemas) ? o.problemas : [];
  const validSpecs = ['adventure-structure', 'names', 'narrative', 'npc', 'encounter'];
  return {
    aprovado: o.aprovado === true,
    problemas: problemas
      .map((p) => asObj(p, 'problema'))
      .filter((p) => validSpecs.includes(String(p.especialista)))
      .map((p) => ({
        alvo: optStr(p, 'alvo') ?? '',
        especialista: p.especialista as CritiqueProblem['especialista'],
        descricao: optStr(p, 'descricao') ?? '',
        sugestao: optStr(p, 'sugestao') ?? '',
      }))
      .filter((p) => p.descricao),
  };
}
