import type { Plugin } from '../api/types';
import { explorerPlugin } from './explorerPlugin';
import { highlightsPlugin } from './highlightsPlugin';
import { settingsPlugin } from './settingsPlugin';
import { searchPlugin } from './searchPlugin';
import { aiChatPlugin } from './aiChatPlugin';
import { commandPalettePlugin } from './commandPalettePlugin';

/**
 * Built-in plugins, compiled with the app. They use exactly the same Plugin API
 * that external/community plugins use through the sandboxed loader.
 */
export const builtinPlugins: Plugin[] = [
  explorerPlugin,
  highlightsPlugin,
  settingsPlugin,
  searchPlugin,
  aiChatPlugin,
  commandPalettePlugin,
];
