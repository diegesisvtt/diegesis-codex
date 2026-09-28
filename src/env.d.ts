/// <reference types="vite/client" />
import type { DiegesisCodexApi } from '@shared/types';

declare global {
  interface Window {
    diegesis: DiegesisCodexApi;
  }
}

export {};
