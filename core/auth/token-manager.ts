import type { GmailClient } from '@core/gmail/client';
import { refreshAccessToken } from '@core/gmail/oauth';
import { encryptSecret, decryptSecret } from '@core/security/encryption';

/**
 * OAuth tokens interface
 */
export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: Date;
}

/**
 * Token refresh callback type
 */
type RevocationHandler = () => void;

/**
 * TokenManager handles OAuth token lifecycle:
 * - Secure storage (encrypted with safeStorage)
 * - Automatic refresh before expiry
 * - Revocation handling
 * - Validation with Gmail API
 *
 * Design Spec Reference: Lines 657-680
 */
export class TokenManager {
  private gmailClient: GmailClient;
  private tokens: OAuthTokens | null = null;
  private revocationHandlers: RevocationHandler[] = [];

  // Static storage for persistence across instances (tokens stored encrypted)
  private static persistentTokens: OAuthTokens | null = null;

  // Refresh buffer: refresh token if it expires within this time
  private static readonly REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

  // Retry configuration
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1000; // 1 second

  /**
   * Encrypt sensitive data using safeStorage
   * Falls back to base64 in non-Electron environments (tests)
   */
  private encrypt(text: string): string {
    return encryptSecret(text);
  }

  /**
   * Decrypt sensitive data using safeStorage
   * Falls back to base64 in non-Electron environments (tests)
   */
  private decrypt(ciphertext: string): string {
    return decryptSecret(ciphertext);
  }

  constructor(gmailClient: GmailClient) {
    this.gmailClient = gmailClient;
    // Restore tokens from persistent storage
    this.tokens = TokenManager.persistentTokens;
  }

  /**
   * Set tokens (stores encrypted)
   */
  async setTokens(tokens: OAuthTokens): Promise<void> {
    // Encrypt tokens before storing
    this.tokens = {
      access_token: this.encrypt(tokens.access_token),
      refresh_token: this.encrypt(tokens.refresh_token),
      expiry_date: tokens.expiry_date,
    };
    // Persist to static storage
    TokenManager.persistentTokens = this.tokens;
  }

  /**
   * Get stored tokens (decrypts for internal use)
   */
  async getStoredTokens(): Promise<OAuthTokens | null> {
    if (!this.tokens) return null;

    return {
      access_token: this.decrypt(this.tokens.access_token),
      refresh_token: this.decrypt(this.tokens.refresh_token),
      expiry_date: this.tokens.expiry_date,
    };
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidToken(): Promise<string> {
    const stored = await this.getStoredTokens();
    if (!stored) {
      throw new Error('No tokens stored. Please authenticate first.');
    }

    // Check if token needs refresh
    if (this.shouldRefreshToken(stored.expiry_date)) {
      await this.refreshTokenWithRetry();
    } else {
      // Token doesn't need refresh, but validate it's still good
      // Only validate if we're not refreshing (to avoid double API calls)
      const isValid = await this.validateTokens();
      if (!isValid) {
        await this.handleRevocation();
        throw new Error('Token has been revoked or is invalid. Please re-authenticate.');
      }
    }

    // Return decrypted token
    const tokens = await this.getStoredTokens();
    if (!tokens) {
      throw new Error('Token refresh failed');
    }
    return tokens.access_token;
  }

  /**
   * Refresh token with retry logic for temporary failures
   */
  private async refreshTokenWithRetry(): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < TokenManager.MAX_RETRIES; attempt++) {
      try {
        await this.refreshToken();
        return; // Success, exit
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message.toLowerCase();

        // Don't retry on revocation or invalid token errors
        if (errorMsg.includes('revoked') || errorMsg.includes('invalid')) {
          await this.handleRevocation();
          throw new Error('Token has been revoked. Please re-authenticate.');
        }

        // If this isn't the last attempt, wait before retrying
        if (attempt < TokenManager.MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, TokenManager.RETRY_DELAY_MS));
        }
      }
    }

    // All retries failed, throw the last error
    throw lastError;
  }

  /**
   * Check if token should be refreshed
   */
  shouldRefreshToken(expiryDate: Date): boolean {
    const now = Date.now();
    const expiry = expiryDate.getTime();
    return (expiry - now) <= TokenManager.REFRESH_BUFFER_MS;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(expiryDate: Date): boolean {
    return expiryDate.getTime() <= Date.now();
  }

  /**
   * Refresh the access token
   */
  async refreshToken(): Promise<void> {
    const stored = await this.getStoredTokens();
    if (!stored) {
      throw new Error('No refresh token available');
    }

    const newCredentials = await refreshAccessToken(stored.refresh_token);

    await this.setTokens({
      access_token: newCredentials.access_token || '',
      refresh_token: stored.refresh_token, // Keep existing refresh token
      expiry_date: new Date(newCredentials.expiry_date || Date.now() + 3600000),
    });
  }

  /**
   * Validate tokens with Gmail API
   */
  async validateTokens(): Promise<boolean> {
    try {
      const profile = await this.gmailClient.getProfile();
      return !!profile.emailAddress;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle token revocation
   */
  async handleRevocation(): Promise<void> {
    // Clear tokens
    this.tokens = null;
    TokenManager.persistentTokens = null;

    // Notify handlers
    for (const handler of this.revocationHandlers) {
      handler();
    }
  }

  /**
   * Register a revocation handler
   */
  onRevocation(handler: RevocationHandler): void {
    this.revocationHandlers.push(handler);
  }

  /**
   * Get raw storage for testing (to verify encryption)
   * Returns the ENCRYPTED form, not plaintext
   */
  async getRawStorage(): Promise<string> {
    if (!this.tokens) return '{}';
    // Return encrypted form - tests should check for encryption
    // The tokens are encrypted when stored
    const encryptedAccess = this.encrypt(this.tokens.access_token);
    const encryptedRefresh = this.encrypt(this.tokens.refresh_token);

    return JSON.stringify({
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expiry_date: this.tokens.expiry_date.toISOString(),
    });
  }
}
