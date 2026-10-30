/**
 * Vendors layer: googleapis
 *
 * The ONLY place in the codebase allowed to import the raw `googleapis`
 * package. Upper layers (domain/capabilities) must import Google API
 * machinery exclusively through this wrapper.
 */
import { google, gmail_v1 } from 'googleapis';

export { google };
export type { gmail_v1 };

export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

/**
 * Construct an authenticated Gmail API client handle.
 */
export function createGmailApi(oauth2Client: OAuth2Client): gmail_v1.Gmail {
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Construct an OAuth2 client with the given credentials config.
 */
export function createOAuth2Client(
  clientId: string,
  clientSecret: string,
  redirectUri: string
): OAuth2Client {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
