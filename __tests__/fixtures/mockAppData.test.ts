import { describe, expect, it } from 'vitest';
import {
  getMockDealsData,
  getMockEmailDetail,
  getMockSenderDetail,
  getMockSendersData,
  getMockTimelineData,
  getMockTopicDetail,
  getMockTopicsData,
} from '../../src/fixtures/mockAppData';

describe('mock app data fixtures', () => {
  it('provides browser-mode list data outside App.tsx', () => {
    expect(getMockTimelineData()).not.toHaveLength(0);
    expect(getMockTopicsData()).not.toHaveLength(0);
    expect(getMockSendersData()).not.toHaveLength(0);
    expect(getMockDealsData()).not.toHaveLength(0);
  });

  it('builds detail fixtures from selected list items', () => {
    const timelineUpdate = getMockTimelineData()[0];
    const topic = getMockTopicsData()[0];
    const sender = getMockSendersData()[0];

    expect(getMockEmailDetail(timelineUpdate).id).toBe(timelineUpdate.id);
    expect(getMockTopicDetail(topic).id).toBe(topic.id);
    expect(getMockSenderDetail(sender).id).toBe(sender.id);
  });
});
