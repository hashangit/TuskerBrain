// Types inferred from schema
// Select types (fields required after SELECT) for reading from DB
// Insert types (fields optional) for writing to DB
import type { emails, timelineUpdates, deals, topics, emailTopics, gmailLabels, emailLabels, syncState, settings, apiKeys, oauthTokens, topicSummaries, senderSummaries, jobs, auditLog } from './schema';

// Email types
export type EmailSelect = typeof emails.$inferSelect;
export type EmailInsert = typeof emails.$inferInsert;
export type EmailType = 'regular' | 'updates' | 'social' | 'promotional';

// Timeline update types
export type TimelineUpdateSelect = typeof timelineUpdates.$inferSelect;
export type TimelineUpdateInsert = typeof timelineUpdates.$inferInsert;
export type Priority = 'high' | 'medium' | 'low';
export type Sentiment = 'positive' | 'negative' | 'neutral';

// Deal types (re-exported from deals.ts for backward compat)
export type { DealRecord, DealInsert, DealValueType, DealData, DealStatus } from './deals';

// Topic types
export type TopicSelect = typeof topics.$inferSelect;
export type TopicInsert = typeof topics.$inferInsert;
export type EmailTopicSelect = typeof emailTopics.$inferSelect;
export type EmailTopicInsert = typeof emailTopics.$inferInsert;

// Label types
export type GmailLabelSelect = typeof gmailLabels.$inferSelect;
export type GmailLabelInsert = typeof gmailLabels.$inferInsert;
export type EmailLabelSelect = typeof emailLabels.$inferSelect;
export type EmailLabelInsert = typeof emailLabels.$inferInsert;

// Summary types
export type TopicSummarySelect = typeof topicSummaries.$inferSelect;
export type TopicSummaryInsert = typeof topicSummaries.$inferInsert;
export type SenderSummarySelect = typeof senderSummaries.$inferSelect;
export type SenderSummaryInsert = typeof senderSummaries.$inferInsert;

// Job types
export type JobSelect = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;
export type JobType = 'email_process' | 'email_archive' | 'email_delete' | 'topic_summary_update' | 'sender_summary_update' | 'backfill_day';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'dead';

// Audit types
export type AuditLogSelect = typeof auditLog.$inferSelect;
export type AuditLogInsert = typeof auditLog.$inferInsert;

// Other types
export type SyncStateSelect = typeof syncState.$inferSelect;
export type SyncStateInsert = typeof syncState.$inferInsert;
export type SettingSelect = typeof settings.$inferSelect;
export type SettingInsert = typeof settings.$inferInsert;
export type ApiKeySelect = typeof apiKeys.$inferSelect;
export type ApiKeyInsert = typeof apiKeys.$inferInsert;
export type OAuthTokenSelect = typeof oauthTokens.$inferSelect;
export type OAuthTokenInsert = typeof oauthTokens.$inferInsert;
