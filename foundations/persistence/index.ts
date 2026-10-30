/**
 * Repository exports
 *
 * These repositories provide a clean interface for database operations
 * following the repository pattern. Each repository handles a specific
 * domain entity and provides CRUD operations.
 */

import { EmailRepository } from './emails';
import { TimelineRepository } from './timeline';
import { DealsRepository } from './deals';
import { TopicsRepository } from './topics';
import { SummariesRepository } from './summaries';
import { LabelsRepository } from './labels';
import { SyncStateRepository } from './sync-state';

export { EmailRepository } from './emails';
export type { EmailRecord, CreateEmailData, UpdateEmailData } from './emails';

export { TimelineRepository } from './timeline';
export type { TimelineUpdateRecord, CreateTimelineUpdateData } from './timeline';

export { DealsRepository } from './deals';
export type { DealRecord, CreateDealData } from './deals';

export { TopicsRepository } from './topics';
export type { TopicRecord, CreateTopicData, TopicSummaryRecord } from './topics';

export { SummariesRepository } from './summaries';
export type { SenderSummaryRecord, SenderSummaryData } from './summaries';

export { LabelsRepository } from './labels';
export type { GmailLabelRecord, CreateLabelData } from './labels';

export { SyncStateRepository } from './sync-state';
export type { SyncStateData } from './sync-state';

/**
 * Create all repositories for a database instance
 */
export function createRepositories(db: import('@foundations/database').TuskerBrainDatabase) {
  return {
    emails: new EmailRepository(db),
    timeline: new TimelineRepository(db),
    deals: new DealsRepository(db),
    topics: new TopicsRepository(db),
    summaries: new SummariesRepository(db),
    labels: new LabelsRepository(db),
    syncState: new SyncStateRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
