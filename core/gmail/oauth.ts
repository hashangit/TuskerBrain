import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

// Check if running in Electron
const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;

// Load OAuth credentials
// Priority: Environment Variables > Electron userData > Local dev file
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

  // Second, check Electron userData directory (for installed apps)
  if (isElectron) {
    const { app } = require('electron');
    const credentialsPath = path.join(app.getPath('userData'), 'oauth-credentials.json');

    if (fs.existsSync(credentialsPath)) {
      return JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    }
  }

  // Finally, check local dev file (only for development)
  // This file should NEVER be committed to version control
  const localCredentialsPath = path.join(process.cwd(), 'OAuth Client ID JSON.json');

  if (fs.existsSync(localCredentialsPath)) {
    return JSON.parse(fs.readFileSync(localCredentialsPath, 'utf-8'));
  }

  throw new Error(
    'Gmail OAuth credentials not found. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables, ' +
    'or place credentials in Electron userData directory, or create a local OAuth credentials file for development.'
  );
}

export function generateAuthUrl(): string {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function exchangeCodeForTokens(code: string) {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
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
