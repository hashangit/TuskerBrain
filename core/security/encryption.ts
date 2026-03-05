// Encryption utilities using Electron's safeStorage
// In non-Electron environments (tests), falls back to base64 encoding

const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;

export function encryptSecret(plainText: string): string {
  if (isElectron) {
    const { safeStorage } = require('electron');
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available');
    }
    const encrypted = safeStorage.encryptString(plainText);
    return encrypted.toString('base64');
  }

  // Fallback for test environments - NOT SECURE, only for testing
  return Buffer.from(plainText).toString('base64');
}

export function decryptSecret(encryptedBase64: string): string {
  if (isElectron) {
    const { safeStorage } = require('electron');
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available');
    }
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    return safeStorage.decryptString(encrypted);
  }

  // Fallback for test environments - NOT SECURE, only for testing
  return Buffer.from(encryptedBase64, 'base64').toString('utf-8');
}

export function isEncryptionAvailable(): boolean {
  if (isElectron) {
    const { safeStorage } = require('electron');
    return safeStorage.isEncryptionAvailable();
  }
  return true; // Fallback always available (but not secure)
}
