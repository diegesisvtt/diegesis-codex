// Cross-module events for AI-driven document mutations.
// main.ts forwards these to renderer windows so the UI refreshes.

import { EventEmitter } from 'node:events';

export const docEvents = new EventEmitter(); // emits 'changed' (realmId: string)
