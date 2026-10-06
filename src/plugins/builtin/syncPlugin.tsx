// Cloud sync plugin (diegesis/sync): status panel, settings page (Nextcloud/
// WebDAV, local folder, OneDrive, S3), commands and ribbon button. Version
// history lives in the sync settings page, not in the explorer context menu.
import { Cloud } from 'lucide-react';
import { PLUGIN_API_VERSION, type Plugin } from '../api/types';
import type { SyncState } from '@shared/types';
import { SyncSettingsPage } from './sync/SyncSettingsPage';
import { useSyncStatus } from './sync/store';

const SYNC_STATE_LABEL: Record<SyncState, string> = {
  disabled: 'Sincronização desativada',
  idle: 'Sincronizado',
  syncing: 'Sincronizando…',
  offline: 'Offline',
  error: 'Erro de sincronização',
  'auth-required': 'Reautenticação necessária',
};

/** Premium sync status indicator: cloud glyph + colored status dot + rotating
 *  arc while syncing. Color encodes state; the tooltip carries the label. */
function SyncRibbonIcon({ size = 15, className }: { size?: number | string; className?: string }) {
  const status = useSyncStatus();
  const state = status?.state ?? 'disabled';
  return (
    <span className="hd-sync" data-state={state} title={SYNC_STATE_LABEL[state]}>
      <Cloud size={size} strokeWidth={1.75} className={`hd-sync-cloud ${className ?? ''}`} />
      <span className="hd-sync-dot" aria-hidden="true" />
      {state === 'syncing' && <span className="hd-sync-arc" aria-hidden="true" />}
    </span>
  );
}

export const syncPlugin: Plugin = {
  manifest: {
    id: 'diegesis/sync',
    name: 'Sincronização',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    description:
      'Sincroniza seus universos com Nextcloud/WebDAV, OneDrive, S3 ou uma pasta local, com histórico de versões e resolução de conflitos.',
    author: 'Diegesis Codex',
    permissions: ['ui', 'commands', 'events', 'settings'],
  },
  activate(ctx) {
    // All sync information lives in this settings page — no dedicated panel.
    ctx.settingsPages.add({
      id: 'diegesis/sync:settings',
      title: 'Sincronização',
      icon: Cloud,
      order: 40,
      component: SyncSettingsPage,
    });

    ctx.commands.add({
      id: 'diegesis/sync:now',
      title: 'Sincronizar agora',
      run: () => void window.diegesis.sync.now(),
    });
    ctx.commands.add({
      id: 'diegesis/sync:settings',
      title: 'Abrir configurações de sincronização',
      run: () => ctx.app.openSettings('plugin:diegesis/sync'),
    });

    ctx.views.addRibbonItem({
      id: 'diegesis/sync:ribbon',
      icon: SyncRibbonIcon,
      command: 'diegesis/sync:settings',
      order: 25,
    });
  },
};
