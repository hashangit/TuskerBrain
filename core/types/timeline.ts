export type Priority = 'high' | 'medium' | 'low';
export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface TimelineUpdate {
  id: string;
  emailId: string;
  threadId?: string;
  title: string;
  description?: string;
  priority: Priority;
  sentiment?: Sentiment;
  emailType?: string;
  topic?: string;
  senderDomain?: string;
  createdAt: Date;
}

export interface TimelineFilterOptions {
  emailType?: string;
  topic?: string;
  senderDomain?: string;
  priority?: Priority;
  dateRange?: {
    start?: Date;
    end?: Date;
  };
}
