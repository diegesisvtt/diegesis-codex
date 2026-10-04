# Cloud Sync — Design

Data: 2026-10-04
Status: aprovado (fase 1)

## Objetivo

Plugin de sincronização estilo Obsidian Sync para o Diegesis Codex: sync automático em
background, sem fricção, com Nextcloud/WebDAV, pasta local espelhada (cobre clientes de
desktop de OneDrive/Dropbox/Drive), OneDrive nativo (Graph API) e S3 compatível.

- **Fase 1 (este design):** sync por documento com push automático, restore, histórico de
  versões, conflitos resolvidos com cópia preservada (last-writer-wins + fila de conflitos).
- **Fase 2 (futuro):** pull contínuo e merge bidirecional multi-dispositivo. A interface
  `SyncProvider` e o protocolo de estado já nascem prontos para isso.

Princípio central: **nunca perder dado**. Toda sobrescrita passa antes pelo histórico de
versões; todo conflito ambíguo vira cópia, não descarte.

## Arquitetura

```
Renderer (React)
  diegesis/sync (plugin builtin) — UI: seção no Settings, painel de status
  (right-panel), ribbon com estado, comandos, menu de histórico no Explorer
      │ IPC `sync:*` (padrão `ai:*`)
Main process (Node)
  electron/sync/engine.ts     — agenda, detecção de mudanças, push/pull, conflitos, retry
  electron/sync/state.ts      — tabelas sync_* no SQLite (cursor, tombstones, conflitos)
  electron/sync/snapshot.ts   — serialização de docs/assets (reusa realmTransfer)
  electron/sync/providers/    — webdav.ts · localFolder.ts · onedrive.ts · s3.ts
  electron/sync/secrets.ts    — safeStorage (padrão electron/ai/config.ts)
      │ HTTPS / fs
Remote layout (idêntico em todos os provedores)
  /diegesis-sync/<realmId>/
    docs/<docId>.json            — envelope: conteúdo + meta + sha256
    assets/<fileName>            — binários (nomes já são IDs únicos)
    versions/<docId>/<ts>.json   — histórico de versões
    manifest.json                — índice + tombstones (ponto de consistência)
```

Decisões:

- **Tudo no main process** — renderer/sandbox não têm acesso a DB/fs; segue o padrão de
  `electron/ai/*`.
- **Granularidade = documento** — cada doc vira um JSON autocontido no remoto; assets
  trafegam pelos nomes únicos existentes (merge-friendly por construção).
- **Estado de sync no próprio SQLite** — tabelas novas via `CREATE TABLE IF NOT EXISTS`,
  sem tocar no schema atual.
- **Layout remoto único** — os 4 provedores implementam os mesmos verbos.

## SyncProvider

```ts
interface SyncProvider {
  readonly kind: 'webdav' | 'local' | 'onedrive' | 's3';
  test(): Promise<void>;
  list(prefix: string): Promise<RemoteEntry[]>; // {path, size, etag?, mtime}
  get(path: string): Promise<Uint8Array>;
  put(path: string, data: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  ensureDir?(path: string): Promise<void>; // no-op no S3/Graph
}
```

- **WebDAV**: PROPFIND/GET/PUT/DELETE/MKCOL com Basic Auth (app-password). Cobre Nextcloud,
  ownCloud e WebDAV genérico. `fetch` nativo do Node (sem CORS).
- **Local**: `node:fs` numa pasta escolhida (ex.: pasta já espelhada pelo cliente OneDrive).
  Zero auth, funciona offline.
- **OneDrive**: Graph API `/me/drive/special/approot:` com OAuth PKCE (navegador do
  sistema via `shell.openExternal` + callback loopback). Tokens no safeStorage, refresh
  automático.
- **S3**: SigV4 assinado com `crypto` do Node, sem dependência nova. Cobre AWS/B2/R2.

## Estado local (novas tabelas)

```sql
sync_state(realm_id, doc_id, base_hash, remote_etag, synced_at);
sync_tombstones(realm_id, doc_id, deleted_at);
sync_conflicts(id, doc_id, local_json, remote_json, detected_at);
sync_asset(file_name, hash, synced_at);
```

Hooks nos pontos centrais de create/update/delete de documentos em `electron/db.ts`
(fase 1 pode usar polling de `updated_at`); delete grava tombstone. Assets comparados
por hash.

## Ciclo de sync

Trigger: debounce de 3s após edição + varredura a cada 5 min (configurável).

1. **Scan** — hash atual vs `sync_state` → dirty set (docs novos/alterados + tombstones).
2. **Pull** — fase 1: apenas no restore explícito; fase 2: contínuo via `manifest.json`.
3. **Conflito** (sujo local E remoto desde o `base_hash`) — last-writer-wins por
   `updated_at`; perdedor vai para `sync_conflicts` + banner na UI. Nunca perde dado.
4. **Push** — `put` de docs alterados, assets novos, tombstones; versão anterior copiada
   para `versions/<docId>/<ts>.json` antes de sobrescrever (retenção padrão: 30 dias).
5. **Commit** — atualiza `sync_state` e `manifest.json` por último (ponto de consistência).

Resiliência: retry exponencial (1s→5min, jitter), lock de instância por realm, pausa
offline com retomada automática.

## UX

- **Setup**: Configurações → Sincronização (nova seção; dropdown de provedor no padrão
  `ProviderSection` da IA, botão "Testar conexão"). Pasta local = só o caminho. Toggle por
  realm. Segredos sempre criptografados com `safeStorage` (prefixo `enc:`).
- **Operação**: automática. Ribbon na title-bar: ✓ / ⟳ / ⚠ / ⊘. Painel de status com
  última sync, pendências, log e "Sincronizar agora". Toast só em conflito, falha de auth
  ou quota.
- **Conflitos**: painel lista docs em conflito; ações Manter local / Manter remoto /
  Manter ambos (duplica como "… (conflito)"). Perdedor sempre fica no histórico.
- **Restore / novo dispositivo**: "Restaurar da nuvem" lista realms remotos e importa
  in-place (IDs preservados quando o realm não existe localmente). Menu "Ver histórico de
  sync" no Explorer restaura versões em 1 clique.

## Tratamento de erros

| Falha | Comportamento |
|---|---|
| Offline/timeout | Fila persiste, backoff exponencial, retoma sozinho |
| Auth inválida | Pausa provedor, toast de re-autenticação, sem retry até o usuário agir |
| Etag mudou durante put | Re-lê remoto, reavalia, reagenda o doc |
| JSON remoto corrompido | sha256 no envelope + manifest; doc ignorado, histórico intacto |
| Escrita parcial remota | Put atômico: `<path>.tmp` + rename (MOVE/rename/objeto atômico) |
| Erro de DB local | Só escreve via funções centrais do `db.ts`; transação por doc com rollback |
| Quota remota | Para push, toast claro, fila preservada |
| 2 dispositivos simultâneos | `last_writer` + heartbeat no manifest; fase 1 avisa antes de push destrutivo |

## Testes

- Unitários (padrão `*.test.ts` do repo): serialização, hash, matriz de decisão de
  conflito, tombstones, signing S3.
- Provider fake em memória (`Map`) — todos os testes da engine rodam sem rede.
- Integração WebDAV: script manual contra container Nextcloud e pasta local.
- Caos (checklist): kill no meio do push, dias offline, conflito em 2 máquinas, restore em
  instalação limpa.

## Entregáveis (fase 1)

1. `electron/sync/`: engine, state, snapshot, secrets, 4 providers.
2. Canais IPC `sync:*` + preload + tipos em `shared/types.ts`.
3. Plugin builtin `diegesis/sync` (settings, painel, ribbon, comandos, histórico).
4. Tabelas `sync_*` + hooks de mudança no `db.ts`.
5. Este design + testes unitários da engine com provider fake.
