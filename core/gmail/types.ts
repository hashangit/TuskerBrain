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
