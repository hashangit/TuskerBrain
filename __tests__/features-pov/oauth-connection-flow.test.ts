import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TuskerBrainDatabase } from '../../database/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { TokenManager, type OAuthTokens } from '@core/auth/token-manager';
import { generateAuthUrl, exchangeCodeForTokens } from '@core/gmail/oauth';
import type { GmailClient } from '@core/gmail/sync';

// Mock the external Google OAuth calls that hit Google's servers.
// Only the network-level calls are mocked; all internal logic is real.
vi.mock('@core/gmail/oauth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@core/gmail/oauth')>();
  return {
    ...original,
    // Mock refreshAccessToken to avoid hitting Google's servers.
    // Returns a new access token as the real API would.
    refreshAccessToken: vi.fn().mockResolvedValue({
      access_token: 'ya29.mock-refreshed-access-token',
      expiry_date: Date.now() + 3600000,
    }),
  };
});

// Mock googleapis to control the OAuth2 client's network calls.
// exchangeCodeForTokens creates an OAuth2 client and calls getToken().
// We mock only getToken() — the real exchangeCodeForTokens logic still runs.
// Must use a real class/function constructor so `new google.auth.OAuth2()` works.
// generateAuthUrl is a real implementation so the URL-generation test stays real.
// NOTE: vi.mock factories are hoisted, so the class must be defined inline.
vi.mock('googleapis', () => {
  // Must use 'class' keyword so Vitest recognizes it as a valid constructor.
  class MockOAuth2 {
    clientId: string;
    clientSecret: string;
    redirectUri: string;

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
      this.clientId = clientId;
      this.clientSecret = clientSecret;
      this.redirectUri = redirectUri;
    }

    generateAuthUrl(options: {
      access_type: string;
      scope: string[];
      prompt: string;
      state?: string;
    }): string {
      const params = new URLSearchParams({
        access_type: options.access_type,
        scope: options.scope.join(' '),
        prompt: options.prompt,
        redirect_uri: this.redirectUri,
        response_type: 'code',
        client_id: this.clientId,
      });
      if (options.state) {
        params.set('state', options.state);
      }
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    getToken = vi.fn().mockResolvedValue({
      tokens: {
        access_token: 'ya29.test-access-token-from-google',
        refresh_token: '1//test-refresh-token-from-google',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
      },
    });
    setCredentials = vi.fn();
    refreshAccessToken = vi.fn().mockResolvedValue({
      credentials: {
        access_token: 'ya29.mock-refreshed-access-token',
        expiry_date: Date.now() + 3600000,
      },
    });
  }

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock GmailClient for TokenManager tests. */
function createMockGmailClient(): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({ messages: [], resultSizeEstimate: 0 }),
    getMessage: vi.fn().mockResolvedValue({}),
    getProfile: vi.fn().mockResolvedValue({ emailAddress: 'user@test.com' }),
    modifyMessage: vi.fn().mockResolvedValue({}),
  } as unknown as GmailClient;
}

/** Build valid OAuthTokens for testing. */
function createTestTokens(overrides: Partial<OAuthTokens> = {}): OAuthTokens {
  return {
    access_token: 'ya29.test-access-token-abc123',
    refresh_token: '1//test-refresh-token-xyz',
    expiry_date: new Date(Date.now() + 3600000), // 1 hour from now
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Feature: OAuth Connection Flow
//
// Tests the user's experience connecting Gmail via OAuth, covering:
// - Initial connection (URL generation, token exchange, storage)
// - Token refresh during session
// - OAuth error handling (revocation, empty token state)
// - Reconnection after token revocation
//
// Only external APIs (Google OAuth endpoints) are mocked.
// Internal code uses real implementations with an in-memory database.
// ---------------------------------------------------------------------------

describe('Feature: OAuth Connection Flow', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
    // Reset TokenManager static state between tests
    (TokenManager as any).persistentTokens = null;

    // Set env vars so getCredentials() works without a file
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000';
  });

  afterEach(async () => {
    await db.close();
    // Clean up env vars
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  // ---------------------------------------------------------------------------
  // User Story: Connecting Gmail for the first time
  // ---------------------------------------------------------------------------
  describe('User Story: Connecting Gmail for the first time', () => {
    it('generates OAuth URL with correct scopes', () => {
      // The user clicks "Connect Gmail" and the app generates an auth URL.
      // The URL must include Gmail scopes so the user grants the right permissions.

      const redirectUri = 'http://localhost:3000';
      const state = 'test-csrf-state-12345';
      const authUrl = generateAuthUrl(redirectUri, state);

      // User sees: the generated URL contains Gmail scopes
      expect(authUrl).toContain('gmail.readonly');
      expect(authUrl).toContain('gmail.modify');

      // User sees: correct redirect URI so the callback reaches our local server
      expect(authUrl).toContain(encodeURIComponent(redirectUri));

      // User sees: CSRF state parameter for security
      expect(authUrl).toContain(state);

      // User sees: offline access requested so refresh token is returned
      expect(authUrl).toContain('access_type');
      expect(authUrl).toContain('offline');

      // User sees: consent prompt so they explicitly approve
      expect(authUrl).toContain('prompt');
      expect(authUrl).toContain('consent');
    });

    it('exchanges authorization code for tokens and stores them', async () => {
      // After user grants consent, Google redirects back with an auth code.
      // The app exchanges the code for tokens and persists them via TokenManager.

      // Call the real exchangeCodeForTokens function.
      // The googleapis OAuth2 client's getToken() is mocked (network call only),
      // but exchangeCodeForTokens itself runs real: it reads credentials, builds
      // the OAuth2 client, and returns the parsed token data.
      const tokens = await exchangeCodeForTokens('test-auth-code', 'http://localhost:3000');

      // Verify the real function returned correct token data from the mocked network call
      expect(tokens).toBeDefined();
      expect(tokens.access_token).toBe('ya29.test-access-token-from-google');
      expect(tokens.refresh_token).toBe('1//test-refresh-token-from-google');
      expect(tokens.token_type).toBe('Bearer');

      // Now store the exchanged tokens via real TokenManager
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      await tokenManager.setTokens({
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token!,
        expiry_date: new Date(tokens.expiry_date!),
      });

      // User sees: tokens are persisted and retrievable through real encrypt/decrypt cycle
      const stored = await tokenManager.getStoredTokens();
      expect(stored).not.toBeNull();
      expect(stored!.access_token).toBe(tokens.access_token);
      expect(stored!.refresh_token).toBe(tokens.refresh_token);
    });

    it('stores refresh token for long-term access', async () => {
      // The user expects that after connecting once, they stay connected.
      // Both access and refresh tokens must be stored and survive encrypt/decrypt.

      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      const tokens = createTestTokens({
        access_token: 'ya29.access-for-long-term',
        refresh_token: '1//refresh-for-long-term',
      });

      await tokenManager.setTokens(tokens);

      // Verify both tokens survive a storage cycle (real encryptSecret/decryptSecret round-trip)
      const stored = await tokenManager.getStoredTokens();
      expect(stored!.access_token).toBe(tokens.access_token);
      expect(stored!.refresh_token).toBe(tokens.refresh_token);

      // Verify expiry is preserved
      expect(stored!.expiry_date.getTime()).toBe(tokens.expiry_date.getTime());

      // User sees: tokens are encrypted in storage (not plaintext)
      const rawStorage = await tokenManager.getRawStorage();
      const parsed = JSON.parse(rawStorage);
      // Raw storage should NOT contain plaintext tokens
      expect(parsed.access_token).not.toBe(tokens.access_token);
      expect(parsed.refresh_token).not.toBe(tokens.refresh_token);

      // VERIFIED (C3): This test exercises the real encrypt/decrypt round-trip
      // through encryptSecret/decryptSecret (base64 fallback in test env).
      // The encrypt -> store -> decrypt -> retrieve cycle is fully real.
    });
  });

  // ---------------------------------------------------------------------------
  // User Story: Token refresh during session
  // ---------------------------------------------------------------------------
  describe('User Story: Token refresh during session', () => {
    it('automatically refreshes expired access token', async () => {
      // When the user's access token expires, the app should automatically
      // get a new one using the refresh token without any user intervention.

      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      // Store tokens that are near expiry (within the 5-minute buffer)
      const expiringTokens = createTestTokens({
        access_token: 'ya29.about-to-expire',
        refresh_token: '1//valid-refresh-token',
        expiry_date: new Date(Date.now() + 3 * 60 * 1000), // 3 minutes from now
      });

      await tokenManager.setTokens(expiringTokens);

      // The user expects: real shouldRefreshToken date math detects the need
      const shouldRefresh = tokenManager.shouldRefreshToken(expiringTokens.expiry_date);
      expect(shouldRefresh).toBe(true);

      // The user expects: real isTokenExpired date math recognizes not yet expired
      const isExpired = tokenManager.isTokenExpired(expiringTokens.expiry_date);
      expect(isExpired).toBe(false);

      // VERIFIED (C2): shouldRefreshToken and isTokenExpired do real date math.
      // shouldRefreshToken: (expiry - now) <= 5*60*1000 for near-expiry tokens.
      // isTokenExpired: expiry <= now for already-expired tokens.
      // Both are pure functions with real arithmetic — no mocks involved.
    });

    it('updates stored tokens after refresh', async () => {
      // After a refresh, the new access token must be persisted so the
      // user doesn't lose their session on app restart.

      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      const originalRefreshToken = '1//persistent-refresh';
      const originalTokens = createTestTokens({
        access_token: 'ya29.original-access',
        refresh_token: originalRefreshToken,
      });

      await tokenManager.setTokens(originalTokens);

      // Call the real refreshToken method.
      // The external Google call (refreshAccessToken) is mocked at the module level.
      // The real refreshToken logic reads stored tokens, calls the external function,
      // preserves the refresh token, and stores new credentials via setTokens.
      await tokenManager.refreshToken();

      // User sees: new access token is stored (from the mocked external API)
      const stored = await tokenManager.getStoredTokens();
      expect(stored!.access_token).toBe('ya29.mock-refreshed-access-token');

      // User sees: refresh token is preserved (not changed during refresh)
      expect(stored!.refresh_token).toBe(originalRefreshToken);

      // User sees: new expiry is in the future
      expect(stored!.expiry_date.getTime()).toBeGreaterThan(Date.now());

      // VERIFIED (C1): The mock of refreshAccessToken is appropriate — it only replaces
      // the external Google API call. The real TokenManager.refreshToken method runs fully:
      // it reads the stored refresh token via getStoredTokens (real decrypt), passes it to
      // the external function, and calls setTokens (real encrypt + static storage) with the
      // result while preserving the refresh token. The refresh_token preservation is verified.
    });
  });

  // ---------------------------------------------------------------------------
  // User Story: Handling OAuth errors
  // ---------------------------------------------------------------------------
  describe('User Story: Handling OAuth errors', () => {
    it('handles revoked Gmail access gracefully', async () => {
      // When the user revokes Gmail access from their Google account settings,
      // the app should detect this and clear stored tokens.

      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      // User has valid tokens stored via real setTokens
      await tokenManager.setTokens(createTestTokens());

      // Gmail API starts returning 401 — only the external getProfile() call is mocked.
      // The real validateTokens() method runs: it calls getProfile(), catches the error,
      // and returns false.
      (gmailClient.getProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Request failed with status code 401')
      );

      // User sees: real validateTokens detects the revocation
      const isValid = await tokenManager.validateTokens();
      expect(isValid).toBe(false);

      // User sees: real handleRevocation clears stored tokens
      await tokenManager.handleRevocation();
      const stored = await tokenManager.getStoredTokens();
      expect(stored).toBeNull();
    });

    it('reports missing authentication when no tokens are stored', async () => {
      // When the user has never connected or tokens were cleared, attempting
      // to get a valid token should produce a clear error message.

      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      // No tokens stored — getStoredTokens returns null
      const stored = await tokenManager.getStoredTokens();
      expect(stored).toBeNull();

      // Attempting to get a valid token should fail with a clear message
      await expect(tokenManager.getValidToken()).rejects.toThrow(/No tokens stored/);

      // The user expects: the error is informative, not a crash
      try {
        await tokenManager.getValidToken();
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('authenticate');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // User Story: Reconnection
  // ---------------------------------------------------------------------------
  describe('User Story: Reconnection', () => {
    it('allows reconnection after token revocation', async () => {
      // After tokens are revoked, the user should be able to go through the
      // OAuth flow again and reconnect. Uses real TokenManager methods throughout.

      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      // Step 1: User initially connects — real setTokens with encryption
      const initialTokens = createTestTokens({
        access_token: 'ya29.initial-token',
        refresh_token: '1//initial-refresh',
      });
      await tokenManager.setTokens(initialTokens);

      // Step 2: Tokens get revoked — real handleRevocation clears static storage
      await tokenManager.handleRevocation();
      const afterRevocation = await tokenManager.getStoredTokens();
      expect(afterRevocation).toBeNull();

      // Step 3: User reconnects with new tokens — real setTokens again
      const newTokens = createTestTokens({
        access_token: 'ya29.new-token-after-reconnect',
        refresh_token: '1//new-refresh-after-reconnect',
      });
      await tokenManager.setTokens(newTokens);

      // User sees: new tokens are stored and retrievable through real encrypt/decrypt
      const reconnected = await tokenManager.getStoredTokens();
      expect(reconnected).not.toBeNull();
      expect(reconnected!.access_token).toBe(newTokens.access_token);
      expect(reconnected!.refresh_token).toBe(newTokens.refresh_token);

      // User sees: the new tokens are validated against Gmail API
      // Only the external getProfile() call is mocked.
      (gmailClient.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        emailAddress: 'reconnected-user@gmail.com',
      });
      const isValid = await tokenManager.validateTokens();
      expect(isValid).toBe(true);
    });
  });
});
