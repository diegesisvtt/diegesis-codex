// Background embedding pipeline. Consumes ai_jobs, chunks documents, embeds new
// chunks in batches with the local model, and keeps sqlite-vec in sync.

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as db from '../db';
import { EMBED_DIM, embedPassages, modelStatus } from './local-embedder';
import type { AIIndexStatus } from '../../shared/types';

const CHUNK_TARGET = 1800; // ~450 tokens
const CHUNK_OVERLAP = 200;
const EMBED_BATCH = 32;
const POLL_MS = 2000;

export const indexEvents = new EventEmitter(); // emits 'status' with AIIndexStatus

let timer: ReturnType<typeof setInterval> | null = null;
let processing = false;
let lastError: string | null = null;

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

/** Splits plain text into overlapping chunks, preferring paragraph boundaries. */
export function chunkText(text: string): { seq: number; text: string; hash: string }[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: { seq: number; text: string; hash: string }[] = [];
  let start = 0;
  let seq = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_TARGET, clean.length);
    if (end < clean.length) {
      // back off to a sentence/paragraph boundary so chunks don't cut mid-sentence
      const slice = clean.slice(start, end);
      const boundary = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '), slice.lastIndexOf('\n'));
      if (boundary > CHUNK_TARGET * 0.5) end = start + boundary + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push({ seq: seq++, text: piece, hash: hash(piece) });
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

async function processJob(job: { id: string; doc_id: string }): Promise<void> {
  const doc = db.getDocForChunking(job.doc_id);
  if (!doc) {
    // document was deleted while the job was queued
    db.completeJob(job.id);
    return;
  }
  const chunks = chunkText(`${doc.title}\n\n${doc.text}`);
  db.syncDocChunks(doc.id, doc.realmId, chunks);

  // embed any chunk that still lacks a vector (bounded batches)
  for (;;) {
    const pending = db.getUnembeddedChunks(EMBED_BATCH);
    if (pending.length === 0) break;
    const vectors = await embedPassages(pending.map((c) => c.text));
    if (vectors.length !== pending.length) {
      throw new Error(`Modelo retornou ${vectors.length} embeddings para ${pending.length} chunks.`);
    }
    db.ensureEmbedDim(EMBED_DIM);
    for (let i = 0; i < pending.length; i++) {
      if (vectors[i].length !== EMBED_DIM) {
        throw new Error(`Dimensão do embedding (${vectors[i].length}) difere da esperada (${EMBED_DIM}).`);
      }
      const c = pending[i];
      db.insertVecEmbedding(c.id, c.doc_id, c.realm_id, Float32Array.from(vectors[i]));
    }
  }
  db.completeJob(job.id);
}

async function processAllPending(): Promise<void> {
  for (;;) {
    const job = db.claimPendingJob();
    if (!job) return;
    try {
      await processJob(job);
      lastError = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
      console.error('[embedder] job failed:', message);
      db.failJob(job.id, message);
      // stop draining on failure (e.g. model download failed) so queries don't hang
      return;
    }
  }
}

async function tick(): Promise<void> {
  if (processing) return;
  const job = db.claimPendingJob();
  if (!job) return;

  processing = true;
  try {
    await processJob(job);
    lastError = null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastError = message;
    console.error('[embedder] job failed:', message);
    db.failJob(job.id, message);
    // back off on failure so we don't hammer a broken model/download
    await new Promise((r) => setTimeout(r, 5000));
  } finally {
    processing = false;
    emitStatus();
  }
}

/**
 * Drains the embedding queue before a query runs, so freshly edited notes are
 * searchable immediately. Waits for any in-flight background job first.
 */
export async function flush(): Promise<void> {
  while (processing) await new Promise((r) => setTimeout(r, 100));
  processing = true;
  try {
    await processAllPending();
  } finally {
    processing = false;
    emitStatus();
  }
}

export function currentStatus(): AIIndexStatus {
  const model = modelStatus();
  const stats = db.chunkStats();
  return {
    modelState: model.state,
    modelProgress: model.progress,
    pendingJobs: db.pendingJobCount(),
    processing,
    chunkCount: stats.chunkCount,
    embeddedCount: stats.embeddedCount,
    lastError: lastError ?? model.error,
  };
}

export function emitStatus(): void {
  indexEvents.emit('status', currentStatus());
}

/** Starts the polling loop. Call once from main after db.initDb(). */
export function startEmbedder(): void {
  // Local model has a fixed dimension; if it differs from the stored one (e.g.
  // a previous remote-embedding config), wipe and rebuild the vector index.
  if (db.getEmbedDim() !== EMBED_DIM) {
    db.setEmbedDim(EMBED_DIM);
    console.log(`[embedder] vector index reset for local model (${EMBED_DIM} dims)`);
  }
  if (timer) return;
  timer = setInterval(() => void tick(), POLL_MS);
  void tick();
}

export function rebuildIndex(): void {
  db.enqueueAllDocs();
  emitStatus();
  void tick();
}
