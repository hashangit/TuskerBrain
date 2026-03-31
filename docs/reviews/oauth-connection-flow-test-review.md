# Test Review: OAuth Connection Flow

## Summary
- File: `__tests__/features-pov/oauth-connection-flow.test.ts`
- Total tests: 8
- Date: 2026-03-30
- Last reworked: 2026-03-30

## Rework Status

| Test | Status | Notes |
|------|--------|-------|
| generates OAuth URL with correct scopes | UNCHANGED (was already real) | Real `generateAuthUrl` via mocked OAuth2 constructor that delegates URL generation |
| exchanges authorization code for tokens and stores them (A1) | **REWORKED** | Now calls real `exchangeCodeForTokens()` with mocked `google.auth.OAuth2` getToken(). Removed disconnected DB INSERT/SELECT assertions |
| stores refresh token for long-term access (C3) | **VERIFIED** | Real encrypt/decrypt round-trip confirmed |
| automatically refreshes expired access token (C2) | **VERIFIED** | Real date math in `shouldRefreshToken`/`isTokenExpired` confirmed |
| updates stored tokens after refresh (C1) | **VERIFIED** | Mock of `refreshAccessToken` only replaces external API call; real `TokenManager.refreshToken` logic runs fully |
| handles revoked Gmail access gracefully (A2) | **REWORKED** | Uses real `validateTokens()` and `handleRevocation()`; only `gmailClient.getProfile()` is mocked |
| reports missing authentication when no tokens are stored (A3+A4) | **CONSOLIDATED** | Former "handles user denying OAuth consent" and "handles invalid authorization code" merged into one test with accurate name |
| allows reconnection after token revocation (A5) | **REWORKED** | Uses real `TokenManager` methods (`setTokens`, `handleRevocation`, `getStoredTokens`, `validateTokens`) throughout; only external `getProfile()` mocked |

## Mock Analysis
| Category | What's Mocked | What's Real |
|----------|--------------|-------------|
| Database | Nothing -- real in-memory SQLite with real migration | In-memory `TuskerBrainDatabase`, real migration SQL executed via `execSql` |
| Repositories | Not used in this test file | `createRepositories(db)` is called but the returned repos object is never used |
| External APIs | `refreshAccessToken` from `@core/gmail/oauth` is mocked at the module level; `google.auth.OAuth2` constructor is mocked with `getToken()` returning fake tokens | `generateAuthUrl` logic runs real (mocked OAuth2 delegates URL generation), `exchangeCodeForTokens` runs real (reads credentials, builds OAuth2 client, returns parsed tokens), `TokenManager` runs fully real |
| GmailClient | Only `getProfile()` is selectively mocked per-test when simulating 401 errors | Other GmailClient methods are stubbed but unused; `validateTokens()` runs real try/catch logic |
| Encryption | Nothing mocked -- runs the real `encryptSecret`/`decryptSecret` which falls back to base64 in non-Electron | Real `encryptSecret`/`decryptSecret` (base64 fallback path in tests) |
| TokenManager | Nothing mocked -- the real class is instantiated and its real methods run | Real `TokenManager` with real `setTokens`, `getStoredTokens`, `refreshToken`, `validateTokens`, `handleRevocation`, `getValidToken` |
| Environment | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` set in `beforeEach` and cleaned in `afterEach` | Tests rely on real env-var-based credential loading |

## Test-by-Test Analysis

### Test: generates OAuth URL with correct scopes
| Field | Value |
|-------|-------|
| **Status** | UNCHANGED |
| **What it verifies** | That `generateAuthUrl` produces a URL containing `gmail.readonly`, `gmail.modify`, the redirect URI, a CSRF state parameter, `access_type=offline`, and `prompt=consent` |
| **Code path exercised** | Real `generateAuthUrl` from `core/gmail/oauth.ts` -> real `getCredentials` (reads env vars) -> mocked OAuth2 constructor with real `generateAuthUrl` delegation |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |

### Test: exchanges authorization code for tokens and stores them (A1 - REWORKED)
| Field | Value |
|-------|-------|
| **Status** | **REWORKED** |
| **What it verifies** | That the real `exchangeCodeForTokens()` function returns correct token data from the OAuth exchange, and that the returned tokens can be stored and retrieved via real `TokenManager` |
| **Code path exercised** | Real `exchangeCodeForTokens` -> real `getCredentials` (env vars) -> constructs OAuth2 client -> calls `getToken()` (mocked network call only) -> returns parsed tokens -> real `TokenManager.setTokens` (encrypt + static storage) -> real `TokenManager.getStoredTokens` (decrypt + retrieval) |
| **Mocked** | `google.auth.OAuth2` constructor's `getToken()` method returns fake Google response. This is the only external network call in the exchange flow. |
| **Real** | `exchangeCodeForTokens` function logic (credential loading, OAuth2 client construction, token parsing), `TokenManager` full encrypt/decrypt storage cycle |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **What changed** | Previously never called `exchangeCodeForTokens`. Now calls it with only the Google network call (`getToken`) mocked. Removed disconnected `oauth_tokens` DB INSERT/SELECT assertions (TokenManager uses static in-memory storage, not the database table). |

### Test: stores refresh token for long-term access (C3 - VERIFIED)
| Field | Value |
|-------|-------|
| **Status** | **VERIFIED** |
| **What it verifies** | That `setTokens` followed by `getStoredTokens` returns the same `access_token`, `refresh_token`, and `expiry_date`. Also checks that `getRawStorage` returns values that differ from plaintext (verifying encryption is applied) |
| **Code path exercised** | Real `TokenManager.setTokens` -> `encryptSecret` (base64) -> stores in static field -> Real `TokenManager.getStoredTokens` -> `decryptSecret` (base64) -> Real `TokenManager.getRawStorage` |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Verification note** | The encrypt/decrypt round-trip through real `encryptSecret`/`decryptSecret` (base64 fallback in test env) is confirmed. The `getRawStorage` check verifies encryption is applied (raw storage differs from plaintext). The cycle is fully real. |

### Test: automatically refreshes expired access token (C2 - VERIFIED)
| Field | Value |
|-------|-------|
| **Status** | **VERIFIED** |
| **What it verifies** | That `shouldRefreshToken` returns `true` for tokens expiring within the 5-minute buffer, and `isTokenExpired` returns `false` for tokens that have not yet expired |
| **Code path exercised** | Real `TokenManager.shouldRefreshToken` (pure logic: compares `expiryDate.getTime() - Date.now()` against 5-minute buffer) -> Real `TokenManager.isTokenExpired` (pure logic: compares `expiryDate.getTime() <= Date.now()`) |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Verification note** | Both `shouldRefreshToken` and `isTokenExpired` are pure functions doing real date arithmetic. No mocks involved in their logic. The test correctly exercises both with a near-expiry token (3 minutes out, within the 5-minute buffer). |

### Test: updates stored tokens after refresh (C1 - VERIFIED)
| Field | Value |
|-------|-------|
| **Status** | **VERIFIED** |
| **What it verifies** | That after calling real `tokenManager.refreshToken()`, the stored `access_token` is the new value from the external API, the `refresh_token` is preserved, and the new `expiry_date` is in the future |
| **Code path exercised** | Real `TokenManager.refreshToken` -> calls mocked `refreshAccessToken` (would hit Google in production) -> real `setTokens` with new credentials -> real `getStoredTokens` to verify |
| **Mocked** | `refreshAccessToken` from `@core/gmail/oauth` -- only the external Google API call |
| **Real** | `TokenManager.refreshToken` method logic (retrieving stored tokens, calling the external function, preserving refresh token, storing new tokens), `TokenManager.setTokens` (encryption + static storage), `TokenManager.getStoredTokens` (decryption + retrieval) |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Verification note** | The mock of `refreshAccessToken` is appropriate -- it only replaces the external Google API call. The real `TokenManager.refreshToken` method runs fully: it reads the stored refresh token via `getStoredTokens` (real decrypt), passes it to the external function, and calls `setTokens` (real encrypt + static storage) with the result while preserving the refresh token. The refresh_token preservation is verified. |

### Test: handles revoked Gmail access gracefully (A2 - REWORKED)
| Field | Value |
|-------|-------|
| **Status** | **REWORKED** |
| **What it verifies** | That real `validateTokens()` returns `false` when `getProfile()` throws 401, and real `handleRevocation()` clears stored tokens |
| **Code path exercised** | Real `TokenManager.setTokens` -> Real `TokenManager.validateTokens` (calls `gmailClient.getProfile()`, catches error, returns false) -> Real `TokenManager.handleRevocation` (clears tokens + static storage) -> Real `TokenManager.getStoredTokens` returns null |
| **Mocked** | Only `gmailClient.getProfile()` is mocked to reject with a 401 error -- the external Gmail API call |
| **Real** | `TokenManager.validateTokens` try/catch logic, `TokenManager.handleRevocation` token clearing, `TokenManager.getStoredTokens` |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **What changed** | Previously exercised real methods but the test description was updated to clarify that real `validateTokens()` and `handleRevocation()` run with only the external API call mocked. |

### Test: reports missing authentication when no tokens are stored (A3+A4 - CONSOLIDATED)
| Field | Value |
|-------|-------|
| **Status** | **CONSOLIDATED** |
| **What it verifies** | That a fresh `TokenManager` with no stored tokens returns null from `getStoredTokens()` and throws an informative error from `getValidToken()` |
| **Code path exercised** | Real `TokenManager` constructor -> Real `TokenManager.getStoredTokens` (returns null) -> Real `TokenManager.getValidToken` (throws) |
| **Real** | `TokenManager` empty-state error handling in `getValidToken` |
| **Verdict** | TESTING REAL |
| **Confidence** | MEDIUM |
| **What changed** | Former "handles user denying OAuth consent" and "handles invalid authorization code" were near-duplicates testing the same empty-TokenManager behavior. Consolidated into one test with an accurate name describing what it actually tests. |

### Test: allows reconnection after token revocation (A5 - REWORKED)
| Field | Value |
|-------|-------|
| **Status** | **REWORKED** |
| **What it verifies** | The full reconnection lifecycle: connect -> revoke -> reconnect, using real `TokenManager` methods throughout |
| **Code path exercised** | Real `TokenManager.setTokens` (initial) -> Real `TokenManager.handleRevocation` (clears) -> Real `TokenManager.getStoredTokens` (null) -> Real `TokenManager.setTokens` (new tokens) -> Real `TokenManager.getStoredTokens` (retrieves new) -> Real `TokenManager.validateTokens` (calls `getProfile()`) |
| **Mocked** | Only `gmailClient.getProfile()` for the final validation check -- the external Gmail API call |
| **Real** | Full `TokenManager` lifecycle: `setTokens` (encrypt + store), `handleRevocation` (clear static storage), `getStoredTokens` (decrypt + retrieve), `validateTokens` (try/catch with API call) |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **What changed** | Clarified that all TokenManager methods run real with only external API mocked. |

## Overall Assessment

- [x] Tests validate real application behavior
- [ ] Tests are mostly testing mocks with some real code
- [ ] Tests are testing mocks only

**Percentage of real behavior tested: ~85%**

### What is genuinely well-tested:
1. **OAuth URL generation** -- exercises real `generateAuthUrl` with a mock OAuth2 that delegates URL generation realistically.
2. **Token exchange** (REWORKED A1) -- now calls real `exchangeCodeForTokens()` with only `getToken()` mocked. Verifies the function correctly reads credentials, builds the OAuth2 client, and returns parsed token data.
3. **Token storage round-trip** (C3) -- exercises real encrypt-store-decrypt-retrieve cycle.
4. **Token expiry detection** (C2) -- real date math in `shouldRefreshToken`/`isTokenExpired`.
5. **Token refresh flow** (C1) -- real `TokenManager.refreshToken` logic with only external API mocked.
6. **Revocation handling** (REWORKED A2) -- real `validateTokens` + `handleRevocation`.
7. **Reconnection lifecycle** (REWORKED A5) -- full real TokenManager lifecycle.

### Remaining gaps:
1. **No test for `getValidToken` refresh-then-validate path.** The `getValidToken` method has two branches: (a) refresh if expiring, (b) validate via API if not expiring. Neither branch is exercised through `getValidToken` end-to-end.
2. **No test for retry logic.** `TokenManager.refreshTokenWithRetry` (3 attempts, 1-second delay, revocation detection) is untested.
3. **No test for revocation handler callbacks.** `TokenManager.onRevocation(handler)` is untested.
4. **`GmailOAuthService` (electron layer) is untested.** The callback server, CSRF state management, and consent-denial handling are not covered.
