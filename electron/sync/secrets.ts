// Secret-at-rest helpers for sync provider credentials.
// Same pattern as electron/ai/config.ts: Electron safeStorage with an `enc:`
// base64 prefix, plaintext fallback when the OS offers no keyring.
import { safeStorage } from 'electron';

const ENC_PREFIX = 'enc:';

export function encryptSecret(value: string): string {
  if (!value) return value;
  if (safeStorage.isEncryptionAvailable()) return ENC_PREFIX + safeStorage.encryptString(value).toString('base64');
  return value;
}

export function decryptSecret(value: string): string {
  if (value.startsWith(ENC_PREFIX) && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'));
    } catch {
      return '';
    }
  }
  return value;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}
