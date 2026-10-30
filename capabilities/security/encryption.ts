// Encryption utilities.
//
// In Electron, secrets are encrypted with safeStorage. Because capabilities
// must not import the electron package, the platform secret storage is
// registered at the composition root (electron/main.ts) via
// setSecretStorage(). In non-Electron environments (tests) no storage is
// registered and the fallback is base64 encoding — NOT SECURE, only for
// testing.

/**
 * Minimal contract for a platform secret store (satisfied by Electron's
 * safeStorage — see electron/register-secret-storage.ts).
 */
export interface SecretStorage {
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  isEncryptionAvailable(): boolean;
}

let _secretStorage: SecretStorage | null = null;

/**
 * Register the platform secret storage. Called once by the transport layer
 * (electron) at startup. Pass null to fall back to the test encoding.
 */
export function setSecretStorage(storage: SecretStorage | null): void {
  _secretStorage = storage;
}

function getSecretStorage(): SecretStorage | null {
  return _secretStorage;
}

export async function encryptSecret(plainText: string): Promise<string> {
  const storage = getSecretStorage();

  if (storage) {
    if (!storage.isEncryptionAvailable()) {
      throw new Error('Encryption not available');
    }
    const encrypted = storage.encryptString(plainText);
    return encrypted.toString('base64');
  }

  // Fallback for test environments - NOT SECURE, only for testing
  return Buffer.from(plainText).toString('base64');
}

export async function decryptSecret(encryptedBase64: string): Promise<string> {
  const storage = getSecretStorage();

  if (storage) {
    if (!storage.isEncryptionAvailable()) {
      throw new Error('Encryption not available');
    }
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    return storage.decryptString(encrypted);
  }

  // Fallback for test environments - NOT SECURE, only for testing
  return Buffer.from(encryptedBase64, 'base64').toString('utf-8');
}

export async function isEncryptionAvailable(): Promise<boolean> {
  const storage = getSecretStorage();

  if (storage) {
    return storage.isEncryptionAvailable();
  }
  return true; // Fallback always available (but not secure)
}
