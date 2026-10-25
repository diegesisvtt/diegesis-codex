// AI chat provider configuration persistence.
// Secret fields (apiKey) are encrypted with Electron safeStorage.
// (Embeddings are always local — see local-embedder.ts — so there's no embed config.)

import { safeStorage } from 'electron';
import { getDb } from '../db';
import { getProvider } from './providers/registry';
import { getImageGenProvider } from './imagegen/registry';
import { getSearchProvider } from './websearch';
import { SECRET_MASK, type AIProviderConfig, type AISettings, type ProviderInfo } from '../../shared/types';

const CHAT_KEY = 'ai_chat_provider';
const SEARCH_KEY = 'ai_search_provider';
const IMAGEGEN_KEY = 'ai_imagegen_provider';
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

function readRaw(key: string): AIProviderConfig | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as AIProviderConfig;
  } catch {
    return null;
  }
}

function writeRaw(key: string, cfg: AIProviderConfig | null): void {
  if (cfg === null) {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
    return;
  }
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(cfg));
}

type ProviderLookup = (id: string) => ProviderInfo | undefined;

function secretKeys(lookup: ProviderLookup, providerId: string): Set<string> {
  return new Set(lookup(providerId)?.fields.filter((f) => f.secret).map((f) => f.key) ?? []);
}

/** Masks secret fields before sending config to the renderer. */
function mask(lookup: ProviderLookup, cfg: AIProviderConfig): AIProviderConfig {
  const secrets = secretKeys(lookup, cfg.providerId);
  const config = { ...cfg.config };
  for (const k of Object.keys(config)) {
    if (secrets.has(k)) config[k] = config[k] ? SECRET_MASK : '';
  }
  return { ...cfg, config };
}

function readMasked(lookup: ProviderLookup, key: string): AIProviderConfig | null {
  const raw = readRaw(key);
  return raw && lookup(raw.providerId) ? mask(lookup, raw) : null;
}

function writeConfig(lookup: ProviderLookup, key: string, cfg: AIProviderConfig | null): void {
  if (cfg === null) {
    writeRaw(key, null);
    return;
  }
  const prev = readRaw(key);
  const secrets = secretKeys(lookup, cfg.providerId);
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.config)) {
    if (secrets.has(k)) {
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
  writeRaw(key, { providerId: cfg.providerId, config });
}

/** Returns the stored config with secrets decrypted (main-process use only). */
function readResolved(lookup: ProviderLookup, key: string): AIProviderConfig | null {
  const raw = readRaw(key);
  if (!raw || !lookup(raw.providerId)) return null;
  const secrets = secretKeys(lookup, raw.providerId);
  const config = { ...raw.config };
  for (const k of Object.keys(config)) {
    if (secrets.has(k) && config[k]) config[k] = decrypt(config[k]);
  }
  return { ...raw, config };
}

export function getAISettings(): AISettings {
  return {
    chat: readMasked(getProviderInfo, CHAT_KEY),
    search: readMasked(getSearchProvider, SEARCH_KEY),
    imagegen: readMasked(getImageGenProviderInfo, IMAGEGEN_KEY),
  };
}

const getProviderInfo: ProviderLookup = (id) => getProvider(id)?.info;
const getImageGenProviderInfo: ProviderLookup = (id) => getImageGenProvider(id)?.info;

export function setChatProvider(cfg: AIProviderConfig | null): void {
  writeConfig(getProviderInfo, CHAT_KEY, cfg);
}

/** Returns the stored chat config with secrets decrypted (main-process use only). */
export function getResolvedChatConfig(): AIProviderConfig | null {
  return readResolved(getProviderInfo, CHAT_KEY);
}

export function setSearchProvider(cfg: AIProviderConfig | null): void {
  writeConfig(getSearchProvider, SEARCH_KEY, cfg);
}

/** Returns the stored search config with secrets decrypted; null = DuckDuckGo default. */
export function getResolvedSearchConfig(): AIProviderConfig | null {
  return readResolved(getSearchProvider, SEARCH_KEY);
}

/**
 * Replaces SECRET_MASK placeholders in an incoming config with the stored secret,
 * so "test connection" works without retyping the API key.
 *
 * Credential-exfiltration guard: stored secrets are only injected when the
 * endpoint matches the stored one — otherwise a caller could point baseUrl at
 * an arbitrary host and have the real key sent there in the auth header.
 * (Providers without a baseUrl field have a hardcoded endpoint, so no check.)
 */
function resolveMasked(lookup: ProviderLookup, settingsKey: string, providerId: string, incoming: Record<string, string>): Record<string, string> {
  const secrets = secretKeys(lookup, providerId);
  const stored = readRaw(settingsKey);
  const out = { ...incoming };
  const endpointMatches =
    !stored || !('baseUrl' in stored.config) || stored.config.baseUrl === undefined || stored.config.baseUrl === incoming.baseUrl;
  for (const key of secrets) {
    if (out[key] !== SECRET_MASK) continue;
    out[key] =
      endpointMatches && stored && stored.providerId === providerId && stored.config[key] ? decrypt(stored.config[key]) : '';
  }
  return out;
}

export function resolveMaskedSecrets(providerId: string, incoming: Record<string, string>): Record<string, string> {
  return resolveMasked(getProviderInfo, CHAT_KEY, providerId, incoming);
}

export function resolveMaskedSearchSecrets(providerId: string, incoming: Record<string, string>): Record<string, string> {
  return resolveMasked(getSearchProvider, SEARCH_KEY, providerId, incoming);
}

export function setImageGenProvider(cfg: AIProviderConfig | null): void {
  writeConfig(getImageGenProviderInfo, IMAGEGEN_KEY, cfg);
}

/** Returns the stored imagegen config with secrets decrypted (main-process use only). */
export function getResolvedImageGenConfig(): AIProviderConfig | null {
  return readResolved(getImageGenProviderInfo, IMAGEGEN_KEY);
}

export function resolveMaskedImageGenSecrets(providerId: string, incoming: Record<string, string>): Record<string, string> {
  return resolveMasked(getImageGenProviderInfo, IMAGEGEN_KEY, providerId, incoming);
}
