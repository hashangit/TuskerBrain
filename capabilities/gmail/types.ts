/**
 * Shared types for Gmail client and sync operations.
 */

export interface ListMessagesOptions {
  maxResults?: number;
  pageToken?: string;
  startHistoryId?: string;
}

export interface ListMessagesResponse {
  messages: Array<{ id: string; threadId?: string }>;
  nextPageToken?: string;
  historyId?: string;
}

export interface GmailProfile {
  emailAddress?: string;
  historyId?: string;
  messagesTotal?: number;
  threadsTotal?: number;
}

export interface MessageModifications {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

/**
 * Transport-agnostic Gmail client contract consumed by the domain layer.
 * The concrete googleapis-backed implementation lives in ./client.ts.
 */
export interface GmailClient {
  listMessages(options?: ListMessagesOptions): Promise<ListMessagesResponse>;
  getMessage(id: string): Promise<any>;
  getProfile(): Promise<{ emailAddress?: string; historyId?: string; messagesTotal?: number }>;
  modifyMessage(messageId: string, modifications: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any>;
  batchModifyMessages?(messageIds: string[], modifications: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any>;
  listLabels?(): Promise<any>;
  createLabel?(name: string): Promise<any>;
}
