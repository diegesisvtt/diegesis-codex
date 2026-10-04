import type { Plugin } from '../api/types';
import { explorerPlugin } from './explorerPlugin';
import { highlightsPlugin } from './highlightsPlugin';
import { settingsPlugin } from './settingsPlugin';
import { searchPlugin } from './searchPlugin';
import { aiChatPlugin } from './aiChatPlugin';
import { audioPlugin } from './audioPlugin';
import { commandPalettePlugin } from './commandPalettePlugin';
import { hexcrawlPlugin } from './hexcrawlPlugin';
import { timelinePlugin } from './timelinePlugin';
import { tablePlugin } from './tablePlugin';
import { rollerPlugin } from './rollerPlugin';
import { dice3dPlugin } from './dice3dPlugin';
import { sheetPlugin } from './sheetPlugin';
import { secondWindowPlugin } from './secondWindowPlugin';

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
  audioPlugin,
  commandPalettePlugin,
  hexcrawlPlugin,
  timelinePlugin,
  tablePlugin,
  rollerPlugin,
  dice3dPlugin,
  sheetPlugin,
  secondWindowPlugin,
];
