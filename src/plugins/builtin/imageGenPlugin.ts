import { ImagePlay } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { ImageGenSettingsPage } from './ai/ImageGenSettingsPage';

/** AI image generation: settings page with backend configuration (ComfyUI,
 *  OpenAI Images, Stability). The editor block lives in the note schema and
 *  the chat tool in the assistant — this plugin owns the configuration UI. */
export const imageGenPlugin: Plugin = {
  manifest: {
    id: 'core/image-gen',
    name: 'Geração de Imagens',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Geração de imagens por IA nas notas e no assistente (ComfyUI).',
    author: 'Diegesis Codex',
    permissions: ['ui', 'settings', 'ai'],
  },
  activate(ctx) {
    ctx.settingsPages.add({
      id: 'core/image-gen:settings',
      title: 'Imagens (IA)',
      icon: ImagePlay,
      order: 21,
      component: ImageGenSettingsPage,
    });
  },
};
