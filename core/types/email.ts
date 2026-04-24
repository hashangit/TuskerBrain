export type EmailType = 'regular' | 'updates' | 'social' | 'promotional';
export type GmailCategory = 'primary' | 'promotions' | 'social' | 'updates' | 'forums';

export interface Email {
  id: string;
  threadId: string;
  senderEmail: string;
  senderName: string | null;
  senderDomain: string;
  subject: string | null;
  snippet: string | null;
  bodyPlain?: string | null;
  bodyHtml?: string | null;
  receivedAt: Date;
  emailType?: EmailType | null;
  gmailCategory?: GmailCategory | null;
  isImportant?: boolean;
  isRead?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  isProcessed?: boolean;
  processedAt?: Date | null;
  messageIdHeader?: string | null;
  referencesHeader?: string | null;
  inReplyToHeader?: string | null;
  labels?: string[];
  createdAt?: Date;
}

/** Minimal email info for thread previews */
export interface ThreadEmailItem {
  id: string;
  subject: string | null;
  snippet: string | null;
  senderName: string | null;
  senderEmail: string;
  receivedAt: Date;
  isRead?: boolean;
  bodyHtml?: string | null;
  bodyPlain?: string | null;
}

/** A group of emails belonging to the same thread */
export interface ThreadGroup {
  threadId: string;
  subject: string;
  emails: ThreadEmailItem[];
  emailCount: number;
  latestEmail: ThreadEmailItem;
  earliestEmail: ThreadEmailItem;
  dateRange: { start: Date; end: Date };
}
