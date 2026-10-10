// Engine behavior tests against in-memory fakes (no network, no Electron, no
// filesystem). Run from the repo root with `bun test electron/sync/engine.test.ts`.
import { describe, expect, test } from 'bun:test';
import type { DocNode } from '../../shared/types';
import { createSyncEngine, type EngineLocalAdapter } from './engine';
import type { RemoteEntry, SyncProvider } from './types';
import {
  decodeManifest,
  docToPayload,
  encodeDoc,
  encodeManifest,
  hashPayload,
  remotePaths,
  type SyncedDocPayload,
} from './snapshot';
import type { SyncPrefs } from './state';

const REALM = 'realm1';

function makeProvider(): SyncProvider & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    kind: 'local',
    async test() {},
    async list(prefix) {
      const out: RemoteEntry[] = [];
      for (const [path, data] of files) {
        if (path.startsWith(prefix)) out.push({ path, size: data.byteLength });
      }
      return out;
    },
    async get(path) {
      const data = files.get(path);
      if (!data) throw new Error(`404 ${path}`);
      return data;
    },
    async put(path, data) {
      files.set(path, data);
    },
    async delete(path) {
      files.delete(path);
    },
  };
}

function makeLocal(initialDocs: DocNode[] = []) {
  const docs = new Map(initialDocs.map((d) => [d.id, d]));
  const pdfPages = new Map<string, { page: number; text: string }[]>();
  const state = new Map<string, Map<string, string>>();
  const tombstones = new Map<string, Map<string, number>>();
  const assets = new Map<string, Uint8Array>();
  const assetRefs = new Map<string, Set<string>>();
  const assetStates = new Map<string, Map<string, string>>();
  const conflicts: { realmId: string; docId: string }[] = [];
  const retries = new Map<string, { attempts: number; lastError: string; nextRetryAt: number; gaveUp: boolean }>();
  const prefs: SyncPrefs = { enabled: true, realmIds: [REALM], intervalMin: 5, retentionDays: 30, deviceId: 'dev-test' };

  const realmState = (r: string) => state.get(r) ?? (state.set(r, new Map()), state.get(r)!);
  const realmTombs = (r: string) => tombstones.get(r) ?? (tombstones.set(r, new Map()), tombstones.get(r)!);
  const realmAssets = (r: string) => assetRefs.get(r) ?? (assetRefs.set(r, new Set()), assetRefs.get(r)!);
  const realmAssetStates = (r: string) => assetStates.get(r) ?? (assetStates.set(r, new Map()), assetStates.get(r)!);

  const adapter: EngineLocalAdapter & { docs: Map<string, DocNode>; conflicts: { realmId: string; docId: string }[] } = {
    docs,
    conflicts,
    listSyncRealmIds: () => prefs.realmIds,
    realmExists: () => true,
    realmName: () => 'Teste',
    createRealmWithId: () => {},
    listDocs: (realmId) => [...docs.values()].filter((d) => d.realmId === realmId),
    getDoc: (id) => docs.get(id) ?? null,
    docPdfPages: (id) => pdfPages.get(id) ?? [],
    applyRemoteDoc: (p) => {
      docs.set(p.id, { ...payloadToDoc(p), realmId: p.realmId });
      if (p.pdfPages) pdfPages.set(p.id, p.pdfPages);
    },
    deleteLocalDoc: (id) => {
      docs.delete(id);
    },
    duplicateDoc: (id, suffix) => {
      const d = docs.get(id);
      if (d) docs.set(`${id}-copy`, { ...d, id: `${id}-copy`, title: `${d.title}${suffix}` });
    },
    getState: (r) => realmState(r),
    setState: (r, id, hash) => realmState(r).set(id, hash),
    clearState: (r, id) => realmState(r).delete(id),
    listTombstones: (r) => realmTombs(r),
    addTombstone: (r, id) => realmTombs(r).set(id, 99),
    clearTombstone: (r, id) => realmTombs(r).delete(id),
    addConflict: (realmId, docId) => conflicts.push({ realmId, docId }),
    getAssetStates: (r) => realmAssetStates(r),
    setAssetState: (r, k, h) => realmAssetStates(r).set(k, h),
    clearAssetState: (r, k) => realmAssetStates(r).delete(k),
    listAssetRefs: (r) => [...realmAssets(r)],
    readAsset: (k) => assets.get(k) ?? null,
    writeAsset: (k, d) => assets.set(k, d),
    getRetry: (realmId, itemKey) => retries.get(`${realmId}:${itemKey}`) ?? null,
    recordRetryFailure: (realmId, _kind, itemKey, error) => {
      const key = `${realmId}:${itemKey}`;
      const prev = retries.get(key);
      const attempts = (prev?.attempts ?? 0) + 1;
      const gaveUp = attempts >= 3;
      const state = { attempts, lastError: error, nextRetryAt: gaveUp ? 0 : Date.now() + 60_000, gaveUp };
      retries.set(key, state);
      return state;
    },
    clearRetry: (realmId, itemKey) => {
      retries.delete(`${realmId}:${itemKey}`);
    },
    prefs: () => prefs,
  };
  return { adapter, docs, prefs, assets, realmAssets, conflicts, retries };
}

function makeDoc(id: string, title: string, updatedAt: number, content = '{}'): DocNode {
  return { id, realmId: REALM, parentId: null, type: 'core/note', title, icon: null, cover: null, content, position: 0, updatedAt };
}

function payloadToDoc(p: SyncedDocPayload): DocNode {
  return {
    id: p.id,
    realmId: p.realmId,
    parentId: p.parentId,
    type: p.type as DocNode['type'],
    title: p.title,
    icon: p.icon,
    cover: p.cover,
    content: p.content,
    position: p.position,
    updatedAt: p.updatedAt,
  };
}

/** Simulates another device committing a doc + manifest to the remote. */
async function remoteCommit(provider: SyncProvider, doc: DocNode, extraManifestHashes: Record<string, string> = {}) {
  await provider.put(remotePaths.doc(REALM, doc.id), encodeDoc(doc));
  const hash = hashPayload(docToPayload(doc));
  const docs = { [doc.id]: { hash, updatedAt: doc.updatedAt }, ...Object.fromEntries(Object.entries(extraManifestHashes).map(([id, h]) => [id, { hash: h, updatedAt: 0 }])) };
  await provider.put(
    remotePaths.manifest(REALM),
    encodeManifest({
      format: 'diegesis-sync-manifest',
      version: 1,
      realmId: REALM,
      realmName: 'Teste',
      updatedAt: doc.updatedAt,
      deviceId: 'other-device',
      docs,
      assets: {},
    })
  );
}

function engineFor(local: ReturnType<typeof makeLocal>, provider: SyncProvider) {
  return createSyncEngine({ local: local.adapter, getProvider: () => provider, sleep: async () => {} });
}

describe('sync engine', () => {
  test('pushing a new local doc uploads it and records state', async () => {
    const local = makeLocal([makeDoc('a', 'Nota A', 100)]);
    const provider = makeProvider();
    const engine = engineFor(local, provider);

    await engine.syncNow(REALM);

    expect(provider.files.has(remotePaths.doc(REALM, 'a'))).toBe(true);
    const manifest = decodeManifest(provider.files.get(remotePaths.manifest(REALM))!);
    expect(manifest?.docs.a.hash).toBe(hashPayload(docToPayload(makeDoc('a', 'Nota A', 100))));
    expect(local.adapter.getState(REALM).get('a')).toBeTruthy();
  });

  test('a remote-only change is pulled into the local store', async () => {
    const local = makeLocal([makeDoc('a', 'Nota A', 100)]);
    const provider = makeProvider();
    const engine = engineFor(local, provider);
    await engine.syncNow(REALM); // baseline

    // another device edits the doc and bumps updatedAt
    const edited = makeDoc('a', 'Nota A (remota)', 200, '{"edited":true}');
    await remoteCommit(provider, edited);

    await engine.syncNow(REALM);
    expect(local.docs.get('a')?.title).toBe('Nota A (remota)');
  });

  test('simultaneous edits resolve by last-writer-wins and queue a conflict', async () => {
    const local = makeLocal([makeDoc('a', 'Nota A', 100)]);
    const provider = makeProvider();
    const engine = engineFor(local, provider);
    await engine.syncNow(REALM); // baseline

    // local edit is newer than the remote edit
    local.docs.set('a', makeDoc('a', 'Nota local', 300));
    await remoteCommit(provider, makeDoc('a', 'Nota remota', 200));

    await engine.syncNow(REALM);

    expect(local.docs.get('a')?.title).toBe('Nota local'); // local wins
    expect(local.conflicts.length).toBe(1);
    // remote now carries the winning version
    const manifest = decodeManifest(provider.files.get(remotePaths.manifest(REALM))!);
    expect(manifest?.docs.a.hash).toBe(hashPayload(docToPayload(makeDoc('a', 'Nota local', 300))));
  });

  test('a local deletion propagates as a remote tombstone', async () => {
    const local = makeLocal([makeDoc('a', 'Nota A', 100)]);
    const provider = makeProvider();
    const engine = engineFor(local, provider);
    await engine.syncNow(REALM);

    local.docs.delete('a');
    local.adapter.addTombstone(REALM, 'a');

    await engine.syncNow(REALM);

    expect(provider.files.has(remotePaths.doc(REALM, 'a'))).toBe(false);
    const manifest = decodeManifest(provider.files.get(remotePaths.manifest(REALM))!);
    expect(manifest?.docs.a.deleted).toBe(true);
    expect(local.adapter.listTombstones(REALM).has('a')).toBe(false);
  });

  test('a remote tombstone deletes the local doc', async () => {
    const local = makeLocal([makeDoc('a', 'Nota A', 100)]);
    const provider = makeProvider();
    const engine = engineFor(local, provider);
    await engine.syncNow(REALM);

    await provider.put(
      remotePaths.manifest(REALM),
      encodeManifest({
        format: 'diegesis-sync-manifest',
        version: 1,
        realmId: REALM,
        realmName: 'Teste',
        updatedAt: 500,
        deviceId: 'other-device',
        docs: { a: { hash: local.adapter.getState(REALM).get('a')!, updatedAt: 500, deleted: true } },
        assets: {},
      })
    );

    await engine.syncNow(REALM);
    expect(local.docs.has('a')).toBe(false);
  });

  test('a corrupted remote doc is skipped without crashing the cycle', async () => {
    const local = makeLocal([makeDoc('a', 'Nota A', 100)]);
    const provider = makeProvider();
    const engine = engineFor(local, provider);
    await engine.syncNow(REALM);

    // remote claims a new doc but the payload is garbage
    await provider.put(remotePaths.doc(REALM, 'b'), new TextEncoder().encode('not json'));
    const manifest = decodeManifest(provider.files.get(remotePaths.manifest(REALM))!)!;
    manifest.docs.b = { hash: 'deadbeef', updatedAt: 999 };
    await provider.put(remotePaths.manifest(REALM), encodeManifest(manifest));

    await engine.syncNow(REALM);
    expect(local.docs.has('b')).toBe(false);
    expect(engine.getStatus().state).toBe('idle');
    // the corrupt item is counted as skipped and queued for retry
    expect(engine.getStatus().skipped).toBe(1);
    expect(local.retries.get(`${REALM}:doc:b`)?.attempts).toBe(1);
  });

  test('a failed item is backed off and not retried immediately', async () => {
    const local = makeLocal([makeDoc('a', 'Nota A', 100)]);
    const provider = makeProvider();
    const engine = engineFor(local, provider);
    await engine.syncNow(REALM);

    await provider.put(remotePaths.doc(REALM, 'b'), new TextEncoder().encode('not json'));
    const manifest = decodeManifest(provider.files.get(remotePaths.manifest(REALM))!)!;
    manifest.docs.b = { hash: 'deadbeef', updatedAt: 999 };
    await provider.put(remotePaths.manifest(REALM), encodeManifest(manifest));

    await engine.syncNow(REALM);
    expect(local.retries.get(`${REALM}:doc:b`)?.attempts).toBe(1);
    // second cycle within the backoff window must not re-attempt the item
    await engine.syncNow(REALM);
    expect(local.retries.get(`${REALM}:doc:b`)?.attempts).toBe(1);
    expect(engine.getStatus().skipped).toBe(1);
  });

  test('a permanently-failed item is skipped without re-fetching', async () => {
    const local = makeLocal([makeDoc('a', 'Nota A', 100)]);
    const provider = makeProvider();
    const engine = engineFor(local, provider);
    await engine.syncNow(REALM);

    await provider.put(remotePaths.doc(REALM, 'b'), new TextEncoder().encode('not json'));
    const manifest = decodeManifest(provider.files.get(remotePaths.manifest(REALM))!)!;
    manifest.docs.b = { hash: 'deadbeef', updatedAt: 999 };
    await provider.put(remotePaths.manifest(REALM), encodeManifest(manifest));

    await engine.syncNow(REALM); // fails once → attempts=1
    // simulate the item having given up after 3 consecutive failures
    local.retries.set(`${REALM}:doc:b`, { attempts: 3, lastError: 'corrupt', nextRetryAt: 0, gaveUp: true });

    await engine.syncNow(REALM); // gave-up item is skipped, not re-fetched
    expect(local.retries.get(`${REALM}:doc:b`)?.attempts).toBe(3);
    expect(local.docs.has('b')).toBe(false);
    expect(engine.getStatus().skipped).toBe(1);
  });
});
