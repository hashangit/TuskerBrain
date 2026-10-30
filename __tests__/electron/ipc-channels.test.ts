import { describe, it, expect } from 'vitest';
import { CHANNEL } from '@foundations/contracts/ipc';

describe('IPC Channels', () => {
  describe('Channel Constants', () => {
    it('should have Gmail OAuth channels defined', () => {
      expect(CHANNEL.GMAIL_OAUTH_START).toBe('gmail:oauth:start');
      expect(CHANNEL.GMAIL_OAUTH_CALLBACK).toBe('gmail:oauth:callback');
      expect(CHANNEL.GMAIL_OAUTH_REFRESH).toBe('gmail:oauth:refresh');
      expect(CHANNEL.GMAIL_OAUTH_REVOKE).toBe('gmail:oauth:revoke');
      expect(CHANNEL.GMAIL_OAUTH_STATUS).toBe('gmail:oauth:status');
    });

    it('should have LLM Provider channels defined', () => {
      expect(CHANNEL.LLM_PROVIDER_LIST).toBe('llm:provider:list');
      expect(CHANNEL.LLM_PROVIDER_SET).toBe('llm:provider:set');
      expect(CHANNEL.LLM_PROVIDER_VALIDATE).toBe('llm:provider:validate');
      expect(CHANNEL.LLM_PROVIDER_TEST).toBe('llm:provider:test');
    });

    it('should have Job Queue channels defined', () => {
      expect(CHANNEL.JOB_LIST).toBe('jobs:list');
      expect(CHANNEL.JOB_CREATE).toBe('jobs:create');
      expect(CHANNEL.JOB_CANCEL).toBe('jobs:cancel');
      expect(CHANNEL.JOB_STATUS).toBe('jobs:status');
      expect(CHANNEL.JOB_PAUSE).toBe('jobs:pause');
      expect(CHANNEL.JOB_RESUME).toBe('jobs:resume');
    });

    it('should have Settings channels defined', () => {
      expect(CHANNEL.SETTINGS_GET).toBe('settings:get');
      expect(CHANNEL.SETTINGS_SET).toBe('settings:set');
      expect(CHANNEL.SETTINGS_RESET).toBe('settings:reset');
    });

    it('should have Sync channels defined', () => {
      expect(CHANNEL.SYNC_START).toBe('sync:start');
      expect(CHANNEL.SYNC_STATUS).toBe('sync:status');
      expect(CHANNEL.SYNC_CANCEL).toBe('sync:cancel');
    });
  });

  describe('Channel Names', () => {
    it('should use consistent naming convention', () => {
      // All channel names should follow pattern: domain:subdomain:action
      const channelValues = Object.values(CHANNEL);

      for (const channel of channelValues) {
        // Should have at least 2 colons (domain:subdomain:action)
        const parts = channel.split(':');
        expect(parts.length).toBeGreaterThanOrEqual(2);
        expect(parts.length).toBeLessThanOrEqual(3);
      }
    });

    it('should have all unique channel names', () => {
      const channelValues = Object.values(CHANNEL);
      const uniqueValues = new Set(channelValues);

      expect(uniqueValues.size).toBe(channelValues.length);
    });
  });
});
