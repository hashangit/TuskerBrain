/**
 * Shared types for Gmail client and sync operations.
 */

export interface ListMessagesOptions {
  maxResults?: number;
  pageToken?: string;
  startHistoryId?: string;
  q?: string;
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

export interface ListHistoryOptions {
  startHistoryId?: string;
  maxResults?: number;
  pageToken?: string;
  historyTypes?: string[];
}

export interface ListHistoryResponse {
  history?: Array<{
    id?: string;
    messagesAdded?: Array<{ message?: { id: string; threadId?: string } }>;
    messagesDeleted?: Array<{ message?: { id: string } }>;
    labelsAdded?: Array<{ message?: { id: string }; labelIds?: string[] }>;
    labelsRemoved?: Array<{ message?: { id: string }; labelIds?: string[] }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
}
