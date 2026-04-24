import { gmail_v1, google } from 'googleapis';
import { createAuthenticatedClient } from './oauth';
import type { ListMessagesOptions, ListMessagesResponse, ListHistoryOptions, ListHistoryResponse } from './types';

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(accessToken: string, refreshToken?: string) {
    const auth = createAuthenticatedClient(accessToken, refreshToken);
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async listMessages(options?: ListMessagesOptions): Promise<ListMessagesResponse> {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults: options?.maxResults ?? 100,
      pageToken: options?.pageToken,
      q: options?.q,
    });
    return response.data as ListMessagesResponse;
  }

  async listHistory(options?: ListHistoryOptions): Promise<ListHistoryResponse> {
    const response = await this.gmail.users.history.list({
      userId: 'me',
      startHistoryId: options?.startHistoryId,
      maxResults: options?.maxResults ?? 100,
      pageToken: options?.pageToken,
      historyTypes: options?.historyTypes,
    });
    return response.data as ListHistoryResponse;
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

  /**
   * Batch modify multiple messages in a single request.
   * More efficient than individual modifyMessage calls.
   */
  async batchModifyMessages(messageIds: string[], modifications: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }) {
    const response = await this.gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: messageIds,
        ...modifications,
      },
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

  async sendReply(options: {
    to: string;
    subject: string;
    threadId?: string;
    body: string;
    inReplyTo?: string;
    references?: string;
  }): Promise<{ id: string; threadId: string; labelIds: string[] }> {
    const lines: string[] = [];
    lines.push(`To: ${options.to}`);
    lines.push(`Subject: ${options.subject}`);
    if (options.inReplyTo) {
      lines.push(`In-Reply-To: ${options.inReplyTo}`);
    }
    if (options.references) {
      lines.push(`References: ${options.references}`);
    }
    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('');
    lines.push(options.body);

    const rawMessage = lines.join('\r\n');
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: options.threadId,
      },
    });

    return response.data as { id: string; threadId: string; labelIds: string[] };
  }
}
