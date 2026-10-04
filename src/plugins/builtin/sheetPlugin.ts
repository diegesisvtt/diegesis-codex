// Ficha de Personagem — documento próprio ('diegesis/sheet') movido pelo
// SheetEngine do @diegesis/sheet: base mínima + pipeline de efeitos (coletar,
// filtrar, ordenar, aplicar, derivar, auditar). Statblocks de PDF podem ser
// importados como ficha (botão no popover de seleção do PdfReader).
import { UserSquare } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { SheetEditor } from '../../components/editors/sheet/SheetEditor';
import { createDefaultSheet, serializeSheet, SHEET_DOC_TYPE } from '@shared/sheet';

export const sheetPlugin: Plugin = {
  manifest: {
    id: 'diegesis/sheet',
    name: 'Ficha de Personagem',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description: 'Fichas de personagem com motor de efeitos: atributos, derived, roll templates e audit trail.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'docs:read'],
  },
  activate(ctx) {
    ctx.editors.add({ docType: SHEET_DOC_TYPE, component: SheetEditor });
    ctx.docTypes.add({
      docType: SHEET_DOC_TYPE,
      label: 'Ficha de Personagem',
      icon: UserSquare,
      iconColor: 'text-sheet',
      defaultTitle: 'Nova Ficha',
      defaultContent: () => serializeSheet(createDefaultSheet()),
    });
  },
};
