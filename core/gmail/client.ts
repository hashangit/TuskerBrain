import { gmail_v1, google } from 'googleapis';
import { createAuthenticatedClient } from './oauth';

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(accessToken: string, refreshToken?: string) {
    const auth = createAuthenticatedClient(accessToken, refreshToken);
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async listMessages(maxResults = 100, pageToken?: string) {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults,
      pageToken,
    });
    return response.data;
  }

  async getMessage(messageId: string) {
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    return response.data;
  }

  async modifyMessage(messageId: string, modifications: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }) {
    const response = await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: modifications,
    });
    return response.data;
  }

  async listLabels() {
    const response = await this.gmail.users.labels.list({
      userId: 'me',
    });
    return response.data;
  }

  async createLabel(name: string) {
    const response = await this.gmail.users.labels.create({
      userId: 'me',
      requestBody: { name },
    });
    return response.data;
  }

  async getProfile() {
    const response = await this.gmail.users.getProfile({
      userId: 'me',
    });
    return response.data;
  }
}
