import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Settings store state interface
 */
interface SettingsState {
  // LLM Settings
  activeProvider: string | null;
  apiKeyValid: boolean;

  // Sync Settings
  lookbackDays: number;
  autoSync: boolean;
  syncIntervalMinutes: number;

  // UI Settings
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
  showNotifications: boolean;

  // Actions
  setActiveProvider: (provider: string | null) => void;
  setApiKeyValid: (valid: boolean) => void;
  setLookbackDays: (days: number) => void;
  setAutoSync: (enabled: boolean) => void;
  setSyncIntervalMinutes: (minutes: number) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCompactMode: (compact: boolean) => void;
  setShowNotifications: (show: boolean) => void;
  reset: () => void;
}

const defaultSettings = {
  activeProvider: null,
  apiKeyValid: false,
  lookbackDays: 30,
  autoSync: false,
  syncIntervalMinutes: 30,
  theme: 'system' as const,
  compactMode: false,
  showNotifications: true,
};

/**
 * Zustand store for application settings.
 * Persisted to localStorage for cross-session persistence.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setActiveProvider: (provider) => set({ activeProvider: provider }),
      setApiKeyValid: (valid) => set({ apiKeyValid: valid }),
      setLookbackDays: (days) => set({ lookbackDays: days }),
      setAutoSync: (enabled) => set({ autoSync: enabled }),
      setSyncIntervalMinutes: (minutes) => set({ syncIntervalMinutes: minutes }),
      setTheme: (theme) => set({ theme }),
      setCompactMode: (compact) => set({ compactMode: compact }),
      setShowNotifications: (show) => set({ showNotifications: show }),
      reset: () => set(defaultSettings),
    }),
    {
      name: 'tuskerbrain-settings',
    }
  )
);

/**
 * Hook to get and set individual settings via IPC
 * This syncs local state with the backend settings storage
 */
export function useSettingsSync() {
  const settings = useSettingsStore();

  const syncFromBackend = async () => {
    try {
      const provider = await window.electronAPI.getSetting('activeProvider');
      if (provider) {
        settings.setActiveProvider(provider as string);
      }

      const lookbackDays = await window.electronAPI.getSetting('lookbackDays');
      if (lookbackDays) {
        settings.setLookbackDays(lookbackDays as number);
      }

      const autoSync = await window.electronAPI.getSetting('autoSync');
      if (autoSync !== null) {
        settings.setAutoSync(autoSync as boolean);
      }
    } catch (error) {
      console.error('Failed to sync settings from backend:', error);
    }
  };

  const syncToBackend = async () => {
    try {
      if (settings.activeProvider) {
        await window.electronAPI.setSetting('activeProvider', settings.activeProvider);
      }
      await window.electronAPI.setSetting('lookbackDays', settings.lookbackDays);
      await window.electronAPI.setSetting('autoSync', settings.autoSync);
      await window.electronAPI.setSetting('syncIntervalMinutes', settings.syncIntervalMinutes);
      await window.electronAPI.setSetting('theme', settings.theme);
      await window.electronAPI.setSetting('compactMode', settings.compactMode);
      await window.electronAPI.setSetting('showNotifications', settings.showNotifications);
    } catch (error) {
      console.error('Failed to sync settings to backend:', error);
    }
  };

  return {
    ...settings,
    syncFromBackend,
    syncToBackend,
  };
}
