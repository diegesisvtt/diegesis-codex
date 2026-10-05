// Sync provider registry: UI metadata (settings form fields) + factory.
import type { ProviderInfo } from '../../../shared/types';
import type { SyncProvider, SyncProviderKind } from '../types';
import { SyncError } from '../types';
import { createLocalProvider } from './local';
import { createWebdavProvider } from './webdav';
import { createOneDriveProvider, type OneDriveTokens } from './onedrive';
import { createS3Provider } from './s3';

export const SYNC_PROVIDER_INFOS: ProviderInfo[] = [
  {
    id: 'local',
    name: 'Pasta local',
    description:
      'Sincroniza para uma pasta deste computador. Se for uma pasta já espelhada por OneDrive, Dropbox, Google Drive ou Syncthing, a nuvem vem de graça — sem login nenhum.',
    fields: [{ key: 'path', label: 'Pasta de sincronização', type: 'text', required: true, placeholder: 'C:\\Users\\você\\OneDrive\\DiegesisSync' }],
  },
  {
    id: 'webdav',
    name: 'Nextcloud / WebDAV',
    description:
      'Nextcloud, ownCloud ou qualquer servidor WebDAV. No Nextcloud, gere uma senha de aplicativo em Configurações → Segurança.',
    fields: [
      { key: 'url', label: 'URL WebDAV', type: 'text', required: true, placeholder: 'https://nuvem.exemplo.com/remote.php/dav/files/usuario' },
      { key: 'username', label: 'Usuário', type: 'text', required: true },
      { key: 'password', label: 'Senha / app-password', type: 'password', required: true, secret: true },
      { key: 'basePath', label: 'Subpasta (opcional)', type: 'text', placeholder: 'DiegesisSync' },
    ],
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description:
      'Conexão nativa com sua conta Microsoft (OAuth). Requer um aplicativo público registrado no Azure (portal.azure.com → App registrations → redirect URI "http://localhost"). Os arquivos ficam na pasta "DiegesisSync" do seu OneDrive.',
    fields: [
      { key: 'clientId', label: 'Client ID (App registration)', type: 'text', required: true, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { key: 'accessToken', label: '', type: 'password', secret: true },
      { key: 'refreshToken', label: '', type: 'password', secret: true },
      { key: 'expiresAt', label: '', type: 'text', secret: true },
    ],
  },
  {
    id: 's3',
    name: 'S3 compatível',
    description: 'Amazon S3, Backblaze B2, Cloudflare R2, MinIO ou qualquer storage com API S3.',
    fields: [
      { key: 'endpoint', label: 'Endpoint', type: 'text', required: true, placeholder: 'https://s3.us-east-1.amazonaws.com' },
      { key: 'region', label: 'Região', type: 'text', required: true, placeholder: 'us-east-1' },
      { key: 'bucket', label: 'Bucket', type: 'text', required: true },
      { key: 'accessKey', label: 'Access key', type: 'text', required: true },
      { key: 'secretKey', label: 'Secret key', type: 'password', required: true, secret: true },
    ],
  },
];

/** Config keys that are encrypted at rest / masked to the renderer. */
export function syncSecretKeys(providerId: string): Set<string> {
  const info = SYNC_PROVIDER_INFOS.find((p) => p.id === providerId);
  return new Set(info?.fields.filter((f) => f.secret).map((f) => f.key) ?? []);
}

export interface ProviderHooks {
  /** OneDrive rotates refresh tokens; the engine persists replacements. */
  onTokensChanged?: (tokens: OneDriveTokens) => void;
}

export function createSyncProvider(providerId: SyncProviderKind, cfg: Record<string, string>, hooks: ProviderHooks = {}): SyncProvider {
  switch (providerId) {
    case 'local':
      return createLocalProvider({ path: cfg.path });
    case 'webdav':
      return createWebdavProvider({ url: cfg.url, username: cfg.username, password: cfg.password, basePath: cfg.basePath });
    case 'onedrive':
      return createOneDriveProvider(
        {
          clientId: cfg.clientId || undefined,
          accessToken: cfg.accessToken,
          refreshToken: cfg.refreshToken,
          expiresAt: Number(cfg.expiresAt ?? 0),
        },
        hooks.onTokensChanged
      );
    case 's3':
      return createS3Provider({ endpoint: cfg.endpoint, region: cfg.region, bucket: cfg.bucket, accessKey: cfg.accessKey, secretKey: cfg.secretKey });
    default:
      throw new SyncError(`Provider de sincronização desconhecido: ${providerId}`, 'unknown');
  }
}
