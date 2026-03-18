// Encryption utilities using Electron's safeStorage
// In non-Electron environments (tests), falls back to base64 encoding

const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;

// Cache for safeStorage to avoid repeated imports
let _safeStorage: Electron.SafeStorage | null = null;

async function getSafeStorage(): Promise<Electron.SafeStorage | null> {
  if (!isElectron) return null;

  if (_safeStorage) return _safeStorage;

  try {
    const electron = await import('electron');
    _safeStorage = electron.safeStorage;
    return _safeStorage;
  } catch {
    return null;
  }
}

export async function encryptSecret(plainText: string): Promise<string> {
  const safeStorage = await getSafeStorage();

  if (safeStorage) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available');
    }
    const encrypted = safeStorage.encryptString(plainText);
    return encrypted.toString('base64');
  }

  // Fallback for test environments - NOT SECURE, only for testing
  return Buffer.from(plainText).toString('base64');
}

export async function decryptSecret(encryptedBase64: string): Promise<string> {
  const safeStorage = await getSafeStorage();

  if (safeStorage) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available');
    }
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    return safeStorage.decryptString(encrypted);
  }

  // Fallback for test environments - NOT SECURE, only for testing
  return Buffer.from(encryptedBase64, 'base64').toString('utf-8');
}

export async function isEncryptionAvailable(): Promise<boolean> {
  const safeStorage = await getSafeStorage();

  if (safeStorage) {
    return safeStorage.isEncryptionAvailable();
  }
  return true; // Fallback always available (but not secure)
}
