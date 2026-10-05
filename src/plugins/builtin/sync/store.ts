// Renderer-side reactive store for sync status, shared by the status panel
// and the ribbon icon. Subscribes once to the main-process push channel.
import { useSyncExternalStore } from 'react';
import type { SyncStatus } from '@shared/types';

let status: SyncStatus | null = null;
let started = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  window.diegesis.sync.status().then((s) => {
    if (s) {
      status = s;
      notify();
    }
  });
  window.diegesis.sync.onStatus((s) => {
    status = s;
    notify();
  });
}

export function getSyncStatus(): SyncStatus | null {
  return status;
}

export function setSyncStatus(s: SyncStatus): void {
  status = s;
  notify();
}

function subscribe(fn: () => void): () => void {
  ensureStarted();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSyncStatus(): SyncStatus | null {
  return useSyncExternalStore(subscribe, getSyncStatus);
}

// ---------- version-history target (shared by the explorer menu item) ----------

export interface HistoryTarget {
  realmId: string;
  docId: string;
  title: string;
}

let historyTarget: HistoryTarget | null = null;

export function openHistory(target: HistoryTarget): void {
  historyTarget = target;
  notify();
}

export function getHistoryTarget(): HistoryTarget | null {
  return historyTarget;
}

export function clearHistory(): void {
  historyTarget = null;
  notify();
}

export function useHistoryTarget(): HistoryTarget | null {
  return useSyncExternalStore(subscribe, getHistoryTarget);
}
