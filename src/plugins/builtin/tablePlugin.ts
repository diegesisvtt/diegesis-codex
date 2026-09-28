import { Table } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import { TableEditor } from '../../components/editors/table/TableEditor';
import { createDefaultTable, serializeTable } from '@shared/table';

/**
 * Tabela Interativa — documento próprio ('diegesis/table') estilo Foundry
 * RollTable: linhas com peso, fórmula de dado opcional (faixas derivadas dos
 * pesos), link de resultados para outros documentos, colar de planilha e
 * rolagem simples. Pode ser embutida em notas via bloco "Tabela interativa".
 */
export const tablePlugin: Plugin = {
  manifest: {
    id: 'diegesis/table',
    name: 'Tabela Interativa',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description:
      'Tabelas roláveis estilo Foundry: linhas com peso, fórmula de dado, links para documentos, importação por colagem e rolagem simples.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'docs:read'],
  },
  activate(ctx) {
    ctx.editors.add({ docType: 'diegesis/table', component: TableEditor });
    ctx.docTypes.add({
      docType: 'diegesis/table',
      label: 'Tabela Interativa',
      icon: Table,
      iconColor: 'text-table',
      defaultTitle: 'Nova Tabela',
      defaultContent: () => serializeTable(createDefaultTable()),
    });
  },
};
