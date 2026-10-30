import type { GmailProfile } from './types';

/**
 * Fetch the Gmail user profile for an access token.
 *
 * This is the sanctioned path for transport code (electron/oauth-service.ts)
 * that needs profile data without a full GmailClient instance. Plain fetch
 * matches the lightweight usage; the googleapis-backed client lives in
 * ./client.ts.
 */
export async function getGmailProfile(accessToken: string): Promise<GmailProfile> {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Gmail profile: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as GmailProfile;
}
