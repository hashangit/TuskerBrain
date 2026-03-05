import { describe, it, expect } from 'vitest';

describe('Gmail OAuth', () => {
  it('should generate OAuth URL with correct scopes', async () => {
    const { generateAuthUrl } = await import('@core/gmail/oauth');
    const url = generateAuthUrl();
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('gmail.readonly');
    expect(url).toContain('gmail.modify');
  });

  it('should exchange code for tokens', async () => {
    // This test requires real OAuth code - skip in CI
    if (!process.env.TEST_OAUTH_CODE) {
      return;
    }
    const { exchangeCodeForTokens } = await import('@core/gmail/oauth');
    const tokens = await exchangeCodeForTokens(process.env.TEST_OAUTH_CODE);
    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
  });

  it('should refresh expired tokens', async () => {
    // This test requires valid refresh token - skip in CI
    if (!process.env.TEST_REFRESH_TOKEN) {
      return;
    }
    const { refreshAccessToken } = await import('@core/gmail/oauth');
    const tokens = await refreshAccessToken(process.env.TEST_REFRESH_TOKEN);
    expect(tokens.access_token).toBeDefined();
  });
});
