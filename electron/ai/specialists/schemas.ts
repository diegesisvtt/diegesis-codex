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
