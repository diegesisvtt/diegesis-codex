/**
 * Boot progress — a tiny module-level observable that records the REAL
 * startup work (database reads, resource discovery, plugin activation).
 *
 * Both the store bootstrap and the plugin host report into it, so a single
 * loading screen can show accurate, non-fabricated progress. The state is a
 * plain object replaced on every mutation, which keeps it compatible with
 * `useSyncExternalStore` (reference changes only when something changed).
 */

export type BootPhase = 'idle' | 'database' | 'plugins' | 'ready';

export interface BootStatus {
  /** true while startup work is still running */
  active: boolean;
  phase: BootPhase;
  /** human-readable description of the current step */
  label: string;
  /** optional concrete target of the current step (realm or plugin name) */
  detail: string | null;
  /** number of finished units of work */
  completed: number;
  /** total known units of work (grows as discovery reveals more) */
  total: number;
}

let status: BootStatus = {
  active: false,
  phase: 'idle',
  label: 'Iniciando',
  detail: null,
  completed: 0,
  total: 0,
};

const listeners = new Set<() => void>();

function setStatus(patch: Partial<BootStatus>): void {
  status = { ...status, ...patch };
  for (const fn of listeners) fn();
}

/** Resets the tracker and marks startup as running. */
export function bootBegin(): void {
  setStatus({
    active: true,
    phase: 'database',
    label: 'Iniciando o Codex',
    detail: null,
    completed: 0,
    total: 0,
  });
}

/** Registers additional units of work discovered after the initial plan. */
export function bootPlan(steps: number): void {
  if (steps <= 0) return;
  setStatus({ total: status.total + steps });
}

/** Updates the descriptive text/phase for the work currently running. */
export function bootProgress(patch: Partial<Pick<BootStatus, 'phase' | 'label' | 'detail'>>): void {
  setStatus(patch);
}

/** Marks one unit of work as finished. */
export function bootStep(): void {
  setStatus({ completed: Math.min(status.completed + 1, status.total || status.completed + 1) });
}

/** Marks startup as finished. */
export function bootFinish(): void {
  setStatus({ active: false, phase: 'ready', completed: status.total, detail: null });
}

export function subscribeBoot(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getBootSnapshot(): BootStatus {
  return status;
}
