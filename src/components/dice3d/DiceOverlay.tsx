// Overlay de dados 3D em TELA CHEIA: montado
// no Shell, anima as rolagens encaminhadas via `dice3dBridge.presentRoll` —
// painel de rolagens, tabelas, blocos de nota e fichas. O canvas é
// transparente (alpha + clearColor 0), então a UI aparece atrás dos dados.
// Só existe quando o plugin de rolagens está ativo E a setting "Exibir dados
// em 3D" está ligada.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { termsFromRoll, type DiceBox } from '@diegesis/dice';
import { parseFormula } from '@shared/table';
import { configToOptions, createConfiguredDiceBox, dice3dBridge, type RollPayload } from './bridge';

const HIDE_DELAY_MS = 3000;
// rolagem legítima pode levar até ~16s (iterationLimit = 1000 frames); se
// passar disso o worker de física/fila serial travou — recuperamos recriando
// o DiceBox, senão os dados ficariam congelados na tela para sempre
const STALL_TIMEOUT_MS = 15000;

export function DiceOverlay() {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const active = useSyncExternalStore(
    dice3dBridge.subscribe,
    () => !!dice3dBridge.settings && dice3dBridge.config.show3d
  );
  const config = useSyncExternalStore(dice3dBridge.subscribe, () => dice3dBridge.config);

  /** cria o DiceBox no container (worker por padrão; `false` força main thread) */
  const spawn = useCallback((worker?: boolean): DiceBox | null => {
    const el = containerRef.current;
    if (!el) return null;
    const box = createConfiguredDiceBox(el, dice3dBridge.config, worker === undefined ? undefined : { worker });
    box.on('error', (err) => console.error('[dice3d]', err));
    boxRef.current = box;
    return box;
  }, []);

  /** destrói o box atual e recria um novo — o destroy interrompe rolagens
   *  emperradas e destrava a fila serial */
  const respawn = useCallback(() => {
    const old = boxRef.current;
    boxRef.current = null;
    old?.destroy();
    spawn();
  }, [spawn]);

  // ciclo de vida do DiceBox — container em tela cheia
  useEffect(() => {
    if (!active) return;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    // adia a criação: em StrictMode o primeiro setup é cancelado antes de
    // criar — evita destruir um WebGL context / event bus sem necessidade
    const start = setTimeout(() => {
      const created = spawn();
      if (!created) return;
      // watchdog: se a física não inicializar a tempo, recria na main thread
      watchdog = setTimeout(() => {
        // um respawn (stall) pode ter trocado o box nesse meio-tempo
        if (created.initialized || boxRef.current !== created) return;
        console.warn('[dice3d] física não inicializou a tempo — recriando sem worker');
        created.destroy();
        if (boxRef.current === created) boxRef.current = null;
        spawn(false);
      }, 6000);
    }, 0);
    return () => {
      clearTimeout(start);
      if (watchdog !== undefined) clearTimeout(watchdog);
      const box = boxRef.current;
      boxRef.current = null;
      box?.destroy();
    };
  }, [active, spawn]);

  // reconfiguração ao vivo
  const firstConfig = useRef(true);
  useEffect(() => {
    if (firstConfig.current) {
      firstConfig.current = false;
      return;
    }
    if (!active) return;
    boxRef.current?.configure(configToOptions(config)).catch(console.error);
  }, [config, active]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  }, []);

  /** anima todos os passos animáveis de uma rolagem de uma vez */
  const animate = useCallback(
    async (payload: RollPayload): Promise<void> => {
      const box = boxRef.current;
      if (!box) return;
      const terms = payload.steps.flatMap((s) => {
        const expr = s.roll ? parseFormula(s.formula) : null;
        return expr && s.roll ? termsFromRoll(expr, s.roll) ?? [] : [];
      });
      if (terms.length === 0) return; // nada a animar (sorteio ponderado puro)
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setVisible(true);
      // rolar antes do `ready` rejeita (física ainda não inicializada)
      try {
        await box.ready;
      } catch (err) {
        scheduleHide();
        console.error('[dice3d] DiceBox não inicializou', err);
        return;
      }
      const off = box.on('roll:finish', () => {
        off();
        scheduleHide();
      });
      // watchdog de travamento: se o worker de física não responder (fila
      // serial emperrada), os dados ficariam congelados na tela para sempre
      const stall = setTimeout(() => {
        off();
        console.warn('[dice3d] rolagem não assentou a tempo — recriando DiceBox');
        if (boxRef.current === box) respawn();
        setVisible(false);
      }, STALL_TIMEOUT_MS);
      try {
        await box.roll(terms);
      } catch (err) {
        off();
        // se um respawn já trocou o box, não mexer no overlay do box novo
        if (boxRef.current === box) scheduleHide();
        console.error('[dice3d] roll failed', err);
      } finally {
        clearTimeout(stall);
      }
    },
    [scheduleHide, respawn]
  );

  // o overlay é o animador do plugin: presentRoll usa este handler
  useEffect(() => {
    dice3dBridge.animateHandler = active ? animate : null;
    return () => {
      dice3dBridge.animateHandler = null;
    };
  }, [active, animate]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-50 pointer-events-none transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
