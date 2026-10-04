// Mesa de dados 3D — view do plugin dice3d. O DiceBox (@diegesis/dice) anima
// resultados PRÉ-ROLADOS (estilo DiceSoNice): a rolagem lógica é feita pelo
// dice-core (evaluateRoll) e convertida em DiceTerm[] para a física animar.
// O log ('roller:rolled') é emitido quando os dados assentam ('roll:finish').
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDiceBox, termsFromRoll, type DiceBox } from '@diegesis/dice';
import { evaluateRoll, type RollResult } from '@diegesis/dice-core';
import PhysicsWorker from '@diegesis/physics/worker?worker';
import { Dices, Eraser, Volume2, VolumeX } from 'lucide-react';
import { parseFormula } from '@shared/table';
import { usePluginManager } from '../../plugins/manager';
import type { PluginSettings } from '../../plugins/api/types';

/** ponte plugin→componente apenas para settings (o manager não expõe hook de
 *  settings); eventos usam usePluginManager() como os demais componentes. */
export const dice3dBridge: { settings: PluginSettings | null } = {
  settings: null,
};

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

export function DiceBoxPanel() {
  const manager = usePluginManager();
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [formula, setFormula] = useState('1d20');
  const [lastTotal, setLastTotal] = useState<number | boolean | null>(null);
  const [rolling, setRolling] = useState(false);
  const [sounds, setSounds] = useState(() => dice3dBridge.settings?.get('sounds', false) ?? false);

  /** emite a rolagem no histórico global (mesmo formato das tabelas) */
  const emitToLog = useCallback(
    (src: string, roll: RollResult) => {
      manager.events.emit('roller:rolled', {
        tableTitle: 'Dados 3D',
        steps: [{ title: 'Dados 3D', formula: src, roll, text: `Total: ${String(roll.value)}` }],
      });
    },
    [manager]
  );

  // ciclo de vida do DiceBox: cria no mount, destrói no unmount/desativação
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Em produção Electron (file://) module workers são bloqueados pelo
    // Chromium (origem opaca) — plano B: física na main thread.
    const isFileProtocol = window.location.protocol === 'file:';
    const box = createDiceBox(el, {
      theme: 'default',
      environment: 'none',
      sounds: dice3dBridge.settings?.get('sounds', false) ?? false,
      ...(isFileProtocol
        ? { worker: false }
        : { workerFactory: () => new PhysicsWorker() }),
    });
    boxRef.current = box;
    box.ready.then(() => setReady(true)).catch((err) => setFatalError(err instanceof Error ? err.message : String(err)));
    box.on('error', (err) => console.error('[dice3d]', err));
    return () => {
      box.destroy();
      boxRef.current = null;
      setReady(false);
    };
  }, []);

  const roll = useCallback(
    async (src: string) => {
      const expr = parseFormula(src);
      if (!expr || rolling) return;
      const result = evaluateRoll(expr);
      setLastTotal(result.value);
      const box = boxRef.current;
      const terms = box && ready ? termsFromRoll(expr, result) : null;
      if (!box || !terms) {
        // sem animação possível — log direto
        emitToLog(src, result);
        return;
      }
      setRolling(true);
      const off = box.on('roll:finish', () => {
        off();
        setRolling(false);
        emitToLog(src, result);
      });
      try {
        await box.roll(terms);
      } catch (err) {
        off();
        setRolling(false);
        console.error('[dice3d] roll failed', err);
        emitToLog(src, result);
      }
    },
    [ready, rolling, emitToLog]
  );

  const toggleSounds = () => {
    const next = !sounds;
    setSounds(next);
    dice3dBridge.settings?.set('sounds', next);
    // reconfigura o box em runtime (sounds são carregados sob demanda)
    boxRef.current?.configure({ sounds: next }).catch(console.error);
  };

  return (
    <div className="h-full flex flex-col bg-app">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-line flex-wrap">
        <Dices size={14} className="text-table" />
        <input
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') roll(formula);
          }}
          spellCheck={false}
          placeholder="1d20 + 5"
          className="w-40 px-2 py-1 rounded bg-elevated/60 border border-line text-[12.5px] font-mono text-ink-1 outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={!ready || rolling}
          onClick={() => roll(formula)}
          className="px-2.5 py-1 rounded bg-accent-soft text-accent-ink text-[12px] font-medium hover:bg-accent/30 disabled:opacity-40 transition-colors"
        >
          Rolar
        </button>
        <div className="flex items-center gap-0.5">
          {QUICK_DICE.map((f) => (
            <button
              key={f}
              type="button"
              disabled={!ready || rolling}
              onClick={() => {
                setFormula(`1d${f}`);
                roll(`1d${f}`);
              }}
              className="px-1.5 py-1 rounded text-[11px] font-mono text-ink-2 hover:text-ink-1 hover:bg-elevated disabled:opacity-40 transition-colors"
            >
              d{f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => boxRef.current?.clear()}
          title="Limpar dados da mesa"
          className="p-1.5 rounded text-ink-3 hover:text-ink-1 hover:bg-elevated transition-colors"
        >
          <Eraser size={13} />
        </button>
        <button
          type="button"
          onClick={toggleSounds}
          title={sounds ? 'Desativar sons' : 'Ativar sons'}
          className="p-1.5 rounded text-ink-3 hover:text-ink-1 hover:bg-elevated transition-colors"
        >
          {sounds ? <Volume2 size={13} /> : <VolumeX size={13} />}
        </button>
        {lastTotal !== null && (
          <span className="ml-auto font-mono font-bold text-[15px] text-ink-1 select-none">{String(lastTotal)}</span>
        )}
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && !fatalError && (
          <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-3 pointer-events-none">
            Preparando a mesa de dados…
          </div>
        )}
        {fatalError && (
          <div className="absolute inset-0 grid place-items-center text-[13px] text-danger pointer-events-none">
            Falha ao iniciar o DiceBox: {fatalError}
          </div>
        )}
      </div>
    </div>
  );
}
