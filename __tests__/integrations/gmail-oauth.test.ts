import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  createAuthenticatedClient,
} from '@core/gmail/oauth';
import { TokenManager } from '@core/auth/token-manager';
import type { GmailClient } from '@core/gmail/client';

/**
 * Design Spec Reference: Lines 657-680
 *
 * OAuth Flow Tests:
 * - User can initiate Gmail OAuth connection
 * - OAuth callback exchanges code for tokens
 * - Access token is refreshed automatically before expiry
 * - Handles OAuth revocation gracefully
 * - Tokens are stored encrypted in safeStorage
 */
describe('Gmail OAuth', () => {
  describe('OAuth URL Generation', () => {
    it('should generate OAuth URL with correct scopes', async () => {
      const url = generateAuthUrl();
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('gmail.readonly');
      expect(url).toContain('gmail.modify');
    });

    it('should include offline access in OAuth URL', async () => {
      const url = generateAuthUrl();
      expect(url).toContain('access_type=offline');
    });

    it('should include consent prompt for refresh token', async () => {
      const url = generateAuthUrl();
      expect(url).toContain('prompt=consent');
    });

    it('should include redirect URI', async () => {
      const url = generateAuthUrl();
      expect(url).toContain('redirect_uri');
    });
  });

  describe('Token Exchange', () => {
    it('should exchange code for tokens', async () => {
      // This test requires real OAuth code - skip in CI
      if (!process.env.TEST_OAUTH_CODE) {
        return;
      }
      const tokens = await exchangeCodeForTokens(process.env.TEST_OAUTH_CODE);
      expect(tokens.access_token).toBeDefined();
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.expiry_date).toBeDefined();
    });
  });

  describe('Token Refresh', () => {
    it('should refresh expired tokens', async () => {
      // This test requires valid refresh token - skip in CI
      if (!process.env.TEST_REFRESH_TOKEN) {
        return;
      }
      const tokens = await refreshAccessToken(process.env test_REFRESH_TOKEN);
      expect(tokens.access_token).toBeDefined();
      expect(tokens.expiry_date).toBeDefined();
    });
  });
});

/**
 * Token Management Tests - Design Spec Lines 671-680
 */
describe('Token Manager', () => {
  let tokenManager: TokenManager;
  let mockGmailClient: GmailClient;

  beforeEach(() => {
    mockGmailClient = {
      getProfile: vi.fn(),
    } as unknown as GmailClient;

    tokenManager = new TokenManager(mockGmailClient);
  });

  describe('Automatic Token Refresh', () => {
    it('should refresh access token automatically before expiry', async () => {
      // Set token that expires in 2 minutes
      const expiringSoon = new Date(Date.now() + 2 * 60 * 1000);
      await tokenManager.setTokens({
        access_token: 'current-access',
        refresh_token: 'refresh-token',
        expiry_date: expiringSoon,
      });

      const validToken = await tokenManager.getValidToken();

      // Should have triggered refresh since token expires soon
      expect(validToken).toBeDefined();
      expect(validToken).not.toBe('current-access'); // Should be new token
    });

    it('should not refresh token if still valid', async () => {
      // Set token that expires in 1 hour
      const stillValid = new Date(Date.now() + 60 * 60 * 1000);
      await tokenManager.setTokens({
        access_token: 'valid-access',
        refresh_token: 'refresh-token',
        expiry_date: stillValid,
      });

      const token = await tokenManager.getValidToken();

      expect(token).toBe('valid-access');
    });

    it('should refresh token 5 minutes before expiry', async () => {
      // Token expires in 4 minutes (within 5 min buffer)
      const almostExpired = new Date(Date.now() + 4 * 60 * 1000);
      await tokenManager.setTokens({
        access_token: 'expiring-access',
        refresh_token: 'refresh-token',
        expiry_date: almostExpired,
      });

      // Should trigger refresh
      const shouldRefresh = tokenManager.shouldRefreshToken(almostExpired);
      expect(shouldRefresh).toBe(true);
    });
  });

  describe('Token Storage', () => {
    it('should store tokens encrypted in safeStorage', async () => {
      const tokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: new Date(Date.now() + 3600000),
      };

      await tokenManager.setTokens(tokens);

      // Verify tokens are stored (implementation should use encryption)
      const stored = await tokenManager.getStoredTokens();
      expect(stored).toBeDefined();
    });

    it('should not store tokens in plaintext', async () => {
      const tokens = {
        access_token: 'sensitive-token',
        refresh_token: 'sensitive-refresh',
        expiry_date: new Date(Date.now() + 3600000),
      };

      await tokenManager.setTokens(tokens);

      // Get raw storage - should not contain plaintext
      const rawStorage = await tokenManager.getRawStorage();
      expect(rawStorage).not.toContain('sensitive-token');
      expect(rawStorage).not.toContain('sensitive-refresh');
    });

    it('should retrieve tokens correctly after restart', async () => {
      const tokens = {
        access_token: 'persisted-token',
        refresh_token: 'persisted-refresh',
        expiry_date: new Date(Date.now() + 3600000),
      };

      await tokenManager.setTokens(tokens);

      // Simulate restart
      const newManager = new TokenManager(mockGmailClient);
      const retrieved = await newManager.getStoredTokens();

      expect(retrieved?.access_token).toBe('persisted-token');
      expect(retrieved?.refresh_token).toBe('persisted-refresh');
    });
  });

  describe('OAuth Revocation Handling', () => {
    it('should handle OAuth revocation gracefully', async () => {
      // Set up tokens
      await tokenManager.setTokens({
        access_token: 'revoked-token',
        refresh_token: 'revoked-refresh',
        expiry_date: new Date(Date.now() + 3600000),
      });

      // Mock API call that throws revocation error
      (mockGmailClient.getProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Token has been revoked')
      );

      const isValid = await tokenManager.validateTokens();

      expect(isValid).toBe(false);
    });

    it('should clear tokens on revocation', async () => {
      await tokenManager.setTokens({
        access_token: 'revoked-token',
        refresh_token: 'revoked-refresh',
        expiry_date: new Date(Date.now() + 3600000),
      });

      await tokenManager.handleRevocation();

      const stored = await tokenManager.getStoredTokens();
      expect(stored).toBeNull();
    });

    it('should emit event on token revocation', async () => {
      const revocationHandler = vi.fn();
      tokenManager.onRevocation(revocationHandler);

      await tokenManager.handleRevocation();

      expect(revocationHandler).toHaveBeenCalled();
    });

    it('should throw clear error message on revocation', async () => {
      await tokenManager.setTokens({
        access_token: 'revoked-token',
        refresh_token: 'revoked-refresh',
        expiry_date: new Date(Date.now() + 3600000),
      });

      await expect(tokenManager.getValidToken()).rejects.toThrow(/revoked|invalid/i);
    });
  });

  describe('Token Validation', () => {
    it('should validate tokens with Gmail API', async () => {
      (mockGmailClient.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        emailAddress: 'test@gmail.com',
      });

      await tokenManager.setTokens({
        access_token: 'valid-token',
        refresh_token: 'valid-refresh',
        expiry_date: new Date(Date.now() + 3600000),
      });

      const isValid = await tokenManager.validateTokens();
      expect(isValid).toBe(true);
    });

    it('should return false for invalid tokens', async () => {
      (mockGmailClient.getProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Invalid Credentials')
      );

      await tokenManager.setTokens({
        access_token: 'invalid-token',
        refresh_token: 'invalid-refresh',
        expiry_date: new Date(Date.now() + 3600000),
      });

      const isValid = await tokenManager.validateTokens();
      expect(isValid).toBe(false);
    });

    it('should check token expiry status', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      const futureDate = new Date(Date.now() + 3600000);

      expect(tokenManager.isTokenExpired(expiredDate)).toBe(true);
      expect(tokenManager.isTokenExpired(futureDate)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors during refresh', async () => {
      await tokenManager.setTokens({
        access_token: 'expiring-soon',
        refresh_token: 'refresh-token',
        expiry_date: new Date(Date.now() + 60000), // 1 min
      });

      // Mock refresh failure
      vi.spyOn(tokenManager, 'refreshToken').mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(tokenManager.getValidToken()).rejects.toThrow(/network/i);
    });

    it('should retry token refresh on temporary failure', async () => {
      await tokenManager.setTokens({
        access_token: 'expiring-soon',
        refresh_token: 'refresh-token',
        expiry_date: new Date(Date.now() + 60000),
      });

      // Mock first failure, then success
      vi.spyOn(tokenManager, 'refreshToken')
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          access_token: 'new-token',
          expiry_date: new Date(Date.now() + 3600000),
        });

      const token = await tokenManager.getValidToken();
      expect(token).toBe('new-token');
    });
  });
});
