import { Sparkles } from 'lucide-react';
import { AIChatPanel } from '../../components/AIChatPanel';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';

/** AI assistant: right-panel view, toggle command and ribbon button. */
export const aiChatPlugin: Plugin = {
  manifest: {
    id: 'core/ai-chat',
    name: 'Assistente IA',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Chat com IA contextualizado pelos documentos do universo.',
    author: 'Mythril',
    permissions: ['ui', 'commands', 'ai'],
  },
  activate(ctx) {
    ctx.views.add({
      id: 'ai-chat',
      title: 'Assistente IA',
      location: 'right-panel',
      component: AIChatPanel,
    });

    ctx.commands.add({
      id: 'core/ai-chat:toggle',
      title: 'Alternar assistente IA',
      run: () => ctx.app.setAiChatOpen(!ctx.app.aiChatOpen),
    });

    ctx.views.addRibbonItem({
      id: 'core/ai-chat:ribbon',
      title: 'Assistente IA',
      icon: Sparkles,
      command: 'core/ai-chat:toggle',
      label: 'IA',
      isActive: () => ctx.app.aiChatOpen,
      order: 10,
    });
  },
};
