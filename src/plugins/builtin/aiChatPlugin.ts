import { Sparkles } from 'lucide-react';
import { AIChatPanel } from '../../components/AIChatPanel';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { AiSettingsPage } from './ai/AiSettingsPage';

/** AI assistant: right-panel view, toggle command, ribbon button and its own
 *  settings page (providers + semantic index). */
export const aiChatPlugin: Plugin = {
  manifest: {
    id: 'core/ai-chat',
    name: 'Assistente IA',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Chat com IA contextualizado pelos documentos do universo.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'commands', 'ai', 'settings'],
  },
  activate(ctx) {
    ctx.settingsPages.add({
      id: 'core/ai-chat:settings',
      title: 'IA',
      icon: Sparkles,
      order: 20,
      component: AiSettingsPage,
    });

    ctx.views.add({
      id: 'ai-chat',
      title: 'Assistente IA',
      location: 'right-panel',
      component: AIChatPanel,
      icon: Sparkles,
      order: 1,
    });

    ctx.commands.add({
      id: 'core/ai-chat:toggle',
      title: 'Alternar assistente IA',
      run: () => ctx.app.setAiChatOpen(!ctx.app.aiChatOpen),
    });

  },
};
