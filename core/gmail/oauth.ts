import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

// Load OAuth credentials
// Priority: Environment Variables > Local dev file
function getCredentials() {
  // First, check for environment variables (recommended for production)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      installed: {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uris: [process.env.GOOGLE_REDIRECT_URI || 'http://localhost'],
      },
    };
  }

  // Check local dev file (for development)
  // This file should NEVER be committed to version control
  // Try multiple possible filenames
  const possiblePaths = [
    path.join(process.cwd(), 'credentials.json'),
    path.join(process.cwd(), 'OAuth Client ID JSON.json'),
  ];

  for (const localCredentialsPath of possiblePaths) {
    if (fs.existsSync(localCredentialsPath)) {
      return JSON.parse(fs.readFileSync(localCredentialsPath, 'utf-8'));
    }
  }

  throw new Error(
    'Gmail OAuth credentials not found. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables, ' +
    'or create a credentials.json or OAuth Client ID JSON.json file for development.'
  );
}

export function generateAuthUrl(redirectUri?: string, state?: string): string {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  // Use provided redirect URI or fallback to first one from credentials
  const redirect = redirectUri || redirect_uris[0];

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect
  );

  const authUrlOptions: {
    access_type: 'online' | 'offline';
    scope: string[];
    prompt: string;
    state?: string;
  } = {
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  };

  // Include state if provided
  if (state) {
    authUrlOptions.state = state;
  }

  return oauth2Client.generateAuthUrl(authUrlOptions);
}

export async function exchangeCodeForTokens(code: string, redirectUri?: string) {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const redirect = redirectUri || redirect_uris[0];

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect
  );

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function refreshAccessToken(refreshToken: string) {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials: newCredentials } = await oauth2Client.refreshAccessToken();
  return newCredentials;
}

export function createAuthenticatedClient(accessToken: string, refreshToken?: string) {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}
