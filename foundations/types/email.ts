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
  receivedAt: Date;
  emailType?: EmailType | null;
  gmailCategory?: GmailCategory | null;
  isImportant?: boolean;
  isRead?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  isProcessed?: boolean;
  processedAt?: Date | null;
  labels?: string[];
  createdAt?: Date;
}
