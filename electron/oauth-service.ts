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
  private tokensLoaded: Promise<void>;

  constructor() {
    // Path for encrypted token storage
    const userDataPath = app.getPath('userData');
    this.tokensFilePath = path.join(userDataPath, 'oauth-tokens.enc');

    // Load tokens on initialization (async)
    this.tokensLoaded = this.loadTokens();
  }

  /**
   * Ensure tokens are loaded before accessing them
   */
  private async ensureTokensLoaded(): Promise<void> {
    await this.tokensLoaded;
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

    // Start a local server to receive the callback first
    await this.startCallbackServer(redirectPort);

    // Create the auth URL with our callback (include state for CSRF protection)
    const redirectUri = `http://localhost:${redirectPort}`;
    const authUrl = generateAuthUrl(redirectUri, state);

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
      const redirectUri = `http://localhost:${this.pendingState.redirectPort}`;
      const tokens = await exchangeCodeForTokens(code, redirectUri);

      // Fetch user's email from Gmail API
      let email: string | undefined;
      try {
        const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
          },
        });
        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          email = profile.emailAddress;
          console.log('[OAuth] Fetched email from Gmail API:', email);
        }
      } catch (err) {
        console.error('[OAuth] Failed to fetch email:', err);
      }

      // Store the tokens securely
      this.tokens = {
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || '',
        expiry_date: tokens.expiry_date || Date.now() + 3600000, // Default 1 hour
        email,
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
    await this.ensureTokensLoaded();

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
    console.log('[OAuth] getStatus called');
    await this.ensureTokensLoaded();

    if (!this.tokens) {
      console.log('[OAuth] No tokens found');
      return { isAuthenticated: false };
    }

    console.log('[OAuth] Tokens found, email:', this.tokens.email);

    // Check if token needs refresh
    if (this.isTokenExpiringSoon()) {
      console.log('[OAuth] Token expiring soon, refreshing...');
      try {
        await this.refreshToken();
      } catch {
        console.log('[OAuth] Token refresh failed');
        return { isAuthenticated: false };
      }
    }

    // Fetch email from Gmail API if not stored
    if (!this.tokens.email && this.tokens.access_token) {
      try {
        const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: {
            'Authorization': `Bearer ${this.tokens.access_token}`,
          },
        });
        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          this.tokens.email = profile.emailAddress;
          console.log('[OAuth] Fetched email from Gmail API:', this.tokens.email);
          // Save the updated tokens with email
          await this.saveTokens();
        }
      } catch (err) {
        console.error('[OAuth] Failed to fetch email:', err);
      }
    }

    console.log('[OAuth] Returning authenticated: true');
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
    await this.ensureTokensLoaded();

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

        // Handle OAuth callback at root path (since redirect_uri is http://localhost:PORT)
        if (url.pathname === '/') {
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

    console.log('[OAuth] Saving tokens...');

    const encrypted = {
      access_token: await encryptSecret(this.tokens.access_token),
      refresh_token: await encryptSecret(this.tokens.refresh_token),
      expiry_date: this.tokens.expiry_date,
      email: this.tokens.email,
    };

    console.log('[OAuth] Encrypted tokens, writing to file...');
    fs.writeFileSync(this.tokensFilePath, JSON.stringify(encrypted), 'utf-8');
    console.log('[OAuth] Tokens saved successfully');
  }

  /**
   * Load tokens from disk and decrypt
   */
  private async loadTokens(): Promise<void> {
    console.log('[OAuth] Loading tokens from:', this.tokensFilePath);

    if (!fs.existsSync(this.tokensFilePath)) {
      console.log('[OAuth] No token file found');
      return;
    }

    try {
      const data = fs.readFileSync(this.tokensFilePath, 'utf-8');
      const encrypted = JSON.parse(data);

      console.log('[OAuth] Token file found, decrypting...');
      console.log('[OAuth] Encrypted access_token type:', typeof encrypted.access_token);

      this.tokens = {
        access_token: await decryptSecret(encrypted.access_token),
        refresh_token: await decryptSecret(encrypted.refresh_token),
        expiry_date: encrypted.expiry_date,
        email: encrypted.email,
      };

      console.log('[OAuth] Tokens loaded successfully, email:', this.tokens.email);
    } catch (error) {
      console.error('[OAuth] Failed to load OAuth tokens:', error);
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
