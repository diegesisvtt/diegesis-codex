// Ponte compartilhada das rolagens: settings do plugin (persistidas e
// aplicadas ao vivo ao DiceBox), o handler de animação do overlay em tela
// cheia (Dice So Nice) e `presentRoll`, o ponto único por onde toda rolagem
// passa para decidir QUANDO o resultado é revelado (ver `wait3d`).
import { createDiceBox, type DiceBox, type DiceBoxOptions, type ShadowQuality } from '@diegesis/dice';
import type { RollResult } from '@diegesis/dice-core';
import PhysicsWorker from '@diegesis/physics/worker?worker';
import type { PluginSettings } from '../../plugins/api/types';
import type { DieType } from '../codex/DiceButton';

export type EnvironmentId = 'none' | 'neutral' | 'tavern' | 'neon';

/** dados válidos e lista padrão da barra rápida (configurável nas settings) */
const VALID_DICE = new Set<DieType>(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);
export const DEFAULT_QUICK_DICE = 'd4, d6, d8, d10, d12, d20, d100';

function parseQuickDice(raw: unknown): DieType[] {
  if (typeof raw !== 'string') return DEFAULT_QUICK_DICE.split(',').map((s) => s.trim() as DieType);
  const list = [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()))].filter(
    (s): s is DieType => VALID_DICE.has(s as DieType)
  );
  return list.length > 0 ? list : ['d20'];
}

/** opções de ambiente/sombras — usadas pelo schema declarativo de settings */
export const ENVIRONMENTS: { id: EnvironmentId; label: string }[] = [
  { id: 'none', label: 'Nenhum' },
  { id: 'neutral', label: 'Neutro' },
  { id: 'tavern', label: 'Taverna' },
  { id: 'neon', label: 'Neon' },
];

export const SHADOWS: { id: ShadowQuality; label: string }[] = [
  { id: 'none', label: 'Sem sombra' },
  { id: 'low', label: 'Baixa' },
  { id: 'medium', label: 'Média' },
  { id: 'high', label: 'Alta' },
];

export interface Dice3dConfig {
  /** exibe os dados em 3D (tela cheia) */
  show3d: boolean;
  /** espera a animação 3D terminar antes de revelar o resultado */
  wait3d: boolean;
  /** dados exibidos na barra rápida do painel (configurável) */
  quickDice: DieType[];
  theme: string;
  material: string;
  texture: string;
  environment: EnvironmentId;
  shadows: ShadowQuality;
  bloom: boolean;
  outline: boolean;
  strength: number;
  sounds: boolean;
  volume: number;
}

const DEFAULT_CONFIG: Dice3dConfig = {
  show3d: true,
  wait3d: true,
  quickDice: DEFAULT_QUICK_DICE.split(',').map((s) => s.trim() as DieType),
  theme: 'default',
  material: '',
  texture: '',
  environment: 'none',
  shadows: 'medium',
  bloom: false,
  outline: false,
  strength: 1,
  sounds: false,
  volume: 80,
};

function loadConfig(s: PluginSettings | null): Dice3dConfig {
  if (!s) return { ...DEFAULT_CONFIG };
  return {
    show3d: s.get('show3d', true),
    wait3d: s.get('wait3d', true),
    quickDice: parseQuickDice(s.get('quickDice', DEFAULT_QUICK_DICE)),
    theme: s.get('theme', 'default'),
    material: s.get('material', ''),
    texture: s.get('texture', ''),
    environment: s.get('environment', 'none'),
    shadows: s.get('shadows', 'medium'),
    bloom: s.get('bloom', false),
    outline: s.get('outline', false),
    strength: s.get('strength', 1),
    sounds: s.get('sounds', false),
    volume: s.get('volume', 80),
  };
}

/** um passo rolado (mesmo formato do evento 'roller:rolled') */
export interface RollStepPayload {
  title: string;
  formula: string;
  roll: RollResult | null;
  text: string;
}

/** uma rolagem a exibir/animar */
export interface RollPayload {
  tableTitle: string;
  steps: RollStepPayload[];
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export const dice3dBridge = {
  /** null enquanto o plugin de rolagens está desativado */
  settings: null as PluginSettings | null,
  /** overlay montado: anima uma rolagem em tela cheia (null quando inativo) */
  animateHandler: null as ((payload: RollPayload) => Promise<void>) | null,
  /** configuração atual (carregada das settings na ativação do plugin) */
  config: { ...DEFAULT_CONFIG } as Dice3dConfig,

  setSettings(s: PluginSettings | null) {
    this.settings = s;
    this.config = loadConfig(s);
    notify();
  },

  /** relê a config das settings (ex.: form de configurações do plugin) e a
   *  propaga ao DiceBox vivo */
  refreshConfig() {
    if (!this.settings) return;
    this.config = loadConfig(this.settings);
    notify();
  },

  /**
   * Ponto único de exibição de uma rolagem. Decide QUANDO revelar o resultado
   * (log, tabela, ficha…):
   * - 3D ativo e `wait3d` ligado: anima primeiro e só então revela;
   * - 3D ativo e `wait3d` desligado: revela na hora e anima em paralelo;
   * - sem 3D: revela na hora.
   * `reveal` nunca deixa de rodar (mesmo se a animação falhar).
   */
  presentRoll(payload: RollPayload, reveal: () => void): void {
    const animate = this.animateHandler;
    if (!animate) {
      reveal();
      return;
    }
    if (!this.config.wait3d) {
      reveal();
      void animate(payload).catch((err) => console.error('[roller] animação 3D falhou', err));
      return;
    }
    // espera a animação, mas nunca prende o resultado: se os dados não
    // assentarem (ex.: janela sem foco/throttling de rAF), revela após o
    // limite de segurança para que a rolagem SEMPRE apareça (histórico/tabela)
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      reveal();
    };
    const guard = window.setTimeout(fire, 4000);
    void animate(payload).then(
      () => {
        clearTimeout(guard);
        fire();
      },
      () => {
        clearTimeout(guard);
        fire();
      }
    );
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** config → opções do DiceBox (criação e reconfiguração ao vivo) */
export function configToOptions(cfg: Dice3dConfig): DiceBoxOptions {
  return {
    theme: cfg.theme,
    environment: cfg.environment,
    shadows: cfg.shadows,
    strength: cfg.strength,
    postprocessing: { enabled: cfg.bloom || cfg.outline, bloom: cfg.bloom ? {} : false, outline: cfg.outline ? {} : false },
    ...(cfg.material ? { material: cfg.material } : {}),
    ...(cfg.texture ? { texture: cfg.texture } : {}),
    sounds: cfg.sounds,
    volume: cfg.volume,
  };
}

/** cria um DiceBox com a configuração atual e os assets empacotados.
 *  `opts.worker` força a física na main thread (fallback quando o Web Worker
 *  não inicializa); por padrão usa worker, exceto em file:// (bloqueado). */
export function createConfiguredDiceBox(
  el: HTMLDivElement,
  cfg: Dice3dConfig,
  opts?: { worker?: boolean }
): DiceBox {
  const isFileProtocol = window.location.protocol === 'file:';
  const useWorker = opts?.worker ?? !isFileProtocol;
  return createDiceBox(el, {
    // assets (texturas/sons/HDRs) servidos pelo protocolo customizado do
    // Electron — em file:// o fetch de arquivos locais é bloqueado
    assetPath: 'diegesis-asset://dice/',
    ...configToOptions(cfg),
    ...(useWorker ? { workerFactory: () => new PhysicsWorker() } : { worker: false }),
  });
}
