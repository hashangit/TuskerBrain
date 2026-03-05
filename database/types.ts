// Re-export types inferred from schema
import type { emails, timelineUpdates, deals, topics, emailTopics, topicSummaries, senderSummaries, gmailLabels, emailLabels, syncState, settings, apiKeys, oauthTokens } from './schema';

// Email types
export type Email = typeof emails.$inferInsert;
export type EmailType = 'regular' | 'updates' | 'social' | 'promotional';

// Timeline update types
export type TimelineUpdate = typeof timelineUpdates.$inferInsert;
export type Priority = 'high' | 'medium' | 'low';
export type Sentiment = 'positive' | 'negative' | 'neutral';

// Deal types
export type Deal = typeof deals.$inferInsert;

// Topic types
export type Topic = typeof topics.$inferInsert;
export type EmailTopic = typeof emailTopics.$inferInsert;
export type TopicSummary = typeof topicSummaries.$inferInsert;

// Sender types
export type SenderSummary = typeof senderSummaries.$inferInsert;

// Job types
export type JobType = 'email_process' | 'email_archive' | 'email_delete' | 'topic_summary_update' | 'sender_summary_update' | 'backfill_day';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'dead';

// Label types
export type GmailLabel = typeof gmailLabels.$inferInsert;
export type EmailLabel = typeof emailLabels.$inferInsert;

// Other types
export type SyncState = typeof syncState.$inferInsert;
export type Setting = typeof settings.$inferInsert;
export type ApiKey = typeof apiKeys.$inferInsert;
export type OAuthToken = typeof oauthTokens.$inferInsert;
