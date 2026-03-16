import { app, shell } from 'electron';
import { generateAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '@core/gmail/oauth';
import { encryptSecret, decryptSecret } from '@core/security/encryption';
import http from 'http';
import path from 'path';
import fs from 'fs';

/**
 * OAuth tokens stored securely
 */
interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number; // Unix timestamp in ms
  email?: string;
}

/**
 * OAuth state for CSRF protection
 */
interface OAuthState {
  state: string;
  redirectPort: number;
  createdAt: number;
}

/**
 * Gmail OAuth Service
 * Handles the complete OAuth flow with secure token storage using safeStorage
 */
export class GmailOAuthService {
  private tokens: StoredTokens | null = null;
  private pendingState: OAuthState | null = null;
  private callbackServer: http.Server | null = null;
  private tokensFilePath: string;

  constructor() {
    // Path for encrypted token storage
    const userDataPath = app.getPath('userData');
    this.tokensFilePath = path.join(userDataPath, 'oauth-tokens.enc');

    // Load tokens on initialization
    this.loadTokens();
  }

  /**
   * Start the OAuth flow
   * Opens a local server to receive the callback and launches the auth URL
   */
  async startAuthFlow(redirectPort: number = 3000): Promise<{ authUrl: string }> {
    // Generate a random state for CSRF protection
    const state = this.generateRandomState();

    // Store the pending state
    this.pendingState = {
      state,
      redirectPort,
      createdAt: Date.now(),
    };

    // Create the auth URL with our callback
    const redirectUri = `http://localhost:${redirectPort}/oauth/callback`;
    const authUrl = generateAuthUrl();

    // Start a local server to receive the callback
    await this.startCallbackServer(redirectPort);

    // Open the auth URL in the default browser
    await shell.openExternal(authUrl);

    return { authUrl };
  }

  /**
   * Handle OAuth callback
   * Exchanges the authorization code for tokens
   */
  async handleCallback(code: string, state: string): Promise<{ success: boolean; email?: string }> {
    // Verify state for CSRF protection
    if (!this.pendingState || this.pendingState.state !== state) {
      throw new Error('Invalid OAuth state - possible CSRF attack');
    }

    // Check state hasn't expired (5 minute window)
    if (Date.now() - this.pendingState.createdAt > 5 * 60 * 1000) {
      throw new Error('OAuth state expired');
    }

    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code);

      // Store the tokens securely
      this.tokens = {
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || '',
        expiry_date: tokens.expiry_date || Date.now() + 3600000, // Default 1 hour
      };

      // Save to disk (encrypted)
      await this.saveTokens();

      // Stop the callback server
      this.stopCallbackServer();

      return { success: true, email: this.tokens.email };
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshToken(): Promise<{ success: boolean }> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      const newCredentials = await refreshAccessToken(this.tokens.refresh_token);

      this.tokens = {
        ...this.tokens,
        access_token: newCredentials.access_token || '',
        expiry_date: newCredentials.expiry_date || Date.now() + 3600000,
      };

      await this.saveTokens();

      return { success: true };
    } catch (error) {
      console.error('Token refresh error:', error);
      // Clear tokens if refresh fails
      await this.clearTokens();
      throw error;
    }
  }

  /**
   * Revoke tokens and clear storage
   */
  async revokeToken(): Promise<{ success: boolean }> {
    // In a full implementation, we would call Google's revoke endpoint
    // For now, just clear the local tokens
    await this.clearTokens();
    return { success: true };
  }

  /**
   * Get the current authentication status
   */
  async getStatus(): Promise<{
    isAuthenticated: boolean;
    email?: string;
    expiresAt?: string;
  }> {
    if (!this.tokens) {
      return { isAuthenticated: false };
    }

    // Check if token needs refresh
    if (this.isTokenExpiringSoon()) {
      try {
        await this.refreshToken();
      } catch {
        return { isAuthenticated: false };
      }
    }

    return {
      isAuthenticated: true,
      email: this.tokens.email,
      expiresAt: new Date(this.tokens.expiry_date).toISOString(),
    };
  }

  /**
   * Get a valid access token (refreshes if necessary)
   */
  async getValidAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('Not authenticated');
    }

    if (this.isTokenExpiringSoon()) {
      await this.refreshToken();
    }

    return this.tokens.access_token;
  }

  /**
   * Check if the current token is expired or expiring soon
   */
  private isTokenExpiringSoon(): boolean {
    if (!this.tokens) return true;

    // Refresh if token expires within 5 minutes
    const bufferMs = 5 * 60 * 1000;
    return Date.now() >= (this.tokens.expiry_date - bufferMs);
  }

  /**
   * Start a local HTTP server to receive OAuth callback
   */
  private startCallbackServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.callbackServer = http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${port}`);

        if (url.pathname === '/oauth/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Authentication Failed</h1><p>${error}</p><p>You can close this window.</p>`);
            return;
          }

          if (code && state) {
            try {
              await this.handleCallback(code, state);
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<h1>Authentication Successful!</h1><p>You can close this window and return to TuskerBrain.</p>');
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end(`<h1>Authentication Error</h1><p>${err instanceof Error ? err.message : 'Unknown error'}</p>`);
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Invalid Request</h1><p>Missing code or state parameter.</p>');
          }
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      this.callbackServer.listen(port, () => {
        resolve();
      });

      this.callbackServer.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stop the callback server
   */
  private stopCallbackServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
    }
  }

  /**
   * Generate a random state string for CSRF protection
   */
  private generateRandomState(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let state = '';
    for (let i = 0; i < 32; i++) {
      state += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return state;
  }

  /**
   * Save tokens to disk with encryption
   */
  private async saveTokens(): Promise<void> {
    if (!this.tokens) return;

    const encrypted = {
      access_token: encryptSecret(this.tokens.access_token),
      refresh_token: encryptSecret(this.tokens.refresh_token),
      expiry_date: this.tokens.expiry_date,
      email: this.tokens.email,
    };

    fs.writeFileSync(this.tokensFilePath, JSON.stringify(encrypted), 'utf-8');
  }

  /**
   * Load tokens from disk and decrypt
   */
  private loadTokens(): void {
    if (!fs.existsSync(this.tokensFilePath)) {
      return;
    }

    try {
      const data = fs.readFileSync(this.tokensFilePath, 'utf-8');
      const encrypted = JSON.parse(data);

      this.tokens = {
        access_token: decryptSecret(encrypted.access_token),
        refresh_token: decryptSecret(encrypted.refresh_token),
        expiry_date: encrypted.expiry_date,
        email: encrypted.email,
      };
    } catch (error) {
      console.error('Failed to load OAuth tokens:', error);
      this.tokens = null;
    }
  }

  /**
   * Clear tokens from memory and disk
   */
  private async clearTokens(): Promise<void> {
    this.tokens = null;

    if (fs.existsSync(this.tokensFilePath)) {
      fs.unlinkSync(this.tokensFilePath);
    }
  }
}
