import { safeStorage } from 'electron';
import { setSecretStorage } from '@capabilities/security/encryption';

/**
 * Register Electron's safeStorage as the platform secret storage.
 *
 * The capabilities layer may not import `electron`, so the transport layer
 * (composition root) performs this registration once at startup. Without
 * registration (tests, non-Electron runtimes), capabilities/security falls
 * back to the base64 test encoding — matching the previous behavior.
 */
export function registerPlatformSecretStorage(): void {
  setSecretStorage(safeStorage);
}
