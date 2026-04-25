import { describe, expect, it } from 'vitest';
import { SettingsManager, SettingsStore } from '@core/settings/manager';

describe('SettingsManager stores', () => {
  it('isolates settings when managers use explicit stores', async () => {
    const first = new SettingsManager(new SettingsStore());
    const second = new SettingsManager(new SettingsStore());

    await first.setProcessingInterval(60);
    await first.set('customFlag', true);

    expect(await second.getProcessingInterval()).toBe(30);
    expect(await second.get('customFlag')).toBeNull();
  });
});
