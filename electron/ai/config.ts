// AI chat provider configuration persistence.
// Secret fields (apiKey) are encrypted with Electron safeStorage.
// (Embeddings are always local — see local-embedder.ts — so there's no embed config.)

import { safeStorage } from 'electron';
import { getDb } from '../db';
import { getProvider } from './providers/registry';
import { SECRET_MASK, type AIProviderConfig, type AISettings } from '../../shared/types';

const CHAT_KEY = 'ai_chat_provider';
const ENC_PREFIX = 'enc:';

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) return ENC_PREFIX + safeStorage.encryptString(value).toString('base64');
  return value; // no system keyring available (some Linux setups) — stored as-is
}

function decrypt(value: string): string {
  if (value.startsWith(ENC_PREFIX) && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'));
    } catch {
      return '';
    }
  }
  return value;
}

function readRaw(): AIProviderConfig | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(CHAT_KEY) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as AIProviderConfig;
  } catch {
    return null;
  }
}

function writeRaw(cfg: AIProviderConfig | null): void {
  if (cfg === null) {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(CHAT_KEY);
    return;
  }
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(CHAT_KEY, JSON.stringify(cfg));
}

/** Masks secret fields before sending config to the renderer. */
function mask(cfg: AIProviderConfig): AIProviderConfig {
  const provider = getProvider(cfg.providerId);
  const secretKeys = new Set(provider?.info.fields.filter((f) => f.secret).map((f) => f.key) ?? []);
  const config = { ...cfg.config };
  for (const k of Object.keys(config)) {
    if (secretKeys.has(k)) config[k] = config[k] ? SECRET_MASK : '';
  }
  return { ...cfg, config };
}

export function getAISettings(): AISettings {
  const chat = readRaw();
  return { chat: chat && getProvider(chat.providerId) ? mask(chat) : null };
}

export function setChatProvider(cfg: AIProviderConfig | null): void {
  if (cfg === null) {
    writeRaw(null);
    return;
  }
  const prev = readRaw();
  const provider = getProvider(cfg.providerId);
  const secretKeys = new Set(provider?.info.fields.filter((f) => f.secret).map((f) => f.key) ?? []);
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.config)) {
    if (secretKeys.has(k)) {
      if (v === SECRET_MASK) {
        // keep the stored secret only when editing the same provider; the mask
        // must never be encrypted/persisted as if it were a real key
        config[k] = prev && prev.providerId === cfg.providerId ? prev.config[k] : '';
      } else {
        config[k] = v ? encrypt(v) : '';
      }
    } else {
      config[k] = v;
    }
  }
  writeRaw({ providerId: cfg.providerId, config });
}

/** Returns the stored chat config with secrets decrypted (main-process use only). */
export function getResolvedChatConfig(): AIProviderConfig | null {
  const raw = readRaw();
  if (!raw || !getProvider(raw.providerId)) return null;
  const provider = getProvider(raw.providerId)!;
  const secretKeys = new Set(provider.info.fields.filter((f) => f.secret).map((f) => f.key));
  const config = { ...raw.config };
  for (const k of Object.keys(config)) {
    if (secretKeys.has(k) && config[k]) config[k] = decrypt(config[k]);
  }
  return { ...raw, config };
}

/**
 * Replaces SECRET_MASK placeholders in an incoming config with the stored secret,
 * so "test connection" works without retyping the API key.
 */
export function resolveMaskedSecrets(providerId: string, incoming: Record<string, string>): Record<string, string> {
  const provider = getProvider(providerId);
  const secretKeys = new Set(provider?.info.fields.filter((f) => f.secret).map((f) => f.key) ?? []);
  const stored = readRaw();
  const out = { ...incoming };
  for (const key of secretKeys) {
    if (out[key] !== SECRET_MASK) continue;
    out[key] = stored && stored.providerId === providerId && stored.config[key] ? decrypt(stored.config[key]) : '';
  }
  return out;
}
