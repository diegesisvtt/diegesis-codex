// Dados 3D — mesa virtual com física real (@diegesis/dice: three.js +
// cannon-es em Web Worker). A rolagem lógica é do dice-core; o DiceBox anima
// os resultados e, ao assentarem ('roll:finish'), a rolagem alimenta o
// histórico global ('roller:rolled', mesmo evento das tabelas interativas).
import { Box } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { DiceBoxPanel, dice3dBridge } from '../../components/dice3d/DiceBoxPanel';

export const dice3dPlugin: Plugin = {
  manifest: {
    id: 'diegesis/dice3d',
    name: 'Dados 3D',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Mesa de dados 3D com física real (three.js + cannon-es), integrada ao histórico de rolagens.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'events', 'settings'],
  },
  activate(ctx) {
    dice3dBridge.settings = ctx.settings;
    ctx.register({
      dispose: () => {
        dice3dBridge.settings = null;
      },
    });

    ctx.views.add({
      id: 'dice3d:box',
      title: 'Dados 3D',
      location: 'workspace-tab',
      component: DiceBoxPanel,
    });

    ctx.commands.add({
      id: 'diegesis/dice3d:open',
      title: 'Abrir mesa de dados 3D',
      run: () => ctx.app.openView('dice3d:box'),
    });

    ctx.views.addRibbonItem({
      id: 'diegesis/dice3d:ribbon',
      title: 'Dados 3D',
      icon: Box,
      command: 'diegesis/dice3d:open',
      order: 21,
    });
  },
};
