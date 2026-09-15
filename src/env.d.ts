/// <reference types="vite/client" />
import type { MythrilApi } from '@shared/types';

declare global {
  interface Window {
    mythril: MythrilApi;
  }
}

export {};
